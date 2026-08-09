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

    // Fetch the task and website to get the domain for the watermark
    const task = await prisma.articleTask.findUnique({
      where: { id: taskId },
      include: { website: true }
    });
    const domain = task?.website?.domain || 'Klever Automation';

    let webPath = '';
    try {
      const fs = require('fs');
      const path = require('path');
      const sharp = require('sharp');
      
      const publicDir = path.join(process.cwd(), 'public', 'images');
      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
      }
      const filename = `${sectionId}-${Date.now()}.jpeg`;
      const localFilePath = path.join(publicDir, filename);
      
      // Process with sharp and add watermark
      const imgBuffer = Buffer.from(imageBase64, 'base64');
      
      // We will create an SVG text overlay for the watermark
      const width = 800; // rough width for svg calculation, sharp will center it based on svg dimensions
      const svgText = `
        <svg width="100%" height="60" xmlns="http://www.w3.org/2000/svg">
          <rect x="0" y="0" width="100%" height="60" fill="white" opacity="0.8" />
          <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="24" fill="black" font-weight="bold">${domain}</text>
        </svg>
      `;
      
      const watermarkedBuffer = await sharp(imgBuffer)
        .composite([
          {
            input: Buffer.from(svgText),
            gravity: 'south',
          },
        ])
        .jpeg({ quality: 90 })
        .toBuffer();

      fs.writeFileSync(localFilePath, watermarkedBuffer);
      webPath = `/images/${filename}`;
      
      // Also update the imageBase64 to the watermarked version for the DB fallback
      // using the same buffer
      const watermarkedBase64 = watermarkedBuffer.toString('base64');
      
    } catch (e: any) {
      console.warn('Local disk image writing bypassed (serverless environment):', e.message);
      
      // Fallback: If disk is read-only but sharp succeeded, use the sharp buffer.
      // We will try to apply sharp in memory even if disk writes fail.
      try {
        const sharp = require('sharp');
        const imgBuffer = Buffer.from(imageBase64, 'base64');
        const svgText = `
          <svg width="100%" height="60" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="0" width="100%" height="60" fill="white" opacity="0.8" />
            <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="24" fill="black" font-weight="bold">${domain}</text>
          </svg>
        `;
        const watermarkedBuffer = await sharp(imgBuffer).composite([{ input: Buffer.from(svgText), gravity: 'south' }]).jpeg({ quality: 90 }).toBuffer();
        webPath = `data:image/jpeg;base64,${watermarkedBuffer.toString('base64')}`;
      } catch (err2) {
        webPath = `data:${mimeType};base64,${imageBase64}`;
      }
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
