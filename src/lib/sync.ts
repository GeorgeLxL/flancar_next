import { getProductUnitPrice, smaregiApi, type SmaregiProduct } from './smaregi';
import { withTransaction } from './db';

async function fetchAllPages<T>(
  api: ReturnType<typeof smaregiApi>,
  path: string,
  extraParams: Record<string, string | number> = {},
): Promise<T[]> {
  const limit = 1000;
  let page = 1;
  const all: T[] = [];
  while (true) {
    const result = await api.get(path, { params: { limit, page, ...extraParams } });
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

// Smaregi expects timestamps in JST (`+09:00`). All time math is done on the
// JST wall-clock, server-timezone-independent.
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, '0');

interface JstParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function toJstParts(epochMs: number): JstParts {
  const j = new Date(epochMs + JST_OFFSET_MS);
  return {
    year: j.getUTCFullYear(),
    month: j.getUTCMonth() + 1,
    day: j.getUTCDate(),
    hour: j.getUTCHours(),
    minute: j.getUTCMinutes(),
    second: j.getUTCSeconds(),
  };
}

function formatJst(p: JstParts): string {
  return (
    `${p.year}-${pad(p.month)}-${pad(p.day)}` +
    `T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}+09:00`
  );
}

// Sync window — the most recent 30 days of updates. Smaregi's getProducts caps
// the `upd_date_time` range at 31 days, so a wider window (the previous 12-month
// setting) is rejected outright and the product sync silently fetches nothing.
// 30 days keeps us safely under that limit while still bounding response time.
const LOOKBACK_DAYS = 30;

function lastMonthRange() {
  const nowMs = Date.now();
  return {
    'upd_date_time-from': formatJst(toJstParts(nowMs - LOOKBACK_DAYS * DAY_MS)),
    'upd_date_time-to': formatJst(toJstParts(nowMs)),
  };
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
    const raw = await fetchAllPages<SmaregiProduct>(api, `/${contractId}/pos/products`, lastMonthRange());
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
      faxNumber?: string;
      fax?: string;
      faxNo?: string;
    };
    const raw = await fetchAllPages<RawCustomer>(api, `/${contractId}/pos/customers`);
    const customers = raw
      .map(c => {
        const fullName = `${c.lastName ?? ''} ${c.firstName ?? ''}`.trim();
        return {
          customerId: String(c.customerId ?? c.memberNo ?? ''),
          customerName: String(c.companyName ?? (fullName || c.customerName || c.name || '')),
          // Smaregi uses slightly different field names across endpoints / accounts
          faxNumber: String(c.faxNumber ?? c.fax ?? c.faxNo ?? '').trim(),
        };
      })
      .filter(c => c.customerId);

    await withTransaction(async client => {
      for (const c of customers) {
        await client.query(
          `INSERT INTO "Customer" ("customerId", "customerName", "faxNumber", "updatedAt")
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT ("customerId") DO UPDATE
             SET "customerName" = EXCLUDED."customerName",
                 "faxNumber" = EXCLUDED."faxNumber",
                 "updatedAt" = NOW()`,
          [c.customerId, c.customerName, c.faxNumber],
        );
      }
    });
    console.log(`Synced ${customers.length} customers`);
  } catch (e) {
    console.error('Failed to sync customers:', e);
  }
}
