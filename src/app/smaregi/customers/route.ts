import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { smaregiApi } from '@/lib/smaregi';

interface RawCustomer {
  customerId?: string;
  customerNo?: string;
  customerName?: string;
  firstName?: string;
  lastName?: string;
}

export async function GET() {
  const guard = await requireAuth();
  if ('response' in guard) return guard.response;
  const contractId = process.env.SMAREGI_CONTRACT_ID!;
  try {
    const result = await smaregiApi(guard.user.accessToken).get(
      `/${contractId}/pos/customers`,
      { params: { limit: 1000 } },
    );
    const data = result.data as unknown;
    const customers: RawCustomer[] = Array.isArray(data)
      ? (data as RawCustomer[])
      : ((data as { customers?: RawCustomer[] })?.customers ?? []);
    return NextResponse.json(
      customers.map(c => ({
        customerId: c.customerId ?? c.customerNo ?? '',
        customerName:
          c.customerName ?? `${c.lastName ?? ''} ${c.firstName ?? ''}`.trim(),
      })),
    );
  } catch {
    return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 });
  }
}
