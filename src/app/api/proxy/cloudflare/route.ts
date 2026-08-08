import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  try {
    const { prompt, accountId, apiToken } = await request.json();

    if (!prompt || !accountId || !apiToken) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const model = '@cf/bytedance/stable-diffusion-xl-lightning';

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          prompt,
          negative_prompt: "ugly, deformed, mutated, bad anatomy, bad hands, missing fingers, extra digits, extra limbs, cross-eyed, poorly drawn face, blurry, low resolution, bad proportions, unnatural features, bad lighting, abstract" 
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Cloudflare API Error ${response.status}: ${err}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    
    // We cannot use Buffer in Edge runtime easily, so we manually convert to base64
    const buffer = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < buffer.byteLength; i++) {
      binary += String.fromCharCode(buffer[i]);
    }
    const base64 = btoa(binary);

    return NextResponse.json({
      success: true,
      imageBase64: base64,
      mimeType: 'image/png',
      model,
      provider: 'cloudflare-ai'
    });

  } catch (error: any) {
    console.error('Edge Proxy Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
