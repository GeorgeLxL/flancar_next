import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { smaregiApi } from '@/lib/smaregi';

export async function GET() {
  const guard = await requireAuth();
  if ('response' in guard) return guard.response;
  const contractId = process.env.SMAREGI_CONTRACT_ID!;
  try {
    const result = await smaregiApi(guard.user.accessToken).get(`/${contractId}/pos/stores`);
    return NextResponse.json(result.data);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch stores' }, { status: 500 });
  }
}
