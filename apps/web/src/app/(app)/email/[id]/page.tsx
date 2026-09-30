'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, Star, Trash2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { StatusPill } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { ErrorState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/modal';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import type { EmailDetail } from '@/lib/types';

export default function EmailDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const { data, isPending, isError, error, refetch } = useQuery<EmailDetail, ApiError>({ queryKey: ['email', id], queryFn: () => api<EmailDetail>(`/emails/${id}`) });

  const star = useMutation({
    mutationFn: (starred: boolean) => api(`/emails/${id}/star`, { method: 'POST', body: { starred } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['email', id] });
      void qc.invalidateQueries({ queryKey: ['emails'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const cancel = useMutation({
    mutationFn: () => api(`/emails/${id}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Email cancelled');
      void qc.invalidateQueries({ queryKey: ['emails'] });
      void qc.invalidateQueries({ queryKey: ['stats'] });
      setConfirm(false);
      router.push('/scheduled');
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setConfirm(false);
    },
  });

  const back = (
    <button onClick={() => router.back()} aria-label="Back" className="flex h-9 w-9 items-center justify-center rounded-full text-fg hover:bg-surface2">
      <ArrowLeft className="h-5 w-5" />
    </button>
  );

  if (isPending)
    return (
      <div className="mx-auto max-w-3xl space-y-4 pt-2">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  if (isError)
    return (
      <div>
        {back}
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      </div>
    );

  const cancellable = data.status === 'scheduled' || data.status === 'queued';
  const when = data.sentAt ?? data.failedAt ?? data.scheduledAt;
  return (
    <article className="mx-auto max-w-4xl">
      <header className="flex items-center gap-3">
        {back}
        <h1 className="min-w-0 flex-1 truncate text-xl font-medium">{data.subject}</h1>
        <button onClick={() => star.mutate(!data.starred)} aria-label={data.starred ? 'Remove star' : 'Star email'} aria-pressed={data.starred} className="p-2 text-muted hover:text-amber-500">
          <Star className={`h-[18px] w-[18px] ${data.starred ? 'fill-amber-400 text-amber-400' : ''}`} />
        </button>
        {cancellable && (
          <button onClick={() => setConfirm(true)} aria-label="Cancel this email" title="Cancel this email" className="p-2 text-muted hover:text-rose-600">
            <Trash2 className="h-[18px] w-[18px]" />
          </button>
        )}
        <Avatar name={data.sender.displayName} className="h-8 w-8" />
      </header>

      <div className="mt-6 flex gap-4 pl-1 sm:pl-12">
        <Avatar name={data.sender.displayName} className="h-9 w-9 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm">
              <span className="font-semibold">{data.sender.displayName}</span> <span className="text-muted">&lt;{data.sender.email}&gt;</span>
            </p>
            <span className="text-xs text-muted">{fmtDateTime(when)}</span>
          </div>
          <p className="mt-0.5 text-xs text-muted">to {data.recipient}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <StatusPill email={data} />
            {data.status === 'failed' && data.failureReason && <span className="text-xs text-rose-600 dark:text-rose-400">{data.failureReason}</span>}
            {data.deferredUntil && cancellable && <span className="text-xs text-orange-600 dark:text-orange-400">Deferred by the hourly rate limit</span>}
            {data.previewUrl && (
              <a href={data.previewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
                Open Ethereal preview <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            )}
          </div>
          {/* body is sanitised server-side (sanitize-html allow-list) before it is stored */}
          <div className="rich mt-6 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: data.body }} />
        </div>
      </div>

      <ConfirmDialog open={confirm} title="Cancel this email?" description={`The email to ${data.recipient} will not be sent. This can't be undone.`} confirmLabel="Cancel email" loading={cancel.isPending} onConfirm={() => cancel.mutate()} onClose={() => setConfirm(false)} />
    </article>
  );
}
