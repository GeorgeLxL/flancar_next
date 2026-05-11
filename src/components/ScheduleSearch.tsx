'use client';

import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { getStaffColors, searchSchedules } from '@/lib/api';

interface SearchResult {
  id: number;
  title: string;
  startAt: string;
  endAt: string;
  customerName: string;
  requester: string;
  staffId: string;
  staffName: string;
  status: 'draft' | 'pending' | 'sent' | 'finished';
  items: { unitPrice: number; quantity: number }[];
}

const STATUS_LABEL: Record<SearchResult['status'], string> = {
  draft: '作成中',
  pending: '確認待ち',
  sent: '送信済み',
  finished: '完了',
};

const STATUS_COLOR_HEX: Record<SearchResult['status'], string> = {
  draft: '#9ca3af',
  pending: '#facc15',
  sent: '#3b82f6',
  finished: '#10b981',
};

interface Props {
  onSelect: (id: number) => void;
}

function getTotalPrice(items: SearchResult['items']) {
  return items?.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) ?? 0;
}

export default function ScheduleSearch({ onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [staffColors, setStaffColors] = useState<Record<string, string>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getStaffColors().then(setStaffColors).catch(() => {});
  }, []);

  const handleChange = (value: string) => {
    setQuery(value);
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!value.trim()) {
      setResults([]);
      return;
    }

    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await searchSchedules(value.trim());
        setResults(data);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  return (
    <div className="flex w-full flex-col">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={e => handleChange(e.target.value)}
          placeholder="タイトル・お客様・商品名などで検索..."
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 pr-10 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-200"
        />
        {loading ? (
          <span className="absolute right-3 top-3 text-xs text-gray-300">検索中...</span>
        ) : (
          <svg className="absolute right-3 top-3 h-4 w-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
        )}
      </div>

      <div className="mt-4 min-h-[420px] overflow-y-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
        {!query.trim() ? (
          <div className="px-6 py-16 text-center text-sm text-gray-400">
            タイトル・お客様・商品名などで検索してください
          </div>
        ) : loading ? (
          <div className="px-6 py-16 text-center text-sm text-gray-400">検索中...</div>
        ) : results.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-gray-400">該当なし</div>
        ) : (
          results.map(result => {
            const totalPrice = getTotalPrice(result.items);
            const tax = Math.floor(totalPrice * 0.1);
            const backgroundColor = staffColors[result.staffId] ?? STATUS_COLOR_HEX[result.status];

            return (
              <div key={result.id} className="border-b border-gray-50 px-4 py-3 last:border-0">
                <button
                  type="button"
                  onClick={() => onSelect(result.id)}
                  style={{ backgroundColor }}
                  className="w-full rounded-xl px-4 py-3 text-left text-white shadow-sm transition-opacity hover:opacity-90"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="truncate text-sm font-semibold">{result.title || '(無題)'}</div>
                    <div className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[11px]">
                      {STATUS_LABEL[result.status]}
                    </div>
                  </div>
                  <div className="mt-1 truncate text-xs opacity-90">
                    {format(new Date(result.startAt), 'HH:mm')}-{format(new Date(result.endAt), 'HH:mm')} {result.customerName} / {result.requester || result.staffName} / ¥{totalPrice.toLocaleString()} / (TAX)¥{tax.toLocaleString()}
                  </div>
                  <div className="mt-1 text-[11px] text-white/80">
                    {format(new Date(result.startAt), 'yyyy/MM/dd HH:mm')} - {format(new Date(result.endAt), 'HH:mm')}
                  </div>
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
