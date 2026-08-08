import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// ─── POST /api/tasks/[id]/retry ──────────────────────────────
// Retry the failed step of a task
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

    const task = await prisma.articleTask.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (task.currentStage !== 'FAILED') {
      return NextResponse.json(
        { error: 'Task is not in failed state' },
        { status: 400 }
      );
    }

    // Find the last failed job to determine which step to retry
    const lastFailedJob = await prisma.jobQueue.findFirst({
      where: { taskId, status: 'FAILED' },
      orderBy: { createdAt: 'desc' },
    });

    const retryStep = lastFailedJob?.step || 'FETCHING_COMPETITORS';

    // Reset task status
    await prisma.articleTask.update({
      where: { id: taskId },
      data: {
        status: 'PROCESSING',
        currentStage: retryStep,
      },
    });

    // Enqueue retry job
    await prisma.jobQueue.create({
      data: {
        taskId,
        jobType: 'PIPELINE_STEP',
        step: retryStep,
        payload: JSON.stringify({ taskId, retry: true }),
        status: 'PENDING',
      },
    });

    // Log the retry
    await prisma.taskLog.create({
      data: {
        articleTaskId: taskId,
        eventType: 'RETRY',
        message: `Retrying step: ${retryStep}`,
      },
    });

    return NextResponse.json({ success: true, retryStep });
  } catch (error) {
    console.error('POST /api/tasks/[id]/retry error:', error);
    return NextResponse.json({ error: 'Failed to retry task' }, { status: 500 });
  }
}
