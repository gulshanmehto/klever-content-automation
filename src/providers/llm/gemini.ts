import { GoogleGenerativeAI } from '@google/generative-ai';
import { prisma } from '@/lib/db';
import type {
  LLMProvider,
  CompetitorAnalysis,
  NormalizedIdeaResult,
  ArticleOutline,
  ArticleContent,
  ContentQCResult,
  ImageQCResult,
  ArticleConfig,
  WatermarkConfig,
  ImagePromptResult,
  RawIdea,
} from './types';

export class GeminiLLMProvider implements LLMProvider {
  private async getApiKey(): Promise<string> {
    // Check Settings table in DB first
    const dbSetting = await prisma.setting.findUnique({ where: { key: 'google_ai_api_key' } });
    if (dbSetting?.value) return dbSetting.value;

    // Fallback to environment variable
    const envKey = process.env.GOOGLE_AI_API_KEY;
    if (!envKey) throw new Error('Google AI Studio API Key is not set in Settings or .env');
    return envKey;
  }

  private async getClient(): Promise<GoogleGenerativeAI> {
    const apiKey = await this.getApiKey();
    return new GoogleGenerativeAI(apiKey);
  }

  async analyzeCompetitors(contents: Array<{ url: string; text: string }>): Promise<CompetitorAnalysis[]> {
    const ai = await this.getClient();
    const model = ai.getGenerativeModel({ model: 'models/gemini-3.5-flash-lite' });

    const results: CompetitorAnalysis[] = [];

    for (const content of contents) {
      const prompt = `
You are an expert content researcher. Analyze the following competitor article text.
Extract all major article ideas, concepts, and outline headings.

For each idea/heading, provide:
1. The exact heading name from the text ("sourceHeading").
2. A simplified, normalized concept name ("normalizedConcept").
3. A list of key attributes described (e.g. materials, styling notes, items mentioned).

Return the result strictly as a JSON object of this structure:
{
  "articleTitle": "Competitor title",
  "articleTheme": "Theme of article",
  "ideas": [
    {
      "sourceHeading": "Heading text",
      "normalizedConcept": "Normalized concept",
      "attributes": {
        "attributeKey": "attributeValue"
      }
    }
  ]
}

Competitor Article Content:
${content.text.substring(0, 15000)}
`;

      const response = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      });

