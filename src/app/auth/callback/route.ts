import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { setSessionUser } from '@/lib/session';

interface SmaregiStaff {
  staffId: string;
  staffName: string;
  email: string;
  roleId: string;
}

export async function GET(req: NextRequest) {
  const {
    SMAREGI_CLIENT_ID,
    SMAREGI_CLIENT_SECRET,
    SMAREGI_REDIRECT_URI,
    SMAREGI_TOKEN_URL,
    SMAREGI_API_BASE,
    SMAREGI_CONTRACT_ID,
  } = process.env;

  const origin = req.nextUrl.origin;
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const email = state ? decodeURIComponent(state) : '';
  if (!email) return NextResponse.redirect(`${origin}/login?error=no_email`);

  try {
    const tokenRes = await axios.post(
      SMAREGI_TOKEN_URL!,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code ?? '',
        redirect_uri: SMAREGI_REDIRECT_URI!,
        client_id: SMAREGI_CLIENT_ID!,
        client_secret: SMAREGI_CLIENT_SECRET!,
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization:
            'Basic ' +
            Buffer.from(`${SMAREGI_CLIENT_ID}:${SMAREGI_CLIENT_SECRET}`).toString('base64'),
        },
      },
    );

    const accessToken: string = tokenRes.data.access_token;

    const staffsRes = await axios.get(`${SMAREGI_API_BASE}/${SMAREGI_CONTRACT_ID}/pos/staffs`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const staffs: SmaregiStaff[] = Array.isArray(staffsRes.data)
      ? staffsRes.data
      : staffsRes.data?.staffs ?? [];

    const staff = staffs.find(s => s.email === email);
    if (!staff) return NextResponse.redirect(`${origin}/login?error=user_not_found`);

    const user = {
      staffId: staff.staffId,
      staffName: staff.staffName,
      email: staff.email,
      roleId: staff.roleId,
      accessToken,
    };
    await setSessionUser(user);

    const url = new URL('/', origin);
    url.searchParams.set('user', JSON.stringify(user));
    return NextResponse.redirect(url.toString());
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    return NextResponse.redirect(
      `${origin}/login?error=auth_failed&detail=${encodeURIComponent(message)}`,
    );
  }
}
