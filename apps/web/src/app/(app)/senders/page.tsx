'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Send } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Pill } from '@/components/ui/badge';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { TableSkeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import type { Sender } from '@/lib/types';

export default function SendersPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [limit, setLimit] = useState('200');
  const { data, isPending, isError, error, refetch } = useQuery({ queryKey: ['senders'], queryFn: () => api<Sender[]>('/senders') });
  const refresh = () => qc.invalidateQueries({ queryKey: ['senders'] });

  const create = useMutation({
    mutationFn: () => api<Sender>('/senders', { method: 'POST', body: { displayName: name.trim(), hourlyLimit: Number(limit) } }),
    onSuccess: (s) => {
      toast.success(`Created Ethereal sender ${s.email}`);
      setName('');
      void refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { active?: boolean; hourlyLimit?: number } }) => api(`/senders/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: () => void refresh(),
    onError: (e: Error) => toast.error(e.message),
  });

  const limitValid = Number.isInteger(Number(limit)) && Number(limit) >= 1;
  return (
    <>
      <PageHeader title="Senders" description="Each sender has its own Ethereal SMTP account and its own hourly limit." />
      <form
        className="card mb-6 flex flex-wrap items-end gap-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && limitValid) create.mutate();
        }}
      >
        <div className="min-w-[220px] flex-1">
          <label htmlFor="sname" className="label">
            Display name
          </label>
          <input id="sname" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Outreach — Sales team" />
        </div>
        <div className="w-40">
          <label htmlFor="slimit" className="label">
            Hourly limit
          </label>
          <input id="slimit" type="number" min={1} className="input" value={limit} onChange={(e) => setLimit(e.target.value)} />
        </div>
        <Button type="submit" loading={create.isPending} disabled={!name.trim() || !limitValid}>
          <Plus className="h-4 w-4" aria-hidden /> Add sender
        </Button>
        <p className="w-full text-xs text-muted">A real Ethereal test inbox is provisioned automatically. Messages are captured, never delivered to real recipients.</p>
      </form>

      <div className="card overflow-hidden">
        {isPending ? (
          <TableSkeleton rows={3} cols={4} />
        ) : isError ? (
          <ErrorState message={error.message} onRetry={() => void refetch()} />
        ) : data.length === 0 ? (
          <EmptyState icon={Send} title="No senders yet" description="Add your first sender above to start scheduling." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="bg-surface2/60 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">Sender</th>
                  <th className="px-4 py-3">SMTP</th>
                  <th className="px-4 py-3">Hourly limit</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Enabled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {data.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{s.displayName}</p>
                      <p className="text-xs text-muted">{s.email}</p>
                    </td>
                    <td className="px-4 py-3 text-muted">{s.smtpHost}</td>
                    <td className="px-4 py-3">
                      <input
                        aria-label={`Hourly limit for ${s.email}`}
                        type="number"
                        min={1}
                        defaultValue={s.hourlyLimit}
                        className="input w-24 py-1"
                        onBlur={(e) => {
                          const n = Number(e.target.value);
                          if (Number.isInteger(n) && n >= 1 && n !== s.hourlyLimit) update.mutate({ id: s.id, patch: { hourlyLimit: n } });
                        }}
                      />
                    </td>
                    <td className="px-4 py-3">{s.active ? <Pill tone="emerald">Active</Pill> : <Pill tone="slate">Disabled</Pill>}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        role="switch"
                        aria-checked={s.active}
                        aria-label={`${s.active ? 'Disable' : 'Enable'} ${s.email}`}
                        onClick={() => update.mutate({ id: s.id, patch: { active: !s.active } })}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${s.active ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                      >
                        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${s.active ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
