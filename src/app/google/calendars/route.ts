import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { addCalendarSource, listCalendarSources } from '@/lib/calendar-sources';

export const runtime = 'nodejs';

export async function GET() {
  const guard = await requireRole('admin');
  if ('response' in guard) return guard.response;
  return NextResponse.json(await listCalendarSources());
}

export async function POST(req: NextRequest) {
  const guard = await requireRole('admin');
  if ('response' in guard) return guard.response;
  const { calendarId, label } = (await req.json()) as { calendarId?: string; label?: string };
  if (!calendarId || !calendarId.trim()) {
    return NextResponse.json({ error: 'calendarId is required' }, { status: 400 });
  }
  const source = await addCalendarSource(calendarId, label ?? '');
  return NextResponse.json(source, { status: 201 });
}
