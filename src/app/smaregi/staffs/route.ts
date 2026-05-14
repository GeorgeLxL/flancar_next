import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { smaregiApi } from '@/lib/smaregi';

interface RawStaff {
  staffId?: string;
  staffCode?: string;
  staffName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  roleId?: string;
}

export async function GET() {
  const guard = await requireAuth();
  if ('response' in guard) return guard.response;
  const contractId = process.env.SMAREGI_CONTRACT_ID!;
  try {
    const result = await smaregiApi(guard.user.accessToken).get(`/${contractId}/pos/staffs`);
    const data = result.data as unknown;
    const raw: RawStaff[] = Array.isArray(data)
      ? (data as RawStaff[])
      : ((data as { staffs?: RawStaff[] })?.staffs ?? []);
    const staffs = raw.map(s => ({
      staffId: s.staffId ?? s.staffCode ?? '',
      staffName:
        s.staffName ??
        `${s.lastName ?? ''} ${s.firstName ?? ''}`.trim() ??
        '',
      email: s.email ?? '',
      roleId: s.roleId ?? '',
    }));
    return NextResponse.json(staffs);
  } catch (err) {
    console.error('Failed to fetch staffs:', err);
    return NextResponse.json({ error: 'Failed to fetch staffs' }, { status: 500 });
  }
}
