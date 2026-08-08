import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// ─── GET /api/tasks/[id] ──────────────────────────────────────
// Returns full task detail with all relations
export async function GET(
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
      include: {
        website: true,
        competitorSources: {
          orderBy: { createdAt: 'asc' },
        },
        normalizedIdeas: {
          orderBy: { finalOrder: 'asc' },
        },
        articleSections: {
          orderBy: { position: 'asc' },
          include: {
            imageGenerations: {
              orderBy: { createdAt: 'desc' },
            },
          },
        },
        taskLogs: {
          orderBy: { createdAt: 'desc' },
          take: 100,
        },
      },
    });

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({ task });
  } catch (error) {
    console.error('GET /api/tasks/[id] error:', error);
    return NextResponse.json({ error: 'Failed to fetch task' }, { status: 500 });
  }
}

// ─── PATCH /api/tasks/[id] ────────────────────────────────────
// Update task metadata (NO delete capability)
export async function PATCH(
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

    // Only allow specific fields to be updated
    const allowedFields = [
      'articleTitle', 'articleSlug', 'articleIntroduction', 'articleConclusion',
      'articleFaq', 'metaTitle', 'metaDescription', 'suggestedTags',
    ];

    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    const task = await prisma.articleTask.update({
      where: { id: taskId },
      data: updateData,
      include: {
        website: { select: { name: true, domain: true } },
      },
    });

    return NextResponse.json({ task });
  } catch (error) {
    console.error('PATCH /api/tasks/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}

// NOTE: No DELETE handler — per spec, tasks are permanent and cannot be deleted.
