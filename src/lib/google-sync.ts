/**
 * Higher-level Google Calendar / Drive sync.
 *
 *   - resolveStaffCalendar(staffName)         → finds the sub-calendar whose
 *                                              `summary` matches the staff's name.
 *   - createScheduleEvent / updateScheduleEvent / deleteScheduleEvent
 *                                              → write through to Google Calendar.
 *   - uploadPdfToDrive(buffer, fileName)      → upload + return file id + view URL.
 *   - attachPdfToEvent(event, drive file)     → set the event's `attachments`.
 *
 * All public functions are best-effort: they catch errors and log, never throw.
 * Local DB stays the source of truth — Google sync is a side effect.
 */

import { Readable } from 'node:stream';
import { getCalendarClient, getDriveClient, googleConfigured } from './google';

export interface GoogleSyncResult {
  ok: boolean;
  eventId?: string;
  calendarId?: string;
  error?: string;
}

interface ScheduleForSync {
  id: number;
  title: string;
  carType: string;
  description?: string | null;
  startAt: string | Date;
  endAt: string | Date;
  customer: string;
  customerName: string;
  requester: string;
  staffId: string;
  staffName: string;
  pdfNumber: string | null;
  status: string;
  items: Array<{
    productName: string;
    quantity: number;
    unitPrice: number;
    maker?: string;
  }>;
}

const TIME_ZONE = 'Asia/Tokyo';

