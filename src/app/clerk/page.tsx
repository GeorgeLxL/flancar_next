'use client';

import { useEffect, useState } from 'react';
import Swal from 'sweetalert2';
import toast from 'react-hot-toast';
import { getSchedule, updateScheduleStatus } from '@/lib/api';
import Calendar, { type CalendarEvent } from '@/components/Calendar';
import PDFPreview, { type Schedule as PreviewSchedule } from '@/components/PDFPreview';
import ScheduleSearch from '@/components/ScheduleSearch';
import RequireRole from '@/components/RequireRole';

type ScheduleStatus = 'draft' | 'pending' | 'sent' | 'finished';

type PreviewScheduleWithMeta = PreviewSchedule & {
  id: number;
  status: ScheduleStatus;
};

export default function ClerkPage() {
  return (
    <RequireRole roles={['clerk', 'admin']}>
      <Clerk />
    </RequireRole>
  );
}

function Clerk() {
  const [selected, setSelected] = useState<PreviewScheduleWithMeta | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const es = new EventSource('/schedules/stream', { withCredentials: true });
    es.addEventListener('schedule', e => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as { type: string; id: number; status?: string };
        if (selected && data.id === selected.id) {
          getSchedule(data.id)
            .then(setSelected)
            .catch(() => {});
        }
      } catch {
        /* noop */
      }
      setRefreshKey(k => k + 1);
    });
    return () => es.close();
  }, [selected?.id]);

  const syncLocalStatus = (id: number, status: ScheduleStatus) => {
    setSelected(current => (current && current.id === id ? { ...current, status } : current));
    setRefreshKey(k => k + 1);
  };

  const handleEventClick = (event: CalendarEvent) => {
    document.body.style.overflow = 'hidden';
    getSchedule(event.id)
      .then((data: PreviewScheduleWithMeta) => setSelected(data))
      .catch(() => toast.error('スケジュールの取得に失敗しました。'));
  };

  const handleSearchSelect = (id: number) => {
    document.body.style.overflow = 'hidden';
    getSchedule(id)
      .then((data: PreviewScheduleWithMeta) => setSelected(data))
      .catch(() => toast.error('スケジュールの取得に失敗しました。'));
  };

  const closeSelected = () => {
    document.body.style.overflow = '';
    setSelected(null);
  };

  const handleSendPdf = async () => {
    if (!selected) return;
    try {
      const updated = await updateScheduleStatus(selected.id, 'pending');
      syncLocalStatus(selected.id, updated.status);
      toast.success('PDFを送信しました。');
      closeSelected();
    } catch {
      toast.error('PDF送信に失敗しました。');
    }
  };

  const handleFinishSchedule = async (id: number) => {
    const result = await Swal.fire({
      title: 'このスケジュールを完了にしますか？',
      text: '完了にすると送信ボタンは表示されなくなります。',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: '完了にする',
      cancelButtonText: 'キャンセル',
      confirmButtonColor: '#059669',
      cancelButtonColor: '#64748b',
      reverseButtons: true,
    });
    if (!result.isConfirmed) return;
    try {
      const updated = await updateScheduleStatus(id, 'finished');
      syncLocalStatus(id, updated.status);
      toast.success('スケジュールを完了にしました。');
    } catch {
      toast.error('完了処理に失敗しました。');
    }
  };

  return (
    <div className="min-h-screen bg-white px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              {searchOpen ? 'スケジュール検索' : 'スケジュール一覧'}
            </h1>
            <p className="mt-0.5 text-sm text-gray-400">
              {searchOpen
                ? 'キーワードからスケジュールを検索して開けます'
                : 'スケジュールをクリックしてPDFを確認・送信'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setSearchOpen(open => !open)}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            {searchOpen ? (
              <>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                閉じる
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                </svg>
                検索
              </>
            )}
          </button>
        </div>

        {searchOpen ? (
          <ScheduleSearch onSelect={handleSearchSelect} />
        ) : (
          <Calendar refreshKey={refreshKey} onEventClick={handleEventClick} />
        )}
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/40 p-6"
          onClick={closeSelected}
        >
          <div
            className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 p-4">
              <div className="flex gap-2">
                {selected.status === 'pending' && (
                  <button
                    type="button"
                    onClick={() => handleFinishSchedule(selected.id)}
                    className="rounded-xl bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
                  >
                    完了にする
                  </button>
                )}
              </div>
            </div>
            <PDFPreview schedule={selected} status={selected.status} onSendPdf={handleSendPdf} />
          </div>
        </div>
      )}
    </div>
  );
}
