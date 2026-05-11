import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { updateScheduleStatus, type ScheduleStatus } from '@/lib/schedules';
import { emitScheduleEvent } from '@/lib/sse';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireRole('clerk', 'admin');
  if ('response' in guard) return guard.response;
  const { id } = await ctx.params;
  const { status } = (await req.json()) as { status?: ScheduleStatus };
  if (!status) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  try {
    const schedule = await updateScheduleStatus(Number(id), status);
    if (!schedule) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    emitScheduleEvent({ type: 'status', id: schedule.id, status: schedule.status });
    return NextResponse.json(schedule);
  } catch (e) {
    if (e instanceof Error && e.message === 'Invalid status') {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    throw e;
  }
}
