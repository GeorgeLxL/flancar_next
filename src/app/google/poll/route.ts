import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, roleOf } from '@/lib/session';
import { pollGoogleCalendars } from '@/lib/google-import';
import { emitScheduleEvent } from '@/lib/sse';

export const runtime = 'nodejs';
export const maxDuration = 60; // give the poll up to 60s

/**
 * POST /google/poll[?full=1]
 *
 * Triggers the Google Calendar → FlanCar import scan.
 * Authentication: admin session required.
 *
 * `mode` selects the look-back window:
 *   - full       → 90 days (manual "Google取込" button)
 *   - login      → 1 day   (fired once on page load)
 *   - (default)  → 30 min  (frequent in-app GoogleAutoPoll heartbeat)
 *
 * Returns an ImportResult summary.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (roleOf(user) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const param = req.nextUrl.searchParams.get('mode');
  const mode = param === 'full' ? 'full' : param === 'login' ? 'login' : 'heartbeat';
  const result = await pollGoogleCalendars({ mode });
  if (result.imported > 0) emitScheduleEvent({ type: 'created', id: 0 });
  return NextResponse.json(result);
}
