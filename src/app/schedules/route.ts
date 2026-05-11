import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth';
import { createSchedule, listSchedules } from '@/lib/schedules';
import { emitScheduleEvent } from '@/lib/sse';

export async function GET() {
  const guard = await requireAuth();
  if ('response' in guard) return guard.response;
  return NextResponse.json(await listSchedules());
}

export async function POST(req: NextRequest) {
  const guard = await requireRole('worker', 'admin');
  if ('response' in guard) return guard.response;
  const body = (await req.json()) as Record<string, unknown>;
  const { items, ...rest } = body as { items?: unknown[] } & Record<string, unknown>;
  const schedule = await createSchedule(rest, (items as never[]) ?? []);
  if (schedule) emitScheduleEvent({ type: 'created', id: schedule.id });
  return NextResponse.json(schedule, { status: 201 });
}
