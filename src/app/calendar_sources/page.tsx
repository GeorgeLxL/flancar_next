'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { addCalendarSource, deleteCalendarSource, getCalendarSources } from '@/lib/api';
import RequireRole from '@/components/RequireRole';

type CalendarSource = {
  id: number;
  calendarId: string;
  label: string;
  createdAt: string;
};

export default function CalendarSourcesPage() {
  return (
    <RequireRole roles={['admin']}>
      <CalendarSources />
    </RequireRole>
  );
}

function CalendarSources() {
  const [sources, setSources] = useState<CalendarSource[]>([]);
  const [calendarId, setCalendarId] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = () => {
    getCalendarSources()
      .then(setSources)
      .catch(() => toast.error('カレンダー一覧の読み込みに失敗しました。'));
  };

  useEffect(load, []);

  const handleAdd = async () => {
    if (!calendarId.trim()) {
      toast.error('カレンダーIDを入力してください。');
      return;
    }
    setSaving(true);
    try {
      await addCalendarSource(calendarId.trim(), label.trim());
      toast.success('カレンダーを追加しました。');
      setCalendarId('');
      setLabel('');
      load();
    } catch {
      toast.error('カレンダーの追加に失敗しました。');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await deleteCalendarSource(id);
      toast.success('カレンダーを削除しました。');
      setSources(current => current.filter(s => s.id !== id));
    } catch {
      toast.error('カレンダーの削除に失敗しました。');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-white px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Googleカレンダー連携設定</h1>
          <p className="mt-1 text-sm text-gray-400">
            取り込み対象のGoogleカレンダーを登録します。各カレンダーは
            <span className="font-medium text-gray-500"> flancar-neo@flancar-neo.iam.gserviceaccount.com </span>
            に「予定の変更」権限で共有してください。
          </p>
          <p className="mt-1 text-xs text-gray-400">
            カレンダーID：Googleカレンダー →「設定と共有」→「カレンダーの統合」→「カレンダーID」で確認できます（例：
            <code className="rounded bg-gray-100 px-1">name@gmail.com</code> または
            <code className="rounded bg-gray-100 px-1">xxxxx@group.calendar.google.com</code>）。
          </p>
        </div>

        {/* Add form */}
        <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-[1.6fr_1fr_auto] sm:items-end">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">カレンダーID</span>
              <input
                value={calendarId}
                onChange={e => setCalendarId(e.target.value)}
                placeholder="example@gmail.com"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-200"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">担当者名（表示名）</span>
              <input
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="後川"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-200"
              />
            </label>
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {saving ? '追加中...' : '追加'}
            </button>
          </div>
        </div>

        {/* List */}
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="grid grid-cols-[1.6fr_1fr_90px] gap-4 border-b border-gray-100 bg-gray-50 px-5 py-3 text-xs font-medium uppercase tracking-wider text-gray-400">
            <div>カレンダーID</div>
            <div>担当者名</div>
            <div>操作</div>
          </div>
          {sources.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">
              登録されたカレンダーはありません。
            </div>
          ) : (
            sources.map(source => (
              <div
                key={source.id}
                className="grid grid-cols-[1.6fr_1fr_90px] items-center gap-4 border-b border-gray-50 px-5 py-4 last:border-b-0"
              >
                <div className="min-w-0 truncate text-sm text-gray-900">{source.calendarId}</div>
                <div className="truncate text-sm text-gray-600">{source.label || '—'}</div>
                <div>
                  <button
                    type="button"
                    onClick={() => handleDelete(source.id)}
                    disabled={deletingId === source.id}
                    className="rounded-xl border border-red-200 px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                  >
                    {deletingId === source.id ? '削除中...' : '削除'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
