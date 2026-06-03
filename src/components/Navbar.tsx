'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuth } from './AuthContext';
import { logout } from '@/lib/api';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, refetch } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!user || pathname === '/login') return null;

  const handleSyncProducts = async () => {
    setSyncing(true);
    try {
      await axios.post(
        '/webhook/products',
        { accessToken: user.accessToken },
        { headers: { 'x-sdsch-secret': process.env.NEXT_PUBLIC_WEBHOOK_SECRET } },
      );
      toast.success('Product DB sync completed.');
    } catch {
      toast.error('Product DB sync failed.');
    } finally {
      setSyncing(false);
      setMenuOpen(false);
    }
  };

  const handleSyncCustomers = async () => {
    setSyncing(true);
    try {
      await axios.post(
        '/webhook/customers',
        { accessToken: user.accessToken },
        { headers: { 'x-sdsch-secret': process.env.NEXT_PUBLIC_WEBHOOK_SECRET } },
      );
      toast.success('Customer DB sync completed.');
    } catch {
      toast.error('Customer DB sync failed.');
    } finally {
      setSyncing(false);
      setMenuOpen(false);
    }
  };

  const handleGooglePoll = async () => {
    setSyncing(true);
    try {
      const res = await axios.post(
        '/google/poll',
        {},
        { withCredentials: true },
      );
      const { imported, skipped, calendars } = res.data ?? {};
      toast.success(
        `Googleカレンダー取込: 新規 ${imported ?? 0} 件 / スキップ ${skipped ?? 0} 件 (${calendars ?? 0} カレンダー)`,
      );
    } catch {
      toast.error('Googleカレンダー取込に失敗しました。');
    } finally {
      setSyncing(false);
      setMenuOpen(false);
    }
  };

  const handleLogout = async () => {
    await logout().catch(() => undefined);
    localStorage.removeItem('user');
    setMenuOpen(false);
    refetch();
    router.push('/login');
  };

  const roleLabel = user.roleId === '3' ? 'worker' : user.roleId === '2' ? 'clerk' : user.roleId === '1' ? 'admin' : '';
  const switchTo = pathname.includes('/worker') ? '/clerk' : '/worker';
  const switchLabel = pathname.includes('/worker') ? '店舗' : 'スケジュール';

  return (
    <nav className="relative z-40 border-b border-gray-100 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 md:px-8 md:py-4">
        <Link href="/" className="text-base font-semibold tracking-tight text-gray-900">
          FlanCar
        </Link>

        <div className="hidden min-w-0 items-center gap-3 text-sm sm:flex">
          <div className="min-w-0 text-right text-gray-500">
            <div className="truncate">{user.staffName}</div>
            <span className="mt-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
              {roleLabel}
            </span>
          </div>
          {user.roleId === '1' && (
            <>
              <Link
                href={switchTo}
                className="shrink-0 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-blue-600 transition-colors hover:bg-blue-100"
              >
                {switchLabel}
              </Link>
              <Link
                href="/staff_colors"
                className="shrink-0 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700 transition-colors hover:bg-emerald-100"
              >
                色選択
              </Link>
              <button
                type="button"
                onClick={handleSyncProducts}
                disabled={syncing}
                className="shrink-0 rounded-xl border border-gray-200 px-3 py-2 text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                {syncing ? '商品DB同期中...' : '商品db同期'}
              </button>
              <button
                type="button"
                onClick={handleSyncCustomers}
                disabled={syncing}
                className="shrink-0 rounded-xl border border-gray-200 px-3 py-2 text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                {syncing ? '会員DB同期中...' : '会員db同期'}
              </button>
              <button
                type="button"
                onClick={handleGooglePoll}
                disabled={syncing}
                className="shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50"
              >
                {syncing ? '取込中...' : 'Google取込'}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="shrink-0 rounded-xl border border-gray-200 px-3 py-2 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
          >
            Logout
          </button>
        </div>

        <div className="flex items-center gap-2 sm:hidden" ref={menuRef}>
          <span className="max-w-[120px] truncate text-sm font-medium text-gray-700">
            {user.staffName}
          </span>
          <button
            type="button"
            onClick={() => setMenuOpen(o => !o)}
            className="rounded-xl border border-gray-200 p-2 text-gray-500 transition-colors hover:bg-gray-50"
          >
            {menuOpen ? (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>

          {menuOpen && (
            <div className="absolute left-0 right-0 top-full flex flex-col border-b border-gray-100 bg-white shadow-md">
              <div className="border-b border-gray-100 px-4 py-3">
                <div className="text-sm font-medium text-gray-900">{user.staffName}</div>
                <div className="text-xs text-gray-400">{roleLabel}</div>
              </div>
              {user.roleId === '1' && (
                <>
                  <Link
                    href={switchTo}
                    onClick={() => setMenuOpen(false)}
                    className="border-b border-gray-100 px-4 py-3 text-sm text-blue-700 transition-colors hover:bg-gray-50"
                  >
                    {switchLabel}
                  </Link>
                  <Link
                    href="/staff_colors"
                    onClick={() => setMenuOpen(false)}
                    className="border-b border-gray-100 px-4 py-3 text-sm text-emerald-700 transition-colors hover:bg-gray-50"
                  >
                    Staff Colors
                  </Link>
                  <button
                    type="button"
                    onClick={handleSyncProducts}
                    disabled={syncing}
                    className="border-b border-gray-100 px-4 py-3 text-left text-sm text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
                  >
                    {syncing ? '商品DB同期中...' : '商品db同期'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSyncCustomers}
                    disabled={syncing}
                    className="border-b border-gray-100 px-4 py-3 text-left text-sm text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
                  >
                    {syncing ? '会員DB同期中...' : '会員db同期'}
                  </button>
                  <button
                    type="button"
                    onClick={handleGooglePoll}
                    disabled={syncing}
                    className="border-b border-gray-100 px-4 py-3 text-left text-sm text-amber-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                  >
                    {syncing ? '取込中...' : 'Google取込'}
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={handleLogout}
                className="px-4 py-3 text-left text-sm text-red-500 transition-colors hover:bg-gray-50"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
