import { prisma } from '@/lib/db';
import type { ImageProvider, ImageOptions, ImageResult } from './types';
import { buildFluxFashionPrompt } from './fashion-prompt';

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

    await prisma.setting.upsert({
      where: { key },
      update: { value: String(currentUsage + neuronsToUse) },
      create: { key, value: String(neuronsToUse) },
    });
    return true;
  }

  async generateImage(prompt: string, options: ImageOptions): Promise<ImageResult> {
    // flux-1-schnell costs ~4 neurons per step; we use 8 steps = ~32 neurons
    const neuronCost = 32;

    const budgetOk = await this.checkAndIncrementNeuronUsage(neuronCost);
    if (!budgetOk) {
      return this.fallbackSvg(prompt, options, 'Daily 10,000 Cloudflare Neuron limit reached. Generation skipped.');
    }

    try {
      const { accountId, apiToken } = await this.getCredentials();
      const model = '@cf/black-forest-labs/flux-1-schnell';

      // Build the highly descriptive fashion prompt with all guardrails
      const guardedPrompt = buildFluxFashionPrompt(prompt, options.style, options.aspectRatio);

      console.log(`[Cloudflare Flux-1-Schnell] Generating image with ${guardedPrompt.length} char prompt`);

      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: guardedPrompt,
            steps: 8,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Cloudflare AI API request failed: ${response.status} ${errorText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      let base64 = '';

      if (contentType.includes('application/json')) {
        const json = await response.json();
        if (!json.success || !json.result || !json.result.image) {
          throw new Error('Cloudflare API returned success=false or missing image data');
        }
        base64 = json.result.image;
      } else {
        // Fallback if Cloudflare ever switches back to raw binary bytes
        const arrayBuffer = await response.arrayBuffer();
        base64 = Buffer.from(arrayBuffer).toString('base64');
      }

      if (!base64) throw new Error('Cloudflare returned empty image data');

      return {
        imageBase64: base64,
        mimeType: 'image/jpeg',
        provider: 'cloudflare-ai',
        model,
      };
    } catch (e: any) {
      console.error('[Cloudflare Flux-1-Schnell] Generation failed:', e.message);
      return this.fallbackSvg(prompt, options, e.message);
    }
  }

  private fallbackSvg(prompt: string, options: ImageOptions, reason: string): ImageResult {
    const width = options.width || 1024;
    const height = options.height || 576;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="100%" height="100%" fill="#fff5f5"/>
      <text x="50%" y="40%" text-anchor="middle" font-family="Arial" font-size="16" fill="#e53e3e" font-weight="bold">Image Generation Failed</text>
      <text x="50%" y="50%" text-anchor="middle" font-family="Arial" font-size="12" fill="#718096">${reason.substring(0, 70)}</text>
      <text x="50%" y="60%" text-anchor="middle" font-family="Arial" font-size="11" fill="#a0aec0">Cloudflare Flux-1-Schnell</text>
    </svg>`;

    return {
      imageBase64: Buffer.from(svg).toString('base64'),
      mimeType: 'image/svg+xml',
      provider: 'cloudflare-fallback',
      model: '@cf/black-forest-labs/flux-1-schnell-fallback',
    };
  }
}
