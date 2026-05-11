'use client';

import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from 'date-fns';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getSchedulesByRange, getStaffColors } from '@/lib/api';
import { useAuth } from './AuthContext';
import { useCalendar } from './CalendarContext';

export interface CalendarEvent {
  id: number;
  title: string;
  startAt: string;
  endAt: string;
  status: 'draft' | 'pending' | 'sent' | 'finished';
  staffId: string;
  customerName: string;
  requester: string;
  items: { unitPrice: number; quantity: number }[];
}

export type CalendarView = 'day' | 'week' | 'month';

const STATUS_COLOR_HEX: Record<CalendarEvent['status'], string> = {
  draft: '#9ca3af',
  pending: '#facc15',
  sent: '#3b82f6',
  finished: '#10b981',
};

const STATUS_LABEL: Record<CalendarEvent['status'], string> = {
  draft: '作成中',
  pending: '確認待ち',
  sent: '送信済み',
  finished: '完了',
};

const DAY_HEADERS = ['日', '月', '火', '水', '木', '金', '土'];
const SLOTS = Array.from({ length: 96 }, (_, i) => i);

function slotToDate(day: Date, slot: number): Date {
  const d = new Date(day);
  d.setHours(Math.floor(slot / 4), (slot % 4) * 15, 0, 0);
  return d;
}

function dateToSlot(date: Date): number {
  return date.getHours() * 4 + Math.floor(date.getMinutes() / 15);
}

interface CalendarProps {
  refreshKey?: number;
  onRangeSelect?: (start: Date, end: Date) => void;
  onEventClick?: (event: CalendarEvent) => void;
}

function rangeForView(view: CalendarView, anchor: Date): { from: Date; to: Date } {
  if (view === 'day') return { from: startOfDay(anchor), to: addDays(startOfDay(anchor), 1) };
  if (view === 'week') {
    const from = startOfWeek(anchor, { weekStartsOn: 0 });
    return { from, to: addDays(from, 7) };
  }
  return {
    from: startOfWeek(startOfMonth(anchor), { weekStartsOn: 0 }),
    to: endOfWeek(endOfMonth(anchor), { weekStartsOn: 0 }),
  };
}

function eventsForDay(events: CalendarEvent[], day: Date) {
  return events.filter(e => {
    const start = new Date(e.startAt);
    const end = new Date(e.endAt);
    return isSameDay(day, start) || isSameDay(day, end) || (day > start && day < end);
  });
}

const SLOT_HEIGHT = 14;

interface LayoutEvent {
  event: CalendarEvent;
  col: number;
  totalCols: number;
  startSlot: number;
  endSlot: number;
}

function layoutEventsForDay(events: CalendarEvent[], day: Date): LayoutEvent[] {
  const dayEvents = events
    .filter(e => {
      const start = new Date(e.startAt);
      const end = new Date(e.endAt);
      return isSameDay(day, start) || isSameDay(day, end) || (day > start && day < end);
    })
    .map(e => {
      const start = new Date(e.startAt);
      const end = new Date(e.endAt);
      return {
        event: e,
        startSlot: isSameDay(day, start) ? dateToSlot(start) : 0,
        endSlot: isSameDay(day, end) ? dateToSlot(end) : 96,
      };
    })
    .sort((a, b) => a.startSlot - b.startSlot);

  const result: LayoutEvent[] = [];

  for (const item of dayEvents) {
    let col = 0;
    while (result.some(r => r.col === col && r.startSlot < item.endSlot && r.endSlot > item.startSlot)) col++;
    result.push({ ...item, col, totalCols: 1 });
  }

  for (let i = 0; i < result.length; i++) {
    const overlapping = result.filter(r => r.startSlot < result[i].endSlot && r.endSlot > result[i].startSlot);
    const maxCol = Math.max(...overlapping.map(r => r.col));
    for (const r of overlapping) r.totalCols = maxCol + 1;
  }

  return result;
}

