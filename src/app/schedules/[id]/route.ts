import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth';
import { deleteSchedule, getSchedule, updateSchedule } from '@/lib/schedules';
import { emitScheduleEvent } from '@/lib/sse';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth();
  if ('response' in guard) return guard.response;
  const { id } = await ctx.params;
  const schedule = await getSchedule(Number(id));
  if (!schedule) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(schedule);
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireRole('worker', 'admin');
  if ('response' in guard) return guard.response;
  const { id } = await ctx.params;
  const body = (await req.json()) as Record<string, unknown>;
  const { items, ...rest } = body as { items?: unknown[] } & Record<string, unknown>;
  try {
    const schedule = await updateSchedule(Number(id), rest, (items as never[]) ?? []);
    if (!schedule) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    emitScheduleEvent({ type: 'updated', id: schedule.id });
    return NextResponse.json(schedule);
  } catch (e) {
    if (e instanceof Error && e.message === 'Not found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    throw e;
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireRole('worker', 'admin');
  if ('response' in guard) return guard.response;
  const { id } = await ctx.params;
  const ok = await deleteSchedule(Number(id));
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  emitScheduleEvent({ type: 'deleted', id: Number(id) });
  return NextResponse.json({ ok: true });
}
