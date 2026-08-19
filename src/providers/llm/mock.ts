/**
 * Mock LLM Provider
 * Returns realistic fake data for development/testing without API keys.
 */

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

export class MockLLMProvider implements LLMProvider {
  private delay(ms: number = 1000): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async analyzeCompetitors(contents: Array<{ url: string; text: string }>): Promise<CompetitorAnalysis[]> {
    await this.delay(2000);
    return contents.map((content, idx) => ({
      sourceUrl: content.url,
      articleTitle: `Competitor Article ${idx + 1}`,
      articleTheme: 'Lifestyle & Fashion',
      ideas: Array.from({ length: 15 + Math.floor(Math.random() * 20) }, (_, i) => ({
        sourceHeading: `Idea ${i + 1} from Competitor ${idx + 1}`,
        normalizedConcept: `Concept ${i + 1}: Sample idea about ${['summer outfits', 'casual wear', 'formal attire', 'street style', 'minimalist fashion'][i % 5]}`,
        attributes: {
          style: ['casual', 'formal', 'street', 'minimalist', 'bohemian'][i % 5],
          occasion: ['daily', 'work', 'weekend', 'date night', 'travel'][i % 5],
        },
      })),
    }));
  }

  async normalizeAndDeduplicateIdeas(ideas: RawIdea[], topic: string): Promise<NormalizedIdeaResult[]> {
    await this.delay(1500);
    // Simulate deduplication — reduce count by ~30%
    const uniqueCount = Math.max(10, Math.floor(ideas.length * 0.7));
    return Array.from({ length: uniqueCount }, (_, i) => ({
      concept: `${topic} - Idea ${i + 1}: ${['Linen pants with fitted top', 'Denim skirt with white tee', 'Maxi dress for summer', 'Blazer with joggers', 'Floral print sundress'][i % 5]}`,
      attributes: { style: 'modern', occasion: 'versatile' },
      sourceUrls: ['https://competitor1.com', 'https://competitor2.com'].slice(0, (i % 2) + 1),
      sourceCount: (i % 2) + 1,
      mergedFrom: [`Original idea A-${i}`, `Original idea B-${i}`].slice(0, (i % 2) + 1),
      generatedOriginal: i > uniqueCount - 3,
    }));
  }

  async selectIdeas(ideas: NormalizedIdeaResult[], count: number, topic: string, customInstruction?: string): Promise<NormalizedIdeaResult[]> {
    await this.delay(1000);
    return ideas.slice(0, count);
  }

  async reorderIdeas(ideas: NormalizedIdeaResult[]): Promise<NormalizedIdeaResult[]> {
    await this.delay(800);
    // Simulate smart reordering by shuffling
    return [...ideas].sort(() => Math.random() - 0.5);
  }

  async createOutline(ideas: NormalizedIdeaResult[], config: ArticleConfig): Promise<ArticleOutline> {
    await this.delay(1500);
    return {
      title: `${config.requestedIdeaCount} ${config.topic}`,
      slug: config.topic.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      introductionPlan: `An engaging introduction about ${config.topic} for ${config.targetAudience} audience.`,
      sections: ideas.map((idea, i) => ({
        position: i + 1,
        heading: idea.concept.split(':')[1]?.trim() || idea.concept,
        concept: idea.concept,
        attributes: idea.attributes,
      })),
      faqTopics: [
        { question: `What are the best ${config.topic.toLowerCase()}?`, answerPlan: 'Discuss top recommendations' },
        { question: `How to style ${config.topic.toLowerCase()}?`, answerPlan: 'Provide styling tips' },
      ],
      conclusionPlan: `Summarize the key takeaways about ${config.topic}.`,
    };
  }

