import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';

// ─── GET /api/tasks ────────────────────────────────────────────
// Returns task list with filters, search, sort, pagination
// Also returns stats if ?stats=true
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Stats mode
    if (searchParams.get('stats') === 'true') {
      const [
        totalTasks,
        inProgress,
        readyForReview,
        wpDraftsCreated,
        failedTasks,
        completedTasks,
      ] = await Promise.all([
        prisma.articleTask.count(),
        prisma.articleTask.count({
          where: {
            currentStage: {
              in: [
                'FETCHING_COMPETITORS', 'ANALYZING_COMPETITORS', 'EXTRACTING_IDEAS',
                'DEDUPLICATING', 'BUILDING_OUTLINE', 'WRITING_ARTICLE',
                'GENERATING_IMAGES', 'IMAGE_QC', 'SAVING_TO_DRIVE', 'UPLOADING_TO_WORDPRESS',
              ],
            },
          },
        }),
        prisma.articleTask.count({ where: { currentStage: 'READY_FOR_REVIEW' } }),
        prisma.articleTask.count({ where: { NOT: { wpPostId: null } } }),
        prisma.articleTask.count({ where: { currentStage: 'FAILED' } }),
        prisma.articleTask.count({ where: { currentStage: 'COMPLETED' } }),
      ]);

      return NextResponse.json({
        stats: { totalTasks, inProgress, readyForReview, wpDraftsCreated, failedTasks, completedTasks },
      });
    }

    // Filters
    const filter = searchParams.get('filter') || 'all';
    const search = searchParams.get('search') || '';
    const sort = searchParams.get('sort') || 'newest';
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Build where clause
    const where: Record<string, unknown> = {};

    // Filter by status group
    switch (filter) {
      case 'in_progress':
        where.currentStage = {
          in: [
            'CREATED', 'FETCHING_COMPETITORS', 'ANALYZING_COMPETITORS', 'EXTRACTING_IDEAS',
            'DEDUPLICATING', 'BUILDING_OUTLINE', 'WRITING_ARTICLE',
            'GENERATING_IMAGES', 'IMAGE_QC', 'SAVING_TO_DRIVE', 'UPLOADING_TO_WORDPRESS',
          ],
        };
        break;
      case 'ready_for_review':
        where.currentStage = 'READY_FOR_REVIEW';
        break;
      case 'wordpress_draft':
        where.currentStage = { in: ['WORDPRESS_DRAFT_CREATED', 'COMPLETED'] };
        where.NOT = { wpPostId: null };
        break;
      case 'completed':
        where.currentStage = 'COMPLETED';
        break;
      case 'failed':
        where.currentStage = 'FAILED';
        break;
    }

    // Search
    if (search) {
      where.OR = [
        { topic: { contains: search } },
        { website: { domain: { contains: search } } },
      ];
      // Search by task ID if numeric
      const numericId = parseInt(search, 10);
      if (!isNaN(numericId)) {
        (where.OR as Array<Record<string, unknown>>).push({ id: numericId });
      }
    }

    // Sort
    let orderBy: Record<string, string> = { createdAt: 'desc' };
    switch (sort) {
      case 'oldest':
        orderBy = { createdAt: 'asc' };
        break;
      case 'recently_updated':
        orderBy = { updatedAt: 'desc' };
        break;
    }

    const [tasks, total] = await Promise.all([
      prisma.articleTask.findMany({
        where,
        orderBy,
        take: limit,
        skip: offset,
        include: {
          website: { select: { name: true, domain: true } },
          _count: { select: { competitorSources: true } },
        },
      }),
      prisma.articleTask.count({ where }),
    ]);

    return NextResponse.json({ tasks, total });
  } catch (error) {
    console.error('GET /api/tasks error:', error);
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

// ─── POST /api/tasks ───────────────────────────────────────────
// Create a new article task
const createTaskSchema = z.object({
  websiteId: z.string().min(1, 'Website is required'),
  topic: z.string().min(1, 'Topic is required').max(500),
  requestedIdeaCount: z.number().int().min(1).max(200),
  competitorUrls: z.array(z.string().url()).min(1).max(3),
  targetCountry: z.string().optional(),
  targetAudience: z.string().optional(),
  articleTone: z.string().optional(),
  category: z.string().optional(),
  wordCountTarget: z.number().int().min(100).optional(),
  imageRatio: z.string().optional(),
  imageStyle: z.string().optional(),
  generateImages: z.boolean().default(true),
  saveToDrive: z.boolean().default(true),
  sendToWordPress: z.boolean().default(true),
  autoRegenerateImages: z.boolean().default(true),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = createTaskSchema.parse(body);

    // Verify website exists
    const website = await prisma.website.findUnique({
      where: { id: data.websiteId },
    });
    if (!website) {
      return NextResponse.json({ error: 'Website not found' }, { status: 404 });
    }

    // Create task immediately (before any processing starts)
    const task = await prisma.articleTask.create({
      data: {
        websiteId: data.websiteId,
        topic: data.topic,
        requestedIdeaCount: data.requestedIdeaCount,
        targetCountry: data.targetCountry || website.targetCountry,
        targetAudience: data.targetAudience || website.targetAudience,
        articleTone: data.articleTone || website.defaultTone,
        category: data.category || website.defaultCategory,
        wordCountTarget: data.wordCountTarget,
        imageRatio: data.imageRatio || website.defaultImageRatio,
        imageStyle: data.imageStyle || website.defaultImageStyle,
        generateImages: data.generateImages,
        saveToDrive: data.saveToDrive,
        sendToWordPress: data.sendToWordPress,
        autoRegenerateImages: data.autoRegenerateImages,
        status: 'CREATED',
        currentStage: 'CREATED',
        progressPercentage: 0,
        competitorSources: {
          create: data.competitorUrls.map((url) => ({
            url,
            fetchStatus: 'PENDING',
          })),
        },
      },
      include: {
        website: { select: { name: true, domain: true } },
        competitorSources: true,
      },
    });

    // Create initial task log
    await prisma.taskLog.create({
      data: {
        articleTaskId: task.id,
        eventType: 'TASK_CREATED',
        message: `Task created: "${data.topic}" with ${data.competitorUrls.length} competitor URL(s)`,
        metadataJson: JSON.stringify({
          competitorUrls: data.competitorUrls,
          requestedIdeaCount: data.requestedIdeaCount,
        }),
      },
    });

    // Enqueue the pipeline job
    await prisma.jobQueue.create({
      data: {
        taskId: task.id,
        jobType: 'PIPELINE_STEP',
        step: 'FETCHING_COMPETITORS',
        payload: JSON.stringify({ taskId: task.id }),
        status: 'PENDING',
      },
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }
    console.error('POST /api/tasks error:', error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}
