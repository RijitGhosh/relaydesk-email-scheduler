import { DelayedError, UnrecoverableError } from 'bullmq';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { redis } from '../src/lib/redis';
import { releaseSendSlot, reserveSendSlot } from '../src/queues/rate-limiter';
import { JobLike, processEmail, ProcessorDeps } from '../src/workers/email.processor';
import { makeEmail, makeUser, resetAll, shutdown } from './helpers';

beforeEach(resetAll);
afterAll(shutdown);

function makeDeps(over: Partial<ProcessorDeps> = {}): ProcessorDeps & { sendMail: ReturnType<typeof vi.fn>; notifySlack: ReturnType<typeof vi.fn> } {
  return {
    reserve: (o) => reserveSendSlot(redis, o),
    claimNotice: vi.fn().mockResolvedValue(true),
    release: (senderId, w) => releaseSendSlot(redis, senderId, w),
    sendMail: vi.fn().mockResolvedValue({ messageId: '<m1@x>', previewUrl: 'https://ethereal.email/message/abc' }),
    notifySlack: vi.fn().mockResolvedValue(true),
    index: vi.fn().mockResolvedValue(undefined),
    sleep: vi.fn().mockResolvedValue(undefined),
    ...over,
  } as ProcessorDeps & { sendMail: ReturnType<typeof vi.fn>; notifySlack: ReturnType<typeof vi.fn> };
}

const job = (emailId: string, attemptsMade = 0, attempts = 5): JobLike & { moveToDelayed: ReturnType<typeof vi.fn> } => ({
  data: { emailId },
  attemptsMade,
  opts: { attempts },
  moveToDelayed: vi.fn().mockResolvedValue(undefined),
});

