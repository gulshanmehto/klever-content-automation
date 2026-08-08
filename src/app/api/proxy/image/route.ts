import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Missing prompt parameter' }, { status: 400 });
    }

    const googleKey = process.env.GOOGLE_AI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!googleKey) {
      return NextResponse.json({ error: 'GOOGLE_AI_API_KEY is not configured' }, { status: 500 });
    }

    try {
      // 1. Try Nano Banana via Gemini
      const nanoBananaModel = 'models/nano-banana'; 
      
      // Google Generative AI API for image generation is usually predict on the specific model
      const googleRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${nanoBananaModel}:predict?key=${googleKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [
            { prompt: prompt }
          ],
          parameters: {
            sampleCount: 1,
            aspectRatio: "3:4"
          }
        })
      });

      if (googleRes.ok) {
        const data = await googleRes.json();
        const base64 = data.predictions?.[0]?.bytesBase64Encoded || data.predictions?.[0]?.bytesBase64 || data.predictions?.[0];
        
        if (base64) {
          return NextResponse.json({
            success: true,
            imageBase64: base64,
            mimeType: 'image/png',
            model: nanoBananaModel,
            provider: 'google-nano-banana'
          });
        }
      }
      
      const errText = await googleRes.text();
      console.error('Nano Banana Error:', errText);
      throw new Error('Nano Banana generation failed');

    } catch (nanoBananaError) {
      console.warn('Nano Banana failed, falling back to DALL-E 2', nanoBananaError);

      if (!openaiKey) {
        throw new Error('OpenAI fallback requested but OPENAI_API_KEY is missing');
      }

      // 2. Fallback to DALL-E 2
      const openaiRes = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'dall-e-2',
          prompt: prompt,
          n: 1,
          size: "1024x1024",
          response_format: "b64_json"
        })
      });

      if (!openaiRes.ok) {
        const errText = await openaiRes.text();
        console.error('DALL-E Error:', errText);
        throw new Error('DALL-E 2 generation failed');
      }

      const openaiData = await openaiRes.json();
      const base64 = openaiData.data[0].b64_json;

      return NextResponse.json({
        success: true,
        imageBase64: base64,
        mimeType: 'image/png',
        model: 'dall-e-2',
        provider: 'openai'
      });
    }
  } catch (error: any) {
    console.error('Edge Proxy Image Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
