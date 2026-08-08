import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const taskId = parseInt(id, 10);
    if (isNaN(taskId)) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
    }

    const { action, sectionId, customPrompt, rating, feedback } = await request.json();

    // ─── ACTION: RATE_TASK ───
    if (action === 'RATE_TASK') {
      const task = await prisma.articleTask.update({
        where: { id: taskId },
        data: {
          userRating: rating,
          userFeedback: feedback,
        },
      });

      // Log feedback for learning loop
      await prisma.taskLog.create({
        data: {
          articleTaskId: taskId,
          eventType: 'USER_FEEDBACK_ADDED',
          message: `User rated task ${rating}/5 stars. Feedback: "${feedback || 'None'}"`,
        },
      });

      return NextResponse.json({ success: true, task });
    }

    // ─── ACTION: REGENERATE_SINGLE_IMAGE ───
    if (action === 'REGENERATE_SINGLE_IMAGE') {
      if (!sectionId) {
        return NextResponse.json({ error: 'sectionId is required' }, { status: 400 });
      }

      const section = await prisma.articleSection.findUnique({
        where: { id: sectionId },
      });

      if (!section) {
        return NextResponse.json({ error: 'Section not found' }, { status: 404 });
      }

      // If custom prompt is provided, save it to the section
      if (customPrompt) {
        await prisma.articleSection.update({
          where: { id: sectionId },
          data: { imagePrompt: customPrompt },
        });
      }

      // Delete existing image generations for this section so the generator runs again
      await prisma.imageGeneration.deleteMany({
        where: { articleSectionId: sectionId },
      });

      // Set task stage to GENERATING_IMAGES so background worker runs it
      await prisma.articleTask.update({
        where: { id: taskId },
        data: {
          currentStage: 'GENERATING_IMAGES',
          status: 'PROCESSING',
          progressPercentage: 58,
        },
      });

      // Enqueue job step
      await prisma.jobQueue.create({
        data: {
          taskId,
          jobType: 'PIPELINE_STEP',
          step: 'GENERATING_IMAGES',
          payload: JSON.stringify({ taskId }),
          status: 'PENDING',
        },
      });

      await prisma.taskLog.create({
        data: {
          articleTaskId: taskId,
          eventType: 'IMAGE_REGENERATED',
          message: `Triggered single image regeneration for section ${section.position}. Custom prompt used: ${customPrompt ? 'Yes' : 'No'}`,
        },
      });

      return NextResponse.json({ success: true });
    }

    // ─── ACTION: RETRY_ALL_IMAGES ───
    if (action === 'RETRY_ALL_IMAGES') {
      const sections = await prisma.articleSection.findMany({
        where: { articleTaskId: taskId },
      });

      // Delete all existing image generations for this task's sections
      await prisma.imageGeneration.deleteMany({
        where: { articleSectionId: { in: sections.map(s => s.id) } },
      });

      // Reset task status
      await prisma.articleTask.update({
        where: { id: taskId },
        data: {
          status: 'PROCESSING',
          currentStage: 'GENERATING_IMAGES',
          progressPercentage: 58,
        },
      });

      // Enqueue the images generation step
      await prisma.jobQueue.create({
        data: {
          taskId,
          jobType: 'PIPELINE_STEP',
          step: 'GENERATING_IMAGES',
          payload: JSON.stringify({ taskId }),
          status: 'PENDING',
        },
      });

      await prisma.taskLog.create({
        data: {
          articleTaskId: taskId,
          eventType: 'RETRY_ALL_IMAGES',
          message: 'Triggered bulk image regeneration for all sections.',
        },
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('Task Action API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
