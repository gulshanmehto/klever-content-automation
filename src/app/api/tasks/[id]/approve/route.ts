import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// ─── POST /api/tasks/[id]/approve ────────────────────────────
// Approve content and trigger image generation
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

    if (task.currentStage !== 'READY_FOR_REVIEW') {
      return NextResponse.json(
        { error: 'Task is not in review stage' },
        { status: 400 }
      );
    }

    // Mark content as approved
    await prisma.articleTask.update({
      where: { id: taskId },
      data: {
        contentApproved: true,
        currentStage: task.generateImages ? 'GENERATING_IMAGES' :
          task.saveToDrive ? 'SAVING_TO_DRIVE' :
            task.sendToWordPress ? 'UPLOADING_TO_WORDPRESS' : 'COMPLETED',
        progressPercentage: task.generateImages ? 58 : 85,
      },
    });

    // Log the approval
    await prisma.taskLog.create({
      data: {
        articleTaskId: taskId,
        eventType: 'CONTENT_APPROVED',
        message: 'Content approved by user. Proceeding to next stage.',
      },
    });

    // Determine next step and enqueue
    const nextStep = task.generateImages ? 'GENERATING_IMAGE_PROMPTS' :
      task.saveToDrive ? 'SAVING_TO_DRIVE' :
        task.sendToWordPress ? 'UPLOADING_TO_WORDPRESS' : 'COMPLETE';

    await prisma.jobQueue.create({
      data: {
        taskId: taskId,
        jobType: 'PIPELINE_STEP',
        step: nextStep,
        payload: JSON.stringify({ taskId }),
        status: 'PENDING',
      },
    });

    return NextResponse.json({ success: true, nextStage: nextStep });
  } catch (error) {
    console.error('POST /api/tasks/[id]/approve error:', error);
    return NextResponse.json({ error: 'Failed to approve task' }, { status: 500 });
  }
}
