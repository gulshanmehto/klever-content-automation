import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { TaskOrchestrator } from '@/services/task-orchestrator';

// Serverless-compatible job processor.
// Called by the Vercel Cron (vercel.json) every minute.
// Processes ONE pending job per invocation.
export async function GET(req: Request) {
  // Optional: protect with a secret token
  const secret = req.headers.get('x-cron-secret');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Find next pending job (FIFO)
  const job = await prisma.jobQueue.findFirst({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
  });

  if (!job) {
    return NextResponse.json({ status: 'no_jobs' });
  }

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

  try {
    const orchestrator = new TaskOrchestrator(job.taskId);
    const nextStep = await orchestrator.executeStep(job.step);

    await prisma.jobQueue.update({
      where: { id: job.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });

    // Enqueue next step immediately if pipeline should continue
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
    }

    return NextResponse.json({ status: 'processed', jobId: job.id, nextStep });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';

    if (job.attempts + 1 >= job.maxAttempts) {
      await prisma.jobQueue.update({
        where: { id: job.id },
        data: { status: 'FAILED', error: errMsg, completedAt: new Date() },
      });
    } else {
      await prisma.jobQueue.update({
        where: { id: job.id },
        data: { status: 'PENDING', error: errMsg, lockedAt: null },
      });
    }

    return NextResponse.json({ status: 'error', error: errMsg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
