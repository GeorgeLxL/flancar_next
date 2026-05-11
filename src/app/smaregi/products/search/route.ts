import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { searchProducts } from '@/lib/schedules';

export async function GET(req: NextRequest) {
  const guard = await requireAuth();
  if ('response' in guard) return guard.response;
  const q = req.nextUrl.searchParams.get('q') ?? '';
  return NextResponse.json(await searchProducts(q));
}
