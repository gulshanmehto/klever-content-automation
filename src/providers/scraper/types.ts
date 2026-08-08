/**
 * Scraper Provider Interface
 * Per spec §9: fallback between simple HTTP and rendered fetching
 */

export interface ScrapedPage {
  url: string;
  title: string;
  content: string; // Cleaned article text
  headings: Array<{ level: number; text: string }>;
  success: boolean;
  error?: string;
}

export interface ScraperProvider {
  fetchPage(url: string): Promise<ScrapedPage>;
  fetchRenderedPage(url: string): Promise<ScrapedPage>;
}
