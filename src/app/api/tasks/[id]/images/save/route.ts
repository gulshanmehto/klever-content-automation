import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const taskId = parseInt(id, 10);
    if (isNaN(taskId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

    const { sectionId, prompt, provider, model, mimeType, imageBase64, error } = await request.json();

    if (error) {
      await prisma.imageGeneration.create({
        data: {
          articleSectionId: sectionId,
          prompt: prompt || '',
          qcStatus: 'FAILED',
          error,
          generationAttempt: 1,
        },
      });
      
      await prisma.taskLog.create({
        data: { articleTaskId: taskId, eventType: 'IMAGE_FAILED', message: `Section image generation failed: ${error}` }
      });
      return NextResponse.json({ success: true, status: 'saved_error' });
    }

    // Write generated image to public directory (Try-catch fallback for Serverless platforms like Vercel)
    let webPath = '';
    try {
      const fs = require('fs');
      const path = require('path');
      const publicDir = path.join(process.cwd(), 'public', 'images');
      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
      }
      const filename = `${sectionId}-${Date.now()}.png`;
      const localFilePath = path.join(publicDir, filename);
      fs.writeFileSync(localFilePath, Buffer.from(imageBase64, 'base64'));
      webPath = `/images/${filename}`;
    } catch (e: any) {
      console.warn('Local disk image writing bypassed (serverless environment):', e.message);
      // If disk is read-only, we store it inline using base64 src fallback on frontend
      webPath = `data:${mimeType};base64,${imageBase64}`;
    }

    await prisma.imageGeneration.create({
      data: {
        articleSectionId: sectionId,
        provider,
        model,
        prompt,
        localPath: webPath,
        mimeType,
        qcStatus: 'GENERATED',
        generationAttempt: 1,
      },
    });

    await prisma.taskLog.create({
      data: { articleTaskId: taskId, eventType: 'IMAGE_GENERATED', message: `Image generated via Edge Proxy for section` }
    });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Save Image API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
