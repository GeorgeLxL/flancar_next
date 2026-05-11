'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthContext';

type Role = 'worker' | 'clerk' | 'admin';

function roleOf(roleId: string | undefined): Role | '' {
  if (roleId === '3') return 'worker';
  if (roleId === '2') return 'clerk';
  if (roleId === '1') return 'admin';
  return '';
}

export default function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, setUser, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const userParam = urlParams.get('user');
    if (userParam) {
      try {
        const parsedUser = JSON.parse(userParam);
        if (parsedUser && parsedUser.staffName && parsedUser.roleId) {
          localStorage.setItem('user', JSON.stringify(parsedUser));
          setUser(parsedUser);
          window.history.replaceState({}, document.title, window.location.pathname);
          router.replace('/');
          return;
        }
      } catch {
        console.warn('Invalid user data in URL, skipping storage');
      }
    }

    try {
      const stored = JSON.parse(localStorage.getItem('user') || 'null');
      if (stored) setUser(stored);
    } catch {
      setUser(null);
    }
  }, [setUser, router]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    const role = roleOf(user.roleId);
    if (!role || !roles.includes(role)) {
      router.replace('/login');
    }
  }, [loading, user, roles, router]);

  if (loading || !user) {
    return <div className="p-6 text-center">読み込み中...</div>;
  }
  const role = roleOf(user.roleId);
  if (!role || !roles.includes(role)) return null;

  return <>{children}</>;
}
