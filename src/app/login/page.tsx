'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { login } from '@/lib/api';
import { useAuth } from '@/components/AuthContext';

export default function LoginPage() {
  const { setUser, user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get('error');
    if (error) {
      if (error === 'user_not_found') toast.error('ユーザーが見つかりません');
      else if (error === 'auth_failed') toast.error('認証に失敗しました');
      else if (error === 'no_email') toast.error('メールアドレスが指定されていません');
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    try {
      const stored = JSON.parse(localStorage.getItem('user') || 'null');
      if (stored) setUser(stored);
    } catch {
      setUser(null);
    }
  }, [setUser]);

  useEffect(() => {
    if (authLoading) return;
    if (user) router.replace('/');
  }, [authLoading, user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      const { url } = await login(email.trim());
      window.location.href = url;
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'ログインに失敗しました';
      toast.error(message);
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div className="w-full max-w-sm space-y-8 rounded-2xl border border-gray-200 p-12 text-center shadow-sm">
        <div className="space-y-2">
          <div className="mb-4 text-4xl">FlanCar</div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">FlanCar</h1>
          <p className="text-sm text-gray-400">メールアドレスを入力してログインしてください</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="メールアドレス"
            required
            className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:border-gray-900 focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-gray-900 px-8 py-3 font-medium text-white transition-all duration-200 hover:bg-gray-700 disabled:opacity-50"
          >
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>
      </div>
    </div>
  );
}
