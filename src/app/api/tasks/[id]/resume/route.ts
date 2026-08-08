import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// ─── POST /api/tasks/[id]/resume ──────────────────────────────
// Resume a cancelled or failed task from where it left off
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

    if (!['CANCELLED', 'FAILED'].includes(task.status)) {
      return NextResponse.json(
        { error: 'Only cancelled or failed tasks can be resumed' },
        { status: 400 }
      );
    }

    // Determine which step to resume from:
    // 1. Look for last failed/cancelled job in the queue
    // 2. Otherwise resume from task's current stage
    // 3. Fallback to start of pipeline
    const lastJob = await prisma.jobQueue.findFirst({
      where: { taskId, status: { in: ['FAILED', 'CANCELLED', 'PROCESSING'] } },
      orderBy: { createdAt: 'desc' },
    });

    const resumeStep = lastJob?.step || task.currentStage || 'FETCHING_COMPETITORS';

    // Reset task status back to PROCESSING
    await prisma.articleTask.update({
      where: { id: taskId },
      data: {
        status: 'PROCESSING',
        currentStage: resumeStep,
      },
    });

    // Cancel any stuck PROCESSING jobs for this task before re-enqueuing
    await prisma.jobQueue.updateMany({
      where: { taskId, status: 'PROCESSING' },
      data: { status: 'CANCELLED' },
    });

    // Enqueue the resume job
    await prisma.jobQueue.create({
      data: {
        taskId,
        jobType: 'PIPELINE_STEP',
        step: resumeStep,
        payload: JSON.stringify({ taskId, resumed: true }),
        status: 'PENDING',
      },
    });

    // Log the resume event
    await prisma.taskLog.create({
      data: {
        articleTaskId: taskId,
        eventType: 'RESUMED',
        message: `Task resumed from step: ${resumeStep}`,
      },
    });

    return NextResponse.json({ success: true, resumeStep });
  } catch (error) {
    console.error('POST /api/tasks/[id]/resume error:', error);
    return NextResponse.json({ error: 'Failed to resume task' }, { status: 500 });
  }
}
