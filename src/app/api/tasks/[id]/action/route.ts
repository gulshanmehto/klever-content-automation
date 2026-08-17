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

    const { action, sectionId, customPrompt, rating, feedback, imageId, newTitle, newSubcategories, newArticleBody } = await request.json();

    // ─── CAPTIONS WORKFLOW ACTIONS ───
    if (action === 'APPROVE_CAPTIONS_TITLE') {
      if (newTitle) {
        await prisma.articleTask.update({
          where: { id: taskId },
          data: { articleTitle: newTitle, articleSlug: newTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-') }
        });
      }
      
      await prisma.articleTask.update({
        where: { id: taskId },
        data: { currentStage: 'GENERATING_SUBCATEGORIES' }
      });
      await prisma.jobQueue.create({
        data: { taskId, jobType: 'PIPELINE_STEP', step: 'GENERATE_CAPTIONS_SUBCATEGORIES', payload: JSON.stringify({ taskId }), status: 'PENDING' }
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'APPROVE_CAPTIONS_SUBCATEGORIES') {
      if (newSubcategories && Array.isArray(newSubcategories)) {
        await prisma.articleSection.deleteMany({ where: { articleTaskId: taskId } });
        for (let i = 0; i < newSubcategories.length; i++) {
          await prisma.articleSection.create({
            data: { articleTaskId: taskId, position: i + 1, heading: newSubcategories[i], body: '' }
          });
        }
      }

      await prisma.articleTask.update({
        where: { id: taskId },
        data: { currentStage: 'WRITING_CAPTIONS_ARTICLE' }
      });
      await prisma.jobQueue.create({
        data: { taskId, jobType: 'PIPELINE_STEP', step: 'WRITE_CAPTIONS_ARTICLE', payload: JSON.stringify({ taskId }), status: 'PENDING' }
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'APPROVE_CAPTIONS_ARTICLE') {
      if (newArticleBody) {
        // If the user made manual edits to the sections, we could save them here, 
        // but for simplicity, we assume the frontend sends the updated sections.
        // Assuming newArticleBody is an array of sections: { id: string, body: string }
        if (Array.isArray(newArticleBody)) {
          for (const sec of newArticleBody) {
            await prisma.articleSection.update({
              where: { id: sec.id },
              data: { body: sec.body }
            });
          }
        }
      }

      await prisma.articleTask.update({
        where: { id: taskId },
        data: { currentStage: 'GENERATING_IMAGE_PROMPTS' } // using standard or captions prompts
      });
      await prisma.jobQueue.create({
        data: { taskId, jobType: 'PIPELINE_STEP', step: 'GENERATE_CAPTIONS_IMAGE_PROMPTS', payload: JSON.stringify({ taskId }), status: 'PENDING' }
      });
      return NextResponse.json({ success: true });
    }

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

    // ─── ACTION: RATE_IMAGE ───
    if (action === 'RATE_IMAGE') {
      if (!imageId || !rating) {
        return NextResponse.json({ error: 'imageId and rating are required' }, { status: 400 });
      }

      await prisma.imageGeneration.update({
        where: { id: imageId },
        data: { userRating: rating },
      });

      return NextResponse.json({ success: true });
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

      // Delete all PENDING jobs for this task to avoid race conditions
      await prisma.jobQueue.deleteMany({
        where: { taskId, status: 'PENDING' },
      });

      // Reset task status to GENERATING_IMAGES to re-roll images with existing prompts
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

    // ─── ACTION: FINISH_IMAGES ───
    if (action === 'FINISH_IMAGES') {
      await prisma.articleTask.update({
        where: { id: taskId },
        data: {
          currentStage: 'IMAGE_QC',
          progressPercentage: 78,
        },
      });

      await prisma.jobQueue.create({
        data: {
          taskId,
          jobType: 'PIPELINE_STEP',
          step: 'IMAGE_QC',
          payload: JSON.stringify({ taskId }),
          status: 'PENDING',
        },
      });

      await prisma.taskLog.create({
        data: {
          articleTaskId: taskId,
          eventType: 'IMAGES_COMPLETED',
          message: 'All images generated and approved. Advancing to Quality Check.',
        },
      });

      return NextResponse.json({ success: true });
    }

    // ─── ACTION: PAUSE ───
    if (action === 'PAUSE') {
      await prisma.articleTask.update({
        where: { id: taskId },
        data: { status: 'PAUSED' },
      });
      // Cancel any pending jobs for this task
      await prisma.jobQueue.updateMany({
        where: { taskId, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
      await prisma.taskLog.create({
        data: { articleTaskId: taskId, eventType: 'TASK_PAUSED', message: 'Task paused by user.' },
      });
      return NextResponse.json({ success: true });
    }

    // ─── ACTION: RESUME ───
    if (action === 'RESUME') {
      const task = await prisma.articleTask.findUnique({ where: { id: taskId } });
      if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

      await prisma.articleTask.update({
        where: { id: taskId },
        data: { status: 'PROCESSING' },
      });
      // Re-enqueue the current stage
      await prisma.jobQueue.create({
        data: {
          taskId,
          jobType: 'PIPELINE_STEP',
          step: task.currentStage,
          payload: JSON.stringify({ taskId }),
          status: 'PENDING',
        },
      });
      await prisma.taskLog.create({
        data: { articleTaskId: taskId, eventType: 'TASK_RESUMED', message: `Task resumed from stage: ${task.currentStage}.` },
      });
      return NextResponse.json({ success: true });
    }

    // ─── ACTION: MARK_COMPLETE ───
    if (action === 'MARK_COMPLETE') {
      await prisma.articleTask.update({
        where: { id: taskId },
        data: {
          status: 'COMPLETED',
          currentStage: 'COMPLETE',
          progressPercentage: 100,
          completedAt: new Date(),
        },
      });
      // Delete any pending jobs since the task is now complete
      await prisma.jobQueue.deleteMany({
        where: { taskId, status: 'PENDING' },
      });

      await prisma.taskLog.create({
        data: { articleTaskId: taskId, eventType: 'TASK_COMPLETED', message: 'Task manually marked as complete by user.' },
      });
      return NextResponse.json({ success: true });
    }

    // ─── ACTION: RESTART_ARTICLE ───
    if (action === 'RESTART_ARTICLE') {
      // Clear article content and reset to BUILDING_OUTLINE
      await prisma.articleTask.update({
        where: { id: taskId },
        data: {
          status: 'PROCESSING',
          currentStage: 'BUILDING_OUTLINE',
          progressPercentage: 30,
          contentApproved: false,
          articleTitle: null,
          articleSlug: null,
          articleIntroduction: null,
          articleConclusion: null,
          articleFaq: null,
          contentQcScore: null,
          contentQcDetails: null,
        },
      });
      // Clear all existing sections
      await prisma.articleSection.deleteMany({ where: { articleTaskId: taskId } });

      // Delete all PENDING jobs for this task to avoid race conditions
      await prisma.jobQueue.deleteMany({
        where: { taskId, status: 'PENDING' },
      });

      // Enqueue
      await prisma.jobQueue.create({
        data: {
          taskId,
          jobType: 'PIPELINE_STEP',
          step: 'BUILDING_OUTLINE',
          payload: JSON.stringify({ taskId }),
          status: 'PENDING',
        },
      });
      await prisma.taskLog.create({
        data: { articleTaskId: taskId, eventType: 'RESTARTED_ARTICLE', message: 'Article generation restarted from outline.' },
      });
      return NextResponse.json({ success: true });
    }

    // ─── ACTION: RESTART_IMAGES ───
    if (action === 'RESTART_IMAGES') {
      const sections = await prisma.articleSection.findMany({ where: { articleTaskId: taskId } });
      // Delete all image generations
      await prisma.imageGeneration.deleteMany({
        where: { articleSectionId: { in: sections.map(s => s.id) } },
      });
      // Clear image prompts so they are regenerated fresh
      await prisma.articleSection.updateMany({
        where: { articleTaskId: taskId },
        data: { imagePrompt: null },
      });

      // Delete all PENDING jobs for this task to avoid race conditions
      await prisma.jobQueue.deleteMany({
        where: { taskId, status: 'PENDING' },
      });

      // Reset to GENERATING_IMAGE_PROMPTS so prompts are rebuilt first
      await prisma.articleTask.update({
        where: { id: taskId },
        data: {
          status: 'PROCESSING',
          currentStage: 'GENERATING_IMAGE_PROMPTS',
          progressPercentage: 55,
          contentApproved: true,
        },
      });
      await prisma.jobQueue.create({
        data: {
          taskId,
          jobType: 'PIPELINE_STEP',
          step: 'GENERATING_IMAGE_PROMPTS',
          payload: JSON.stringify({ taskId }),
          status: 'PENDING',
        },
      });
      await prisma.taskLog.create({
        data: { articleTaskId: taskId, eventType: 'RESTARTED_IMAGES', message: 'Image generation restarted from prompt generation.' },
      });
      return NextResponse.json({ success: true });
    }

    // ─── ACTION: START_WORDPRESS_UPLOAD ───
    if (action === 'START_WORDPRESS_UPLOAD') {
      await prisma.articleTask.update({
        where: { id: taskId },
        data: {
          status: 'PROCESSING',
          currentStage: 'UPLOADING_TO_WORDPRESS',
        },
      });

      await prisma.jobQueue.deleteMany({
        where: { taskId, status: 'PENDING' },
      });

      await prisma.jobQueue.create({
        data: {
          taskId,
          jobType: 'PIPELINE_STEP',
          step: 'UPLOADING_TO_WORDPRESS',
          payload: JSON.stringify({ taskId }),
          status: 'PENDING',
        },
      });
      await prisma.taskLog.create({
        data: { articleTaskId: taskId, eventType: 'WP_UPLOAD_STARTED', message: 'Manual upload to WordPress started.' },
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('Task Action API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
