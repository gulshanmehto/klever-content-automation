/**
 * LLM Provider Interface
 * Abstracts AI language model operations for easy provider switching.
 * Per spec §46: modular service abstraction.
 */

export interface CompetitorAnalysis {
  sourceUrl: string;
  articleTitle: string;
  articleTheme: string;
  ideas: RawIdea[];
}

export interface RawIdea {
  sourceHeading: string;
  normalizedConcept: string;
  attributes: Record<string, string>;
}

export interface NormalizedIdeaResult {
  concept: string;
  attributes: Record<string, string>;
  sourceUrls: string[];
  sourceCount: number;
  mergedFrom: string[];
  generatedOriginal: boolean;
}

export interface SelectedIdea {
  concept: string;
  attributes: Record<string, string>;
  initialOrder: number;
  finalOrder: number;
}

export interface ArticleOutline {
  title: string;
  slug: string;
  introductionPlan: string;
  sections: Array<{
    position: number;
    heading: string;
    concept: string;
    attributes: Record<string, string>;
  }>;
  faqTopics: Array<{ question: string; answerPlan: string }>;
  conclusionPlan: string;
}

export interface ArticleContent {
  title: string;
  slug: string;
  introduction: string;
  sections: Array<{
    position: number;
    heading: string;
    body: string;
    imageDescription: string;
    altTextCandidate: string;
  }>;
  faq: Array<{ question: string; answer: string }>;
  conclusion: string;
  metaTitle: string;
  metaDescription: string;
  suggestedTags: string[];
}

export interface ContentQCResult {
  score: number;
  requestedIdeas: number;
  actualIdeas: number;
  duplicateIdeas: number;
  structureScore: number;
  grammarScore: number;
  originalityScore: number;
  seoScore: number;
  issues: string[];
  status: 'PASS' | 'FAIL';
}

export interface ImageQCResult {
  score: number;
  ideaMatch: boolean;
  watermarkPresent: boolean;
  watermarkCorrect: boolean;
  visualQuality: 'pass' | 'fail';
  issues: string[];
  status: 'PASS' | 'FAIL';
}

export interface ArticleConfig {
  topic: string;
  targetCountry: string;
  targetAudience: string;
  tone: string;
  requestedIdeaCount: number;
  wordCountTarget?: number;
  category?: string;
}

export interface WatermarkConfig {
  text: string;
  placement: string;
}

export interface ImagePromptResult {
  sectionPosition: number;
  prompt: string;
}

export interface LLMProvider {
  analyzeCompetitors(contents: Array<{ url: string; text: string }>): Promise<CompetitorAnalysis[]>;
  normalizeAndDeduplicateIdeas(ideas: RawIdea[], topic: string): Promise<NormalizedIdeaResult[]>;
  selectIdeas(ideas: NormalizedIdeaResult[], count: number, topic: string): Promise<NormalizedIdeaResult[]>;
  reorderIdeas(ideas: NormalizedIdeaResult[], topic: string): Promise<NormalizedIdeaResult[]>;
  createOutline(ideas: NormalizedIdeaResult[], config: ArticleConfig): Promise<ArticleOutline>;
  writeArticle(outline: ArticleOutline, config: ArticleConfig): Promise<ArticleContent>;
  generateImagePrompts(
    sections: Array<{ position: number; heading: string; body: string; concept: string }>,
    watermark: WatermarkConfig,
    style: string,
    ratio: string,
  ): Promise<ImagePromptResult[]>;
  qualityCheckContent(article: ArticleContent, config: ArticleConfig): Promise<ContentQCResult>;
  qualityCheckImage(
    imageBase64: string,
    section: { heading: string; body: string; concept: string },
    watermarkText: string,
  ): Promise<ImageQCResult>;
}
