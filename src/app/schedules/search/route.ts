import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { searchSchedules } from '@/lib/schedules';

export async function GET(req: NextRequest) {
  const guard = await requireAuth();
  if ('response' in guard) return guard.response;
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  return NextResponse.json(await searchSchedules(q));
}
