'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { getStaffColors, getStaffs, setStaffColor } from '@/lib/api';
import RequireRole from '@/components/RequireRole';

type Staff = {
  staffId: string;
  staffName: string;
};

export default function StaffColorsPage() {
  return (
    <RequireRole roles={['admin']}>
      <StaffColors />
    </RequireRole>
  );
}

function StaffColors() {
  const [staffs, setStaffs] = useState<Staff[]>([]);
  const [colors, setColors] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getStaffs(), getStaffColors()])
      .then(([staffData, colorData]) => {
        setStaffs(staffData);
        setColors(colorData);
      })
      .catch(() => {
        toast.error('色設定の読み込みに失敗しました。');
      });
  }, []);

  const handleColorChange = (staffId: string, color: string) => {
    setColors(current => ({ ...current, [staffId]: color }));
  };

  const handleSave = async (staffId: string) => {
    const color = colors[staffId] ?? '#6b7280';
    setSavingId(staffId);
    try {
      await setStaffColor(staffId, color);
      toast.success('色設定を保存しました。');
    } catch {
      toast.error('色設定の保存に失敗しました。');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-white px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">スタッフ色設定</h1>
          <p className="mt-1 text-sm text-gray-400">管理者がスタッフごとのカレンダー色を設定します。</p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="grid grid-cols-[1.4fr_120px_120px] gap-4 border-b border-gray-100 bg-gray-50 px-5 py-3 text-xs font-medium uppercase tracking-wider text-gray-400">
            <div>Staff</div>
            <div>Color</div>
            <div>Action</div>
          </div>
          {staffs.map(staff => (
            <div
              key={staff.staffId}
              className="grid grid-cols-[1.4fr_120px_120px] items-center gap-4 border-b border-gray-50 px-5 py-4 last:border-b-0"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-gray-900">{staff.staffName}</div>
                <div className="mt-1 text-xs text-gray-400">{staff.staffId}</div>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={colors[staff.staffId] ?? '#6b7280'}
                  onChange={e => handleColorChange(staff.staffId, e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded-lg border border-gray-200 bg-white p-1"
                />
                <span className="text-xs text-gray-500">{colors[staff.staffId] ?? '#6b7280'}</span>
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => handleSave(staff.staffId)}
                  disabled={savingId === staff.staffId}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
                >
                  {savingId === staff.staffId ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
