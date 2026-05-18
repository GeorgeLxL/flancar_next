'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import Calendar, { type CalendarEvent } from '@/components/Calendar';
import ScheduleFormModal from '@/components/ScheduleFormModal';
import ScheduleSearch from '@/components/ScheduleSearch';
import ContextMenu, { type ContextMenuItem } from '@/components/ContextMenu';
import RequireRole from '@/components/RequireRole';
import { createSchedule, deleteSchedule, getSchedule, updateSchedule } from '@/lib/api';

type ModalState =
  | { type: 'create'; start: Date; end: Date }
  | { type: 'edit'; id: number }
  | null;

type MenuState =
  | { type: 'event'; x: number; y: number; event: CalendarEvent }
  | { type: 'slot'; x: number; y: number; date: Date; granular: boolean }
  | null;

interface Clipboard {
  op: 'copy' | 'move';
  id: number;
  durationMs: number;
  originalStart: Date;
}

export default function WorkerPage() {
  return (
    <RequireRole roles={['worker', 'admin']}>
      <Worker />
    </RequireRole>
  );
}

interface SchedulePayloadItem {
  productId: string;
  productName?: string;
  maker?: string;
  categoryId?: string;
  unitPrice: number;
  quantity: number;
}

interface ScheduleFull {
  id: number;
  title: string;
  carType: string;
  description?: string;
  startAt: string;
  endAt: string;
  customerId: string;
  staffId: string;
  staffName: string;
  customer: string;
  requester: string;
  showComiPack?: boolean;
  items: SchedulePayloadItem[];
}

function buildPayload(schedule: ScheduleFull, newStart: Date, newEnd: Date) {
  return {
    title: schedule.title,
    carType: schedule.carType,
    description: schedule.description ?? '',
    startAt: newStart.toISOString(),
    endAt: newEnd.toISOString(),
    customerId: schedule.customerId,
    customerName: '',
    staffId: schedule.staffId,
    staffName: schedule.staffName,
    customer: schedule.customer,
    requester: schedule.requester,
    showComiPack: Boolean(schedule.showComiPack),
    items: (schedule.items ?? []).map(item => ({
      productId: item.productId,
      productName: item.productName ?? '',
      maker: item.maker ?? '',
      categoryId: item.categoryId ?? '',
      unitPrice: Number(item.unitPrice) || 0,
      quantity: Number(item.quantity) || 1,
    })),
  };
}

// In month-view the right-click / drop target has no time-of-day, so we keep
// the original event's time-of-day on that date. In time-grid views the target
// is an exact slot time, so use it as-is.
function anchorTimeOnDate(target: Date, original: Date): Date {
  const d = new Date(target);
  d.setHours(original.getHours(), original.getMinutes(), 0, 0);
  return d;
}

