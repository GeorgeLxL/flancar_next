'use client';

import { useEffect, useRef } from 'react';

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Swallow the first outside left-click in the capture phase so it only
    // dismisses the menu without also firing the underlying onClick (which
    // would, e.g., open the edit/create modal).
    const onOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        e.stopPropagation();
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // Defer attachment so the click that opened the menu doesn't immediately
    // close it.
    const t = setTimeout(() => {
      document.addEventListener('mousedown', onOutside, true);
      document.addEventListener('click', onOutside, true);
    }, 0);
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onOutside, true);
      document.removeEventListener('click', onOutside, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Keep within viewport
  const w = 160;
  const h = items.length * 36 + 8;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const left = Math.min(x, vw - w - 8);
  const top = Math.min(y, vh - h - 8);

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', left, top, zIndex: 10000 }}
      className="min-w-[160px] overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-2xl"
      onContextMenu={e => e.preventDefault()}
    >
      {items.map((item, i) => (
        <button
          key={i}
          type="button"
          disabled={item.disabled}
          onClick={() => {
            if (item.disabled) return;
            item.onClick();
            onClose();
          }}
          className="block w-full px-4 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
