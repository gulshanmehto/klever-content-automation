import { OpenAI } from 'openai';
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

export class OpenAILLMProvider implements LLMProvider {
  private async getApiKey(): Promise<string> {
    const dbSetting = await prisma.setting.findUnique({ where: { key: 'openai_api_key' } });
    if (dbSetting?.value) return dbSetting.value;

    const envKey = process.env.OPENAI_API_KEY;
    if (!envKey) throw new Error('OpenAI API Key is not set in Settings or .env');
    return envKey;
  }

  private async getClient(): Promise<OpenAI> {
    const apiKey = await this.getApiKey();
    return new OpenAI({ apiKey });
  }

  async analyzeCompetitors(contents: Array<{ url: string; text: string }>): Promise<CompetitorAnalysis[]> {
    const openai = await this.getClient();
    const results: CompetitorAnalysis[] = [];

    for (const content of contents) {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are an expert content researcher. Return data strictly as valid JSON matching the requested structure.',
          },
          {
            role: 'user',
            content: `Analyze the following competitor article text. Extract all major article ideas, concepts, and outline headings.
Return the result strictly as a JSON object of this structure:
{
  "articleTitle": "Competitor title",
  "articleTheme": "Theme of article",
  "ideas": [
    {
      "sourceHeading": "Heading text",
      "normalizedConcept": "Normalized concept",
      "attributes": {
        "style": "casual"
      }
    }
  ]
}

Competitor Article Content:
${content.text.substring(0, 15000)}`,
          },
        ],
        response_format: { type: 'json_object' },
      });

      try {
        const data = JSON.parse(response.choices[0].message.content || '{}');
        results.push({
          sourceUrl: content.url,
          articleTitle: data.articleTitle || 'Untitled',
          articleTheme: data.articleTheme || 'General',
          ideas: data.ideas || [],
        });
      } catch (e) {
        console.error('Failed to parse competitor analysis JSON from OpenAI:', e);
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
    const openai = await this.getClient();
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a content editor. Return data strictly as a valid JSON array.',
        },
        {
          role: 'user',
          content: `We have extracted multiple fashion/article ideas from different competitor URLs.
Our target topic is: "${topic}".
Group similar concepts, merge close duplicates, and output a clean list of normalized unique ideas.

Return strictly a JSON array of objects with this structure:
[
  {
    "concept": "Normalized concept name",
    "attributes": { "style": "casual", "occasion": "weekend" },
    "mergedFrom": ["competitor concept A", "competitor concept B"]
  }
]

Input ideas to normalize:
${JSON.stringify(ideas)}`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    try {
      const data = JSON.parse(response.choices[0].message.content || '{}');
      const results = Array.isArray(data) ? data : data.ideas || [];
      return results.map((r: any) => ({
        concept: r.concept,
        attributes: r.attributes || {},
        sourceUrls: [],
        sourceCount: r.mergedFrom?.length || 1,
        mergedFrom: r.mergedFrom || [],
        generatedOriginal: false,
      }));
    } catch {
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
    const openai = await this.getClient();
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a curator. Return data strictly as a JSON array.',
        },
        {
          role: 'user',
          content: `We need exactly ${count} ideas for an article about "${topic}". We have ${ideas.length} unique ideas available.
Select the best ${count} ideas. If we have fewer unique ideas than requested, generate additional original ideas to make the total exactly ${count}.

Return strictly a JSON array with structure:
[
  { "index": 0 },
  { "concept": "New generated original idea", "attributes": {} }
]

Available Ideas:
${JSON.stringify(ideas.map((id, idx) => ({ idx, concept: id.concept, attributes: id.attributes })))}`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    try {
      const data = JSON.parse(response.choices[0].message.content || '{}');
      const selection = Array.isArray(data) ? data : data.selection || [];
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

      return selectedList.slice(0, count);
    } catch {
      return ideas.slice(0, count);
    }
  }

  async reorderIdeas(ideas: NormalizedIdeaResult[], topic: string): Promise<NormalizedIdeaResult[]> {
    const openai = await this.getClient();
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a content organizer. Return strictly a JSON array of numbers.',
        },
        {
          role: 'user',
          content: `We are publishing an article about "${topic}".
Reorder the following ${ideas.length} ideas to make the flow engaging, natural, and logical.

Return strictly a JSON array of the reordered index sequence (0-indexed) like [2, 0, 1, ...]:
Available Ideas:
${JSON.stringify(ideas.map((id, idx) => ({ idx, concept: id.concept })))}`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    try {
      const data = JSON.parse(response.choices[0].message.content || '{}');
      const order = Array.isArray(data) ? data : data.order || [];
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
    const openai = await this.getClient();
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an outline creator. Return strictly a JSON outline.',
        },
        {
          role: 'user',
          content: `Create a structured outline for an article on "${config.topic}".
Target audience: ${config.targetAudience} in ${config.targetCountry}. Tone: ${config.tone}.

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
${JSON.stringify(ideas)}`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    try {
      const data = JSON.parse(response.choices[0].message.content || '{}');
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
    const openai = await this.getClient();
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a professional copywriter. Write a full, detailed copy. Return strictly valid JSON.',
        },
        {
          role: 'user',
          content: `Write a completely original, SEO-optimized article based on this outline.
Topic: "${config.topic}". Tone: "${config.tone}". Target: "${config.targetAudience}".

Write:
1. An engaging introduction paragraph (~100-150 words).
2. A detailed body section for EVERY item in the outline. For each item write a substantial descriptive paragraph (~80-120 words).
3. Suggest a highly detailed image prompt for each section.
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
${JSON.stringify(outline)}`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    return JSON.parse(response.choices[0].message.content || '{}') as ArticleContent;
  }

  async generateCaptionsTitle(keyword: string, guidelines?: string): Promise<string> {
    return `OpenAI Captions for ${keyword}`;
  }

  async generateCaptionsSubcategories(title: string, guidelines?: string): Promise<string[]> {
    return ['OpenAI Subcategory 1'];
  }

  async writeCaptionsArticle(title: string, subcategories: string[], guidelines?: string): Promise<ArticleContent> {
    return {
      title,
      slug: 'openai-slug',
      faq: [],
      introduction: 'Intro',
      sections: subcategories.map((s, i) => ({ position: i, heading: s, body: 'Body', imageDescription: 'img', altTextCandidate: 'alt' })),
      conclusion: 'Conclusion',
      metaTitle: 'Meta',
      metaDescription: 'Desc',
      suggestedTags: [],
    };
  }

  async generateImagePrompts(
    sections: Array<{ position: number; heading: string; body: string; concept: string }>,
    watermark: WatermarkConfig,
    style: string,
    ratio: string,
  ): Promise<ImagePromptResult[]> {
    const openai = await this.getClient();
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an image prompt engineer. Return strictly a JSON array.',
        },
        {
          role: 'user',
          content: `For each article section, write a highly descriptive prompt.
Style: "${style}". Aspect Ratio: "${ratio}". Watermark Text: "${watermark.text}".

Return strictly as a JSON array of prompts matching this structure:
[
  { "sectionPosition": 1, "prompt": "AI Image prompt details..." }
]

Sections:
${JSON.stringify(sections.map(s => ({ position: s.position, heading: s.heading, concept: s.concept })))}`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    return JSON.parse(response.choices[0].message.content || '[]') as ImagePromptResult[];
  }

  async qualityCheckContent(article: ArticleContent, config: ArticleConfig): Promise<ContentQCResult> {
    const openai = await this.getClient();
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an editor. Perform quality checks. Return strictly valid JSON.',
        },
        {
          role: 'user',
          content: `Perform a content quality check on this generated article.
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
${JSON.stringify(article)}`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    return JSON.parse(response.choices[0].message.content || '{}') as ContentQCResult;
  }

  async qualityCheckImage(
    imageBase64: string,
    section: { heading: string; body: string; concept: string },
    watermarkText: string,
  ): Promise<ImageQCResult> {
    const openai = await this.getClient();
    
    // Fallback: GPT-4o vision integration check
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this generated image. Compare it to the article heading: "${section.heading}" and watermark: "${watermarkText}".
Return strictly JSON:
{
  "score": 90,
  "ideaMatch": true,
  "watermarkPresent": true,
  "watermarkCorrect": true,
  "visualQuality": "pass",
  "issues": [],
  "status": "PASS"
}`,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
    });

    return JSON.parse(response.choices[0].message.content || '{}') as ImageQCResult;
  }
}
