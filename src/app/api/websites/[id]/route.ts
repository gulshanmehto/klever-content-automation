import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { encrypt } from '@/lib/encryption';
import { z } from 'zod';

// ─── GET /api/websites/[id] ───────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const website = await prisma.website.findUnique({
      where: { id },
      include: {
        _count: { select: { tasks: true } },
      },
    });

    if (!website) {
      return NextResponse.json({ error: 'Website not found' }, { status: 404 });
    }

    // Don't send encrypted credentials to frontend — just indicate if they're set
    return NextResponse.json({
      website: {
        ...website,
        wpUsernameEncrypted: undefined,
        wpAppPasswordEncrypted: undefined,
        hasWpCredentials: !!(website.wpUsernameEncrypted && website.wpAppPasswordEncrypted),
      },
    });
  } catch (error) {
    console.error('GET /api/websites/[id] error:', error);
    return NextResponse.json({ error: 'Failed to fetch website' }, { status: 500 });
  }
}

// ─── PATCH /api/websites/[id] ─────────────────────────────────
const updateWebsiteSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  domain: z.string().min(1).max(200).optional(),
  wpBaseUrl: z.string().optional(),
  wpUsername: z.string().optional(),
  wpAppPassword: z.string().optional(),
  driveParentFolderId: z.string().optional().nullable(),
  targetCountry: z.string().optional(),
  targetAudience: z.string().optional(),
  defaultTone: z.string().optional(),
  defaultCategory: z.string().optional().nullable(),
  defaultImageStyle: z.string().optional(),
  defaultImageRatio: z.string().optional(),
  watermarkText: z.string().optional(),
  watermarkPlacement: z.string().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const data = updateWebsiteSchema.parse(body);

    const updateData: Record<string, unknown> = {};

    // Copy simple fields
    const simpleFields = [
      'name', 'domain', 'wpBaseUrl', 'driveParentFolderId',
      'targetCountry', 'targetAudience', 'defaultTone', 'defaultCategory',
      'defaultImageStyle', 'defaultImageRatio', 'watermarkText', 'watermarkPlacement',
    ];

    for (const field of simpleFields) {
      if ((data as Record<string, unknown>)[field] !== undefined) {
        updateData[field] = (data as Record<string, unknown>)[field];
      }
    }

    // Encrypt credentials if provided
    if (data.wpUsername) {
      updateData.wpUsernameEncrypted = encrypt(data.wpUsername);
    }
    if (data.wpAppPassword) {
      updateData.wpAppPasswordEncrypted = encrypt(data.wpAppPassword);
    }

    const website = await prisma.website.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      website: {
        ...website,
        wpUsernameEncrypted: undefined,
        wpAppPasswordEncrypted: undefined,
        hasWpCredentials: !!(website.wpUsernameEncrypted && website.wpAppPasswordEncrypted),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }
    console.error('PATCH /api/websites/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update website' }, { status: 500 });
  }
}

// ─── DELETE /api/websites/[id] ────────────────────────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.website.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/websites/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete website' }, { status: 500 });
  }
}
