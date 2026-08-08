import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/settings
export async function GET() {
  try {
    const dbSettings = await prisma.setting.findMany();
    const settingsMap = dbSettings.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, string>);

    // Fallback to environment variables if not set in DB
    const llmProvider = settingsMap['llm_provider'] || process.env.LLM_PROVIDER || 'mock';
    const imageProvider = settingsMap['image_provider'] || process.env.IMAGE_PROVIDER || 'mock';
    const hasGoogleKey = !!(process.env.GOOGLE_AI_API_KEY || settingsMap['google_ai_api_key']);

    return NextResponse.json({
      llmProvider,
      imageProvider,
      hasGoogleKey,
    });
  } catch (error) {
    console.error('GET /api/settings error:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

// POST /api/settings
export async function POST(request: NextRequest) {
  try {
    const { llmProvider, imageProvider, googleAiApiKey } = await request.json();

    if (llmProvider) {
      await prisma.setting.upsert({
        where: { key: 'llm_provider' },
        update: { value: llmProvider },
        create: { key: 'llm_provider', value: llmProvider },
      });
    }

    if (imageProvider) {
      await prisma.setting.upsert({
        where: { key: 'image_provider' },
        update: { value: imageProvider },
        create: { key: 'image_provider', value: imageProvider },
      });
    }

    if (googleAiApiKey) {
      await prisma.setting.upsert({
        where: { key: 'google_ai_api_key' },
        update: { value: googleAiApiKey },
        create: { key: 'google_ai_api_key', value: googleAiApiKey },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/settings error:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
