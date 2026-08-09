import { google } from 'googleapis';
import axios from 'axios';
import type { ImageProvider, ImageOptions, ImageResult } from './types';

export class VertexAIImageProvider implements ImageProvider {
  private async getAccessToken(projectId: string, clientEmail: string, privateKey: string): Promise<string> {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: clientEmail,
        private_key: privateKey.replace(/\\n/g, '\n'), // Ensure proper newlines
        project_id: projectId,
      },
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });

    const client = await auth.getClient();
    const token = await client.getAccessToken();
    
    if (!token.token) {
      throw new Error('Failed to generate Google Cloud access token');
    }
    
    return token.token;
  }

  async generateImage(prompt: string, options: ImageOptions): Promise<ImageResult> {
    const projectId = process.env.GCP_PROJECT_ID;
    const region = process.env.GCP_REGION || 'us-central1';
    const clientEmail = process.env.GCP_CLIENT_EMAIL;
    const privateKey = process.env.GCP_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('Missing Google Cloud credentials (GCP_PROJECT_ID, GCP_CLIENT_EMAIL, GCP_PRIVATE_KEY) in .env');
    }

    try {
      const accessToken = await this.getAccessToken(projectId, clientEmail, privateKey);
      
      const model = 'imagen-4.0-fast-generate-001';
      const endpoint = `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/publishers/google/models/${model}:predict`;

      // Define aspect ratio based on options
      let aspectRatio = '1:1';
      if (options.width && options.height) {
        if (options.width > options.height) {
          aspectRatio = '16:9';
        } else if (options.height > options.width) {
          aspectRatio = '9:16';
        }
      }

      const payload = {
        instances: [
          {
            prompt: prompt,
          }
        ],
        parameters: {
          sampleCount: 1,
          aspectRatio: aspectRatio,
          personGeneration: 'ALLOW_ADULT', // Allow people generation if policy permits
        }
      };

      const response = await axios.post(
        endpoint,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=utf-8',
          },
        }
      );

      const predictions = response.data.predictions;
      if (predictions && predictions.length > 0) {
        const prediction = predictions[0];
        
        // Vertex AI returns the image in either `bytesBase64Encoded` or `bytes`
        const base64Image = prediction.bytesBase64Encoded || prediction.bytes;
        
        if (base64Image) {
          return {
            imageBase64: base64Image,
            mimeType: prediction.mimeType || 'image/png',
            provider: 'vertex-ai',
            model: model,
          };
        }
      }

      throw new Error('No image data returned from Vertex AI');

    } catch (error: any) {
      console.error('Vertex AI Image Generation Error:', error.response?.data || error.message);
      
      // Provide a fallback SVG if Generation Fails
      const width = options.width || 1024;
      const height = options.height || 576;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <rect width="100%" height="100%" fill="#fee2e2"/>
        <text x="50%" y="50%" text-anchor="middle" font-family="Arial" font-size="16" fill="#ef4444">Vertex AI Gen Failed</text>
      </svg>`;

      return {
        imageBase64: Buffer.from(svg).toString('base64'),
        mimeType: 'image/svg+xml',
        provider: 'vertex-ai-fallback',
        model: 'imagen-4.0-fast-generate-001',
      };
    }
  }
}
