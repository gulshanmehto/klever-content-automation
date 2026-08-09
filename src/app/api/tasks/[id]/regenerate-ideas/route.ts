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

    const body = await request.json();
    const feedback = body.feedback;

    const task = await prisma.articleTask.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Save feedback and jump back to DEDUPLICATING so it re-selects ideas using the feedback
    await prisma.articleTask.update({
      where: { id: taskId },
      data: {
        ideaFeedback: feedback,
        currentStage: 'DEDUPLICATING',
        progressPercentage: 32,
      },
    });

    await prisma.taskLog.create({
      data: {
        articleTaskId: taskId,
        eventType: 'IDEAS_REJECTED',
        message: `Ideas rejected with feedback: "${feedback}". Restarting deduplication.`,
      },
    });

    await prisma.jobQueue.create({
      data: {
        taskId: taskId,
        jobType: 'PIPELINE_STEP',
        step: 'DEDUPLICATING',
        payload: JSON.stringify({ taskId }),
        status: 'PENDING',
      },
    });

    return NextResponse.json({ success: true, nextStage: 'DEDUPLICATING' });
  } catch (error) {
    console.error('POST /api/tasks/[id]/regenerate-ideas error:', error);
    return NextResponse.json({ error: 'Failed to regenerate ideas' }, { status: 500 });
  }
}
