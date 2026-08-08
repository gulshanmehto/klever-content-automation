import type { LLMProvider } from './llm/types';
import type { ImageProvider } from './image/types';
import type { ScraperProvider } from './scraper/types';
import type { DriveProvider } from './drive/types';
import type { WordPressProvider } from './wordpress/types';

import { GeminiLLMProvider } from './llm/gemini';
import { GeminiImagenProvider } from './image/imagen';
import { CloudflareWorkersAIImageProvider } from './image/cloudflare-ai';
import { HttpScraperProvider } from './scraper/http-scraper';
import { GoogleDriveProvider } from './drive/google-drive';
import { WPRestProvider } from './wordpress/wp-rest';

// Singletons
let llmProvider: LLMProvider | null = null;
let imageProvider: ImageProvider | null = null;
let scraperProvider: ScraperProvider | null = null;
let driveProvider: DriveProvider | null = null;

export function getLLMProvider(): LLMProvider {
  if (!llmProvider) {
    llmProvider = new GeminiLLMProvider();
  }
  return llmProvider;
}

export function getImageProvider(): ImageProvider {
  if (!imageProvider) {
    // If Cloudflare config variables are active, switch over to Workers AI image engine dynamically
    if (process.env.CLOUDFLARE_API_TOKEN) {
      imageProvider = new CloudflareWorkersAIImageProvider();
    } else {
      imageProvider = new GeminiImagenProvider();
    }
  }
  return imageProvider;
}

export function getScraperProvider(): ScraperProvider {
  if (!scraperProvider) {
    scraperProvider = new HttpScraperProvider();
  }
  return scraperProvider;
}

export function getDriveProvider(): DriveProvider {
  if (!driveProvider) {
    driveProvider = new GoogleDriveProvider();
  }
  return driveProvider;
}

export function getWordPressProvider(wpBaseUrl: string, username: string, appPassword: string): WordPressProvider {
  return new WPRestProvider(wpBaseUrl, username, appPassword);
}
