/**
 * Job Worker
 * Database-backed job queue worker that processes pipeline steps.
 * Per spec §37: background processing without Redis.
 * 
 * Uses setInterval to poll the job queue every 2 seconds.
 * Designed to run in-process with the Next.js server.
 */

import { prisma } from '@/lib/db';
import { TaskOrchestrator } from './task-orchestrator';

let workerRunning = false;
let workerInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start the background job worker.
 * Safe to call multiple times — only one worker will run.
 */
export function startJobWorker() {
  if (workerRunning) return;
  workerRunning = true;

  console.log('🔧 Job worker started — polling every 2 seconds');

  workerInterval = setInterval(async () => {
    try {
      await processNextJob();
    } catch (error) {
      console.error('Job worker error:', error);
    }
  }, 2000);
}

/**
 * Stop the background job worker.
 */
export function stopJobWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
  workerRunning = false;
  console.log('🛑 Job worker stopped');
}

/**
 * Process the next pending job from the queue.
 */
async function processNextJob() {
  // Find the next pending job (FIFO)
  const job = await prisma.jobQueue.findFirst({
    where: {
      status: 'PENDING',
    },
    orderBy: { createdAt: 'asc' },
  });

  if (!job) return; // No pending jobs

  // Lock the job
  await prisma.jobQueue.update({
    where: { id: job.id },
    data: {
      status: 'PROCESSING',
      startedAt: new Date(),
      attempts: { increment: 1 },
      lockedAt: new Date(),
    },
  });

  console.log(`⚙️  Processing job ${job.id}: ${job.step} for task ${job.taskId}`);

  try {
    const orchestrator = new TaskOrchestrator(job.taskId);
    const nextStep = await orchestrator.executeStep(job.step);

    // Mark job as completed
    await prisma.jobQueue.update({
      where: { id: job.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    // Enqueue next step if pipeline should continue
    if (nextStep && nextStep !== 'DONE' && nextStep !== 'WAIT_FOR_APPROVAL') {
      await prisma.jobQueue.create({
        data: {
          taskId: job.taskId,
          jobType: 'PIPELINE_STEP',
          step: nextStep,
          payload: JSON.stringify({ taskId: job.taskId }),
          status: 'PENDING',
        },
      });
      console.log(`📋 Enqueued next step: ${nextStep} for task ${job.taskId}`);
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Job ${job.id} failed:`, errMsg);

    if (job.attempts + 1 >= job.maxAttempts) {
      await prisma.jobQueue.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          error: errMsg,
          completedAt: new Date(),
        },
      });
    } else {
      // Retry: set back to pending
      await prisma.jobQueue.update({
        where: { id: job.id },
        data: {
          status: 'PENDING',
          error: errMsg,
          lockedAt: null,
        },
      });
    }
  }
}
