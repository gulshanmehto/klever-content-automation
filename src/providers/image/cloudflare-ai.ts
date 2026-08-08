import { prisma } from '@/lib/db';
import type { ImageProvider, ImageOptions, ImageResult } from './types';

export class CloudflareWorkersAIImageProvider implements ImageProvider {
  private async getCredentials(): Promise<{ accountId: string; apiToken: string }> {
    const accountIdSetting = await prisma.setting.findUnique({ where: { key: 'cloudflare_account_id' } });
    const apiTokenSetting = await prisma.setting.findUnique({ where: { key: 'cloudflare_api_token' } });

    const accountId = accountIdSetting?.value || process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = apiTokenSetting?.value || process.env.CLOUDFLARE_API_TOKEN;

    if (!accountId || !apiToken) {
      throw new Error('Cloudflare Account ID or API Token is not configured in Settings or .env');
    }
    return { accountId, apiToken };
  }

  // Track daily neuron budget to enforce free limits
  private async checkAndIncrementNeuronUsage(neuronsToUse: number): Promise<boolean> {
    const todayStr = new Date().toISOString().split('T')[0];
    const key = `cf_neurons_used_${todayStr}`;

    const usageSetting = await prisma.setting.findUnique({ where: { key } });
    const currentUsage = usageSetting ? parseInt(usageSetting.value, 10) : 0;

    // Enforce strict Cloudflare Workers AI free tier limit: 10,000 neurons max per day
    if (currentUsage + neuronsToUse > 10000) {
      console.warn(`[Cloudflare AI Budget] Request blocked. Daily neuron limit of 10,000 reached. Current: ${currentUsage}, Attempted: +${neuronsToUse}`);
      return false;
    }

    // Save updated neuron usage for today
    await prisma.setting.upsert({
      where: { key },
      update: { value: String(currentUsage + neuronsToUse) },
      create: { key, value: String(neuronsToUse) },
    });
    return true;
  }

  async generateImage(prompt: string, options: ImageOptions): Promise<ImageResult> {
    const neuronCost = 200; // SDXL XL Base model cost estimate: ~200 neurons per generation

    // 1. Enforce free tier budget limits before executing API calls
    const budgetOk = await this.checkAndIncrementNeuronUsage(neuronCost);
    if (!budgetOk) {
      return this.fallbackSvg(prompt, options, 'Daily 10,000 Cloudflare Neuron limit reached. Generation skipped.');
    }

    try {
      const { accountId, apiToken } = await this.getCredentials();
      const model = '@cf/stabilityai/stable-diffusion-xl-base-1.0';

      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: prompt,
            num_steps: 20,
            guidance_scale: 7.5,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Cloudflare AI API request failed: ${response.status} ${errorText}`);
      }

      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');

      return {
        imageBase64: base64,
        mimeType: 'image/jpeg',
        provider: 'cloudflare-ai',
        model: 'stable-diffusion-xl-base-1.0',
      };
    } catch (e: any) {
      console.error('Cloudflare Workers AI generation failed, falling back to SVG:', e.message);
      return this.fallbackSvg(prompt, options, e.message);
    }
  }

  private fallbackSvg(prompt: string, options: ImageOptions, reason: string): ImageResult {
    const width = options.width || 1024;
    const height = options.height || 576;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="100%" height="100%" fill="#fff5f5"/>
      <text x="50%" y="45%" text-anchor="middle" font-family="Arial" font-size="16" fill="#e53e3e" font-weight="bold">Cloudflare AI Fallback</text>
      <text x="50%" y="55%" text-anchor="middle" font-family="Arial" font-size="12" fill="#718096">${reason.substring(0, 70)}</text>
    </svg>`;

    return {
      imageBase64: Buffer.from(svg).toString('base64'),
      mimeType: 'image/svg+xml',
      provider: 'cloudflare-fallback',
      model: 'stable-diffusion-xl-base-1.0-fallback',
    };
  }
}
