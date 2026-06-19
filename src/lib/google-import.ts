/**
 * Phase 2: Google Calendar → FlanCar import.
 *
 * Polls every shared sub-calendar for events updated in the last N minutes
 * whose title starts with one of the configured prefix markers
 * (default: `商,サ,新,見`). Imports each as a draft Schedule, with smart
 * matching of product / customer abbreviations against the cached Smaregi DB.
 *
 * Idempotent via the unique partial index on Schedule.googleEventId.
 */

import { getCalendarClient, googleConfigured, googleKeyDiagnostics } from './google';
import { addCalendarSource, addCalendarSourceIfNew, listCalendarSources } from './calendar-sources';
import { query, queryOne } from './db';
import { createSchedule } from './schedules';
import type { calendar_v3 } from 'googleapis';

const DEFAULT_PREFIXES = ['商', 'サ', '新', '見'];
/** Heartbeat window: each periodic auto-poll (every ~1 min) looks back 30 min. */
const LOOKBACK_MS = 30 * 60 * 1000;
/** Login window: the poll fired once on page load looks back 1 day. */
const LOGIN_LOOKBACK_MS = 24 * 60 * 60 * 1000;
/** Manual "Google取込" button window — wide enough to catch events from months ago. */
const FULL_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;

/** Parse GOOGLE_CALENDAR_TITLE_PREFIX (comma-separated) into a list. */
function loadPrefixes(): string[] {
  const raw = process.env.GOOGLE_CALENDAR_TITLE_PREFIX;
  if (!raw) return DEFAULT_PREFIXES;
  const items = raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return items.length > 0 ? items : DEFAULT_PREFIXES;
}

/** Return the matching prefix if the title starts with any of them, else null. */
function matchPrefix(title: string, prefixes: string[]): string | null {
  const t = title.trim();
  for (const p of prefixes) {
    if (t.startsWith(p)) return p;
  }
  return null;
}

export interface ImportResult {
  scanned: number;
  imported: number;
  skipped: number;
  errors: number;
  calendars: number;
  /** false when the Google integration (service account) is not configured. */
  configured: boolean;
  /** Set when the calendar listing itself failed (e.g. auth / permission). */
  error?: string;
}

interface ParsedTitle {
  carType: string;
  productCodes: string[];
}

interface ParsedLocation {
  customerAbbrev: string;
  requester: string;
  amount: number;
}

export function parseEventTitle(rawTitle: string, prefixes: string[] | string): ParsedTitle {
  const list = Array.isArray(prefixes) ? prefixes : [prefixes];
  let t = rawTitle.trim();
  const matched = matchPrefix(t, list);
  if (matched) t = t.slice(matched.length).trim();
  // Some users add a space after the marker (e.g. `見 ABC123`).
  const tokens = t.split(/[\s/、]+/).filter(Boolean);
  if (tokens.length === 0) return { carType: '', productCodes: [] };
  return { carType: tokens[0], productCodes: tokens.slice(1) };
}

export function parseEventLocation(rawLocation: string): ParsedLocation {
  const trimmed = (rawLocation ?? '').trim();
  if (!trimmed) return { customerAbbrev: '', requester: '', amount: 0 };
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  // Find the last token containing digits; treat as the price.
  let amount = 0;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const m = tokens[i].match(/(\d[\d,]*)/);
    if (m) {
      amount = Number(m[1].replace(/,/g, ''));
      tokens.splice(i, 1);
      break;
    }
  }
  return {
    customerAbbrev: tokens[0] ?? '',
    requester: tokens.slice(1).join(' '),
    amount,
  };
}

interface ProductMatch {
  productId: string;
  categoryId: string;
  unitPrice: number;
}

/**
 * Try to find ONE Smaregi product matching a short code. Multiple hits or
 * none = returns null (the worker will pick manually).
 */
async function matchProductByCode(code: string): Promise<ProductMatch | null> {
  if (!code) return null;
  const like = `%${code}%`;
  const rows = await query<ProductMatch>(
    `SELECT "productId", "categoryId", "unitPrice"
       FROM "Product"
      WHERE "productName" ILIKE $1 OR "productId" ILIKE $1
      LIMIT 2`,
    [like],
  );
  return rows.length === 1 ? rows[0] : null;
}

