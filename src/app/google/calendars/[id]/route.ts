import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { deleteCalendarSource } from '@/lib/calendar-sources';

export const runtime = 'nodejs';

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireRole('admin');
  if ('response' in guard) return guard.response;
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isInteger(numId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  await deleteCalendarSource(numId);
  return NextResponse.json({ id: numId });
}
