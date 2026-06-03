import { format } from 'date-fns';
import { query, queryOne, withTransaction } from './db';
import {
  createScheduleEvent,
  deleteScheduleEvent,
  updateScheduleEvent,
} from './google-sync';
import { googleConfigured } from './google';

export type ScheduleStatus = 'draft' | 'pending' | 'sent' | 'finished';

interface ScheduleRow {
  id: number;
  title: string;
  carType: string;
  description: string | null;
  startAt: Date;
  endAt: Date;
  customerId: string;
  staffId: string;
  staffName: string;
  customer: string;
  requester: string;
  showComiPack: boolean;
  pdfNumber: string | null;
  status: ScheduleStatus;
  googleEventId: string | null;
  googleCalendarId: string | null;
  googleSyncedAt: Date | null;
  googleSyncError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ItemRow {
  id: number;
  scheduleId: number;
  productId: string;
  categoryId: string;
  unitPrice: number;
  quantity: number;
  productName: string | null;
  maker: string | null;
}

export interface ScheduleInput {
  title?: string;
  carType?: string;
  description?: string;
  startAt?: string;
  endAt?: string;
  customerId?: string;
  staffId?: string;
  staffName?: string;
  customer?: string;
  requester?: string;
  showComiPack?: boolean;
  status?: ScheduleStatus;
}

export interface ScheduleItemInput {
  productId: string;
  categoryId?: string;
  unitPrice: number | string;
  quantity: number | string;
}

function sanitizeSchedule(data: ScheduleInput) {
  return {
    title: data.title ?? '',
    carType: data.carType ?? '',
    description: data.description ?? '',
    startAt: data.startAt ? new Date(data.startAt) : new Date(),
    endAt: data.endAt ? new Date(data.endAt) : new Date(),
    customerId: data.customerId ?? '',
    staffId: data.staffId ?? '',
    staffName: data.staffName ?? '',
    customer: data.customer ?? '',
    requester: data.requester ?? '',
    showComiPack: Boolean(data.showComiPack),
    status: (data.status ?? 'draft') as ScheduleStatus,
  };
}

function sanitizeItems(items: ScheduleItemInput[]) {
  return (items || []).map(item => ({
    productId: String(item.productId ?? ''),
    categoryId: String(item.categoryId ?? ''),
    unitPrice: Number(item.unitPrice) || 0,
    quantity: Number(item.quantity) || 1,
  }));
}

async function loadScheduleAggregate(id: number) {
  const schedule = await queryOne<ScheduleRow>(
    `SELECT s.*
       FROM "Schedule" s
      WHERE s.id = $1`,
    [id],
  );
  if (!schedule) return null;

  const items = await query<ItemRow>(
    `SELECT si.*, p."productName", p.maker
       FROM "ScheduleItem" si
       LEFT JOIN "Product" p ON p."productId" = si."productId"
      WHERE si."scheduleId" = $1
      ORDER BY si.id ASC`,
    [id],
  );

  const customer = await queryOne<{ customerName: string; faxNumber: string | null }>(
    `SELECT "customerName", "faxNumber" FROM "Customer" WHERE "customerId" = $1`,
    [schedule.customerId],
  );

  const categoryIds = [...new Set(items.map(i => i.categoryId).filter(Boolean))];
  const categories = categoryIds.length
    ? await query<{ categoryId: string; categoryName: string }>(
        `SELECT "categoryId", "categoryName" FROM "Category" WHERE "categoryId" = ANY($1::text[])`,
        [categoryIds],
      )
    : [];
  const categoryMap = new Map(categories.map(c => [c.categoryId, c.categoryName]));

  return {
    ...schedule,
    customerName: customer?.customerName ?? '',
    customerFaxNumber: customer?.faxNumber ?? '',
    items: items.map(i => ({
      id: i.id,
      scheduleId: i.scheduleId,
      productId: i.productId,
      categoryId: i.categoryId,
      categoryName: categoryMap.get(i.categoryId) ?? '',
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      productName: i.productName ?? '',
      maker: i.maker ?? '',
    })),
  };
}

async function loadSchedulesAggregate(rows: ScheduleRow[]) {
  if (!rows.length) return [];
  const ids = rows.map(r => r.id);
  const customerIds = [...new Set(rows.map(r => r.customerId).filter(Boolean))];

  const items = await query<ItemRow>(
    `SELECT si.*, p."productName", p.maker
       FROM "ScheduleItem" si
       LEFT JOIN "Product" p ON p."productId" = si."productId"
      WHERE si."scheduleId" = ANY($1::int[])
      ORDER BY si.id ASC`,
    [ids],
  );
  const itemsBySchedule = new Map<number, ItemRow[]>();
  for (const it of items) {
    const arr = itemsBySchedule.get(it.scheduleId) ?? [];
    arr.push(it);
    itemsBySchedule.set(it.scheduleId, arr);
  }

  const customers = customerIds.length
    ? await query<{ customerId: string; customerName: string }>(
        `SELECT "customerId", "customerName" FROM "Customer" WHERE "customerId" = ANY($1::text[])`,
        [customerIds],
      )
    : [];
  const customerMap = new Map(customers.map(c => [c.customerId, c.customerName]));

  return rows.map(r => ({
    ...r,
    customerName: customerMap.get(r.customerId) ?? '',
    items: (itemsBySchedule.get(r.id) ?? []).map(i => ({
      id: i.id,
      scheduleId: i.scheduleId,
      productId: i.productId,
      categoryId: i.categoryId,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      productName: i.productName ?? '',
      maker: i.maker ?? '',
    })),
  }));
}

export async function listSchedules() {
  const rows = await query<ScheduleRow>(
    `SELECT * FROM "Schedule" ORDER BY "startAt" DESC`,
  );
  return loadSchedulesAggregate(rows);
}

export async function listSchedulesByRange(from: Date, to: Date) {
  const rows = await query<ScheduleRow>(
    `SELECT * FROM "Schedule"
      WHERE ("startAt" >= $1 AND "startAt" <= $2)
         OR ("endAt"   >= $1 AND "endAt"   <= $2)
         OR ("startAt" <= $1 AND "endAt"   >= $2)
      ORDER BY "startAt" ASC`,
    [from.toISOString(), to.toISOString()],
  );
  return loadSchedulesAggregate(rows);
}

export async function searchSchedules(q: string) {
  if (!q.trim()) return [];
  const like = `%${q}%`;
  const rows = await query<ScheduleRow>(
    `SELECT DISTINCT s.*
       FROM "Schedule" s
       LEFT JOIN "Customer" c ON c."customerId" = s."customerId"
       LEFT JOIN "ScheduleItem" si ON si."scheduleId" = s.id
       LEFT JOIN "Product" p ON p."productId" = si."productId"
      WHERE s.title       ILIKE $1
         OR s.customer    ILIKE $1
         OR s."staffName" ILIKE $1
         OR s.requester   ILIKE $1
         OR s."carType"   ILIKE $1
         OR c."customerName" ILIKE $1
         OR p."productName"  ILIKE $1
      ORDER BY s."startAt" ASC
      LIMIT 50`,
    [like],
  );
  return loadSchedulesAggregate(rows);
}

export async function getSchedule(id: number) {
  return loadScheduleAggregate(id);
}

// ── Google Calendar sync helpers ───────────────────────────────────────────
// Sync is fire-and-forget: local DB stays the source of truth. We record the
// result on the row (eventId / syncedAt / syncError) for diagnostics.

async function recordSyncResult(
  id: number,
  ok: boolean,
  eventId?: string | null,
  calendarId?: string | null,
  error?: string | null,
) {
  await query(
    `UPDATE "Schedule"
        SET "googleEventId"   = COALESCE($2, "googleEventId"),
            "googleCalendarId"= COALESCE($3, "googleCalendarId"),
            "googleSyncedAt"  = CASE WHEN $4 THEN NOW() ELSE "googleSyncedAt" END,
            "googleSyncError" = $5
      WHERE id = $1`,
    [id, eventId ?? null, calendarId ?? null, ok, error ?? null],
  );
}

async function syncToGoogleAfterCreate(id: number): Promise<void> {
  if (!googleConfigured()) return;
  const schedule = await loadScheduleAggregate(id);
  if (!schedule) return;
  const result = await createScheduleEvent(schedule);
  await recordSyncResult(id, result.ok, result.eventId, result.calendarId, result.error);
}

async function syncToGoogleAfterUpdate(id: number): Promise<void> {
  if (!googleConfigured()) return;
  const row = await queryOne<{ googleEventId: string | null; googleCalendarId: string | null }>(
    `SELECT "googleEventId", "googleCalendarId" FROM "Schedule" WHERE id = $1`,
    [id],
  );
  const schedule = await loadScheduleAggregate(id);
  if (!schedule) return;
  const result =
    row?.googleEventId && row?.googleCalendarId
      ? await updateScheduleEvent(schedule, { eventId: row.googleEventId, calendarId: row.googleCalendarId })
      : await createScheduleEvent(schedule);
  await recordSyncResult(id, result.ok, result.eventId, result.calendarId, result.error);
}

async function syncToGoogleAfterDelete(
  current: { eventId: string | null; calendarId: string | null },
): Promise<void> {
  if (!googleConfigured()) return;
  if (!current.eventId || !current.calendarId) return;
  await deleteScheduleEvent({ eventId: current.eventId, calendarId: current.calendarId });
}

export interface CreateScheduleOptions {
  /**
   * If set, the schedule is being imported FROM Google and we already know
   * the event/calendar it corresponds to. Stops the create-side push from
   * looping back to Google.
   */
  google?: { eventId: string; calendarId: string };
}

export async function createSchedule(
  input: ScheduleInput,
  items: ScheduleItemInput[],
  options: CreateScheduleOptions = {},
) {
  const data = sanitizeSchedule(input);
  const sItems = sanitizeItems(items);
  const dateStr = format(new Date(), 'MMdd');

  return withTransaction(async client => {
    const latest = await client.query<{ pdfNumber: string | null }>(
      `SELECT "pdfNumber" FROM "Schedule" WHERE "pdfNumber" LIKE $1 ORDER BY "pdfNumber" DESC LIMIT 1`,
      [`${dateStr}%`],
    );
    const latestNumber = latest.rows[0]?.pdfNumber
      ? Number(latest.rows[0].pdfNumber.slice(dateStr.length))
      : 0;
    const pdfNumber = `${dateStr}${String(latestNumber + 1).padStart(3, '0')}`;

    const inserted = await client.query<ScheduleRow>(
      `INSERT INTO "Schedule"
         (title, "carType", description, "startAt", "endAt", "customerId", "staffId", "staffName",
          customer, requester, "showComiPack", "pdfNumber", status,
          "googleEventId", "googleCalendarId", "googleSyncedAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
               CASE WHEN $14::text IS NOT NULL THEN NOW() ELSE NULL END, NOW())
       RETURNING *`,
      [
        data.title,
        data.carType,
        data.description,
        data.startAt,
        data.endAt,
        data.customerId,
        data.staffId,
        data.staffName,
        data.customer,
        data.requester,
        data.showComiPack,
        pdfNumber,
        data.status,
        options.google?.eventId ?? null,
        options.google?.calendarId ?? null,
      ],
    );
    const id = inserted.rows[0].id;

    for (const it of sItems) {
      await client.query(
        `INSERT INTO "ScheduleItem" ("scheduleId", "productId", "categoryId", "unitPrice", quantity)
         VALUES ($1,$2,$3,$4,$5)`,
        [id, it.productId, it.categoryId, it.unitPrice, it.quantity],
      );
    }
    return id;
  }).then(async id => {
    const aggregate = await loadScheduleAggregate(id);
    // Don't push back to Google for events that came FROM Google.
    if (!options.google) {
      void syncToGoogleAfterCreate(id).catch(err => console.error('Google sync (create) failed:', err));
    }
    return aggregate;
  });
}

export async function updateSchedule(id: number, input: ScheduleInput, items: ScheduleItemInput[]) {
  const data = sanitizeSchedule(input);
  const sItems = sanitizeItems(items);

  await withTransaction(async client => {
    const result = await client.query(
      `UPDATE "Schedule"
          SET title=$1, "carType"=$2, description=$3, "startAt"=$4, "endAt"=$5,
              "customerId"=$6, "staffId"=$7, "staffName"=$8, customer=$9, requester=$10,
              "showComiPack"=$11, status=$12, "updatedAt"=NOW()
        WHERE id=$13`,
      [
        data.title,
        data.carType,
        data.description,
        data.startAt,
        data.endAt,
        data.customerId,
        data.staffId,
        data.staffName,
        data.customer,
        data.requester,
        data.showComiPack,
        data.status,
        id,
      ],
    );
    if (result.rowCount === 0) throw new Error('Not found');

    await client.query(`DELETE FROM "ScheduleItem" WHERE "scheduleId" = $1`, [id]);
    for (const it of sItems) {
      await client.query(
        `INSERT INTO "ScheduleItem" ("scheduleId", "productId", "categoryId", "unitPrice", quantity)
         VALUES ($1,$2,$3,$4,$5)`,
        [id, it.productId, it.categoryId, it.unitPrice, it.quantity],
      );
    }
  });
  const aggregate = await loadScheduleAggregate(id);
  void syncToGoogleAfterUpdate(id).catch(err => console.error('Google sync (update) failed:', err));
  return aggregate;
}

export async function deleteSchedule(id: number) {
  // Read the Google linkage before we drop the row.
  const existing = await queryOne<{ googleEventId: string | null; googleCalendarId: string | null }>(
    `SELECT "googleEventId", "googleCalendarId" FROM "Schedule" WHERE id = $1`,
    [id],
  );
  const result = await query(`DELETE FROM "Schedule" WHERE id = $1 RETURNING id`, [id]);
  if (result.length > 0 && existing) {
    void syncToGoogleAfterDelete({
      eventId: existing.googleEventId,
      calendarId: existing.googleCalendarId,
    }).catch(err => console.error('Google sync (delete) failed:', err));
  }
  return result.length > 0;
}

export async function updateScheduleStatus(id: number, status: ScheduleStatus) {
  const valid: ScheduleStatus[] = ['draft', 'pending', 'sent', 'finished'];
  if (!valid.includes(status)) throw new Error('Invalid status');
  await query(
    `UPDATE "Schedule" SET status = $1, "updatedAt" = NOW() WHERE id = $2`,
    [status, id],
  );
  return loadScheduleAggregate(id);
}

export async function getStaffColors(): Promise<Record<string, string>> {
  const rows = await query<{ staffId: string; color: string }>(
    `SELECT "staffId", color FROM "StaffColor"`,
  );
  return Object.fromEntries(rows.map(r => [r.staffId, r.color]));
}

export async function setStaffColor(staffId: string, color: string) {
  await query(
    `INSERT INTO "StaffColor" ("staffId", color, "updatedAt")
     VALUES ($1, $2, NOW())
     ON CONFLICT ("staffId") DO UPDATE
       SET color = EXCLUDED.color, "updatedAt" = NOW()`,
    [staffId, color],
  );
}

export async function searchProducts(q: string) {
  const products = q
    ? await query<{ productId: string; productName: string; maker: string; categoryId: string; unitPrice: number }>(
        `SELECT "productId", "productName", maker, "categoryId", "unitPrice"
           FROM "Product"
          WHERE "productName" ILIKE $1
          ORDER BY "productName" ASC
          LIMIT 50`,
        [`%${q}%`],
      )
    : await query<{ productId: string; productName: string; maker: string; categoryId: string; unitPrice: number }>(
        `SELECT "productId", "productName", maker, "categoryId", "unitPrice"
           FROM "Product"
          ORDER BY "productName" ASC
          LIMIT 50`,
      );

  const categoryIds = [...new Set(products.map(p => p.categoryId).filter(Boolean))];
  const categories = categoryIds.length
    ? await query<{ categoryId: string; categoryName: string }>(
        `SELECT "categoryId", "categoryName" FROM "Category" WHERE "categoryId" = ANY($1::text[])`,
        [categoryIds],
      )
    : [];
  const categoryMap = new Map(categories.map(c => [c.categoryId, c.categoryName]));
  return products.map(p => ({ ...p, categoryName: categoryMap.get(p.categoryId) ?? '' }));
}

export async function searchCustomersDb(q: string) {
  const rows = q
    ? await query<{ customerId: string; customerName: string }>(
        `SELECT "customerId", "customerName" FROM "Customer"
          WHERE "customerName" ILIKE $1
          ORDER BY "customerName" ASC
          LIMIT 50`,
        [`%${q}%`],
      )
    : await query<{ customerId: string; customerName: string }>(
        `SELECT "customerId", "customerName" FROM "Customer"
          ORDER BY "customerName" ASC
          LIMIT 50`,
      );
  return rows;
}