function Worker() {
  const [modal, setModal] = useState<ModalState>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menu, setMenu] = useState<MenuState>(null);
  const [clipboard, setClipboard] = useState<Clipboard | null>(null);

  const closeMenu = () => setMenu(null);
  const bump = () => setRefreshKey(k => k + 1);

  const handleRangeSelect = (start: Date, end: Date) => setModal({ type: 'create', start, end });
  const handleEventClick = (event: CalendarEvent) => setModal({ type: 'edit', id: event.id });
  const handleSearchSelect = (id: number) => setModal({ type: 'edit', id });
  const closeModal = () => setModal(null);
  const onSaved = () => {
    setModal(null);
    bump();
  };

  const handleEventContextMenu = (event: CalendarEvent, x: number, y: number) => {
    setMenu({ type: 'event', x, y, event });
  };

  const handleSlotContextMenu = (date: Date, x: number, y: number, granular: boolean) => {
    setMenu({ type: 'slot', x, y, date, granular });
  };

  const putOnClipboard = (event: CalendarEvent, op: 'copy' | 'move') => {
    const start = new Date(event.startAt);
    const end = new Date(event.endAt);
    setClipboard({
      op,
      id: event.id,
      durationMs: Math.max(end.getTime() - start.getTime(), 15 * 60 * 1000),
      originalStart: start,
    });
    toast.success(op === 'copy' ? 'スケジュールをコピーしました。' : 'スケジュールを切り取りました。');
  };

  const doDelete = async (event: CalendarEvent) => {
    const result = await Swal.fire({
      title: 'このスケジュールを削除しますか？',
      text: '削除すると元に戻せません。',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: '削除する',
      cancelButtonText: 'キャンセル',
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#64748b',
      reverseButtons: true,
    });
    if (!result.isConfirmed) return;
    try {
      await deleteSchedule(event.id);
      toast.success('スケジュールを削除しました。');
      if (clipboard?.id === event.id) setClipboard(null);
      bump();
    } catch {
      toast.error('削除に失敗しました。');
    }
  };

  const doPaste = async (target: Date, granular: boolean) => {
    if (!clipboard) return;
    try {
      const schedule: ScheduleFull = await getSchedule(clipboard.id);
      const start = granular ? target : anchorTimeOnDate(target, clipboard.originalStart);
      const end = new Date(start.getTime() + clipboard.durationMs);
      const payload = buildPayload(schedule, start, end);

      if (clipboard.op === 'copy') {
        await createSchedule(payload);
        toast.success('スケジュールを貼り付けました。');
      } else {
        await updateSchedule(clipboard.id, payload);
        toast.success('スケジュールを移動しました。');
        // Move is one-shot: clear the clipboard so the same item can't be
        // re-moved repeatedly by accident.
        setClipboard(null);
      }
      bump();
    } catch {
      toast.error('貼り付けに失敗しました。');
    }
  };

  const doCreate = (date: Date, granular: boolean) => {
    const start = granular ? new Date(date) : new Date(date);
    if (!granular) start.setHours(9, 0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000); // default 1h
    setModal({ type: 'create', start, end });
  };

  const handleEventDrop = async (
    eventId: number,
    droppedAt: Date,
    copy: boolean,
    granular: boolean,
  ) => {
    try {
      const schedule: ScheduleFull = await getSchedule(eventId);
      const originalStart = new Date(schedule.startAt);
      const originalEnd = new Date(schedule.endAt);
      const durationMs = Math.max(
        originalEnd.getTime() - originalStart.getTime(),
        15 * 60 * 1000,
      );
      const start = granular ? droppedAt : anchorTimeOnDate(droppedAt, originalStart);
      const end = new Date(start.getTime() + durationMs);
      const payload = buildPayload(schedule, start, end);

      if (copy) {
        await createSchedule(payload);
        toast.success('スケジュールをコピーしました。');
      } else {
        await updateSchedule(eventId, payload);
        toast.success('スケジュールを移動しました。');
      }
      bump();
    } catch {
      toast.error(copy ? 'コピーに失敗しました。' : '移動に失敗しました。');
    }
  };

  const menuItems: ContextMenuItem[] = (() => {
    if (!menu) return [];
    if (menu.type === 'event') {
      return [
        { label: 'コピー', onClick: () => putOnClipboard(menu.event, 'copy') },
        { label: '移動', onClick: () => putOnClipboard(menu.event, 'move') },
        { label: '削除', onClick: () => doDelete(menu.event) },
      ];
    }
    return [
      { label: '作成', onClick: () => doCreate(menu.date, menu.granular) },
      {
        label: '貼り付け',
        disabled: !clipboard,
        onClick: () => doPaste(menu.date, menu.granular),
      },
    ];
  })();

  return (
    <div className="min-h-screen bg-white px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto flex max-w-6xl flex-col" style={{ minHeight: 'calc(100vh - 120px)' }}>
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              {searchOpen ? 'スケジュール検索' : 'スケジュール'}
            </h1>
            <p className="mt-0.5 text-sm text-gray-400">
              {searchOpen
                ? 'キーワードからスケジュールを検索して開けます'
                : 'カレンダーをドラッグして新規作成、作成中のスケジュールをクリックして編集'}
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
          <Calendar
            refreshKey={refreshKey}
            onRangeSelect={handleRangeSelect}
            onEventClick={handleEventClick}
            onEventContextMenu={handleEventContextMenu}
            onSlotContextMenu={handleSlotContextMenu}
            onEventDrop={handleEventDrop}
          />
        )}
      </div>

      {modal?.type === 'create' && (
        <ScheduleFormModal
          defaultDate={modal.start}
          defaultEndDate={modal.end}
          onClose={closeModal}
          onSaved={onSaved}
        />
      )}

      {modal?.type === 'edit' && (
        <ScheduleFormModal scheduleId={modal.id} onClose={closeModal} onSaved={onSaved} onDeleted={onSaved} />
      )}

      {menu && menuItems.length > 0 && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={closeMenu} />
      )}
    </div>
  );
}
