import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { discoverAndRegisterCalendars } from '@/lib/google-import';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /google/calendars/discover
 *
 * Lists every calendar the service account can see and registers them all into
 * the CalendarSource DB in one call. Admin only.
 */
export async function POST() {
  const guard = await requireRole('admin');
  if ('response' in guard) return guard.response;
  return NextResponse.json(await discoverAndRegisterCalendars());
}
