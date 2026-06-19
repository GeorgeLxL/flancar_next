/**
 * Admin-managed list of Google calendars to import from.
 *
 * A service account does NOT automatically see calendars shared with it via
 * `calendarList.list()`, so auto-discovery alone returns nothing. This table
 * lets an admin register each shared calendar's ID explicitly; the importer
 * reads events from these IDs directly (events.list works on any calendar the
 * service account has access to, regardless of calendarList membership).
 *
 * The table is created lazily so no manual `db:init` is required in production.
 */

import { query } from './db';

export interface CalendarSource {
  id: number;
  calendarId: string;
  /** Display name used as the schedule's staffName on import (e.g. "後川"). */
  label: string;
  createdAt: string;
}

let tableReady = false;
async function ensureTable(): Promise<void> {
  if (tableReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS "CalendarSource" (
      "id" SERIAL PRIMARY KEY,
      "calendarId" TEXT NOT NULL UNIQUE,
      "label" TEXT NOT NULL DEFAULT '',
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  tableReady = true;
}

export async function listCalendarSources(): Promise<CalendarSource[]> {
  await ensureTable();
  return query<CalendarSource>(
    `SELECT "id", "calendarId", "label", "createdAt" FROM "CalendarSource" ORDER BY "createdAt"`,
  );
}

export async function addCalendarSource(calendarId: string, label: string): Promise<CalendarSource> {
  await ensureTable();
  const rows = await query<CalendarSource>(
    `INSERT INTO "CalendarSource" ("calendarId", "label")
     VALUES ($1, $2)
     ON CONFLICT ("calendarId") DO UPDATE SET "label" = EXCLUDED."label"
     RETURNING "id", "calendarId", "label", "createdAt"`,
    [calendarId.trim(), label.trim()],
  );
  return rows[0];
}

export async function deleteCalendarSource(id: number): Promise<void> {
  await ensureTable();
  await query(`DELETE FROM "CalendarSource" WHERE "id" = $1`, [id]);
}
