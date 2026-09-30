'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Slack } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Pill } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import type { SlackStatus } from '@/lib/types';

function SlackCard() {
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const { data, isPending } = useQuery({ queryKey: ['slack'], queryFn: () => api<SlackStatus>('/slack/status') });

  useEffect(() => {
    const result = params.get('slack');
    if (!result) return;
    if (result === 'connected') toast.success('Slack connected');
    else toast.error(`Slack connection failed (${params.get('reason') ?? 'unknown'})`);
    void qc.invalidateQueries({ queryKey: ['slack'] });
    router.replace('/integrations');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const disconnect = useMutation({
    mutationFn: () => api('/slack/disconnect', { method: 'POST' }),
    onSuccess: () => {
      toast.success('Slack disconnected');
      void qc.invalidateQueries({ queryKey: ['slack'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="card max-w-2xl p-6">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300">
          <Slack className="h-6 w-6" aria-hidden />
        </span>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">Slack rate-limit alerts</h2>
            {data && (data.connected ? <Pill tone="emerald">Connected</Pill> : <Pill tone="slate">Not connected</Pill>)}
          </div>
          <p className="mt-1 text-sm text-muted">When a sender hits its hourly limit, RelayDesk sends you a direct message once per sender per hour. Deferred emails resume automatically.</p>
          {isPending ? (
            <Skeleton className="mt-4 h-9 w-40" />
          ) : data?.connected ? (
            <div className="mt-4 space-y-3">
              <p className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden /> Workspace <strong>{data.teamName}</strong> · connected {fmtDateTime(data.connectedAt)}
              </p>
              <div className="flex gap-2">
                <a href="/api/slack/connect">
                  <Button variant="secondary">Reconnect</Button>
                </a>
                <Button variant="danger" loading={disconnect.isPending} onClick={() => disconnect.mutate()}>
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <a href="/api/slack/connect">
                <Button>
                  <Slack className="h-4 w-4" aria-hidden /> Connect Slack
                </Button>
              </a>
              {data && !data.configured && <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">Slack app credentials are not set on the server yet (SLACK_CLIENT_ID / SLACK_CLIENT_SECRET).</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <>
      <PageHeader title="Slack" description="Get notified the moment a sender is rate limited." />
      <Suspense fallback={null}>
        <SlackCard />
      </Suspense>
    </>
  );
}
