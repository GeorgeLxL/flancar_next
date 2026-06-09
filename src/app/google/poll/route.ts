import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, roleOf } from '@/lib/session';
import { pollGoogleCalendars } from '@/lib/google-import';
import { emitScheduleEvent } from '@/lib/sse';

export const runtime = 'nodejs';
export const maxDuration = 60; // give the poll up to 60s

/**
 * POST /google/poll
 *
 * Authentication: either
 *   - logged in as admin, OR
 *   - request carries `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sets
 *     this automatically when CRON_SECRET is configured in env).
 *
 * Returns an ImportResult summary.
 */
export async function POST(req: NextRequest) {
  if (!(await authorize(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = await pollGoogleCalendars();
  // Nudge any open calendar views to refresh — if anything was imported.
  if (result.imported > 0) emitScheduleEvent({ type: 'created', id: 0 });
  return NextResponse.json(result);
}

// Vercel Cron sends a GET, not a POST.
export async function GET(req: NextRequest) {
  return POST(req);
}

async function authorize(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization') ?? '';
    if (auth === `Bearer ${cronSecret}`) return true;
  }
  const user = await getSessionUser();
  return roleOf(user) === 'admin';
}
