'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthContext';

export default function Home() {
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
        }
      } catch {
        console.warn('Invalid user data in URL');
      }
    }
  }, [setUser]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.roleId === '3') router.replace('/worker');
    else if (user.roleId === '2') router.replace('/clerk');
    else if (user.roleId === '1') router.replace('/worker');
    else router.replace('/login');
  }, [loading, user, router]);

  return <div className="p-6 text-center">読み込み中...</div>;
}