/** Cache the staffName→calendarId mapping so we don't list calendars on every write. */
let calendarCache: Map<string, string> | null = null;
let calendarCacheAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function loadCalendarCache(): Promise<Map<string, string>> {
  if (calendarCache && Date.now() - calendarCacheAt < CACHE_TTL_MS) return calendarCache;
  const calendar = getCalendarClient();
  const cache = new Map<string, string>();
  let pageToken: string | undefined;
  do {
    const res = await calendar.calendarList.list({ pageToken, maxResults: 250 });
    for (const item of res.data.items ?? []) {
      if (item.id && item.summary) cache.set(item.summary.trim(), item.id);
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  calendarCache = cache;
  calendarCacheAt = Date.now();
  return cache;
}

export function invalidateCalendarCache(): void {
  calendarCache = null;
}

/**
 * Match `staffName` to a sub-calendar. Tries (in order): exact summary match,
 * last-name match (token before a space), substring match. Returns null if
 * nothing fits — caller decides whether to skip the event or fall back.
 */
export async function resolveStaffCalendar(staffName: string): Promise<string | null> {
  if (!staffName) return null;
  const cache = await loadCalendarCache();
  const trimmed = staffName.trim();
  if (cache.has(trimmed)) return cache.get(trimmed)!;

  // Try last name (first token before whitespace) — Smaregi often stores "後川 広輔"
  const lastName = trimmed.split(/\s+/)[0];
  if (lastName && cache.has(lastName)) return cache.get(lastName)!;

  // Substring fallback
  for (const [summary, id] of cache.entries()) {
    if (trimmed.includes(summary) || summary.includes(trimmed) || summary.includes(lastName)) {
      return id;
    }
  }
  return null;
}

function totalYen(items: ScheduleForSync['items']): number {
  return items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
}

function buildEventBody(schedule: ScheduleForSync) {
  const total = totalYen(schedule.items);
  const tax = Math.floor(total * 0.1);
  const lines = [
    schedule.customerName ? `取引先: ${schedule.customerName}` : null,
    schedule.customer ? `お客様: ${schedule.customer}` : null,
    schedule.requester ? `ご依頼者: ${schedule.requester}` : null,
    schedule.carType ? `車種: ${schedule.carType}` : null,
    `担当: ${schedule.staffName}`,
    `小計(税抜): ¥${total.toLocaleString()}`,
    `税: ¥${tax.toLocaleString()}`,
    `合計: ¥${(total + tax).toLocaleString()}`,
    schedule.pdfNumber ? `伝票番号: ${schedule.pdfNumber}` : null,
    schedule.description ? '\n' + schedule.description : null,
  ].filter(Boolean);

  // NOTE: `location` is intentionally NOT set. The staff type the location field
  // in Google Calendar themselves (取引先/依頼者/金額/受注者), and a patch that
  // omits it leaves their original value untouched. Writing it here would
  // overwrite what they entered.
  return {
    summary: schedule.title || '(無題)',
    description: lines.join('\n'),
    start: { dateTime: new Date(schedule.startAt).toISOString(), timeZone: TIME_ZONE },
    end: { dateTime: new Date(schedule.endAt).toISOString(), timeZone: TIME_ZONE },
  };
}

/** Create a Google event for the schedule. Returns the eventId on success. */
export async function createScheduleEvent(schedule: ScheduleForSync): Promise<GoogleSyncResult> {
  if (!googleConfigured()) return { ok: false, error: 'not configured' };
  try {
    const calendarId = await resolveStaffCalendar(schedule.staffName);
    if (!calendarId) return { ok: false, error: `no calendar matching staff "${schedule.staffName}"` };
    const calendar = getCalendarClient();
    const res = await calendar.events.insert({
      calendarId,
      requestBody: buildEventBody(schedule),
    });
    if (!res.data.id) return { ok: false, error: 'no event id returned' };
    return { ok: true, eventId: res.data.id, calendarId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Google createEvent failed:', message);
    return { ok: false, error: message };
  }
}

/** Update an existing Google event. If the staff (calendar) changed, moves the event. */
export async function updateScheduleEvent(
  schedule: ScheduleForSync,
  current: { eventId: string; calendarId: string },
): Promise<GoogleSyncResult> {
  if (!googleConfigured()) return { ok: false, error: 'not configured' };
  try {
    const newCalendarId = (await resolveStaffCalendar(schedule.staffName)) ?? current.calendarId;
    const calendar = getCalendarClient();

    // If the staff changed (different calendar), move the event first.
    let calendarId = current.calendarId;
    if (newCalendarId !== current.calendarId) {
      await calendar.events.move({
        calendarId: current.calendarId,
        eventId: current.eventId,
        destination: newCalendarId,
      });
      calendarId = newCalendarId;
    }

    await calendar.events.patch({
      calendarId,
      eventId: current.eventId,
      requestBody: buildEventBody(schedule),
    });
    return { ok: true, eventId: current.eventId, calendarId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // If the event was deleted in Google, recreate it.
    if (message.includes('Resource has been deleted') || message.includes('Not Found')) {
      return createScheduleEvent(schedule);
    }
    console.error('Google updateEvent failed:', message);
    return { ok: false, error: message };
  }
}

export async function deleteScheduleEvent(
  current: { eventId: string; calendarId: string },
): Promise<GoogleSyncResult> {
  if (!googleConfigured()) return { ok: false, error: 'not configured' };
  try {
    const calendar = getCalendarClient();
    await calendar.events.delete({
      calendarId: current.calendarId,
      eventId: current.eventId,
    });
    return { ok: true, eventId: current.eventId, calendarId: current.calendarId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Already gone — that's fine.
    if (message.includes('Resource has been deleted') || message.includes('Not Found')) {
      return { ok: true };
    }
    console.error('Google deleteEvent failed:', message);
    return { ok: false, error: message };
  }
}

export interface DriveUploadResult {
  fileId: string;
  webViewLink: string;
}

/** Upload a PDF buffer to Drive into GOOGLE_DRIVE_FOLDER_ID. */
export async function uploadPdfToDrive(
  buffer: Buffer,
  fileName: string,
): Promise<DriveUploadResult> {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) throw new Error('GOOGLE_DRIVE_FOLDER_ID is not set');
  const drive = getDriveClient();
  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
      mimeType: 'application/pdf',
    },
    media: {
      mimeType: 'application/pdf',
      body: Readable.from(buffer),
    },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  });
  const fileId = res.data.id;
  const webViewLink = res.data.webViewLink ?? '';
  if (!fileId) throw new Error('Drive upload returned no file id');
  return { fileId, webViewLink };
}

/** Add a Drive file as an attachment on a Google event. Replaces existing attachments. */
export async function attachDriveFileToEvent(
  current: { eventId: string; calendarId: string },
  driveFile: DriveUploadResult,
  fileName: string,
): Promise<GoogleSyncResult> {
  if (!googleConfigured()) return { ok: false, error: 'not configured' };
  try {
    const calendar = getCalendarClient();
    await calendar.events.patch({
      calendarId: current.calendarId,
      eventId: current.eventId,
      supportsAttachments: true,
      requestBody: {
        attachments: [
          {
            fileId: driveFile.fileId,
            fileUrl: driveFile.webViewLink,
            title: fileName,
            mimeType: 'application/pdf',
          },
        ],
      },
    });
    return { ok: true, eventId: current.eventId, calendarId: current.calendarId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Google attachPdfToEvent failed:', message);
    return { ok: false, error: message };
  }
}
