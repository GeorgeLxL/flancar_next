import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { netfaxConfigured, sendFax } from '@/lib/netfax';
import { getSchedule, updateScheduleStatus } from '@/lib/schedules';
import { emitScheduleEvent } from '@/lib/sse';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /netfax/send
 *
 * Multipart form:
 *   pdf         - the PDF blob to fax (application/pdf)
 *   scheduleId  - which schedule this is for (used for status + fax number)
 *   fax         - optional override; defaults to the customer's fax number
 *
 * Sends the PDF via NetFax and, on success, marks the schedule as 送信済み (sent).
 */
export async function POST(req: NextRequest) {
  const guard = await requireRole('clerk', 'admin');
  if ('response' in guard) return guard.response;

  if (!netfaxConfigured()) {
    return NextResponse.json({ ok: false, error: 'FAX連携が未設定です' });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 });
  }

  const pdf = form.get('pdf');
  const scheduleId = Number(String(form.get('scheduleId') ?? ''));
  const faxOverride = String(form.get('fax') ?? '').trim();
  if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
    return NextResponse.json({ error: 'scheduleId is required' }, { status: 400 });
  }
  if (!(pdf instanceof File)) {
    return NextResponse.json({ error: 'pdf file is required' }, { status: 400 });
  }

  const schedule = await getSchedule(scheduleId);
  if (!schedule) return NextResponse.json({ error: 'schedule not found' }, { status: 404 });

  const faxNumber = faxOverride || schedule.customerFaxNumber || '';
  if (!faxNumber) {
    return NextResponse.json({ ok: false, error: '送信先のFAX番号がありません' });
  }

  const buffer = Buffer.from(await pdf.arrayBuffer());
  const result = await sendFax({
    pdfBase64: buffer.toString('base64'),
    faxNumber,
    reqId: `nf-${scheduleId}-${Date.now()}`,
    sendto: schedule.customerName || undefined,
  });

  if (result.ok) {
    await updateScheduleStatus(scheduleId, 'sent');
    emitScheduleEvent({ type: 'status', id: scheduleId, status: 'sent' });
  }

  return NextResponse.json(result);
}
