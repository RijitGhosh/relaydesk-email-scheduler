'use client';
import { ExternalLink } from 'lucide-react';
import { useStats } from '@/hooks/use-stats';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/empty-state';

const tiles = [
  { key: 'waiting', label: 'Waiting', tone: 'from-sky-500 to-blue-500' },
  { key: 'delayed', label: 'Delayed', tone: 'from-violet-500 to-indigo-500' },
  { key: 'active', label: 'Active', tone: 'from-amber-500 to-orange-500' },
  { key: 'completed', label: 'Completed', tone: 'from-emerald-500 to-teal-500' },
  { key: 'failed', label: 'Failed', tone: 'from-rose-500 to-pink-500' },
] as const;

export default function QueuePage() {
  const { data, isPending, isError, error, refetch } = useStats();
  return (
    <>
      <PageHeader
        title="Queue"
        description="Live BullMQ counts for the email-send queue (refreshes every 5s)."
        actions={
          <a href="/admin/queues" target="_blank" rel="noreferrer">
            <Button variant="secondary">
              Open Bull Board <ExternalLink className="h-4 w-4" aria-hidden />
            </Button>
          </a>
        }
      />
      {isError ? (
        <div className="card">
          <ErrorState message={error.message} onRetry={() => void refetch()} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {tiles.map((t) => (
            <div key={t.key} className="card overflow-hidden">
              <div className={`h-1.5 bg-gradient-to-r ${t.tone}`} aria-hidden />
              <div className="p-4">
                <p className="text-sm text-muted">{t.label}</p>
                {isPending ? <Skeleton className="mt-2 h-8 w-14" /> : <p className="mt-1 text-3xl font-semibold tabular-nums">{(data?.queue[t.key] ?? 0).toLocaleString()}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-6 max-w-2xl text-sm text-muted">
        <strong className="text-fg">Delayed</strong> jobs are future emails waiting in Redis. When a sender hits its hourly cap, jobs return to Delayed until the next hour window.
      </p>
    </>
  );
}
