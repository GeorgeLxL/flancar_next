import { NextRequest, NextResponse } from 'next/server';
import { syncCustomers, syncProducts } from '@/lib/sync';

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-sdsch-secret');
  if (secret !== process.env.NEXT_PUBLIC_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { accessToken?: string };
  const accessToken = String(body.accessToken ?? '');
  if (!accessToken) return NextResponse.json({ error: 'accessToken is required' }, { status: 400 });

  void syncProducts(accessToken).catch(e => console.error('Webhook sync failed:', e));
  void syncCustomers(accessToken).catch(e => console.error('Webhook sync failed:', e));
  return NextResponse.json({ success: true, message: 'Sync started' });
}
