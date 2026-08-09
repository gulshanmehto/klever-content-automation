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

    const task = await prisma.articleTask.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (task.currentStage !== 'IDEAS_READY_FOR_REVIEW') {
      return NextResponse.json(
        { error: 'Task is not in idea review stage' },
        { status: 400 }
      );
    }

    // Mark ideas as approved
    await prisma.articleTask.update({
      where: { id: taskId },
      data: {
        ideasApproved: true,
        currentStage: 'BUILDING_OUTLINE',
        progressPercentage: 40,
      },
    });

    await prisma.taskLog.create({
      data: {
        articleTaskId: taskId,
        eventType: 'IDEAS_APPROVED',
        message: 'Ideas approved by user. Proceeding to build outline.',
      },
    });

    await prisma.jobQueue.create({
      data: {
        taskId: taskId,
        jobType: 'PIPELINE_STEP',
        step: 'BUILDING_OUTLINE',
        payload: JSON.stringify({ taskId }),
        status: 'PENDING',
      },
    });

    return NextResponse.json({ success: true, nextStage: 'BUILDING_OUTLINE' });
  } catch (error) {
    console.error('POST /api/tasks/[id]/approve-ideas error:', error);
    return NextResponse.json({ error: 'Failed to approve ideas' }, { status: 500 });
  }
}
