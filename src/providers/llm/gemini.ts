import { GoogleGenerativeAI } from '@google/generative-ai';
import { prisma } from '@/lib/db';
import { WRITER_PROFILES } from './profiles';
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
    if (dbSetting?.value) return dbSetting.value.trim().replace(/^"|"$/g, '');

    // Fallback to environment variable
    const envKey = process.env.GOOGLE_AI_API_KEY;
    if (!envKey) throw new Error('Google AI Studio API Key is not set in Settings or .env');
    return envKey.trim().replace(/^"|"$/g, '');
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

  async selectIdeas(ideas: NormalizedIdeaResult[], count: number, topic: string, customInstruction?: string): Promise<NormalizedIdeaResult[]> {
    const ai = await this.getClient();
    const model = ai.getGenerativeModel({ model: 'models/gemini-3.5-flash-lite' });

    const prompt = `
You are a curator. We need exactly ${count} ideas for an article about "${topic}".
We have ${ideas.length} unique ideas available.
${customInstruction ? `\n${customInstruction}\n` : ''}

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

    const customInstructionsText = config.customInstructions ? `\nCRITICAL CUSTOM INSTRUCTIONS:\n${config.customInstructions}\n` : '';

    const writerProfileStr = config.writerProfile 
      ? WRITER_PROFILES[config.writerProfile]?.systemPrompt 
      : WRITER_PROFILES['standard'].systemPrompt;

    let systemPrompt = `You are a professional content strategist and outlining expert.
${writerProfileStr ? `\nWRITER PROFILE / TONE DIRECTIVES:\n${writerProfileStr}\n` : ''}
We are creating a high-quality article for a target audience.
Target audience: ${config.targetAudience} in ${config.targetCountry}. Tone: ${config.tone}.
We have chosen ${ideas.length} ideas.
${customInstructionsText}

Provide:
1. A catch SEO-friendly title
2. URL slug
3. Introduction plan
4. Conclusion plan
5. FAQ topics (2-3 questions)

CRITICAL JSON RULES:
- The output MUST be a valid, parseable JSON object.
- ALL property names must be double-quoted.
- ALL string values must be double-quoted.
- If you use double quotes inside a string, you MUST escape them (e.g. \\"word\\").
- DO NOT include trailing commas.
- DO NOT wrap the output in markdown code blocks (no \`\`\`json). Just return the raw JSON object starting with { and ending with }.
- DO NOT include any conversational text before or after the JSON.

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
      contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
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

    const customInstructionsText = config.customInstructions ? `\nCRITICAL CUSTOM INSTRUCTIONS:\n${config.customInstructions}\n` : '';

    const writerProfileStr = config.writerProfile 
      ? WRITER_PROFILES[config.writerProfile]?.systemPrompt 
      : WRITER_PROFILES['standard'].systemPrompt;

    // Build the system prompt
    let systemPrompt = `You are an expert article writer.

CRITICAL HUMAN WRITING RULES (AVOID AI TROPES):
- NEVER use common AI vocabulary: delve, tapestry, testament, beacon, pivotal, landscape, navigate, realm, symphony, utilize, showcase, elevate, unveil, embrace, resonate.
- AVOID negative parallelisms ("Not just X, but also Y", "Not X, but Y"). Use direct statements instead.
- AVOID the "Rule of Three" (listing exactly three adjectives or examples repeatedly).
- Do NOT overuse boldface for emphasis. 
- Use standard sentence structures, including basic copulatives ("is" / "are"), rather than constantly varying sentence structures artificially.
- Do not use emoji for formatting. Use standard markdown.
- Do not output collaborative filler like "Certainly! Here is the article..." or "In conclusion". Just write the content.
- Keep the writing natural and human-like.

${writerProfileStr ? `\nWRITER PROFILE / TONE DIRECTIVES:\n${writerProfileStr}\n` : ''}
Topic: "${config.topic}". Tone: "${config.tone}". Target: "${config.targetAudience}".
${customInstructionsText}

Write:
1. An engaging introduction (~150 words) that follows these guidelines:
   - Hook the reader with a relatable question or statement about the topic.
   - Explain the core value or context (why this style/item/event matters).
   - Provide brief, actionable styling advice (e.g., fabrics, pairings, or fit).
   - End with a smooth transition (e.g., "Below, you'll find XX [topic] outfit ideas...").
   - CRITICAL: Break the introduction into 3 or 4 very small, short paragraphs (separated by \\n\\n) to ensure it is easy to read on mobile devices.
2. A detailed body section for EVERY item in the outline. For each item write a substantial descriptive paragraph (~80-120 words) detailing the look, items, styling advice.
3. Suggest a highly detailed image prompt for each section that represents the idea visually.
4. An alt text suggestion.
5. FAQ answers.
6. A strong conclusion.

CRITICAL JSON RULES:
- The output MUST be a valid, parseable JSON object.
- ALL property names must be double-quoted.
- ALL string values must be double-quoted.
- If you use double quotes inside a string, you MUST escape them (e.g. \\"word\\").
- DO NOT include trailing commas.
- DO NOT wrap the output in markdown code blocks (no \`\`\`json). Just return the raw JSON object starting with { and ending with }.
- DO NOT include any conversational text before or after the JSON.

Return strictly as a JSON object matching this structure:
{
  "title": "${outline.title}",
  "slug": "${outline.slug}",
  "introduction": "Full intro text broken into small paragraphs separated by \\n\\n...",
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
      contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });

    const text = response.response.text();
    try {
      const startIndex = text.indexOf('{');
      const endIndex = text.lastIndexOf('}');
      let parsed: ArticleContent;
      if (startIndex !== -1 && endIndex !== -1) {
        const cleanJson = text.substring(startIndex, endIndex + 1);
        parsed = JSON.parse(cleanJson) as ArticleContent;
      } else {
        parsed = JSON.parse(text) as ArticleContent;
      }
      
      // Fallbacks in case LLM omits fields
      if (!parsed.title) parsed.title = outline.title;
      if (!parsed.slug) parsed.slug = outline.slug;
      if (!parsed.introduction) parsed.introduction = outline.introductionPlan || '';
      if (!parsed.conclusion) parsed.conclusion = outline.conclusionPlan || '';
      
      return parsed;
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

    // ── Load 2-3 random reference images from disk ──────────────────────────
    // Images sit in the "Ai Reference Images" folder at the project root.
    // We pick 3 different ones at random every call so Gemini sees variety.
    const { readdirSync, readFileSync } = await import('fs');
    const path = await import('path');

    const refDir = path.join(process.cwd(), 'Ai Reference Images');
    let allImages: string[] = [];
    try {
      allImages = readdirSync(refDir).filter(f =>
        /\.(webp|jpg|jpeg|png)$/i.test(f)
      );
    } catch {
      // Folder not accessible at runtime (e.g. edge env) — skip images
    }

    // Shuffle and pick 3
    const shuffled = allImages.sort(() => Math.random() - 0.5);
    const picked = shuffled.slice(0, 3);

    // Build inline image parts for Gemini multimodal
    const imageParts: Array<{ inlineData: { mimeType: string; data: string } }> = [];
    for (const filename of picked) {
      try {
        const filePath = path.join(refDir, filename);
        const data = readFileSync(filePath).toString('base64');
        imageParts.push({
          inlineData: {
            mimeType: 'image/webp',
            data,
          },
        });
      } catch {
        // Skip unreadable files
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    const textPrompt = `
You are an expert AI fashion photography art director. Your job is to write HIGHLY DESCRIPTIVE image prompts for the Flux-1-Schnell AI image model.

${imageParts.length > 0 ? `I am sending you ${imageParts.length} real Pinterest fashion reference photos above. Study them carefully:
- Note the EXACT type of outdoor environment (European streets with climbing vines, coastal stone patios, lush garden with blooming flowers, dappled-light parks, sunny promenades)
- Note the lighting quality (warm golden-hour, soft natural daylight, bright midday)  
- Note the model (brunette, sun-kissed, 28-38, natural confident expression)
- Note how every garment is clearly visible in full-body or 3/4 length shots
Your prompts MUST recreate this exact real-world lifestyle photography quality and these specific environments.
` : ''}

CRITICAL: Flux-1-Schnell is a 4-step fast model that LOSES MICRO-DETAIL with short prompts. You MUST write prompts of at least 120 words to force it to capture all garment textures, accessories, and background details.

MANDATORY RULES:
1. NEVER use the article topic name (NEVER write "crop top ideas" or "strapless dress outfit ideas" — instead describe a specific styled look)
2. Describe ONE fully-styled outfit per section: exact fabric (linen, ribbed knit, chiffon, denim), exact color, garment name, fit/silhouette
3. List EVERY accessory: shoes (brand-style, color, heel type), bag (shape, material, color, strap), jewellery (earrings, necklace, bracelet), sunglasses
4. Describe the BACKGROUND in detail: e.g. "sun-drenched European pedestrian street, white-painted rendered building walls with cascading green ivy vines, warm terracotta-tiled pavement" OR "rocky coastal stone patio overlooking bright turquoise Mediterranean sea, woven rattan cafe chairs, thatched canopy overhead" OR "lush English cottage garden, blooming white hydrangeas and pink roses, old stone pathway, soft dappled afternoon light" OR "dappled-light city park under a large oak tree, white picnic blanket on green grass, soft bokeh foliage background"
5. Always describe the model: aged 28-38, warm sun-kissed skin, long wavy brunette hair, warm confident smile, relaxed natural pose
6. End with: "Shot on 85mm DSLR, cinematic depth of field, sharp focus on subject, soft natural light, magazine editorial quality, highly photorealistic."

Return STRICTLY as a JSON array (no markdown, no code fences, no explanation):
[
  { "sectionPosition": 1, "prompt": "..." },
  { "sectionPosition": 2, "prompt": "..." }
]

Article sections to generate prompts for:
${JSON.stringify(sections.map(s => ({ position: s.position, heading: s.heading, concept: s.concept, bodySnippet: s.body.slice(0, 400) })))}
`;

    const parts: any[] = [
      ...imageParts,
      { text: textPrompt },
    ];

    const response = await model.generateContent({
      contents: [{ role: 'user', parts }],
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

  // ─── Captions Workflow Methods ──────────────────────────────────────────────

  async generateCaptionsTitle(keyword: string, guidelines?: string): Promise<string> {
    const ai = await this.getClient();
    const model = ai.getGenerativeModel({ model: 'models/gemini-3.5-flash-lite' });

    const prompt = `
You are an expert social media content strategist. The user wants to write an article with hundreds of captions for the keyword: "${keyword}".
Your task is to generate exactly ONE catchy title for this article (e.g., "160+ Weather Captions").

${guidelines ? `Guidelines:\n${guidelines}\n` : ''}

Return strictly a JSON object:
{ "title": "Your Generated Title Here" }
`;

    const response = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });

    try {
      const data = JSON.parse(response.response.text());
      return data.title || \`150+ Captions for \${keyword}\`;
    } catch {
      return \`150+ Captions for \${keyword}\`;
    }
  }

  async generateCaptionsSubcategories(title: string, guidelines?: string): Promise<string[]> {
    const ai = await this.getClient();
    const model = ai.getGenerativeModel({ model: 'models/gemini-3.5-flash-lite' });

    const prompt = `
You are an expert social media content strategist. The user is writing an article titled: "${title}".
Your task is to generate 5 to 10 subcategories/subheadings for this article.
For example, if the title is about "Weather Captions", subcategories might be "Aesthetic Weather Captions", "Warm Weather Captions", "Cold Weather Captions", etc.

${guidelines ? `Guidelines:\n${guidelines}\n` : ''}

Return strictly a JSON array of strings representing the subcategories:
["Subcategory 1", "Subcategory 2", "Subcategory 3"]
`;

    const response = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });

    try {
      return JSON.parse(response.response.text());
    } catch {
      return ['General Captions', 'Aesthetic Captions', 'Short Captions'];
    }
  }

  async writeCaptionsArticle(title: string, subcategories: string[], guidelines?: string): Promise<ArticleContent> {
    const ai = await this.getClient();
    const model = ai.getGenerativeModel({ model: 'models/gemini-3.5-flash-lite' });

    const prompt = `
You are an expert social media copywriter. You are writing an article titled: "${title}".
The article has the following subcategories: ${JSON.stringify(subcategories)}.

Task:
1. Write an engaging introduction (~150 words).
2. For EACH subcategory, generate 10 to 20 highly engaging, trendy captions. Format them nicely using HTML (e.g., <ul><li>Caption 1</li><li>Caption 2</li></ul>) inside the body of that section.
3. Generate a highly detailed image prompt for EACH subcategory that visualizes one of the captions.
4. Write a conclusion.

${guidelines ? `Guidelines:\n${guidelines}\n` : ''}

Return strictly a JSON object matching this structure:
{
  "title": "${title}",
  "slug": "captions-slug",
  "introduction": "Intro text...",
  "sections": [
    {
      "position": 1,
      "heading": "Subcategory 1",
      "body": "<ul><li>Caption 1</li>...</ul>",
      "imageDescription": "Detailed image prompt...",
      "altTextCandidate": "Alt text..."
    }
  ],
  "faq": [],
  "conclusion": "Conclusion text...",
  "metaTitle": "SEO title",
  "metaDescription": "SEO meta description",
  "suggestedTags": ["captions", "instagram"]
}
`;

    const response = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });

    try {
      return JSON.parse(response.response.text()) as ArticleContent;
    } catch {
      throw new Error("Failed to generate captions article content.");
    }
  }
}
