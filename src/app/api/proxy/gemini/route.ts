import { NextRequest, NextResponse } from 'next/server';
import { GeminiImagenProvider } from '@/providers/image/imagen';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, style, aspectRatio } = body;

    if (!prompt) {
      return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
    }

    const provider = new GeminiImagenProvider();
    
    // Convert generic aspect ratio format like '4:5' to what Gemini might expect if needed
    // or just pass the options. The provider handles standard ImageOptions.
    const result = await provider.generateImage(prompt, { style, aspectRatio });

    return NextResponse.json({
      success: true,
      imageBase64: result.base64,
      mimeType: result.mimeType || 'image/jpeg',
      model: 'models/gemini-2.5-flash-image',
      provider: 'gemini',
    });

  } catch (error: any) {
    console.error('[Gemini Proxy] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