  async writeArticle(outline: ArticleOutline, config: ArticleConfig): Promise<ArticleContent> {
    await this.delay(3000);
    return {
      title: outline.title,
      slug: outline.slug,
      introduction: `Welcome to our comprehensive guide on ${config.topic}. Whether you're looking for inspiration or practical ideas, we've curated the best ${config.requestedIdeaCount} options that are perfect for ${config.targetAudience}. From casual everyday looks to statement pieces, there's something here for everyone.`,
      sections: outline.sections.map((section) => ({
        position: section.position,
        heading: section.heading,
        body: `This is a beautifully crafted section about "${section.heading}". It provides detailed information, styling tips, and practical advice for ${config.targetAudience}. The ${section.heading.toLowerCase()} is a versatile choice that works well for multiple occasions. Consider pairing it with complementary accessories for a complete look. This option has been trending recently and is perfect for the current season.`,
        imageDescription: `A stylish ${section.heading.toLowerCase()} photographed in natural lighting`,
        altTextCandidate: `${section.heading} - ${config.topic}`,
      })),
      faq: outline.faqTopics.map((faq) => ({
        question: faq.question,
        answer: `Great question! ${faq.answerPlan}. Here are some key tips to consider when exploring this topic.`,
      })),
      conclusion: `We hope this guide to ${config.topic} has given you plenty of inspiration. Remember, the best style is one that makes you feel confident and comfortable. Don't be afraid to experiment with different combinations and make each look your own.`,
      metaTitle: `${outline.title} | ${new Date().getFullYear()} Guide`,
      metaDescription: `Discover the best ${config.topic.toLowerCase()} curated for ${config.targetAudience}. ${config.requestedIdeaCount} hand-picked ideas with styling tips and inspiration.`,
      suggestedTags: [config.topic.split(' ')[0], 'style', 'fashion', 'guide', new Date().getFullYear().toString()],
    };
  }

  async generateImagePrompts(
    sections: Array<{ position: number; heading: string; body: string; concept: string }>,
    watermark: WatermarkConfig,
    style: string,
    ratio: string,
  ): Promise<ImagePromptResult[]> {
    await this.delay(1500);
    return sections.map((section) => ({
      sectionPosition: section.position,
      prompt: `${style} photograph of ${section.heading.toLowerCase()}. Clean, well-lit composition. ${ratio} aspect ratio. Professional quality. ${watermark.placement.replace(/\{text\}/g, watermark.text)} At the bottom footer of the image, add a clean white rectangular box with a thin black border. Center the text '${watermark.text}' inside the white box in clear black typography.`,
    }));
  }

  async qualityCheckContent(article: ArticleContent, config: ArticleConfig): Promise<ContentQCResult> {
    await this.delay(1000);
    return {
      score: 92,
      requestedIdeas: config.requestedIdeaCount,
      actualIdeas: article.sections.length,
      duplicateIdeas: 0,
      structureScore: 95,
      grammarScore: 90,
      originalityScore: 88,
      seoScore: 93,
      issues: [],
      status: 'PASS',
    };
  }

  // ─── Captions Workflow Methods ──────────────────────────────────────────────
  async generateCaptionsTitle(keyword: string, count: number, guidelines?: string): Promise<string> {
    return `${count}+ ${keyword} Captions Mock Title`;
  }

  async generateCaptionsSubcategories(title: string, count: number, guidelines?: string): Promise<string[]> {
    return ['Mock Subcategory 1', 'Mock Subcategory 2'];
  }

  async writeCaptionsArticle(title: string, subcategories: string[], count: number, guidelines?: string): Promise<ArticleContent> {
    return {
      title,
      slug: 'mock-captions-slug',
      introduction: 'Mock Intro',
      sections: subcategories.map((s, i) => ({
        position: i + 1,
        heading: s,
        body: '<ul><li>Mock Caption 1</li><li>Mock Caption 2</li></ul>',
        imageDescription: 'Mock image desc',
        altTextCandidate: 'Mock alt text'
      })),
      faq: [],
      conclusion: 'Mock Conclusion',
      metaTitle: 'Mock Meta',
      metaDescription: 'Mock Desc',
      suggestedTags: ['mock']
    };
  }

  async qualityCheckImage(
    imageBase64: string,
    section: { heading: string; body: string; concept: string },
    watermarkText: string,
  ): Promise<ImageQCResult> {
    await this.delay(500);
    const score = 85 + Math.floor(Math.random() * 15);
    return {
      score,
      ideaMatch: true,
      watermarkPresent: true,
      watermarkCorrect: true,
      visualQuality: 'pass',
      issues: [],
      status: score >= 85 ? 'PASS' : 'FAIL',
    };
  }
}
