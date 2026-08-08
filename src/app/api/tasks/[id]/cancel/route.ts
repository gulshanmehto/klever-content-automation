import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// ─── POST /api/tasks/[id]/cancel ─────────────────────────────
// Cancel a task (per spec §53: task remains visible, just marked as Cancelled)
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

    if (task.currentStage === 'COMPLETED') {
      return NextResponse.json(
        { error: 'Cannot cancel a completed task' },
        { status: 400 }
      );
    }

    // Cancel pending jobs for this task
    await prisma.jobQueue.updateMany({
      where: { taskId, status: { in: ['PENDING', 'PROCESSING'] } },
      data: { status: 'FAILED', error: 'Task cancelled by user' },
    });

    // Mark task as cancelled (NOT deleted — per spec)
    await prisma.articleTask.update({
      where: { id: taskId },
      data: {
        status: 'CANCELLED',
        currentStage: 'CANCELLED',
      },
    });

    await prisma.taskLog.create({
      data: {
        articleTaskId: taskId,
        eventType: 'TASK_CANCELLED',
        message: 'Task cancelled by user',
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/tasks/[id]/cancel error:', error);
    return NextResponse.json({ error: 'Failed to cancel task' }, { status: 500 });
  }
}
