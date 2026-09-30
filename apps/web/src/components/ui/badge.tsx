import clsx from 'clsx';
import { Clock } from 'lucide-react';
import { fmtPill } from '@/lib/format';
import type { EmailItem } from '@/lib/types';

/** Figma-style pill: orange clock+time for upcoming sends, grey "Sent", red "Failed". */
export function StatusPill({ email }: { email: Pick<EmailItem, 'status' | 'scheduledAt' | 'deferredUntil'> }) {
  const base = 'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium';
  switch (email.status) {
    case 'sent':
      return <span className={clsx(base, 'bg-surface2 text-muted')}>Sent</span>;
    case 'failed':
      return <span className={clsx(base, 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300')}>Failed</span>;
    case 'cancelled':
      return <span className={clsx(base, 'bg-surface2 text-muted')}>Cancelled</span>;
    case 'processing':
      return <span className={clsx(base, 'animate-pulse bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300')}>Sending…</span>;
    default:
      return (
        <span className={clsx(base, 'bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300')} title={email.deferredUntil ? 'Deferred by the hourly rate limit' : 'Scheduled time'}>
          <Clock className="h-3 w-3" aria-hidden />
          {fmtPill(email.deferredUntil ?? email.scheduledAt)}
        </span>
      );
  }
}

export function Pill({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'emerald' | 'amber' | 'rose' | 'blue' }) {
  const tones = {
    slate: 'bg-surface2 text-muted',
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    rose: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  };
  return <span className={clsx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone])}>{children}</span>;
}
