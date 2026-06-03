import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { sendFax, toE164Jp, uploadFaxMedia } from '@/lib/telnyx';
import { updateScheduleStatus } from '@/lib/schedules';
import { emitScheduleEvent } from '@/lib/sse';

export const runtime = 'nodejs';

/**
 * POST /fax/send
 *
 * Multipart form:
 *   pdf          - the rendered 1-page PDF blob (application/pdf)
 *   scheduleId   - the schedule whose status should flip on success
 *   to           - recipient fax number (any common Japanese format is accepted)
 */
export async function POST(req: NextRequest) {
  const guard = await requireRole('clerk', 'admin');
  if ('response' in guard) return guard.response;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 });
  }

  const pdf = form.get('pdf');
  const scheduleIdRaw = String(form.get('scheduleId') ?? '');
  const toRaw = String(form.get('to') ?? '').trim();

  const scheduleId = Number(scheduleIdRaw);
  if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
    return NextResponse.json({ error: 'scheduleId is required' }, { status: 400 });
  }
  if (!toRaw) return NextResponse.json({ error: 'to is required' }, { status: 400 });
  if (!(pdf instanceof File)) {
    return NextResponse.json({ error: 'pdf file is required' }, { status: 400 });
  }

  const to = toE164Jp(toRaw);
  const buffer = Buffer.from(await pdf.arrayBuffer());
  const fileName = pdf.name || `schedule-${scheduleId}.pdf`;

  try {
    const mediaName = await uploadFaxMedia(buffer, fileName);
    const result = await sendFax({ to, mediaName });
    const updated = await updateScheduleStatus(scheduleId, 'pending');
    if (updated) emitScheduleEvent({ type: 'status', id: updated.id, status: updated.status });
    return NextResponse.json({
      ok: true,
      faxId: result.faxId,
      status: result.status,
      schedule: updated,
    });
  } catch (err) {
    const detail =
      (err as { response?: { data?: unknown }; message?: string })?.response?.data ??
      (err instanceof Error ? err.message : 'Unknown error');
    console.error('Fax send failed:', detail);
    return NextResponse.json(
      { error: 'Fax send failed', detail },
      { status: 500 },
    );
  }
}
