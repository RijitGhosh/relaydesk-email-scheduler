'use client';
import { Calendar } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toLocalInput } from '@/lib/format';
import { Button } from '../ui/button';

function tomorrowAt(hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  return toLocalInput(d);
}
const OPTIONS = [
  { label: 'Tomorrow', value: () => tomorrowAt(9) },
  { label: 'Tomorrow, 10:00 AM', value: () => tomorrowAt(10) },
  { label: 'Tomorrow, 11:00 AM', value: () => tomorrowAt(11) },
  { label: 'Tomorrow, 3:00 PM', value: () => tomorrowAt(15) },
];

export function SendLaterPopover({ value, onDone, onClose }: { value: string; onDone: (v: string) => void; onClose: () => void }) {
  const [pending, setPending] = useState(value);
  const ref = useRef<HTMLDivElement>(null);
  const invalid = pending !== '' && new Date(pending).getTime() <= Date.now();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!ref.current?.contains(t) && !t.closest('[data-send-later-trigger]')) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    ref.current?.querySelector('input')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  return (
    <div ref={ref} role="dialog" aria-label="Send later" className="absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border border-line bg-surface p-4 shadow-xl">
      <h2 className="text-sm font-medium">Send Later</h2>
      <label className="mt-3 flex items-center gap-2 border-b border-line pb-1.5 text-xs text-muted">
        <span className="sr-only">Pick date and time</span>
        <input type="datetime-local" value={pending} onChange={(e) => setPending(e.target.value)} className="w-full bg-transparent text-sm text-fg focus:outline-none" />
        <Calendar className="h-4 w-4 shrink-0" aria-hidden />
      </label>
      {invalid && (
        <p role="alert" className="mt-1 text-xs text-rose-600">
          Pick a time in the future
        </p>
      )}
      <ul className="mt-3 space-y-0.5">
        {OPTIONS.map((o) => (
          <li key={o.label}>
            <button type="button" onClick={() => setPending(o.value())} className="w-full rounded-md px-1 py-1.5 text-left text-xs hover:bg-surface2">
              {o.label}
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-center justify-between">
        {value ? (
          <button type="button" onClick={() => onDone('')} className="text-xs text-muted hover:text-fg">
            Send now instead
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClose} className="px-2 text-xs font-medium">
            Cancel
          </button>
          <Button size="sm" variant="outline" className="rounded-full" disabled={!pending || invalid} onClick={() => onDone(pending)}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
