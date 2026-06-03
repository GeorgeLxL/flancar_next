'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  Calendar as RSCalendar,
  type CalendarEvent as RSCalendarEvent,
  type CalendarView as RSView,
  type EventDropInfo,
  type RangeSelectInfo,
} from 'react-scheduled-calendar';
import 'react-scheduled-calendar/styles.css';
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

interface FlancarMeta {
  status: CalendarEvent['status'];
  customerName: string;
  requester: string;
  items: { unitPrice: number; quantity: number }[];
}

interface CalendarProps {
  refreshKey?: number;
  onRangeSelect?: (start: Date, end: Date) => void;
  onEventClick?: (event: CalendarEvent) => void;
  onEventContextMenu?: (event: CalendarEvent, clientX: number, clientY: number) => void;
  onSlotContextMenu?: (date: Date, clientX: number, clientY: number, granular: boolean) => void;
  onEventDrop?: (eventId: number, droppedAt: Date, copy: boolean, granular: boolean) => void;
}

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

// Picks the visible color for an event: explicit staff color wins, status palette is the fallback.
function resolveColor(staffId: string, status: CalendarEvent['status'], staffColors: Record<string, string>): string {
  return staffColors[staffId] ?? STATUS_COLOR_HEX[status];
}

// Re-shape what the API returns into the package's generic CalendarEvent shape,
// stashing all FlanCar-specific fields on `meta` so `renderEvent` can use them.
function toRsEvent(e: CalendarEvent, staffColors: Record<string, string>): RSCalendarEvent<FlancarMeta> {
  return {
    id: e.id,
    title: e.title,
    start: e.startAt,
    end: e.endAt,
    color: resolveColor(e.staffId, e.status, staffColors),
    category: e.staffId,
    meta: {
      status: e.status,
      customerName: e.customerName,
      requester: e.requester,
      items: e.items,
    },
  };
}

// Reverse of toRsEvent — needed when callbacks come back from the package
// carrying its RS event shape and we want to give the host page the FlanCar shape.
function fromRsEvent(e: RSCalendarEvent<FlancarMeta>): CalendarEvent {
  return {
    id: Number(e.id),
    title: e.title,
    startAt: typeof e.start === 'string' ? e.start : e.start.toISOString(),
    endAt: typeof e.end === 'string' ? e.end : e.end.toISOString(),
    status: e.meta?.status ?? 'draft',
    staffId: e.category ?? '',
    customerName: e.meta?.customerName ?? '',
    requester: e.meta?.requester ?? '',
    items: e.meta?.items ?? [],
  };
}

export default function Calendar({
  refreshKey,
  onRangeSelect,
  onEventClick,
  onEventContextMenu,
  onSlotContextMenu,
  onEventDrop,
}: CalendarProps) {
  const pathname = usePathname();
  const { anchor, setAnchor, view, setView } = useCalendar();
  const { user } = useAuth();
  const [apiEvents, setApiEvents] = useState<CalendarEvent[]>([]);
  const [staffColors, setStaffColors] = useState<Record<string, string>>({});
  const [liveTick, setLiveTick] = useState(0);

  const switchTo = pathname.includes('/worker') ? '/clerk' : '/worker';
  const switchLabel = pathname.includes('/worker') ? '店舗' : 'スケジュール';

  useEffect(() => {
    getStaffColors().then(setStaffColors).catch(() => {});
  }, [refreshKey]);

  useEffect(() => {
    getSchedulesByRange(rangeFor(view, anchor).from, rangeFor(view, anchor).to)
      .then(setApiEvents)
      .catch(() => setApiEvents([]));
  }, [view, anchor, refreshKey, liveTick]);

  useEffect(() => {
    const es = new EventSource('/schedules/stream', { withCredentials: true });
    es.addEventListener('schedule', () => setLiveTick(t => t + 1));
    return () => es.close();
  }, []);

  const events = useMemo(
    () => apiEvents.map(e => toRsEvent(e, staffColors)),
    [apiEvents, staffColors],
  );

  return (
    <div className="flex flex-col h-full gap-3">
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

      <RSCalendar<FlancarMeta>
        events={events}
        view={view as RSView}
        onViewChange={v => setView(v)}
        anchor={anchor}
        onAnchorChange={setAnchor}
        locale="ja"
        theme="light"
        weekStartsOn={0}
        slotMinutes={15}
        renderEvent={({ event, view: v }) => <FlancarEventChip event={event} view={v} />}
        // Pure delegation — the host page owns all interaction handling.
        onRangeSelect={
          onRangeSelect
            ? (info: RangeSelectInfo) => onRangeSelect(info.start, info.end)
            : null
        }
        onEventClick={
          onEventClick ? (e: RSCalendarEvent<FlancarMeta>) => onEventClick(fromRsEvent(e)) : null
        }
        onEventContextMenu={
          onEventContextMenu
            ? (e, x, y) => onEventContextMenu(fromRsEvent(e), x, y)
            : null
        }
        onSlotContextMenu={
          onSlotContextMenu ? (d, x, y, g) => onSlotContextMenu(d, x, y, g) : null
        }
        onEventDrop={
          onEventDrop
            ? (info: EventDropInfo<FlancarMeta>) =>
                onEventDrop(Number(info.event.id), info.newStart, info.copy, info.granular)
            : null
        }
        // Disable the package's built-in popovers — Worker page opens the
        // ScheduleFormModal instead via the click/range-select callbacks above.
        disableCreatePopover
        disableEditPopover
      />
    </div>
  );
}

function FlancarEventChip({
  event,
  view,
}: {
  event: RSCalendarEvent<FlancarMeta>;
  view: 'day' | 'week' | 'month';
}) {
  const start = new Date(event.start);
  const end = new Date(event.end);
  const totalPrice = event.meta?.items?.reduce((s, i) => s + i.unitPrice * i.quantity, 0) ?? 0;
  const tax = Math.floor(totalPrice * 0.1);
  return (
    <>
      <div className="font-semibold truncate leading-tight">{event.title}</div>
      <div className="truncate opacity-90 leading-tight">
        {format(start, 'HH:mm')}–{format(end, 'HH:mm')} {event.meta?.customerName} / {event.meta?.requester} / ¥{totalPrice.toLocaleString()} / (TAX)¥{tax.toLocaleString()}
        {view === 'month' ? '' : ''}
      </div>
    </>
  );
}

// Calculate the visible date range that the API should be queried for.
function rangeFor(view: 'day' | 'week' | 'month', anchor: Date): { from: Date; to: Date } {
  const d = new Date(anchor);
  if (view === 'day') {
    const from = new Date(d);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    return { from, to };
  }
  if (view === 'week') {
    const from = new Date(d);
    from.setDate(d.getDate() - d.getDay());
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 7);
    return { from, to };
  }
  // month: first day of month → last day of month, padded to whole weeks
  const firstOfMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  const lastOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const from = new Date(firstOfMonth);
  from.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());
  from.setHours(0, 0, 0, 0);
  const to = new Date(lastOfMonth);
  to.setDate(lastOfMonth.getDate() + (6 - lastOfMonth.getDay()));
  to.setHours(23, 59, 59, 999);
  return { from, to };
}