describe('email worker', () => {
  it('sends, marks sent, stores the preview URL and indexes', async () => {
    const { user, sender } = await makeUser();
    const email = await makeEmail({ userId: user.id, senderId: sender.id });
    const deps = makeDeps();
    expect(await processEmail(job(email.id), 'tok', deps)).toBe('sent');
    const row = await prisma.scheduledEmail.findUniqueOrThrow({ where: { id: email.id } });
    expect(row.status).toBe('sent');
    expect(row.sentAt).toBeTruthy();
    expect(row.previewUrl).toBe('https://ethereal.email/message/abc');
    expect(deps.sendMail).toHaveBeenCalledTimes(1);
    expect(deps.index).toHaveBeenCalledWith([email.id]);
  });

  it('skips an already-sent email without sending again (idempotency)', async () => {
    const { user, sender } = await makeUser();
    const email = await makeEmail({ userId: user.id, senderId: sender.id, status: 'sent' });
    const deps = makeDeps();
    expect(await processEmail(job(email.id), 'tok', deps)).toBe('skipped');
    expect(deps.sendMail).not.toHaveBeenCalled();
  });

  it('sends exactly once when the same job is processed concurrently', async () => {
    const { user, sender } = await makeUser();
    const email = await makeEmail({ userId: user.id, senderId: sender.id });
    const deps = makeDeps();
    const results = await Promise.allSettled([1, 2, 3, 4].map(() => processEmail(job(email.id), 'tok', deps)));
    expect(deps.sendMail).toHaveBeenCalledTimes(1);
    expect(results.filter((r) => r.status === 'fulfilled' && r.value === 'sent')).toHaveLength(1);
    // losers either skipped or were parked via DelayedError — never sent
    for (const r of results) if (r.status === 'rejected') expect(r.reason).toBeInstanceOf(DelayedError);
  });

  it('marks failed permanently on a 5xx SMTP error and does not retry', async () => {
    const { user, sender } = await makeUser();
    const email = await makeEmail({ userId: user.id, senderId: sender.id });
    const deps = makeDeps({ sendMail: vi.fn().mockRejectedValue(Object.assign(new Error('550 mailbox unavailable'), { responseCode: 550 })) });
    await expect(processEmail(job(email.id), 'tok', deps)).rejects.toBeInstanceOf(UnrecoverableError);
    const row = await prisma.scheduledEmail.findUniqueOrThrow({ where: { id: email.id } });
    expect(row.status).toBe('failed');
    expect(row.failureReason).toContain('550');
  });

  it('releases the email for retry on a transient error, fails it on the last attempt', async () => {
    const { user, sender } = await makeUser();
    const email = await makeEmail({ userId: user.id, senderId: sender.id });
    const deps = makeDeps({ sendMail: vi.fn().mockRejectedValue(new Error('ETIMEDOUT')) });
    await expect(processEmail(job(email.id, 0), 'tok', deps)).rejects.toThrow('ETIMEDOUT');
    expect((await prisma.scheduledEmail.findUniqueOrThrow({ where: { id: email.id } })).status).toBe('queued');
    await expect(processEmail(job(email.id, 4), 'tok', deps)).rejects.toThrow('ETIMEDOUT');
    expect((await prisma.scheduledEmail.findUniqueOrThrow({ where: { id: email.id } })).status).toBe('failed');
  });

  it('enforces the hourly limit: defers to the next window, keeps the record, notifies Slack once', async () => {
    const { user, sender } = await makeUser();
    const first = await makeEmail({ userId: user.id, senderId: sender.id, hourlyLimit: 1 });
    const second = await makeEmail({ userId: user.id, senderId: sender.id, hourlyLimit: 1 });
    const third = await makeEmail({ userId: user.id, senderId: sender.id, hourlyLimit: 1 });
    const seen = new Set<number>();
    const deps = makeDeps({ claimNotice: vi.fn(async (_s: string, w: number) => (seen.has(w) ? false : (seen.add(w), true))) });

    expect(await processEmail(job(first.id), 'tok', deps)).toBe('sent');

    const j2 = job(second.id);
    await expect(processEmail(j2, 'tok', deps)).rejects.toBeInstanceOf(DelayedError);
    const delayedTo = (j2.moveToDelayed.mock.calls[0] as [number])[0];
    expect(delayedTo).toBeGreaterThan(Date.now());
    expect(delayedTo - Date.now()).toBeLessThanOrEqual(3_600_000 + 1000);

    const row2 = await prisma.scheduledEmail.findUniqueOrThrow({ where: { id: second.id } });
    expect(row2.status).toBe('queued'); // not lost, not failed
    expect(row2.deferredUntil).toBeTruthy();

    await expect(processEmail(job(third.id), 'tok', deps)).rejects.toBeInstanceOf(DelayedError);
    expect(deps.notifySlack).toHaveBeenCalledTimes(1); // second blocked job in same window does not spam
    expect(deps.notifySlack.mock.calls[0]?.[1]).toContain('rate limit reached');
    expect(deps.sendMail).toHaveBeenCalledTimes(1);
  });

  it('does not let failed sends consume the hourly quota', async () => {
    const { user, sender } = await makeUser();
    const email = await makeEmail({ userId: user.id, senderId: sender.id, hourlyLimit: 1 });
    const failing = makeDeps({ sendMail: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) });
    await expect(processEmail(job(email.id), 'tok', failing)).rejects.toThrow('ECONNREFUSED');
    const ok = makeDeps();
    expect(await processEmail(job(email.id, 1), 'tok', ok)).toBe('sent'); // limit is 1, retry still fits
  });

  it('waits for its reserved slot when spacing is configured', async () => {
    const { user, sender } = await makeUser();
    const a = await makeEmail({ userId: user.id, senderId: sender.id, delayMs: 2000 });
    const b = await makeEmail({ userId: user.id, senderId: sender.id, delayMs: 2000 });
    const deps = makeDeps();
    await processEmail(job(a.id), 'tok', deps);
    await processEmail(job(b.id), 'tok', deps);
    const waits = (deps.sleep as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as number);
    expect(waits.length).toBe(1);
    expect(waits[0]).toBeGreaterThan(1500);
  });

  it('skips cancelled emails', async () => {
    const { user, sender } = await makeUser();
    const email = await makeEmail({ userId: user.id, senderId: sender.id });
    await prisma.scheduledEmail.update({ where: { id: email.id }, data: { status: 'cancelled' } });
    const deps = makeDeps();
    expect(await processEmail(job(email.id), 'tok', deps)).toBe('skipped');
    expect(deps.sendMail).not.toHaveBeenCalled();
  });
});
