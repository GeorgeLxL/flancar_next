import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getStaffColors } from '@/lib/schedules';

export async function GET() {
  const guard = await requireAuth();
  if ('response' in guard) return guard.response;
  return NextResponse.json(await getStaffColors());
}