interface CustomerMatch {
  customerId: string;
}

async function matchCustomerByAbbrev(abbrev: string): Promise<CustomerMatch | null> {
  if (!abbrev) return null;
  const like = `%${abbrev}%`;
  const rows = await query<CustomerMatch>(
    `SELECT "customerId"
       FROM "Customer"
      WHERE "customerName" ILIKE $1
      LIMIT 2`,
    [like],
  );
  return rows.length === 1 ? rows[0] : null;
}

async function alreadyImported(eventId: string): Promise<boolean> {
  const row = await queryOne<{ id: number }>(
    `SELECT id FROM "Schedule" WHERE "googleEventId" = $1`,
    [eventId],
  );
  return row !== null;
}

interface ImportContext {
  prefixes: string[];
  calendarSummary: string;
  calendarId: string;
}

async function importEvent(
  event: calendar_v3.Schema$Event,
  ctx: ImportContext,
): Promise<'imported' | 'skipped'> {
  if (!event.id) return 'skipped';
  const title = event.summary ?? '';
  if (!matchPrefix(title, ctx.prefixes)) return 'skipped';
  if (await alreadyImported(event.id)) return 'skipped';

  const titleP = parseEventTitle(title, ctx.prefixes);
  const locP = parseEventLocation(event.location ?? '');

  // Resolve customer (1 hit only — otherwise leave for manual selection).
  const matchedCustomer = await matchCustomerByAbbrev(locP.customerAbbrev);

  // Resolve each product code — keep matches, drop unmatched.
  const items = [];
  for (const code of titleP.productCodes) {
    const product = await matchProductByCode(code);
    if (product) {
      items.push({
        productId: product.productId,
        categoryId: product.categoryId,
        unitPrice: product.unitPrice,
        quantity: 1,
      });
    }
  }

  const start = event.start?.dateTime ?? event.start?.date;
  const end = event.end?.dateTime ?? event.end?.date;
  if (!start || !end) return 'skipped';

  await createSchedule(
    {
      title: title.trim(),
      carType: titleP.carType,
      description: event.description ?? '',
      startAt: new Date(start).toISOString(),
      endAt: new Date(end).toISOString(),
      customerId: matchedCustomer?.customerId ?? '',
      // staffId is left blank — worker picks the matching Smaregi staff.
      // Calendar summary is the most reliable hint to populate staffName.
      staffId: '',
      staffName: ctx.calendarSummary,
      customer: '',
      requester: locP.requester,
      showComiPack: true,
      status: 'draft',
    },
    items,
    { google: { eventId: event.id, calendarId: ctx.calendarId } },
  );

  return 'imported';
}

export interface DiscoverResult {
  configured: boolean;
  /** How many calendars the service account can currently see. */
  found: number;
  /** Calendars registered into the DB (id + label). */
  registered: Array<{ calendarId: string; label: string }>;
  error?: string;
}

/**
 * List every calendar the service account can currently see
 * (`calendarList.list()`) and register each one into the CalendarSource DB in
 * a single call. Idempotent — re-running just refreshes the same rows.
 *
 * Note: a service account only sees calendars that are in its own list, so this
 * finds nothing for calendars that are shared-but-not-listed. In that case the
 * admin must register the calendar ID manually.
 */
