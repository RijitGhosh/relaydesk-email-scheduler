'use client';
import { useEffect, useRef } from 'react';
import { Button } from './button';

interface ConfirmProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** Accessible confirm dialog: role=dialog, aria-modal, Esc to close, focus moves in and is restored on close. */
export function ConfirmDialog({ open, title, description, confirmLabel = 'Confirm', loading, onConfirm, onClose }: ConfirmProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const focusables = document.querySelectorAll<HTMLElement>('[data-dialog] button:not(:disabled)');
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div data-dialog role="dialog" aria-modal="true" aria-labelledby="dlg-title" aria-describedby="dlg-desc" className="card relative w-full max-w-md p-6">
        <h2 id="dlg-title" className="text-lg font-semibold">
          {title}
        </h2>
        <p id="dlg-desc" className="mt-2 text-sm text-muted">
          {description}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button ref={cancelRef} variant="secondary" onClick={onClose}>
            Keep it
          </Button>
          <Button variant="danger" loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
