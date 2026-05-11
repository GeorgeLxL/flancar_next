import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { normalizeProduct, smaregiApi, type SmaregiProduct } from '@/lib/smaregi';

export async function GET() {
  const guard = await requireAuth();
  if ('response' in guard) return guard.response;
  const contractId = process.env.SMAREGI_CONTRACT_ID!;
  try {
    const result = await smaregiApi(guard.user.accessToken).get(
      `/${contractId}/pos/products`,
      { params: { limit: 1000 } },
    );
    const data = result.data as unknown;
    const products = Array.isArray(data)
      ? (data as SmaregiProduct[]).map(normalizeProduct)
      : Array.isArray((data as { products?: SmaregiProduct[] })?.products)
        ? (data as { products: SmaregiProduct[] }).products.map(normalizeProduct)
        : [];
    return NextResponse.json(products);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
  }
}