function TimeGrid({
  days,
  events,
  staffColors,
  onRangeSelect,
  onEventClick,
}: {
  days: Date[];
  events: CalendarEvent[];
  staffColors: Record<string, string>;
  onRangeSelect?: (start: Date, end: Date) => void;
  onEventClick?: (event: CalendarEvent) => void;
}) {
  const nowRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ di: number; start: number; end: number } | null>(null);
  const [drag, setDrag] = useState<{ di: number; start: number; end: number } | null>(null);

  useEffect(() => {
    nowRef.current?.scrollIntoView({ block: 'center' });
  }, []);

  const now = new Date();
  const nowSlot = dateToSlot(now);

  const onClick = (di: number, slot: number) => {
    if (!onRangeSelect) return;
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
    if (isMobile) {
      const hour = Math.floor(slot / 4);
      const start = new Date(days[di]);
      start.setHours(hour, 0, 0, 0);
      const end = new Date(days[di]);
      end.setHours(hour + 1, 0, 0, 0);
      onRangeSelect(start, end);
    } else {
      onRangeSelect(slotToDate(days[di], slot), slotToDate(days[di], slot + 1));
    }
  };

  const onMouseDown = (di: number, slot: number, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragRef.current = { di, start: slot, end: slot };
    setDrag({ di, start: slot, end: slot });
  };

  const onMouseEnter = (di: number, slot: number) => {
    if (!dragRef.current || dragRef.current.di !== di) return;
    dragRef.current.end = slot;
    setDrag({ ...dragRef.current });
  };

  const onMouseUp = () => {
    if (!dragRef.current) {
      setDrag(null);
      return;
    }
    const { di, start, end } = dragRef.current;
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);
    const wasDrag = lo !== hi;
    dragRef.current = null;
    setDrag(null);
    if (wasDrag && onRangeSelect) {
      onRangeSelect(slotToDate(days[di], lo), slotToDate(days[di], hi + 1));
    }
  };

  const isDragging = (di: number, slot: number) => {
    if (!drag || drag.di !== di) return false;
    const lo = Math.min(drag.start, drag.end);
    const hi = Math.max(drag.start, drag.end);
    return slot >= lo && slot <= hi;
  };

  return (
    <div
      className="flex flex-col flex-1 overflow-hidden border border-gray-200 rounded-2xl select-none"
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <div
        className="grid border-b border-gray-200 bg-white shrink-0"
        style={{ gridTemplateColumns: `48px repeat(${days.length}, 1fr)` }}
      >
        <div className="border-r border-gray-200" />
        {days.map(day => {
          const today = isToday(day);
          const dow = day.getDay();
          return (
            <div key={day.toISOString()} className="py-2 text-center border-r border-gray-200 last:border-r-0">
              <div
                className={`text-xs font-medium ${dow === 0 ? 'text-red-400' : dow === 6 ? 'text-blue-400' : 'text-gray-400'}`}
              >
                {DAY_HEADERS[dow]}
              </div>
              <div
                className={`mx-auto mt-0.5 w-7 h-7 flex items-center justify-center rounded-full text-sm font-semibold ${today ? 'bg-gray-900 text-white' : 'text-gray-700'}`}
              >
                {format(day, 'd')}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="relative grid" style={{ gridTemplateColumns: `48px repeat(${days.length}, 1fr)` }}>
          <div className="relative" style={{ gridColumn: 1, gridRow: '1 / span 96' }}>
            {SLOTS.map(slot => {
              const isHourStart = slot % 4 === 0;
              const hour = Math.floor(slot / 4);
              return (
                <div
                  key={`lbl-${slot}`}
                  className={`h-3.5 flex items-start justify-end pr-2 border-r border-gray-200 ${isHourStart ? 'border-t border-gray-300' : ''}`}
                >
                  {isHourStart && (
                    <span className="text-xs text-gray-500 -mt-2 leading-none">
                      {String(hour).padStart(2, '0')}:00
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {days.map((day, di) => {
            const layout = layoutEventsForDay(events, day);
            const isNowDay = isToday(day);

            return (
              <div
                key={day.toISOString()}
                className="relative border-r border-gray-200 last:border-r-0"
                style={{ gridColumn: di + 2 }}
              >
                {SLOTS.map(slot => {
                  const isHourStart = slot % 4 === 0;
                  const isNow = isNowDay && nowSlot === slot;
                  const dragging = isDragging(di, slot);
                  return (
                    <div
                      key={slot}
                      onMouseDown={e => onMouseDown(di, slot, e)}
                      onMouseEnter={() => onMouseEnter(di, slot)}
                      onClick={() => onClick(di, slot)}
                      className={`h-3.5 cursor-pointer relative ${
                        isHourStart ? 'border-t border-gray-300' : ''
                      } ${dragging ? 'bg-blue-100' : 'hover:bg-gray-50'}`}
                    >
                      {isNow && (
                        <div
                          ref={nowRef}
                          className="absolute left-0 right-0 border-t-2 border-red-400 z-10 pointer-events-none"
                        />
                      )}
                    </div>
                  );
                })}

                {layout.map(({ event, col, totalCols, startSlot, endSlot }) => {
                  const top = startSlot * SLOT_HEIGHT;
                  const height = Math.max((endSlot - startSlot) * SLOT_HEIGHT, SLOT_HEIGHT * 2);
                  const colW = 85 / totalCols;
                  const left = col * colW + 1;
                  const width = colW - 1;
                  const bgColor = staffColors[event.staffId] ?? STATUS_COLOR_HEX[event.status];
                  const totalPrice = event.items?.reduce((s, i) => s + i.unitPrice * i.quantity, 0) ?? 0;
                  return (
                    <div
                      key={event.id}
                      onClick={e => {
                        e.stopPropagation();
                        onEventClick?.(event);
                      }}
                      style={{ position: 'absolute', top, height, left: `${left}%`, width: `${width}%`, backgroundColor: bgColor }}
                      className="rounded px-1 py-0.5 text-xs text-white cursor-pointer z-20 overflow-hidden shadow-sm hover:opacity-90 transition-opacity"
                    >
                      <div className="font-semibold truncate leading-tight">{event.title}</div>
                      <div className="truncate opacity-90 leading-tight">
                        {format(new Date(event.startAt), 'HH:mm')}–{format(new Date(event.endAt), 'HH:mm')} {event.customerName} / {event.requester} / ¥{totalPrice.toLocaleString()} / (TAX)¥{Math.floor(totalPrice * 0.1).toLocaleString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MonthView({
  anchor,
  events,
  staffColors,
  onRangeSelect,
  onEventClick,
}: {
  anchor: Date;
  events: CalendarEvent[];
  staffColors: Record<string, string>;
  onRangeSelect?: (start: Date, end: Date) => void;
  onEventClick?: (event: CalendarEvent) => void;
}) {
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(anchor), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(anchor), { weekStartsOn: 0 }),
  });

  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startLongPress = (day: Date) => {
    longPressRef.current = setTimeout(() => {
      const s = new Date(day);
      s.setHours(9, 0, 0, 0);
      const e = new Date(day);
      e.setHours(10, 0, 0, 0);
      onRangeSelect?.(s, e);
    }, 500);
  };

  const cancelLongPress = () => {
    if (longPressRef.current) clearTimeout(longPressRef.current);
  };

  const handleClick = (day: Date, inMonth: boolean) => {
    if (!inMonth) return;
    const s = new Date(day);
    s.setHours(9, 0, 0, 0);
    const e = new Date(day);
    e.setHours(10, 0, 0, 0);
    onRangeSelect?.(s, e);
  };

  return (
    <div className="flex-1 border border-gray-100 rounded-2xl overflow-hidden flex flex-col">
      <div className="grid grid-cols-7 border-b border-gray-100 shrink-0">
        {DAY_HEADERS.map((d, i) => (
          <div
            key={d}
            className={`py-2 text-center text-xs font-medium uppercase tracking-wider ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-400'}`}
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 flex-1 overflow-y-auto" style={{ gridAutoRows: 'minmax(90px, 1fr)' }}>
        {days.map(day => {
          const dayEvents = eventsForDay(events, day);
          const inMonth = isSameMonth(day, anchor);
          const today = isToday(day);
          const dow = day.getDay();
          return (
            <div
              key={day.toISOString()}
              onClick={() => handleClick(day, inMonth)}
              onMouseDown={() => inMonth && startLongPress(day)}
              onMouseUp={cancelLongPress}
              onMouseLeave={cancelLongPress}
              onTouchStart={() => inMonth && startLongPress(day)}
              onTouchEnd={cancelLongPress}
              onTouchMove={cancelLongPress}
              className={`border-b border-r border-gray-100 p-1.5 transition-colors ${inMonth ? 'bg-white hover:bg-gray-50 cursor-pointer' : 'bg-gray-50/50 cursor-default'}`}
            >
              <div className="flex justify-end mb-1">
                <span
                  className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${today ? 'bg-gray-900 text-white' : !inMonth ? 'text-gray-300' : dow === 0 ? 'text-red-400' : dow === 6 ? 'text-blue-400' : 'text-gray-600'}`}
                >
                  {format(day, 'd')}
                </span>
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map(event => {
                  const totalPrice = event.items?.reduce((s, i) => s + i.unitPrice * i.quantity, 0) ?? 0;
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        onEventClick?.(event);
                      }}
                      style={{ backgroundColor: staffColors[event.staffId] ?? STATUS_COLOR_HEX[event.status] }}
                      className="w-full text-left rounded px-1.5 py-0.5 text-xs text-white hover:opacity-80 transition-opacity"
                    >
                      <div className="font-semibold truncate">{event.title}</div>
                      <div className="truncate opacity-90">
                        {format(new Date(event.startAt), 'HH:mm')}–{format(new Date(event.endAt), 'HH:mm')} {event.customerName} / {event.requester} / ¥{totalPrice.toLocaleString()} / (TAX)¥{Math.floor(totalPrice * 0.1).toLocaleString()}
                      </div>
                    </button>
                  );
                })}
                {dayEvents.length > 3 && (
                  <div className="text-xs text-gray-400 px-1">+{dayEvents.length - 3} 件</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Calendar({ refreshKey, onRangeSelect, onEventClick }: CalendarProps) {
  const pathname = usePathname();
  const { anchor, setAnchor, view, setView } = useCalendar();
  const { user } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [staffColors, setStaffColors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [liveTick, setLiveTick] = useState(0);

  const switchTo = pathname.includes('/worker') ? '/clerk' : '/worker';
  const switchLabel = pathname.includes('/worker') ? '店舗' : 'スケジュール';

  useEffect(() => {
    getStaffColors().then(setStaffColors).catch(() => {});
  }, [refreshKey]);

  useEffect(() => {
    const { from, to } = rangeForView(view, anchor);
    setLoading(true);
    getSchedulesByRange(from, to)
      .then(setEvents)
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [view, anchor, refreshKey, liveTick]);

  useEffect(() => {
    const es = new EventSource('/schedules/stream', { withCredentials: true });
    es.addEventListener('schedule', () => {
      setLiveTick(t => t + 1);
    });
    es.onerror = () => {
      // EventSource auto-reconnects; nothing to do
    };
    return () => es.close();
  }, []);

  const navigate = (dir: 1 | -1) => {
    if (view === 'day') setAnchor(dir === 1 ? addDays(anchor, 1) : subDays(anchor, 1));
    else if (view === 'week') setAnchor(dir === 1 ? addWeeks(anchor, 1) : subWeeks(anchor, 1));
    else setAnchor(dir === 1 ? addMonths(anchor, 1) : subMonths(anchor, 1));
  };

  const headerLabel = () => {
    if (view === 'day') return format(anchor, 'yyyy年 M月 d日');
    if (view === 'week') {
      const from = startOfWeek(anchor, { weekStartsOn: 0 });
      const to = endOfWeek(anchor, { weekStartsOn: 0 });
      return `${format(from, 'yyyy年 M月 d日')} – ${format(to, 'M月 d日')}`;
    }
    return format(anchor, 'yyyy年 M月');
  };

  const prevLabel = view === 'day' ? '‹ 前日' : view === 'week' ? '‹ 前週' : '‹ 前月';
  const nextLabel = view === 'day' ? '翌日 ›' : view === 'week' ? '翌週 ›' : '翌月 ›';

  const weekDays = eachDayOfInterval({
    start: startOfWeek(anchor, { weekStartsOn: 0 }),
    end: endOfWeek(anchor, { weekStartsOn: 0 }),
  });

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
          >
            {prevLabel}
          </button>
          <button
            type="button"
            onClick={() => setAnchor(new Date())}
            className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
          >
            今日
          </button>
          <button
            type="button"
            onClick={() => navigate(1)}
            className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
          >
            {nextLabel}
          </button>
          <h2 className="text-sm font-semibold text-gray-900">{headerLabel()}</h2>
          {loading && <span className="text-xs text-gray-300">読み込み中...</span>}
        </div>
        <div className="flex rounded-xl border border-gray-200 overflow-hidden text-sm">
          {(['day', 'week', 'month'] as CalendarView[]).map(v => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`px-3 py-1.5 transition-colors ${view === v ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              {v === 'day' ? '日' : v === 'week' ? '週' : '月'}
            </button>
          ))}
        </div>
      </div>

      {user && user.roleId === '1' && (
        <Link
          href={switchTo}
          className="max-w-32 text-center rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-blue-600 transition-colors hover:bg-blue-100"
        >
          {switchLabel}
        </Link>
      )}

      <div className="flex gap-4 flex-wrap text-xs text-gray-400">
        {(Object.keys(STATUS_LABEL) as CalendarEvent['status'][]).map(s => (
          <div key={s} className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_COLOR_HEX[s] }} />
            {STATUS_LABEL[s]}
          </div>
        ))}
        <span className="text-gray-300">※ 担当者の色が設定されている場合はその色で表示</span>
      </div>

      {view === 'month' && (
        <MonthView anchor={anchor} events={events} staffColors={staffColors} onRangeSelect={onRangeSelect} onEventClick={onEventClick} />
      )}
      {view === 'week' && (
        <TimeGrid days={weekDays} events={events} staffColors={staffColors} onRangeSelect={onRangeSelect} onEventClick={onEventClick} />
      )}
      {view === 'day' && (
        <TimeGrid days={[anchor]} events={events} staffColors={staffColors} onRangeSelect={onRangeSelect} onEventClick={onEventClick} />
      )}
    </div>
  );
}
