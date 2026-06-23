/**
 * One-shot DDL for the Supabase Postgres database. Run with `npm run db:init`.
 * Mirrors the original Prisma schema so existing data is unaffected if the
 * tables already exist.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getPool } from '../src/lib/db';

// Minimal .env loader so this script can be run standalone.
function loadEnv(file: string) {
  try {
    const content = readFileSync(file, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=("(.*)"|'(.*)'|(.*))\s*$/);
      if (!m) continue;
      const key = m[1];
      const value = m[3] ?? m[4] ?? m[5] ?? '';
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    /* file missing — ignore */
  }
}
loadEnv(path.join(process.cwd(), '.env'));
loadEnv(path.join(process.cwd(), '.env.local'));

const ddl = `
DO $$ BEGIN
  CREATE TYPE "ScheduleStatus" AS ENUM ('draft', 'pending', 'sent', 'finished');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Customer" (
  "id" SERIAL PRIMARY KEY,
  "customerId" TEXT NOT NULL UNIQUE,
  "customerName" TEXT NOT NULL,
  "faxNumber" TEXT NOT NULL DEFAULT '',
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Idempotent column add for existing databases.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "faxNumber" TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS "Category" (
  "id" SERIAL PRIMARY KEY,
  "categoryId" TEXT NOT NULL UNIQUE,
  "categoryName" TEXT NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "Product" (
  "id" SERIAL PRIMARY KEY,
  "productId" TEXT NOT NULL UNIQUE,
  "productName" TEXT NOT NULL,
  "maker" TEXT NOT NULL DEFAULT '',
  "categoryId" TEXT NOT NULL DEFAULT '',
  "unitPrice" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "Schedule" (
  "id" SERIAL PRIMARY KEY,
  "title" TEXT NOT NULL DEFAULT '',
  "carType" TEXT NOT NULL DEFAULT '',
  "description" TEXT DEFAULT '',
  "startAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "endAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "customerId" TEXT NOT NULL DEFAULT '',
  "staffId" TEXT NOT NULL DEFAULT '',
  "staffName" TEXT NOT NULL DEFAULT '',
  "customer" TEXT NOT NULL DEFAULT '',
  "requester" TEXT NOT NULL DEFAULT '',
  "showComiPack" BOOLEAN NOT NULL DEFAULT FALSE,
  "pdfNumber" TEXT UNIQUE,
  "status" "ScheduleStatus" NOT NULL DEFAULT 'draft',
  "googleEventId" TEXT,
  "googleCalendarId" TEXT,
  "googleSyncedAt" TIMESTAMPTZ,
  "googleSyncError" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Idempotent column adds for existing databases.
ALTER TABLE "Schedule" ADD COLUMN IF NOT EXISTS "googleEventId" TEXT;
ALTER TABLE "Schedule" ADD COLUMN IF NOT EXISTS "googleCalendarId" TEXT;
ALTER TABLE "Schedule" ADD COLUMN IF NOT EXISTS "googleSyncedAt" TIMESTAMPTZ;
ALTER TABLE "Schedule" ADD COLUMN IF NOT EXISTS "googleSyncError" TEXT;
-- Unresolved Google-import product short-codes awaiting manual selection.
ALTER TABLE "Schedule" ADD COLUMN IF NOT EXISTS "pendingCodes" TEXT;

-- Unique partial index so a given Google event can only ever map to one Schedule.
-- Phase 2 (Google → App) relies on this for idempotent imports.
CREATE UNIQUE INDEX IF NOT EXISTS "Schedule_googleEventId_unique"
  ON "Schedule" ("googleEventId") WHERE "googleEventId" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "ScheduleItem" (
  "id" SERIAL PRIMARY KEY,
  "scheduleId" INTEGER NOT NULL REFERENCES "Schedule"("id") ON DELETE CASCADE,
  "productId" TEXT NOT NULL DEFAULT '',
  "categoryId" TEXT NOT NULL DEFAULT '',
  "unitPrice" INTEGER NOT NULL DEFAULT 0,
  "quantity" INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS "ScheduleItem_scheduleId_idx" ON "ScheduleItem" ("scheduleId");

CREATE TABLE IF NOT EXISTS "StaffColor" (
  "staffId" TEXT PRIMARY KEY,
  "color" TEXT NOT NULL DEFAULT '#6b7280',
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Google calendars to import from. A service account doesn't auto-list
-- calendars shared with it, so admins register each calendar's ID here.
CREATE TABLE IF NOT EXISTS "CalendarSource" (
  "id" SERIAL PRIMARY KEY,
  "calendarId" TEXT NOT NULL UNIQUE,
  "label" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

async function main() {
  const pool = getPool();
  await pool.query(ddl);
  console.log('Database schema ready.');
  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
