import { getProductUnitPrice, smaregiApi, type SmaregiProduct } from './smaregi';
import { withTransaction } from './db';

async function fetchAllPages<T>(api: ReturnType<typeof smaregiApi>, path: string): Promise<T[]> {
  const limit = 1000;
  let page = 1;
  const all: T[] = [];
  while (true) {
    const result = await api.get(path, { params: { limit, page } });
    const items: T[] = Array.isArray(result.data)
      ? result.data
      : Array.isArray(result.data?.items)
        ? result.data.items
        : [];
    all.push(...items);
    if (items.length < limit) break;
    page++;
  }
  return all;
}

export async function syncProducts(accessToken: string) {
  const contractId = process.env.SMAREGI_CONTRACT_ID!;
  const api = smaregiApi(accessToken);

  try {
    const raw = await fetchAllPages<{ categoryId?: string; categoryName?: string }>(api, `/${contractId}/pos/categories`);
    const categories = raw
      .map(c => ({ categoryId: String(c.categoryId ?? ''), categoryName: String(c.categoryName ?? '') }))
      .filter(c => c.categoryId);

    await withTransaction(async client => {
      for (const c of categories) {
        await client.query(
          `INSERT INTO "Category" ("categoryId", "categoryName", "updatedAt")
           VALUES ($1, $2, NOW())
           ON CONFLICT ("categoryId") DO UPDATE
             SET "categoryName" = EXCLUDED."categoryName", "updatedAt" = NOW()`,
          [c.categoryId, c.categoryName],
        );
      }
    });
    console.log(`Synced ${categories.length} categories`);
  } catch (e) {
    console.error('Failed to sync categories:', e);
  }

  try {
    const raw = await fetchAllPages<SmaregiProduct>(api, `/${contractId}/pos/products`);
    const products = raw
      .map(p => ({
        productId: String(p.productId ?? p.productCode ?? ''),
        productName: String(p.productName ?? p.name ?? ''),
        maker: String(p.productKana ?? ''),
        categoryId: String(p.categoryId ?? ''),
        unitPrice: getProductUnitPrice(p),
      }))
      .filter(p => p.productId);

    await withTransaction(async client => {
      for (const p of products) {
        await client.query(
          `INSERT INTO "Product" ("productId", "productName", maker, "categoryId", "unitPrice", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT ("productId") DO UPDATE
             SET "productName" = EXCLUDED."productName",
                 maker = EXCLUDED.maker,
                 "categoryId" = EXCLUDED."categoryId",
                 "unitPrice" = EXCLUDED."unitPrice",
                 "updatedAt" = NOW()`,
          [p.productId, p.productName, p.maker, p.categoryId, p.unitPrice],
        );
      }
    });
    console.log(`Synced ${products.length} products`);
  } catch (e) {
    console.error('Failed to sync products:', e);
  }
}

export async function syncCustomers(accessToken: string) {
  const contractId = process.env.SMAREGI_CONTRACT_ID!;
  const api = smaregiApi(accessToken);

  try {
    type RawCustomer = {
      customerId?: string;
      memberNo?: string;
      companyName?: string;
      lastName?: string;
      firstName?: string;
      customerName?: string;
      name?: string;
    };
    const raw = await fetchAllPages<RawCustomer>(api, `/${contractId}/pos/customers`);
    const customers = raw
      .map(c => {
        const fullName = `${c.lastName ?? ''} ${c.firstName ?? ''}`.trim();
        return {
          customerId: String(c.customerId ?? c.memberNo ?? ''),
          customerName: String(c.companyName ?? (fullName || c.customerName || c.name || '')),
        };
      })
      .filter(c => c.customerId);

    await withTransaction(async client => {
      for (const c of customers) {
        await client.query(
          `INSERT INTO "Customer" ("customerId", "customerName", "updatedAt")
           VALUES ($1, $2, NOW())
           ON CONFLICT ("customerId") DO UPDATE
             SET "customerName" = EXCLUDED."customerName", "updatedAt" = NOW()`,
          [c.customerId, c.customerName],
        );
      }
    });
    console.log(`Synced ${customers.length} customers`);
  } catch (e) {
    console.error('Failed to sync customers:', e);
  }
}
