import { GoogleGenerativeAI } from '@google/generative-ai';
import { prisma } from '@/lib/db';
import type { ImageProvider, ImageOptions, ImageResult } from './types';

export class GeminiImagenProvider implements ImageProvider {
  private async getApiKey(): Promise<string> {
    const dbSetting = await prisma.setting.findUnique({ where: { key: 'google_ai_api_key' } });
    if (dbSetting?.value) return dbSetting.value;

    const envKey = process.env.GOOGLE_AI_API_KEY;
    if (!envKey) throw new Error('Google AI Studio API Key is not set in Settings or .env');
    return envKey;
  }

  // Static tracking to enforce 1 request per minute (60s spacing) locally
  private static lastRequestTime = 0;

  async generateImage(prompt: string, options: ImageOptions): Promise<ImageResult> {
    const apiKey = await this.getApiKey();
    const ai = new GoogleGenerativeAI(apiKey);
    
    // Use the gemini-2.5-flash-image model via Gemini API
    const model = ai.getGenerativeModel({ model: 'models/gemini-2.5-flash-image' });

    let attempts = 0;
    const maxAttempts = 4;
    let delay = 2000; // start with 2s

    while (attempts < maxAttempts) {
      try {
        // 1. Enforce a local delay of 60 seconds since the last successful/attempted image request
        const now = Date.now();
        const timePassed = now - GeminiImagenProvider.lastRequestTime;
        if (timePassed < 60000) {
          const waitTime = 60000 - timePassed;
          console.log(`[Token Bucket] Spacing request: Waiting ${Math.ceil(waitTime / 1000)}s to avoid Gemini API Rate Limit...`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
        
        GeminiImagenProvider.lastRequestTime = Date.now();
        attempts++;

        const response = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });

        // The Imagen API response returns image parts as inlineData bytes
        const candidate = response.response.candidates?.[0];
        const part = candidate?.content?.parts?.[0];

        if (part?.inlineData?.data) {
          return {
            imageBase64: part.inlineData.data,
            mimeType: part.inlineData.mimeType || 'image/jpeg',
            provider: 'imagen',
            model: 'gemini-2.5-flash-image',
          };
        }

        throw new Error('No image data found in response parts');
      } catch (error: any) {
        const errorMsg = error.message || '';
        const isRateLimit = errorMsg.includes('429') || errorMsg.toLowerCase().includes('quota');

        if (isRateLimit && attempts < maxAttempts) {
          console.warn(`[429 Rate Limit] Attempt ${attempts} failed. Retrying in ${delay / 1000}s... Error: ${errorMsg}`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2; // Exponential Backoff: 2s -> 4s -> 8s -> 16s
          continue;
        }

        console.error('Imagen generation failed, falling back to SVG placeholder:', errorMsg);
        
        // Fallback SVG image in case of API issues/billing limitations
        const width = options.width || 1024;
        const height = options.height || 576;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
          <rect width="100%" height="100%" fill="#eef2ff"/>
          <text x="50%" y="50%" text-anchor="middle" font-family="Arial" font-size="16" fill="#4f46e5">${prompt.substring(0, 50)}...</text>
        </svg>`;

        return {
          imageBase64: Buffer.from(svg).toString('base64'),
          mimeType: 'image/svg+xml',
          provider: 'imagen-fallback',
          model: 'imagen-3.0',
        };
      }
    }

    // Default return wrapper in case loop completes without returning
    throw new Error('Failed to generate image after maximum retries');
  }
}
