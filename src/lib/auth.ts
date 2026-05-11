import { NextResponse } from 'next/server';
import { getSessionUser, roleOf, type SessionUser } from './session';

export async function requireAuth(): Promise<{ user: SessionUser } | { response: NextResponse }> {
  const user = await getSessionUser();
  if (!user) {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { user };
}

export async function requireRole(
  ...roles: Array<'worker' | 'clerk' | 'admin'>
): Promise<{ user: SessionUser } | { response: NextResponse }> {
  const user = await getSessionUser();
  if (!user) {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const role = roleOf(user);
  if (!roles.includes(role as 'worker' | 'clerk' | 'admin')) {
    return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { user };
}
