import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { email } = (await req.json()) as { email?: string };
  if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 });

  const { SMAREGI_CLIENT_ID, SMAREGI_REDIRECT_URI, SMAREGI_AUTH_URL } = process.env;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: SMAREGI_CLIENT_ID!,
    redirect_uri: SMAREGI_REDIRECT_URI!,
    scope: 'openid pos.staffs:read pos.products:read pos.stores:read pos.customers:read',
    state: encodeURIComponent(email),
  });
  return NextResponse.json({ url: `${SMAREGI_AUTH_URL}?${params}` });
}