export async function discoverAndRegisterCalendars(): Promise<DiscoverResult> {
  const result: DiscoverResult = { configured: true, found: 0, registered: [] };
  if (!googleConfigured()) {
    result.configured = false;
    return result;
  }

  const calendar = getCalendarClient();
  const found: Array<{ id: string; summary: string }> = [];
  try {
    let pageToken: string | undefined;
    do {
      const res = await calendar.calendarList.list({ pageToken, maxResults: 250 });
      for (const item of res.data.items ?? []) {
        if (item.id) found.push({ id: item.id, summary: item.summaryOverride || item.summary || item.id });
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.error = `${message} | key=${JSON.stringify(googleKeyDiagnostics())}`;
    console.error('Google calendar discovery failed:', result.error);
    return result;
  }

  result.found = found.length;
  for (const c of found) {
    const saved = await addCalendarSource(c.id, c.summary);
    result.registered.push({ calendarId: saved.calendarId, label: saved.label });
  }
  return result;
}

/**
 * Poll all sub-calendars shared with the service account and import any new
 * matching events. Safe to run repeatedly — dupes are blocked by the unique
 * googleEventId index.
 */
export async function pollGoogleCalendars(
  options: { mode?: 'full' | 'login' | 'heartbeat' } = {},
): Promise<ImportResult> {
  const result: ImportResult = {
    scanned: 0,
    imported: 0,
    skipped: 0,
    errors: 0,
    calendars: 0,
    configured: true,
  };
  if (!googleConfigured()) {
    // Distinguish "integration not set up" from "set up but no calendars shared"
    // — both otherwise look identical (calendars: 0) and waste debugging time.
    result.configured = false;
    return result;
  }

  const prefixes = loadPrefixes();
  const calendar = getCalendarClient();
  // Window depends on the trigger: a manual press scans wide (catch old events),
  // the login poll a day, and the frequent heartbeat just the last 30 min.
  const lookbackMs =
    options.mode === 'full' ? FULL_LOOKBACK_MS : options.mode === 'login' ? LOGIN_LOOKBACK_MS : LOOKBACK_MS;
  const updatedMin = new Date(Date.now() - lookbackMs).toISOString();

  // Build the set of calendars to scan, keyed by id so the two sources dedupe.
  const calMap = new Map<string, { id: string; summary: string }>();

  // (1) Auto-discovery + register: list the calendars in the service account's
  // own list, persist each to the DB (so they show in the admin UI and stick),
  // then scan them. This folds the "discover" step into the sync — one press of
  // 「Google取込」 finds the calendars and imports in a single action. For a
  // service account this list is often empty even when calendars are shared with
  // it, which is why the DB-registered set (2) below also exists.
  try {
    let pageToken: string | undefined;
    do {
      const res = await calendar.calendarList.list({ pageToken, maxResults: 250 });
      for (const item of res.data.items ?? []) {
        if (!item.id) continue;
        const summary = item.summaryOverride || item.summary || item.id;
        calMap.set(item.id, { id: item.id, summary });
        // Persist without overwriting a label an admin may have set by hand.
        await addCalendarSourceIfNew(item.id, summary);
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
  } catch (err) {
    // Non-fatal: a service account that can't list calendars can still read
    // the explicitly-configured ones below via events.list. Record the cause
    // (with non-secret key diagnostics) for visibility.
    result.errors++;
    const message = err instanceof Error ? err.message : String(err);
    result.error = `${message} | key=${JSON.stringify(googleKeyDiagnostics())}`;
    console.error('Google calendarList.list failed:', result.error);
  }

  // (2) Admin-registered calendars (DB). events.list works on any calendar the
  // service account has access to, regardless of calendarList membership — so a
  // shared-but-not-listed calendar still gets scanned. The label overrides the
  // summary so the imported schedule's staffName matches the staff (e.g. "後川").
  for (const source of await listCalendarSources()) {
    const existing = calMap.get(source.calendarId);
    calMap.set(source.calendarId, {
      id: source.calendarId,
      summary: source.label || existing?.summary || source.calendarId,
    });
  }

  const calendarList = [...calMap.values()];
  result.calendars = calendarList.length;

  for (const cal of calendarList) {
    try {
      let evToken: string | undefined;
      do {
        const evRes = await calendar.events.list({
          calendarId: cal.id,
          updatedMin,
          singleEvents: true,
          showDeleted: false,
          maxResults: 250,
          pageToken: evToken,
          // q would let Google filter server-side by text, but the prefix can
          // be ambiguous in `q`; we do the filter ourselves below.
        });
        for (const ev of evRes.data.items ?? []) {
          result.scanned++;
          try {
            const outcome = await importEvent(ev, {
              prefixes,
              calendarSummary: cal.summary,
              calendarId: cal.id,
            });
            if (outcome === 'imported') result.imported++;
            else result.skipped++;
          } catch (err) {
            result.errors++;
            console.error('Google import event failed:', err);
          }
        }
        evToken = evRes.data.nextPageToken ?? undefined;
      } while (evToken);
    } catch (err) {
      result.errors++;
      console.error(`Google calendar poll failed for ${cal.summary}:`, err);
    }
  }

  return result;
}