      const responseText = response.response.text();
      try {
        const data = JSON.parse(responseText);
        results.push({
          sourceUrl: content.url,
          articleTitle: data.articleTitle || 'Untitled',
          articleTheme: data.articleTheme || 'General',
          ideas: data.ideas || [],
        });
      } catch (e) {
        console.error('Failed to parse competitor analysis json:', responseText, e);
        results.push({
          sourceUrl: content.url,
          articleTitle: 'Failed to Parse',
          articleTheme: 'General',
          ideas: [],
        });
      }
    }

    return results;
  }

  async normalizeAndDeduplicateIdeas(ideas: RawIdea[], topic: string): Promise<NormalizedIdeaResult[]> {
    const ai = await this.getClient();
    const model = ai.getGenerativeModel({ model: 'models/gemini-3.5-flash-lite' });

    const prompt = `
You are a content editor. We have extracted multiple fashion/article ideas from different competitor URLs.
Our target topic is: "${topic}".

Group similar concepts, merge close duplicates, and output a clean list of normalized unique ideas.
Do not lose relevant details when merging.

For each unique idea, return:
1. "concept" (the main heading/topic name).
2. "attributes" (common styles/occasions).
3. "mergedFrom" (list of original source headings that match this normalized concept).

Return strictly a JSON array of objects with this structure:
[
  {
    "concept": "Normalized concept name",
    "attributes": { "style": "casual", "occasion": "weekend" },
    "mergedFrom": ["competitor concept A", "competitor concept B"]
  }
]

Input ideas to normalize:
${JSON.stringify(ideas)}
`;

    const response = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });

    try {
      const results = JSON.parse(response.response.text());
      return results.map((r: any) => ({
        concept: r.concept,
        attributes: r.attributes || {},
        sourceUrls: [],
        sourceCount: r.mergedFrom?.length || 1,
        mergedFrom: r.mergedFrom || [],
        generatedOriginal: false,
      }));
    } catch {
      // Fallback
      return ideas.map(i => ({
        concept: i.normalizedConcept || i.sourceHeading,
        attributes: i.attributes || {},
        sourceUrls: [],
        sourceCount: 1,
        mergedFrom: [i.sourceHeading],
        generatedOriginal: false,
      }));
    }
  }

  async selectIdeas(ideas: NormalizedIdeaResult[], count: number, topic: string): Promise<NormalizedIdeaResult[]> {
    const ai = await this.getClient();
    const model = ai.getGenerativeModel({ model: 'models/gemini-3.5-flash-lite' });

    const prompt = `
You are a curator. We need exactly ${count} ideas for an article about "${topic}".
We have ${ideas.length} unique ideas available.

Select the best ${count} ideas that provide the best variety, match search intent, and have the highest quality.
If we have fewer unique ideas than requested, generate additional original ideas to make the total exactly ${count}.

Return strictly a JSON array of indices representing the selected ideas (0-indexed) or newly generated ideas with structure:
[
  { "index": 0 },
  { "concept": "New generated original idea", "attributes": {} }
]

Available Ideas:
${JSON.stringify(ideas.map((id, idx) => ({ idx, concept: id.concept, attributes: id.attributes })))}
`;

    const response = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });

    try {
      const selection = JSON.parse(response.response.text());
      const selectedList: NormalizedIdeaResult[] = [];

      for (const item of selection) {
        if (item.index !== undefined && ideas[item.index]) {
          selectedList.push(ideas[item.index]);
        } else if (item.concept) {
          selectedList.push({
            concept: item.concept,
            attributes: item.attributes || {},
            sourceUrls: [],
            sourceCount: 1,
            mergedFrom: [],
            generatedOriginal: true,
          });
        }
      }

      // Ensure exact count match
      return selectedList.slice(0, count);
    } catch {
      return ideas.slice(0, count);
    }
  }

  async reorderIdeas(ideas: NormalizedIdeaResult[], topic: string): Promise<NormalizedIdeaResult[]> {
    const ai = await this.getClient();
    const model = ai.getGenerativeModel({ model: 'models/gemini-3.5-flash-lite' });

    const prompt = `
We are publishing an article about "${topic}".
Reorder the following ${ideas.length} ideas to make the flow engaging, natural, and logical. 
Distribute styles and categories evenly so similar ideas are not next to each other.

Return strictly a JSON array of the reordered index sequence (0-indexed) like [2, 0, 1, ...]:
Available Ideas:
${JSON.stringify(ideas.map((id, idx) => ({ idx, concept: id.concept })))}
`;

    const response = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });

    try {
      const order = JSON.parse(response.response.text());
      const reordered: NormalizedIdeaResult[] = [];
      for (const idx of order) {
        if (ideas[idx]) reordered.push(ideas[idx]);
      }
      return reordered.length > 0 ? reordered : ideas;
    } catch {
      return ideas;
    }
  }

  async createOutline(ideas: NormalizedIdeaResult[], config: ArticleConfig): Promise<ArticleOutline> {
    const ai = await this.getClient();
    const model = ai.getGenerativeModel({ model: 'models/gemini-3.5-flash-lite' });

    const prompt = `
Create a structured outline for an article on "${config.topic}".
Target audience: ${config.targetAudience} in ${config.targetCountry}. Tone: ${config.tone}.
We have chosen ${ideas.length} ideas.

Provide:
1. A catch SEO-friendly title
2. URL slug
3. Introduction plan
4. Conclusion plan
5. FAQ topics (2-3 questions)

Return strictly JSON matching this structure:
{
  "title": "Article Title",
  "slug": "article-slug",
  "introductionPlan": "Plan for intro",
  "sections": [
    { "position": 1, "heading": "Heading for idea 1", "concept": "original concept" }
  ],
  "faqTopics": [
    { "question": "Question?", "answerPlan": "Plan" }
  ],
  "conclusionPlan": "Plan for conclusion"
}

Ideas:
${JSON.stringify(ideas)}
`;

    const response = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });

    try {
      const data = JSON.parse(response.response.text());
      return {
        title: data.title || `${ideas.length} ${config.topic}`,
        slug: data.slug || config.topic.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        introductionPlan: data.introductionPlan || '',
        sections: data.sections || ideas.map((id, idx) => ({ position: idx + 1, heading: id.concept, concept: id.concept, attributes: id.attributes })),
        faqTopics: data.faqTopics || [],
        conclusionPlan: data.conclusionPlan || '',
      };
    } catch {
      return {
        title: `${ideas.length} ${config.topic}`,
        slug: config.topic.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        introductionPlan: '',
        sections: ideas.map((id, idx) => ({ position: idx + 1, heading: id.concept, concept: id.concept, attributes: id.attributes })),
        faqTopics: [],
        conclusionPlan: '',
      };
    }
  }

  async writeArticle(outline: ArticleOutline, config: ArticleConfig): Promise<ArticleContent> {
    const ai = await this.getClient();
    const model = ai.getGenerativeModel({ model: 'models/gemini-3.5-flash-lite' });

    const prompt = `
You are a senior fashion and lifestyle copywriter. Write a completely original, SEO-optimized article based on this outline.
Topic: "${config.topic}". Tone: "${config.tone}". Target: "${config.targetAudience}".

Write:
1. An engaging introduction paragraph (~100-150 words).
2. A detailed body section for EVERY item in the outline. For each item write a substantial descriptive paragraph (~80-120 words) detailing the look, items, styling advice.
3. Suggest a highly detailed image prompt for each section that represents the idea visually.
4. An alt text suggestion.
5. FAQ answers.
6. A strong conclusion.

Return strictly as a JSON object matching this structure:
{
  "title": "${outline.title}",
  "slug": "${outline.slug}",
  "introduction": "Full intro paragraph...",
  "sections": [
    {
      "position": 1,
      "heading": "Heading text",
      "body": "Full body text...",
      "imageDescription": "Detailed image prompt description...",
      "altTextCandidate": "Alt text..."
    }
  ],
  "faq": [
    { "question": "Q?", "answer": "A..." }
  ],
  "conclusion": "Full conclusion paragraph...",
  "metaTitle": "SEO title",
  "metaDescription": "SEO meta description",
  "suggestedTags": ["tag1", "tag2"]
}

Outline:
${JSON.stringify(outline)}
`;

    const response = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });

    const text = response.response.text();
    try {
      const startIndex = text.indexOf('{');
      const endIndex = text.lastIndexOf('}');
      if (startIndex !== -1 && endIndex !== -1) {
        const cleanJson = text.substring(startIndex, endIndex + 1);
        return JSON.parse(cleanJson) as ArticleContent;
      }
      return JSON.parse(text) as ArticleContent;
    } catch (e) {
      console.error('Failed to parse Gemini output direct, attempting text fallback extraction:', text);
      throw e;
    }
  }

  async generateImagePrompts(
    sections: Array<{ position: number; heading: string; body: string; concept: string }>,
    watermark: WatermarkConfig,
    style: string,
    ratio: string,
  ): Promise<ImagePromptResult[]> {
    const ai = await this.getClient();
    const model = ai.getGenerativeModel({ model: 'models/gemini-3.5-flash-lite' });

    const prompt = `
You are a professional fashion photography art director creating AI image prompts for a US women's fashion blog.
Your job is to translate the article's concept into a HIGHLY SPECIFIC, photorealistic image prompt.

CRITICAL RULES FOR OUTFIT DESCRIPTIONS:
- DO NOT use abstract article topics (e.g., NEVER say "strapless dress ideas").
- INSTEAD, invent a specific, styled outfit (e.g., "a white linen strapless midi dress paired with light blue vintage denim jeans and brown leather sandals").
- Detail the fabric, color, fit, and accessories.

CRITICAL RULES FOR THE MODEL & ANATOMY:
- Target model: An American woman, naturally beautiful, aged 25-45, healthy build, relatable everyday look (like a Pinterest fashion blogger).
- Describe her face, hair, and pose clearly to ensure the AI generates correct anatomy.
- Include phrases like: "perfectly symmetrical face", "detailed natural eyes", "correct anatomy", "perfectly formed hands with 5 fingers".

Photography style: "${style}", bright, candid street style or clean indoor lifestyle, full-body or 3/4 length shot, magazine quality, DSLR.
Aspect Ratio: "${ratio}".

Example format: "A photorealistic fashion blogger portrait of a beautiful American woman in her mid-30s wearing a crisp white linen button-down shirt tucked into high-waisted distressed denim shorts, white sneakers, tortoiseshell sunglasses. She is walking down a sunny city sidewalk. Perfectly symmetrical face, detailed eyes, correct anatomy, perfect hands. ${style} photography, 85mm lens, natural lighting."

Return STRICTLY as a JSON array:
[
  { "sectionPosition": 1, "prompt": "..." }
]

Article sections:
${JSON.stringify(sections.map(s => ({ position: s.position, heading: s.heading, concept: s.concept, bodySnippet: s.body.slice(0, 300) })))}
`;

    const response = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });

    return JSON.parse(response.response.text()) as ImagePromptResult[];
  }

  async qualityCheckContent(article: ArticleContent, config: ArticleConfig): Promise<ContentQCResult> {
    const ai = await this.getClient();
    const model = ai.getGenerativeModel({ model: 'models/gemini-3.5-flash-lite' });

    const prompt = `
Perform a content quality check on this generated article.
Check for grammar, structure, tone alignment with "${config.tone}", and value.

Return strictly as a JSON object:
{
  "score": 90,
  "requestedIdeas": ${config.requestedIdeaCount},
  "actualIdeas": ${article.sections.length},
  "duplicateIdeas": 0,
  "structureScore": 92,
  "grammarScore": 95,
  "originalityScore": 90,
  "seoScore": 88,
  "issues": [],
  "status": "PASS"
}

Article:
${JSON.stringify(article)}
`;

    const response = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });

    return JSON.parse(response.response.text()) as ContentQCResult;
  }

  async qualityCheckImage(
    imageBase64: string,
    section: { heading: string; body: string; concept: string },
    watermarkText: string,
  ): Promise<ImageQCResult> {
    const ai = await this.getClient();
    // Use gemini-3.5-flash-lite vision model
    const model = ai.getGenerativeModel({ model: 'models/gemini-3.5-flash-lite' });

    const prompt = `
Analyze this generated image. Compare it to the article heading: "${section.heading}" and normalized concept: "${section.concept}".
Check if the website watermark text "${watermarkText}" is present and spelled correctly.

Return strictly JSON:
{
  "score": 90,
  "ideaMatch": true,
  "watermarkPresent": true,
  "watermarkCorrect": true,
  "visualQuality": "pass",
  "issues": [],
  "status": "PASS"
}
`;

    const response = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: imageBase64,
                mimeType: 'image/jpeg',
              },
            },
          ],
        },
      ],
      generationConfig: { responseMimeType: 'application/json' },
    });

    return JSON.parse(response.response.text()) as ImageQCResult;
  }
}
