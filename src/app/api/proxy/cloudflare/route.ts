import { NextRequest, NextResponse } from 'next/server';
import { buildFluxFashionPrompt, FLUX_NEGATIVE_PROMPT } from '@/providers/image/fashion-prompt';

// Using Node.js runtime for Buffer support and longer execution time
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, style, aspectRatio } = body;

    if (!prompt) {
      return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
    }

    // Load credentials server-side from env (set via Vercel dashboard)
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;

    if (!accountId || !apiToken) {
      return NextResponse.json(
        { error: 'Cloudflare credentials not configured on server' },
        { status: 500 }
      );
    }

    const model = '@cf/black-forest-labs/flux-1-schnell';

    // Apply the full Flux fashion guardrails to produce a highly descriptive prompt
    const guardedPrompt = buildFluxFashionPrompt(prompt, style, aspectRatio);

    console.log(`[Cloudflare Proxy] Sending Flux-1-Schnell request, prompt length: ${guardedPrompt.length}`);

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
          negative_prompt: FLUX_NEGATIVE_PROMPT,
          num_steps: 8,
          guidance: 7.5,
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Cloudflare API Error ${response.status}: ${err}`);
    }

    // flux-1-schnell returns raw binary bytes
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    return NextResponse.json({
      success: true,
      imageBase64: base64,
      mimeType: 'image/jpeg',
      model,
      provider: 'cloudflare-ai',
    });

  } catch (error: any) {
    console.error('[Cloudflare Proxy] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
