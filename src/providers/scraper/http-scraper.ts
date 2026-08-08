/**
 * HTTP Scraper Provider
 * Uses axios + cheerio + node-html-parser for content extraction.
 * node-html-parser is pure JS with no ESM/CJS conflicts — works on Vercel serverless.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import type { ScraperProvider, ScrapedPage } from './types';

export class HttpScraperProvider implements ScraperProvider {
  private readonly timeout = 15000;
  private readonly userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  async fetchPage(url: string): Promise<ScrapedPage> {
    try {
      const response = await axios.get(url, {
        timeout: this.timeout,
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        maxRedirects: 5,
      });

      const html = response.data;
      return this.extractWithCheerio(url, html);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown fetch error';
      return {
        url,
        title: '',
        content: '',
        headings: [],
        success: false,
        error: errMsg,
      };
    }
  }

  async fetchRenderedPage(url: string): Promise<ScrapedPage> {
    return this.fetchPage(url);
  }

  private extractWithCheerio(url: string, html: string): ScrapedPage {
    try {
      const $ = cheerio.load(html);

      // Remove noise elements
      $('nav, footer, sidebar, .sidebar, .nav, .footer, .header, .menu').remove();
      $('script, style, noscript, iframe').remove();
      $('.ad, .ads, .advertisement, .banner, [class*="cookie"]').remove();
      $('.comment, .comments, #comments, .related-posts').remove();
      $('.newsletter, .subscribe, .social-share').remove();
      $('[class*="popup"], [class*="modal"]').remove();

      // Get title
      const title =
        $('h1').first().text().trim() ||
        $('title').text().trim() ||
        $('meta[property="og:title"]').attr('content') ||
        '';

      // Try to find the main content block
      const mainSelectors = [
        'article',
        'main',
        '.post-content',
        '.entry-content',
        '.article-content',
        '.content',
        '#content',
      ];
      let contentElement = null;
      for (const selector of mainSelectors) {
        const el = $(selector).first();
        if (el.length && el.text().trim().length > 200) {
          contentElement = el;
          break;
        }
      }

      if (!contentElement) {
        contentElement = $('body');
      }

      // Extract headings
      const headings = this.extractHeadings($);

      // Extract and clean text content
      const content = contentElement
        .text()
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n\n')
        .trim();

      return {
        url,
        title,
        content,
        headings,
        success: content.length > 100,
        error: content.length <= 100 ? 'Could not extract sufficient content' : undefined,
      };
    } catch (error) {
      return {
        url,
        title: '',
        content: '',
        headings: [],
        success: false,
        error: error instanceof Error ? error.message : 'Extraction failed',
      };
    }
  }

  private extractHeadings($: ReturnType<typeof cheerio.load>): Array<{ level: number; text: string }> {
    const headings: Array<{ level: number; text: string }> = [];
    $('h1, h2, h3').each((_, el) => {
      const tagName = (el as any).tagName || (el as any).name || '';
      const level = parseInt(tagName.toLowerCase().replace('h', ''), 10);
      const text = $(el).text().trim();
      if (text && level >= 1 && level <= 3) {
        headings.push({ level, text });
      }
    });
    return headings;
  }
}
