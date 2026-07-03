/**
 * NetFax (netreal.jp) FAX-sending API.
 *
 * Docs: https://netreal.jp/document/faxapi/
 * Endpoint: POST https://nrp-api.netreal.jp/fax/send
 *
 * Credentials come from env (never hard-code):
 *   NETFAX_LOGIN_ID   - the account ID (会員ID)
 *   NETFAX_LOGIN_PASS - the account password
 */

const NETFAX_ENDPOINT = 'https://nrp-api.netreal.jp/fax/send';

export interface FaxResult {
  ok: boolean;
  srvId?: string;
  pages?: number;
  error?: string;
}

export function netfaxConfigured(): boolean {
  return Boolean(process.env.NETFAX_LOGIN_ID && process.env.NETFAX_LOGIN_PASS);
}

export async function sendFax(opts: {
  /** PDF as base64 (no data: prefix), max 10MB. */
  pdfBase64: string;
  /** Destination fax number; non-digits are stripped. */
  faxNumber: string;
  /** Unique request id from our side (max 32 chars). */
  reqId: string;
  /** Optional recipient display name (max 30 full-width chars). */
  sendto?: string;
}): Promise<FaxResult> {
  const login_id = process.env.NETFAX_LOGIN_ID;
  const login_pass = process.env.NETFAX_LOGIN_PASS;
  if (!login_id || !login_pass) return { ok: false, error: 'NetFax is not configured' };

  const fax = opts.faxNumber.replace(/[^0-9]/g, '');
  if (!fax) return { ok: false, error: '送信先FAX番号が空です' };

  const recipient: Record<string, string> = { fax };
  if (opts.sendto) recipient.sendto = opts.sendto.slice(0, 30);

  const body = {
    login_id,
    login_pass,
    doc_data: opts.pdfBase64,
    list_data: [recipient],
    req_id: opts.reqId.slice(0, 32),
  };

  try {
    const res = await fetch(NETFAX_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      status?: number;
      srv_id?: string | number;
      doc_pg?: number;
      error_message?: string;
    };
    if (!res.ok || data.status !== 1) {
      return { ok: false, error: data.error_message ?? `HTTP ${res.status}` };
    }
    return { ok: true, srvId: data.srv_id != null ? String(data.srv_id) : undefined, pages: data.doc_pg };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
