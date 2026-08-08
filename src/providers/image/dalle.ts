import { OpenAI } from 'openai';
import { prisma } from '@/lib/db';
import type { ImageProvider, ImageOptions, ImageResult } from './types';

export class OpenAiDalleProvider implements ImageProvider {
  private async getApiKey(): Promise<string> {
    const dbSetting = await prisma.setting.findUnique({ where: { key: 'openai_api_key' } });
    if (dbSetting?.value) return dbSetting.value;

    const envKey = process.env.OPENAI_API_KEY;
    if (!envKey) throw new Error('OpenAI API Key is not set in Settings or .env');
    return envKey;
  }

  async generateImage(prompt: string, options: ImageOptions): Promise<ImageResult> {
    const apiKey = await this.getApiKey();
    const openai = new OpenAI({ apiKey });

    try {
      // Use DALL-E 3
      const response = await openai.images.generate({
        model: 'dall-e-3',
        prompt: prompt,
        n: 1,
        size: options.aspectRatio === '1:1' ? '1024x1024' : '1024x1792', // DALL-E supports 1024x1024, 1024x1792, or 1792x1024
        response_format: 'b64_json',
      });

      const base64Data = response.data?.[0]?.b64_json;
      if (!base64Data) throw new Error('DALL-E 3 returned no image data');

      return {
        imageBase64: base64Data,
        mimeType: 'image/png',
        provider: 'openai',
        model: 'dall-e-3',
      };
    } catch (error: any) {
      console.error('DALL-E 3 generation failed:', error.message);
      throw error;
    }
  }
}
