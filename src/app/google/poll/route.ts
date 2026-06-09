import { NextResponse } from 'next/server';
import { getSessionUser, roleOf } from '@/lib/session';
import { pollGoogleCalendars } from '@/lib/google-import';
import { emitScheduleEvent } from '@/lib/sse';

export const runtime = 'nodejs';
export const maxDuration = 60; // give the poll up to 60s

/**
 * POST /google/poll
 *
 * Triggers the Google Calendar → FlanCar import scan.
 * Authentication: admin session required.
 *
 * Called from:
 *   - the "Google取込" button in the navbar
 *   - the in-app GoogleAutoPoll component (on page load / focus / heartbeat)
 *
 * Returns an ImportResult summary.
 */
export async function POST() {
  const user = await getSessionUser();
  if (roleOf(user) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = await pollGoogleCalendars();
  if (result.imported > 0) emitScheduleEvent({ type: 'created', id: 0 });
  return NextResponse.json(result);
}
