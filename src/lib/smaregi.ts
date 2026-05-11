import axios from 'axios';

export function smaregiApi(token: string) {
  return axios.create({
    baseURL: process.env.SMAREGI_API_BASE,
    headers: { Authorization: `Bearer ${token}` },
  });
}

export type SmaregiProduct = {
  productId?: string;
  productCode?: string;
  productName?: string;
  productKana?: string;
  name?: string;
  price?: string | number;
  customerPrice?: string | number;
  reduceTaxPrice?: string | number;
  reduceTaxCustomerPrice?: string | number;
  cost?: string | number;
  categoryId?: string;
  prices?: Array<{ price?: number | string }>;
};

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function getProductUnitPrice(product: SmaregiProduct): number {
  const candidates = [
    product?.price,
    product?.customerPrice,
    product?.reduceTaxPrice,
    product?.reduceTaxCustomerPrice,
    product?.cost,
    product?.prices?.[0]?.price,
  ];
  for (const candidate of candidates) {
    const parsed = toNumber(candidate);
    if (parsed !== null) return parsed;
  }
  return 0;
}

export function normalizeProduct(product: SmaregiProduct) {
  return {
    ...product,
    productId: product.productId ?? product.productCode ?? '',
    productName: product.productName ?? product.name ?? '',
    unitPrice: getProductUnitPrice(product),
  };
}
