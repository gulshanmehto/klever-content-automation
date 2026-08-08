import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { encrypt } from '@/lib/encryption';
import { z } from 'zod';

// ─── GET /api/websites ─────────────────────────────────────────
export async function GET() {
  try {
    const websites = await prisma.website.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        domain: true,
        wpBaseUrl: true,
        driveParentFolderId: true,
        targetCountry: true,
        targetAudience: true,
        defaultTone: true,
        defaultCategory: true,
        defaultImageStyle: true,
        defaultImageRatio: true,
        watermarkText: true,
        watermarkPlacement: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { tasks: true } },
      },
    });

    return NextResponse.json({ websites });
  } catch (error) {
    console.error('GET /api/websites error:', error);
    return NextResponse.json({ error: 'Failed to fetch websites' }, { status: 500 });
  }
}

// ─── POST /api/websites ────────────────────────────────────────
const createWebsiteSchema = z.object({
  name: z.string().min(1).max(200),
  domain: z.string().min(1).max(200),
  wpBaseUrl: z.string().url().optional().or(z.literal('')),
  wpUsername: z.string().optional(),
  wpAppPassword: z.string().optional(),
  driveParentFolderId: z.string().optional(),
  targetCountry: z.string().default('US'),
  targetAudience: z.string().default('general'),
  defaultTone: z.string().default('informative'),
  defaultCategory: z.string().optional(),
  defaultImageStyle: z.string().default('photorealistic'),
  defaultImageRatio: z.string().default('16:9'),
  watermarkText: z.string().min(1),
  watermarkPlacement: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = createWebsiteSchema.parse(body);

    const website = await prisma.website.create({
      data: {
        name: data.name,
        domain: data.domain,
        wpBaseUrl: data.wpBaseUrl || '',
        wpUsernameEncrypted: data.wpUsername ? encrypt(data.wpUsername) : '',
        wpAppPasswordEncrypted: data.wpAppPassword ? encrypt(data.wpAppPassword) : '',
        driveParentFolderId: data.driveParentFolderId,
        targetCountry: data.targetCountry,
        targetAudience: data.targetAudience,
        defaultTone: data.defaultTone,
        defaultCategory: data.defaultCategory,
        defaultImageStyle: data.defaultImageStyle,
        defaultImageRatio: data.defaultImageRatio,
        watermarkText: data.watermarkText,
        watermarkPlacement: data.watermarkPlacement,
      },
    });

    return NextResponse.json({ website }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }
    console.error('POST /api/websites error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Failed to create website: ${msg}` }, { status: 500 });
  }
}
