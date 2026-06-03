/**
 * Thin Telnyx Programmable Fax client.
 *
 * Two-step send:
 *   1. POST /v2/media — upload the PDF, Telnyx returns a `media_name`.
 *   2. POST /v2/faxes — send the fax referencing that media_name.
 *
 * Env vars required:
 *   TELNYX_API_KEY        — the API v2 key from the Telnyx portal
 *   TELNYX_FROM_NUMBER    — the purchased Telnyx phone number (E.164, e.g. +815012345678)
 *   TELNYX_CONNECTION_ID  — the Fax Application ID the FROM number is bound to
 */

import axios from 'axios';

const BASE = 'https://api.telnyx.com/v2';

function authHeader(): Record<string, string> {
  const key = process.env.TELNYX_API_KEY;
  if (!key) throw new Error('TELNYX_API_KEY is not set');
  return { Authorization: `Bearer ${key}` };
}

/**
 * Upload a PDF buffer to Telnyx media storage. Returns the media_name to use
 * when sending. Media auto-expires per Telnyx defaults.
 */
export async function uploadFaxMedia(pdf: Buffer, fileName: string): Promise<string> {
  const form = new FormData();
  const blob = new Blob([new Uint8Array(pdf)], { type: 'application/pdf' });
  form.append('media_url', '');
  form.append('media_name', fileName.replace(/[^a-zA-Z0-9._-]/g, '_'));
  form.append('file', blob, fileName);

  const res = await axios.post(`${BASE}/media`, form, { headers: authHeader() });
  const name = res.data?.data?.media_name as string | undefined;
  if (!name) throw new Error('Telnyx media upload did not return a media_name');
  return name;
}

export interface SendFaxParams {
  to: string;
  mediaName: string;
  quality?: 'normal' | 'high' | 'very_high';
}

export interface SendFaxResult {
  faxId: string;
  status: string;
}

export async function sendFax({ to, mediaName, quality = 'high' }: SendFaxParams): Promise<SendFaxResult> {
  const from = process.env.TELNYX_FROM_NUMBER;
  const connectionId = process.env.TELNYX_CONNECTION_ID;
  if (!from) throw new Error('TELNYX_FROM_NUMBER is not set');
  if (!connectionId) throw new Error('TELNYX_CONNECTION_ID is not set');

  const res = await axios.post(
    `${BASE}/faxes`,
    {
      connection_id: connectionId,
      from,
      to,
      media_name: mediaName,
      quality,
      store_media: false,
    },
    { headers: { ...authHeader(), 'Content-Type': 'application/json' } },
  );
  const data = res.data?.data;
  if (!data?.id) throw new Error('Telnyx fax create did not return an id');
  return { faxId: data.id, status: data.status ?? 'queued' };
}

/**
 * Lightweight client-supplied number normalization. Accepts common Japanese
 * formats (03-1234-5678, 0312345678, +81 3 1234 5678) and returns E.164.
 * Telnyx requires E.164.
 */
export function toE164Jp(input: string): string {
  const digits = input.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('0')) return `+81${digits.slice(1)}`;
  if (digits.startsWith('81')) return `+${digits}`;
  return digits.startsWith('+') ? digits : `+${digits}`;
}
