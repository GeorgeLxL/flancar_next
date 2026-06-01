'use client';

import { useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import Select from 'react-select';
import AsyncSelect from 'react-select/async';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import { scheduleSchema, type ScheduleFormData } from '@/schemas/schedule';
import { useAuth } from './AuthContext';
import {
  createSchedule,
  deleteSchedule,
  getSchedule,
  getStaffs,
  searchProducts,
  searchCustomers,
  updateSchedule,
} from '@/lib/api';

interface Staff {
  staffId: string;
  staffName: string;
}

interface Props {
  scheduleId?: number | null;
  defaultDate?: Date | null;
  defaultEndDate?: Date | null;
  onClose: () => void;
  onSaved: (savedId: number) => void;
  onDeleted?: () => void;
}

const inputClass =
  'w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 transition focus:outline-none focus:ring-2 focus:ring-gray-200 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed';
const labelClass = 'mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-400';

const selectStyles = {
  control: (provided: Record<string, unknown>) => ({
    ...provided,
    border: '1px solid #e5e7eb',
    borderRadius: '0.75rem',
    backgroundColor: 'white',
    padding: '0.25rem 0.5rem',
    fontSize: '0.875rem',
    boxShadow: 'none',
    '&:hover': { borderColor: '#e5e7eb' },
    '&:focus-within': { outline: 'none', boxShadow: '0 0 0 2px rgba(229,231,235,0.5)' },
  }),
  option: (provided: Record<string, unknown>, state: { isSelected: boolean; isFocused: boolean }) => ({
    ...provided,
    backgroundColor: state.isSelected ? '#f3f4f6' : state.isFocused ? '#f9fafb' : 'white',
    color: '#111827',
    fontSize: '0.875rem',
  }),
  singleValue: (provided: Record<string, unknown>) => ({ ...provided, color: '#111827' }),
  placeholder: (provided: Record<string, unknown>) => ({ ...provided, color: '#9ca3af' }),
  // Lift the dropdown above the modal so iOS Safari renders it. The menu is
  // portaled to <body> (see `menuPortalTarget` below) to escape the modal's
  // overflow-y-auto / transform stacking context.
  menuPortal: (provided: Record<string, unknown>) => ({ ...provided, zIndex: 9999 }),
};

function toDatetimeLocal(iso: string) {
  try {
    return format(new Date(iso), "yyyy-MM-dd'T'HH:mm");
  } catch {
    return iso;
  }
}

function snapTo15(value: string): string {
  try {
    const d = new Date(value);
    const snapped = Math.round(d.getMinutes() / 15) * 15;
    d.setMinutes(snapped === 60 ? 0 : snapped, 0, 0);
    if (snapped === 60) d.setHours(d.getHours() + 1);
    return format(d, "yyyy-MM-dd'T'HH:mm");
  } catch {
    return value;
  }
}

function DateTimeSelect({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const date = value ? value.slice(0, 10) : '';
  const hour = value ? value.slice(11, 13) : '09';
  const minute = value ? value.slice(14, 16) : '00';
  const update = (d: string, h: string, m: string) => onChange(`${d}T${h}:${m}`);

  return (
    <div className="flex gap-1.5">
      <input
        type="date"
        value={date}
        onChange={e => update(e.target.value, hour, minute)}
        disabled={disabled}
        className="flex-1 min-w-0 rounded-xl border border-gray-200 bg-white px-2 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-200 disabled:bg-gray-100 disabled:text-gray-500"
      />
      <select
        value={hour}
        onChange={e => update(date, e.target.value, minute)}
        disabled={disabled}
        className="w-14 rounded-xl border border-gray-200 bg-white px-1 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-200 disabled:bg-gray-100 disabled:text-gray-500"
      >
        {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map(h => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <select
        value={minute}
        onChange={e => update(date, hour, e.target.value)}
        disabled={disabled}
        className="w-14 rounded-xl border border-gray-200 bg-white px-1 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-200 disabled:bg-gray-100 disabled:text-gray-500"
      >
        {['00', '15', '30', '45'].map(m => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );
}

interface ProductOption {
  value: string;
  label: string;
  unitPrice: number;
  productName: string;
  maker: string;
  categoryId: string;
}

interface CustomerOption {
  value: string;
  label: string;
}

export default function ScheduleFormModal({
  scheduleId,
  defaultDate,
  defaultEndDate,
  onClose,
  onSaved,
  onDeleted,
}: Props) {
  const isEdit = Boolean(scheduleId);
  const { user } = useAuth();
  const [staffs, setStaffs] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(isEdit);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const defaultStart = defaultDate ? snapTo15(format(defaultDate, "yyyy-MM-dd'T'HH:mm")) : '';
  const defaultEnd = defaultEndDate ? snapTo15(format(defaultEndDate, "yyyy-MM-dd'T'HH:mm")) : defaultStart;

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ScheduleFormData>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: {
      items: [],
      startAt: defaultStart,
      endAt: defaultEnd,
      customerId: '',
      customerName: '',
      staffId: user?.staffId || '',
      staffName: user?.staffName || '',
      customer: '',
      requester: '',
    },
  });

  const watchedItems = watch('items');
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  useEffect(() => {
    getStaffs()
      .then((data: Staff[]) => {
        setStaffs(data);
        if (!isEdit && user?.staffId) {
          setValue('staffId', user.staffId);
          setValue('staffName', user.staffName || '');
        }
      })
      .catch(() => setStaffs([]));

    if (isEdit && scheduleId) {
      getSchedule(scheduleId).then((schedule: Record<string, unknown>) => {
        const keys = Object.keys(schedule) as (keyof ScheduleFormData)[];
        for (const key of keys) {
          if (key === 'startAt' || key === 'endAt') {
            setValue(key, snapTo15(toDatetimeLocal(schedule[key] as string)));
          } else {
            setValue(key, schedule[key] as never);
          }
        }
        setLoading(false);
      });
    }
  }, [scheduleId, isEdit, setValue, user?.staffId, user?.staffName]);

  const loadProductOptions = async (q: string): Promise<ProductOption[]> => {
    const data = await searchProducts(q);
    return (data as Array<{ productId: string; productName: string; unitPrice: number; maker: string; categoryId: string }>).map(p => ({
      value: p.productId,
      label: `${p.productName} (${p.unitPrice.toLocaleString()}円)`,
      unitPrice: p.unitPrice,
      productName: p.productName,
      maker: p.maker,
      categoryId: p.categoryId,
    }));
  };

  const loadCustomerOptions = async (q: string): Promise<CustomerOption[]> => {
    const data = await searchCustomers(q);
    return (data as Array<{ customerId: string; customerName: string }>).map(c => ({
      value: c.customerId,
      label: c.customerName,
    }));
  };

  const onSubmit = async (data: ScheduleFormData) => {
    const toISO = (local: string) => new Date(local).toISOString();
    const payload = {
      ...data,
      startAt: toISO(data.startAt),
      endAt: toISO(data.endAt),
      items: data.items.map(item => ({
        productId: item.productId,
        productName: item.productName,
        maker: item.maker ?? '',
        categoryId: item.categoryId ?? '',
        unitPrice: item.unitPrice,
        quantity: item.quantity,
      })),
    };
    try {
      const saved =
        isEdit && scheduleId
          ? await updateSchedule(scheduleId, payload)
          : await createSchedule(payload);
      toast.success(isEdit ? 'スケジュールを更新しました。' : 'スケジュールを作成しました。');
      const savedId = Number((saved as { id?: number } | undefined)?.id ?? scheduleId ?? 0);
      onSaved(savedId);
    } catch {
      toast.error('保存に失敗しました。');
    }
  };

  function CheckboxField({
    label,
    name,
    disabled = false,
  }: {
    label: string;
    name: keyof ScheduleFormData;
    disabled?: boolean;
  }) {
    const isChecked = watch(name) as boolean;
    return (
      <label
        className={`flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 transition ${disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-gray-100'}`}
      >
        <input type="checkbox" {...register(name)} disabled={disabled} className="hidden" />
        <span
          className={`relative flex h-5 w-9 items-center rounded-full transition-colors ${isChecked ? 'bg-gray-900' : 'bg-gray-300'} ${disabled ? 'bg-gray-400' : ''}`}
        >
          <span
            className={`absolute h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${isChecked ? 'translate-x-4.5' : 'translate-x-0.5'}`}
          />
        </span>
        <span className="text-sm font-medium text-gray-700">{label}</span>
      </label>
    );
  }

  const field = (label: string, name: keyof ScheduleFormData, type = 'text') => {
    if (type === 'checkbox') {
      return <CheckboxField label={label} name={name} />;
    }
    return (
      <div>
        <label className={labelClass}>{label}</label>
        <input type={type} {...register(name)} className={inputClass} />
        {errors[name] && <p className="mt-1 text-xs text-red-400">{errors[name]?.message as string}</p>}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            {isEdit ? 'スケジュール編集' : '新規スケジュール'}
          </h2>
          <div className="flex gap-2">
            {isEdit && onDeleted && (
              <button
                type="button"
                onClick={async () => {
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
                    await deleteSchedule(scheduleId!);
                    toast.success('スケジュールを削除しました。');
                    onDeleted();
                  } catch {
                    toast.error('削除に失敗しました。');
                  }
                }}
                className="rounded-xl border border-red-200 px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
              >
                削除
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">読み込み中...</div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {field('タイトル', 'title')}
              {field('車種', 'carType')}
            </div>

            <div>
              <label className={labelClass}>会員(取引先)</label>
              <AsyncSelect
                loadOptions={loadCustomerOptions}
                defaultOptions
                value={
                  watch('customerId')
                    ? { value: watch('customerId'), label: watch('customerName') }
                    : null
                }
                onChange={selected => {
                  setValue('customerId', selected?.value || '');
                  setValue('customerName', selected?.label || '');
                }}
                placeholder="検索してください"
                styles={selectStyles as never}
                noOptionsMessage={() => '該当なし'}
                loadingMessage={() => '検索中...'}
                menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
                menuPosition="fixed"
              />
              {errors.customerId && (
                <p className="mt-1 text-xs text-red-400">{errors.customerId.message}</p>
              )}
              <input type="hidden" {...register('customerName')} />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className={labelClass}>商品</label>
                <button
                  type="button"
                  onClick={() =>
                    append({
                      productId: '',
                      productName: '',
                      maker: '',
                      categoryId: '',
                      unitPrice: 0,
                      quantity: 1,
                    })
                  }
                  className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs text-gray-400 hover:text-gray-700 transition"
                >
                  ＋ 追加
                </button>
              </div>
              {errors.items && <p className="mb-2 text-xs text-red-400">{errors.items.message as string}</p>}
              <div className="space-y-2">
                {fields.map((fieldItem, index) => {
                  const currentItem = watchedItems?.[index];
                  const unitPrice =
                    typeof currentItem?.unitPrice === 'number' && Number.isFinite(currentItem.unitPrice)
                      ? currentItem.unitPrice
                      : 0;
                  const qty =
                    typeof currentItem?.quantity === 'number' && Number.isFinite(currentItem.quantity)
                      ? currentItem.quantity
                      : 0;

                  return (
                    <div key={fieldItem.id} className="rounded-xl bg-gray-50 p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <AsyncSelect
                          loadOptions={loadProductOptions}
                          defaultOptions
                          value={
                            currentItem?.productId
                              ? {
                                  value: currentItem.productId,
                                  label: `${currentItem.productName} (${unitPrice.toLocaleString()}円)`,
                                }
                              : null
                          }
                          onChange={selected => {
                            const opt = selected as ProductOption | null;
                            setValue(`items.${index}.productId`, opt?.value || '');
                            setValue(`items.${index}.productName`, opt?.productName || '');
                            setValue(`items.${index}.maker`, opt?.maker || '');
                            setValue(`items.${index}.categoryId`, opt?.categoryId || '');
                            setValue(`items.${index}.unitPrice`, opt?.unitPrice || 0);
                          }}
                          placeholder="商品を検索"
                          styles={selectStyles as never}
                          noOptionsMessage={() => '該当なし'}
                          loadingMessage={() => '検索中...'}
                          className="flex-1"
                          menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
                          menuPosition="fixed"
                        />
                        <input type="hidden" {...register(`items.${index}.productName`)} />
                        <input type="hidden" {...register(`items.${index}.maker`)} />
                        <input type="hidden" {...register(`items.${index}.categoryId`)} />
                        <div className="flex items-center gap-2 text-sm">
                          <input
                            type="number"
                            {...register(`items.${index}.unitPrice`, { valueAsNumber: true })}
                            className="w-20 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 disabled:bg-gray-100 disabled:text-gray-500"
                            min={0}
                          />
                          <span className="text-gray-400 text-xs">円</span>
                          <input
                            type="number"
                            {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                            className="w-16 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 disabled:bg-gray-100 disabled:text-gray-500"
                            min={1}
                          />
                          <span className="text-gray-700 font-medium w-24 text-right">
                            {(unitPrice * qty).toLocaleString()}円
                          </span>
                          <button
                            type="button"
                            onClick={() => remove(index)}
                            className="rounded-xl border border-red-200 px-2.5 py-1.5 text-xs text-red-500 hover:bg-red-50 transition"
                          >
                            削除
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <label className={labelClass}>内容</label>
              <textarea
                {...register('description')}
                rows={2}
                className="w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-200 disabled:bg-gray-100 disabled:text-gray-500"
              />
            </div>

            <div>
              <label className={labelClass}>担当者</label>
              <Select
                options={staffs.map(s => ({ value: s.staffId, label: s.staffName }))}
                value={
                  staffs.find(s => s.staffId === watch('staffId'))
                    ? {
                        value: watch('staffId'),
                        label: staffs.find(s => s.staffId === watch('staffId'))!.staffName,
                      }
                    : null
                }
                onChange={selected => {
                  setValue('staffId', selected?.value || '');
                  setValue('staffName', selected?.label || '');
                }}
                placeholder="選択してください"
                styles={selectStyles as never}
                isSearchable
                menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
                menuPosition="fixed"
              />
              {errors.staffId && (
                <p className="mt-1 text-xs text-red-400">{errors.staffId.message}</p>
              )}
              <input type="hidden" {...register('staffName')} />
            </div>

            {field('工賃コミコミパック表示', 'showComiPack', 'checkbox')}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>開始日時</label>
                <DateTimeSelect value={watch('startAt')} onChange={v => setValue('startAt', v)} />
                {errors.startAt && (
                  <p className="mt-1 text-xs text-red-400">{errors.startAt.message}</p>
                )}
              </div>
              <div>
                <label className={labelClass}>終了日時</label>
                <DateTimeSelect value={watch('endAt')} onChange={v => setValue('endAt', v)} />
                {errors.endAt && <p className="mt-1 text-xs text-red-400">{errors.endAt.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {field('お客様名', 'customer')}
              {field('ご依頼者', 'requester')}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-xl bg-gray-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-all"
              >
                {isSubmitting ? '保存中...' : '保存'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-gray-200 px-6 py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-50 transition"
              >
                キャンセル
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
