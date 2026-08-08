import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/encryption';

// POST /api/websites/[id]/test-wp
// Tests WordPress REST API connection using stored credentials
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const website = await prisma.website.findUnique({ where: { id } });

    if (!website) {
      return NextResponse.json({ error: 'Website not found' }, { status: 404 });
    }

    if (!website.wpUsernameEncrypted || !website.wpAppPasswordEncrypted) {
      return NextResponse.json(
        { success: false, error: 'WordPress credentials not configured. Please save a username and application password first.' },
        { status: 400 }
      );
    }

    const username = decrypt(website.wpUsernameEncrypted);
    const appPassword = decrypt(website.wpAppPasswordEncrypted);
    const baseUrl = website.wpBaseUrl.replace(/\/$/, '');

    const credentials = Buffer.from(`${username}:${appPassword}`).toString('base64');

    const response = await fetch(`${baseUrl}/wp-json/wp/v2/users/me`, {
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json({
        success: false,
        error: `WordPress returned ${response.status}: ${text.slice(0, 200)}`,
      });
    }

    const user = await response.json();
    return NextResponse.json({
      success: true,
      user: { name: user.name, email: user.email, roles: user.roles },
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Connection failed',
    });
  }
}
