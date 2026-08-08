/**
 * Mock Image Provider
 * Generates a placeholder image for development/testing.
 */

import type { ImageProvider, ImageOptions, ImageResult } from './types';

export class MockImageProvider implements ImageProvider {
  async generateImage(prompt: string, options: ImageOptions): Promise<ImageResult> {
    // Simulate generation delay
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

    // Generate a simple SVG placeholder as base64
    const width = options.width || 1024;
    const height = options.height || 576;
    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const shortPrompt = prompt.substring(0, 60).replace(/[<>&'"]/g, '');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="100%" height="100%" fill="${color}" opacity="0.15"/>
      <rect x="10" y="10" width="${width-20}" height="${height-20}" rx="16" fill="white" stroke="${color}" stroke-width="2" opacity="0.8"/>
      <text x="50%" y="45%" text-anchor="middle" font-family="Arial" font-size="18" fill="${color}" font-weight="bold">AI Generated Image</text>
      <text x="50%" y="55%" text-anchor="middle" font-family="Arial" font-size="12" fill="#666">${shortPrompt}...</text>
      <rect x="${width/2 - 100}" y="${height - 50}" width="200" height="30" fill="white" stroke="black" stroke-width="1" rx="4"/>
      <text x="50%" y="${height - 30}" text-anchor="middle" font-family="Arial" font-size="11" fill="black">mock-watermark.com</text>
    </svg>`;

    const base64 = Buffer.from(svg).toString('base64');

    return {
      imageBase64: base64,
      mimeType: 'image/svg+xml',
      provider: 'mock',
      model: 'mock-v1',
    };
  }
}
