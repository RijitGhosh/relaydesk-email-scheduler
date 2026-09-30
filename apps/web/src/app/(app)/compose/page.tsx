'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Clock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { RecipientsField, RecipientState } from '@/components/compose/recipients-field';
import { RichEditor } from '@/components/compose/rich-editor';
import { SendLaterPopover } from '@/components/compose/send-later';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { fmtDateTimeLong } from '@/lib/format';
import { estimateCompletion } from '@/lib/recipients';
import type { ScheduleSummary, Sender } from '@/lib/types';

const SEND_NOW_OFFSET_MS = 10_000;
type Errors = Partial<Record<'sender' | 'to' | 'subject' | 'body' | 'delay' | 'hourly', string>>;

function Row({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-[130px_1fr] sm:gap-4">
      <label htmlFor={htmlFor} className="pt-2 text-sm font-medium sm:text-right">
        {label}
      </label>
      <div>{children}</div>
    </div>
  );
}
const Err = ({ msg }: { msg?: string }) =>
  msg ? (
    <p role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-400">
      {msg}
    </p>
  ) : null;

export default function ComposePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const requestId = useRef('');
  useEffect(() => {
    requestId.current = crypto.randomUUID();
  }, []);

  const senders = useQuery({ queryKey: ['senders'], queryFn: () => api<Sender[]>('/senders') });
  const active = useMemo(() => (senders.data ?? []).filter((s) => s.active), [senders.data]);

  const [senderId, setSenderId] = useState('');
  const [to, setTo] = useState<RecipientState>({ emails: [], invalid: 0, duplicates: 0 });
  const [subject, setSubject] = useState('');
  const [delay, setDelay] = useState('2');
  const [hourly, setHourly] = useState('100');
  const [body, setBody] = useState('');
  const [startLocal, setStartLocal] = useState('');
  const [laterOpen, setLaterOpen] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    if (!senderId && active[0]) setSenderId(active[0].id);
  }, [active, senderId]);

  const sender = active.find((s) => s.id === senderId);
  const delayNum = Number(delay);
  const hourlyNum = Number(hourly);
  const startMs = startLocal ? new Date(startLocal).getTime() : Date.now() + SEND_NOW_OFFSET_MS;
  const canEstimate = to.emails.length > 0 && Number.isFinite(delayNum) && delayNum >= 0 && Number.isInteger(hourlyNum) && hourlyNum >= 1 && delay !== '' && hourly !== '';
  const estimate = canEstimate ? estimateCompletion(startMs, to.emails.length, Math.round(delayNum * 1000), Math.min(hourlyNum, sender?.hourlyLimit ?? hourlyNum)) : null;

  const schedule = useMutation({
    mutationFn: () =>
      api<ScheduleSummary>('/emails/schedule', {
        method: 'POST',
        body: {
          senderId,
          subject: subject.trim(),
          body,
          recipients: to.emails,
          startTime: new Date(startLocal ? startMs : Date.now() + SEND_NOW_OFFSET_MS).toISOString(),
          delayBetweenEmailsMs: Math.round(delayNum * 1000),
          hourlyLimit: hourlyNum,
          requestId: requestId.current, // stable across retries => the server never schedules twice
        },
      }),
    onSuccess: (s) => {
      toast[s.duplicate ? 'info' : 'success'](s.duplicate ? 'Already scheduled — no duplicates were created.' : `Scheduled ${s.recipientCount.toLocaleString()} email${s.recipientCount === 1 ? '' : 's'}`);
      void qc.invalidateQueries({ queryKey: ['emails'] });
      void qc.invalidateQueries({ queryKey: ['stats'] });
      router.push('/scheduled');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit() {
    const text = new DOMParser().parseFromString(body, 'text/html').body.textContent?.trim() ?? '';
    const e: Errors = {};
    if (!senderId) e.sender = 'Choose a sender';
    if (to.emails.length === 0) e.to = 'Add at least one recipient or upload a CSV/TXT list';
    if (!subject.trim()) e.subject = 'Subject is required';
    if (!text) e.body = 'Write a message before sending';
    if (delay === '' || !Number.isFinite(delayNum) || delayNum < 0 || delayNum > 3600) e.delay = '0–3600 seconds';
    if (hourly === '' || !Number.isInteger(hourlyNum) || hourlyNum < 1) e.hourly = 'Whole number ≥ 1';
    if (startLocal && new Date(startLocal).getTime() <= Date.now()) e.body = e.body ?? 'The chosen send time has passed — pick a new one';
    setErrors(e);
    if (Object.keys(e).length === 0) schedule.mutate();
  }

  const box = 'w-16 rounded-md border border-line bg-transparent px-2 py-1.5 text-sm placeholder:text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40';
  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex items-center gap-3">
        <button onClick={() => router.back()} aria-label="Back" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface2">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="flex-1 text-xl font-medium">Compose New Email</h1>
        <div className="relative flex items-center gap-2">
          <button data-send-later-trigger onClick={() => setLaterOpen((o) => !o)} aria-label="Send later" aria-expanded={laterOpen} className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface2 hover:text-brand">
            <Clock className="h-[18px] w-[18px]" />
          </button>
          <Button variant="outline" className="rounded-full" loading={schedule.isPending} onClick={submit}>
            {startLocal ? 'Send Later' : 'Send'}
          </Button>
          {laterOpen && (
            <SendLaterPopover
              value={startLocal}
              onClose={() => setLaterOpen(false)}
              onDone={(v) => {
                setStartLocal(v);
                setLaterOpen(false);
              }}
            />
          )}
        </div>
      </header>
      {startLocal && (
        <p className="-mt-3 mb-4 text-right text-xs text-muted">
          Scheduled for <span className="font-medium text-fg">{fmtDateTimeLong(new Date(startLocal))}</span>
        </p>
      )}

      <div className="space-y-5">
        <Row label="From" htmlFor="from">
          <select id="from" value={senderId} onChange={(e) => setSenderId(e.target.value)} disabled={senders.isPending} className="rounded-lg bg-surface2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30">
            {active.length === 0 && <option value="">{senders.isPending ? 'Loading…' : 'No active senders'}</option>}
            {active.map((s) => (
              <option key={s.id} value={s.id}>
                {s.email}
              </option>
            ))}
          </select>
          {senders.isSuccess && active.length === 0 && <p className="mt-1 text-xs text-amber-600">Add or enable a sender from the account menu → Senders.</p>}
          <Err msg={errors.sender} />
        </Row>

        <Row label="To">
          <RecipientsField value={to} onChange={(v) => { setTo(v); setErrors((x) => ({ ...x, to: undefined })); }} onError={(m) => toast.error(m)} error={errors.to} />
        </Row>

        <Row label="Subject" htmlFor="subject">
          <input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" maxLength={300} className="w-full border-b border-line bg-transparent pb-2 pt-1 text-sm placeholder:text-muted focus:border-brand focus:outline-none" />
          <Err msg={errors.subject} />
        </Row>

        <Row label="Delay between 2 emails">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div>
              <input aria-label="Delay between emails in seconds" inputMode="decimal" value={delay} onChange={(e) => setDelay(e.target.value)} placeholder="00" className={box} />
              <span className="ml-1.5 text-xs text-muted">sec</span>
              <Err msg={errors.delay} />
            </div>
            <label className="flex items-center gap-2 text-sm font-medium">
              Hourly Limit
              <input aria-label="Hourly limit" inputMode="numeric" value={hourly} onChange={(e) => setHourly(e.target.value)} placeholder="00" className={box} />
            </label>
            {errors.hourly && <Err msg={errors.hourly} />}
            {sender && <span className="text-xs text-muted">Sender cap: {sender.hourlyLimit}/hr</span>}
          </div>
          {estimate && (
            <p className="mt-2 text-xs text-muted">
              {to.emails.length.toLocaleString()} recipients · first send {fmtDateTimeLong(new Date(startMs))} · estimated completion <span className="font-medium text-fg">{fmtDateTimeLong(new Date(estimate))}</span>. Actual delivery can shift if the hourly limit is hit or a send is retried.
            </p>
          )}
        </Row>

        <Row label="Message">
          <RichEditor onChange={(html) => { setBody(html); setErrors((x) => ({ ...x, body: undefined })); }} invalid={Boolean(errors.body)} />
          <Err msg={errors.body} />
        </Row>
      </div>
    </div>
  );
}
