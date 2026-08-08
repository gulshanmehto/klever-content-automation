import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const taskId = parseInt(id, 10);
    if (isNaN(taskId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

    const task = await prisma.articleTask.findUnique({
      where: { id: taskId },
      include: { sections: { orderBy: { position: 'asc' } } }
    });

    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    // Fetch Cloudflare credentials from DB (as requested by user)
    const accountIdSetting = await prisma.setting.findUnique({ where: { key: 'cloudflare_account_id' } });
    const apiTokenSetting = await prisma.setting.findUnique({ where: { key: 'cloudflare_api_token' } });
    const accountId = accountIdSetting?.value || process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = apiTokenSetting?.value || process.env.CLOUDFLARE_API_TOKEN;

    if (!accountId || !apiToken) {
      return NextResponse.json({ error: 'Cloudflare credentials missing' }, { status: 400 });
    }

    // Determine which sections need images
    const sectionsToProcess = [];
    for (const section of task.sections) {
      if (!section.imagePrompt) continue;
      
      const existingValid = await prisma.imageGeneration.findFirst({
        where: { articleSectionId: section.id, qcStatus: { in: ['GENERATED', 'PASSED', 'NEEDS_MANUAL_REVIEW'] } },
      });

      if (!existingValid) {
        sectionsToProcess.push({
          id: section.id,
          position: section.position,
          heading: section.heading,
          prompt: section.imagePrompt
        });
      }
    }

    return NextResponse.json({
      credentials: { accountId, apiToken },
      options: { aspectRatio: task.imageRatio || '16:9', style: task.imageStyle || 'photorealistic' },
      sections: sectionsToProcess,
      total: task.sections.filter(s => s.imagePrompt).length,
      done: task.sections.filter(s => s.imagePrompt).length - sectionsToProcess.length
    });

  } catch (error: any) {
    console.error('Queue API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
