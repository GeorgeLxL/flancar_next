import { NextRequest, NextResponse } from 'next/server';
import { syncProducts } from '@/lib/sync';

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-sdsch-secret');
  if (secret !== process.env.NEXT_PUBLIC_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { accessToken?: string };
  const accessToken = String(body.accessToken ?? '');
  if (!accessToken) return NextResponse.json({ error: 'accessToken is required' }, { status: 400 });
  try {
    await syncProducts(accessToken);
    return NextResponse.json({ success: true, message: 'Sync completed' });
  } catch (e) {
    console.error('Webhook sync failed:', e);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
