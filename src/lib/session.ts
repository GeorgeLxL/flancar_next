import crypto from 'node:crypto';
import { cookies } from 'next/headers';

export interface SessionUser {
  staffId: string;
  staffName: string;
  email: string;
  roleId: string;
  accessToken: string;
}

const COOKIE_NAME = 'flancar_session';
const MAX_AGE = 60 * 60 * 24; // 1 day

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET is not set');
  return s;
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

function encode(user: SessionUser): string {
  const payload = Buffer.from(JSON.stringify(user), 'utf8').toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function decode(value: string | undefined): SessionUser | null {
  if (!value) return null;
  const [payload, sig] = value.split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (
    expected.length !== sig.length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
  ) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionUser;
  } catch {
    return null;
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  return decode(store.get(COOKIE_NAME)?.value);
}

export async function setSessionUser(user: SessionUser): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, encode(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export function roleOf(user: SessionUser | null): 'worker' | 'clerk' | 'admin' | '' {
  if (!user) return '';
  if (user.roleId === '3') return 'worker';
  if (user.roleId === '2') return 'clerk';
  if (user.roleId === '1') return 'admin';
  return '';
}
