/**
 * Google service account auth + Calendar / Drive clients.
 *
 * Required env vars (all read lazily — sync silently no-ops if unset):
 *   GOOGLE_SERVICE_ACCOUNT_JSON  - the full JSON key file as a single-line string
 *   GOOGLE_DRIVE_FOLDER_ID       - destination folder for PDF uploads
 */

import { google, type calendar_v3, type drive_v3 } from 'googleapis';
import { JWT } from 'google-auth-library';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive',
];

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

declare global {
  // eslint-disable-next-line no-var
  var __flancarGoogle:
    | {
        jwt: JWT;
        calendar: calendar_v3.Calendar;
        drive: drive_v3.Drive;
      }
    | undefined;
}

/**
 * Resolve the raw service-account JSON string from env.
 *
 * Prefers GOOGLE_SERVICE_ACCOUNT_BASE64 (the whole JSON, base64-encoded) because
 * pasting raw JSON into a host's env UI frequently corrupts the multi-line
 * private_key (stripped/altered newlines → "DECODER routines::unsupported").
 * base64 has no special characters, so it survives copy-paste intact. Falls back
 * to the plain GOOGLE_SERVICE_ACCOUNT_JSON for local/dev use.
 */
function loadRawJson(): string | null {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_BASE64;
  if (b64) {
    try {
      return Buffer.from(b64, 'base64').toString('utf8');
    } catch {
      return null;
    }
  }
  return process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? null;
}

function loadKey(): ServiceAccountKey | null {
  const raw = loadRawJson();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ServiceAccountKey;
    if (!parsed.client_email || !parsed.private_key) return null;
    // Env-stored keys often arrive with escaped "\n" instead of real newlines,
    // which makes OpenSSL reject the PEM ("error:1E08010C:DECODER
    // routines::unsupported"). Normalize so both forms work. No-op when the key
    // already contains real newlines.
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    return parsed;
  } catch {
    return null;
  }
}

export function googleConfigured(): boolean {
  return loadKey() !== null;
}

function getClients() {
  if (globalThis.__flancarGoogle) return globalThis.__flancarGoogle;
  const key = loadKey();
  if (!key) throw new Error('Google service account is not configured');

  const jwt = new JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: SCOPES,
  });
  const calendar = google.calendar({ version: 'v3', auth: jwt });
  const drive = google.drive({ version: 'v3', auth: jwt });
  globalThis.__flancarGoogle = { jwt, calendar, drive };
  return globalThis.__flancarGoogle;
}

export function getCalendarClient(): calendar_v3.Calendar {
  return getClients().calendar;
}

export function getDriveClient(): drive_v3.Drive {
  return getClients().drive;
}
