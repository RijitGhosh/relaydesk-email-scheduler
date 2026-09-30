'use client';
import clsx from 'clsx';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Filter, Inbox, RotateCw, Search, Send, Star, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useDebounce } from '@/hooks/use-debounce';
import { api, ApiError } from '@/lib/api';
import type { EmailItem, Page } from '@/lib/types';
import { StatusPill } from '../ui/badge';
import { Button } from '../ui/button';
import { EmptyState, ErrorState } from '../ui/empty-state';
import { Pagination } from '../ui/pagination';
import { TableSkeleton } from '../ui/skeleton';
import { useToast } from '../ui/toast';

export type Tab = 'scheduled' | 'sent';
const PAGE_SIZE = 20;

const filters: Record<Tab, { value: string; label: string }[]> = {
  scheduled: [
    { value: '', label: 'All' },
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'queued', label: 'Queued' },
    { value: 'processing', label: 'Processing' },
    { value: 'cancelled', label: 'Cancelled' },
  ],
  sent: [
    { value: '', label: 'All' },
    { value: 'sent', label: 'Sent' },
    { value: 'failed', label: 'Failed' },
  ],
};

export function Mailbox({ tab }: { tab: Tab }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const q = useDebounce(search.trim(), 350);
  const searching = q.length > 0;

  useEffect(() => {
    setPage(1);
    setStatus('');
    setSearch('');
  }, [tab]);
  useEffect(() => setPage(1), [q, status]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (status) params.set('status', status);
  if (searching) {
    params.set('q', q);
    params.set('tab', tab);
  }
  const path = searching ? `/emails/search?${params}` : `/emails/${tab}?${params}`;
  const { data, isPending, isError, error, refetch, isFetching } = useQuery<Page<EmailItem>, ApiError>({
    queryKey: ['emails', tab, page, status, q],
    queryFn: () => api<Page<EmailItem>>(path),
    placeholderData: keepPreviousData,
    refetchInterval: searching ? false : 10_000,
  });

  const star = useMutation({
    mutationFn: ({ id, starred }: { id: string; starred: boolean }) => api(`/emails/${id}/star`, { method: 'POST', body: { starred } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['emails'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <div className="mb-2 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input className="h-10 w-full rounded-full bg-surface2 pl-10 pr-10 text-sm placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand/30" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search emails" />
          {search && (
            <button onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted hover:text-fg">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div ref={menuRef} className="relative">
          <button onClick={() => setMenu((m) => !m)} aria-label="Filter by status" aria-expanded={menu} className={clsx('flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface2', status && 'bg-brand/10 text-brand')}>
            <Filter className="h-4 w-4" />
          </button>
          {menu && (
            <ul role="menu" className="absolute right-0 top-full z-20 mt-2 w-40 rounded-xl border border-line bg-surface p-1.5 shadow-lg">
              {filters[tab].map((f) => (
                <li key={f.value}>
                  <button
                    role="menuitemradio"
                    aria-checked={status === f.value}
                    onClick={() => {
                      setStatus(f.value);
                      setMenu(false);
                    }}
                    className={clsx('w-full rounded-lg px-3 py-1.5 text-left text-sm hover:bg-surface2', status === f.value && 'font-semibold text-brand')}
                  >
                    {f.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button onClick={() => void refetch()} aria-label="Refresh" className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface2">
          <RotateCw className={clsx('h-4 w-4', isFetching && 'animate-spin')} />
        </button>
      </div>
      {searching && data?.source && <p className="mb-1 px-2 text-xs text-muted">Results from {data.source === 'elasticsearch' ? 'Elasticsearch' : 'Postgres (Elasticsearch unavailable)'}</p>}

      {isPending ? (
        <TableSkeleton rows={8} cols={4} />
      ) : isError ? (
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      ) : data.items.length === 0 ? (
        searching ? (
          <EmptyState icon={Search} title="No results" description={`Nothing matched “${q}”.`} />
        ) : tab === 'scheduled' ? (
          <EmptyState icon={Inbox} title="No scheduled emails" description="Compose a campaign and it will show up here until it is sent." action={<Link href="/compose"><Button variant="outline">Compose</Button></Link>} />
        ) : (
          <EmptyState icon={Send} title="No sent emails yet" description="Delivered emails appear here with their Ethereal preview." />
        )
      ) : (
        <ul className={clsx('divide-y divide-line', isFetching && 'opacity-90')}>
          {data.items.map((e) => (
            <li key={e.id} className="group relative">
              <Link href={`/email/${e.id}`} className="flex items-center gap-3 py-3.5 pl-2 pr-12 text-sm transition-colors hover:bg-surface2/60 sm:gap-4">
                <span className="w-32 shrink-0 truncate sm:w-52" title={e.recipient}>
                  To: {e.recipient}
                </span>
                <StatusPill email={e} />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{e.subject}</span>
                  <span className="text-muted"> - {e.preview}</span>
                </span>
              </Link>
              <button onClick={() => star.mutate({ id: e.id, starred: !e.starred })} aria-label={e.starred ? 'Remove star' : 'Star email'} aria-pressed={e.starred} className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-muted hover:text-amber-500">
                <Star className={clsx('h-4 w-4', e.starred && 'fill-amber-400 text-amber-400')} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onChange={setPage} />}
    </div>
  );
}
