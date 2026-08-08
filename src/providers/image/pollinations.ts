import axios from 'axios';
import type { ImageProvider, ImageOptions, ImageResult } from './types';

export class PollinationsImageProvider implements ImageProvider {
  async generateImage(prompt: string, options: ImageOptions): Promise<ImageResult> {
    try {
      // Clean prompt for url path query parameters
      const cleanPrompt = prompt.replace(/[^a-zA-Z0-9\s]/g, '').substring(0, 200);
      const width = options.aspectRatio === '1:1' ? 1024 : 1024;
      const height = options.aspectRatio === '1:1' ? 1024 : 576;
      
      const imageUrl = `https://image.pollinations.ai/p/${encodeURIComponent(cleanPrompt)}?width=${width}&height=${height}&seed=${Math.floor(Math.random() * 1000000)}&nologo=true`;

      // Fetch the generated image from Pollinations as buffer
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 45000
      });

      const buffer = Buffer.from(response.data);
      const base64Data = buffer.toString('base64');

      return {
        imageBase64: base64Data,
        mimeType: 'image/jpeg',
        provider: 'pollinations',
        model: 'flux', // Pollinations.ai runs Flux models on backend
      };
    } catch (error: any) {
      console.error('Pollinations image generation failed:', error.message);
      throw error;
    }
  }
}
