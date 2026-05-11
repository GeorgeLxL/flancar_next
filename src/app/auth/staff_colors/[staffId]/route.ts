import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { setStaffColor } from '@/lib/schedules';

export async function PUT(req: NextRequest, ctx: { params: Promise<{ staffId: string }> }) {
  const guard = await requireRole('admin');
  if ('response' in guard) return guard.response;
  const { staffId } = await ctx.params;
  const { color } = (await req.json()) as { color?: string };
  if (!staffId) return NextResponse.json({ error: 'staffId is required' }, { status: 400 });
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) {
    return NextResponse.json({ error: 'Invalid color' }, { status: 400 });
  }
  await setStaffColor(staffId, color);
  return NextResponse.json({ staffId, color });
}
