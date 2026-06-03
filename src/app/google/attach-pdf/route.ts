import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import {
  attachDriveFileToEvent,
  createScheduleEvent,
  uploadPdfToDrive,
} from '@/lib/google-sync';
import { googleConfigured } from '@/lib/google';
import { getSchedule } from '@/lib/schedules';

export const runtime = 'nodejs';

/**
 * POST /google/attach-pdf
 *
 * Multipart form:
 *   pdf         - the 4-page PDF blob (application/pdf)
 *   scheduleId  - which schedule's Google event to attach to
 *
 * Flow:
 *   1. Upload the PDF to GOOGLE_DRIVE_FOLDER_ID.
 *   2. Patch the existing Google event's `attachments` field to point at it.
 *
 * If the schedule doesn't yet have a Google event (sync was misfired earlier),
 * we create one first.
 */
export async function POST(req: NextRequest) {
  const guard = await requireRole('worker', 'clerk', 'admin');
  if ('response' in guard) return guard.response;

  if (!googleConfigured()) {
    return NextResponse.json({ ok: false, error: 'google not configured' }, { status: 200 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 });
  }

  const pdf = form.get('pdf');
  const scheduleId = Number(String(form.get('scheduleId') ?? ''));
  if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
    return NextResponse.json({ error: 'scheduleId is required' }, { status: 400 });
  }
  if (!(pdf instanceof File)) {
    return NextResponse.json({ error: 'pdf file is required' }, { status: 400 });
  }

  try {
    // Make sure we know which Google event this schedule maps to.
    let row = await queryOne<{
      googleEventId: string | null;
      googleCalendarId: string | null;
    }>(
      `SELECT "googleEventId", "googleCalendarId" FROM "Schedule" WHERE id = $1`,
      [scheduleId],
    );
    if (!row) return NextResponse.json({ error: 'schedule not found' }, { status: 404 });

    if (!row.googleEventId || !row.googleCalendarId) {
      // The background sync hadn't run / had failed. Create the event now.
      const schedule = await getSchedule(scheduleId);
      if (!schedule) return NextResponse.json({ error: 'schedule not found' }, { status: 404 });
      const created = await createScheduleEvent(schedule);
      if (!created.ok || !created.eventId || !created.calendarId) {
        return NextResponse.json({ ok: false, error: created.error ?? 'create event failed' });
      }
      await queryOne(
        `UPDATE "Schedule" SET "googleEventId" = $2, "googleCalendarId" = $3, "googleSyncedAt" = NOW() WHERE id = $1 RETURNING id`,
        [scheduleId, created.eventId, created.calendarId],
      );
      row = { googleEventId: created.eventId, googleCalendarId: created.calendarId };
    }

    const fileName = pdf.name || `schedule-${scheduleId}.pdf`;
    const buffer = Buffer.from(await pdf.arrayBuffer());
    const driveFile = await uploadPdfToDrive(buffer, fileName);
    const result = await attachDriveFileToEvent(
      { eventId: row.googleEventId!, calendarId: row.googleCalendarId! },
      driveFile,
      fileName,
    );

    return NextResponse.json({ ok: result.ok, error: result.error, fileId: driveFile.fileId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Google attach-pdf failed:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
