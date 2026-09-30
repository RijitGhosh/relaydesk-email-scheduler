import { DelayedError, UnrecoverableError } from 'bullmq';
import { env } from '../config/env';
import { isPermanentMailError, OutgoingMail, SenderTransportConfig, sendViaSender, SentMail } from '../integrations/mailer';
import { sendSlackMessage } from '../integrations/slack';
import { htmlToText } from '../lib/html';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { enqueueIndex } from '../queues/enqueue';
import { claimRateLimitNotice, releaseSendSlot, reserveSendSlot, SlotReservation } from '../queues/rate-limiter';
import { STALE_PROCESSING_MS } from '../services/reconcile.service';

export interface JobLike {
  id?: string;
  data: { emailId: string };
  attemptsMade: number;
  opts: { attempts?: number };
  moveToDelayed(timestamp: number, token?: string): Promise<void>;
}

export interface ProcessorDeps {
  reserve(opts: { senderId: string; minDelayMs: number; limit: number }): Promise<SlotReservation>;
  claimNotice(senderId: string, windowIndex: number): Promise<boolean>;
  release(senderId: string, windowIndex: number): Promise<void>;
  sendMail(sender: SenderTransportConfig, mail: OutgoingMail): Promise<SentMail>;
  notifySlack(userId: string, text: string): Promise<boolean>;
  index(ids: string[]): Promise<void>;
  sleep(ms: number): Promise<void>;
}

export const defaultDeps: ProcessorDeps = {
  reserve: (o) => reserveSendSlot(redis, o),
  claimNotice: (senderId, w) => claimRateLimitNotice(redis, senderId, w),
  release: (senderId, w) => releaseSendSlot(redis, senderId, w),
  sendMail: sendViaSender,
  notifySlack: sendSlackMessage,
  index: enqueueIndex,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

export type ProcessResult = 'sent' | 'skipped';

async function deferJob(job: JobLike, token: string | undefined, delayMs: number): Promise<never> {
  await job.moveToDelayed(Date.now() + delayMs, token);
  throw new DelayedError();
}

/**
 * Idempotent, rate-limited send. Order of operations matters:
 *   load → terminal? skip → atomic claim (CAS) → reserve slot (limit + spacing) → wait → SMTP → mark sent → index
 */
export async function processEmail(job: JobLike, token: string | undefined, deps: ProcessorDeps = defaultDeps): Promise<ProcessResult> {
  const { emailId } = job.data;
  const email = await prisma.scheduledEmail.findUnique({ where: { id: emailId }, include: { sender: true, campaign: true } });
  if (!email) {
    logger.warn({ emailId }, 'email row missing; dropping job');
    return 'skipped';
  }
  if (email.status === 'sent' || email.status === 'cancelled' || email.status === 'failed') {
    logger.info({ emailId, status: email.status }, 'already terminal; skipping (idempotent)');
    return 'skipped';
  }

  if (!email.sender.active) {
    const until = new Date(Date.now() + 5 * 60_000);
    await prisma.scheduledEmail.updateMany({ where: { id: emailId, status: { in: ['scheduled', 'queued'] } }, data: { status: 'queued', deferredUntil: until } });
    return deferJob(job, token, 5 * 60_000);
  }

  // Atomic claim. Only ONE worker can flip queued -> processing; a stale `processing` row (crashed worker) is reclaimable.
  const now = new Date();
  const claim = await prisma.scheduledEmail.updateMany({
    where: {
      id: emailId,
      OR: [{ status: { in: ['scheduled', 'queued'] } }, { status: 'processing', lockedAt: { lt: new Date(now.getTime() - STALE_PROCESSING_MS) } }],
    },
    data: { status: 'processing', lockedAt: now, attempts: { increment: 1 } },
  });
  if (claim.count === 0) {
    const current = await prisma.scheduledEmail.findUnique({ where: { id: emailId }, select: { status: true, lockedAt: true } });
    if (current?.status === 'processing') {
      // Someone else (or a crashed worker) owns it. Come back after the staleness window instead of duplicating work.
      const wait = Math.max(5_000, (current.lockedAt?.getTime() ?? Date.now()) + STALE_PROCESSING_MS - Date.now() + 1_000);
      logger.warn({ emailId }, 'owned by another worker; re-checking later');
      return deferJob(job, token, wait);
    }
    logger.info({ emailId, status: current?.status }, 'not claimable; skipping');
    return 'skipped';
  }

  const minDelayMs = Math.max(email.campaign.delayBetweenMs, env.MIN_SEND_DELAY_MS);
  const limit = Math.min(email.campaign.hourlyLimit, email.sender.hourlyLimit);
  const slot = await deps.reserve({ senderId: email.senderId, minDelayMs, limit });

  if (!slot.allowed) {
    const deferUntil = new Date(Date.now() + slot.deferMs);
    await prisma.scheduledEmail.update({ where: { id: emailId }, data: { status: 'queued', lockedAt: null, deferredUntil: deferUntil } });
    logger.warn({ emailId, senderId: email.senderId, until: deferUntil.toISOString() }, 'hourly limit reached; job deferred to next window');
    if (await deps.claimNotice(email.senderId, slot.windowIndex)) {
      const text = `RelayDesk rate limit reached for sender ${email.sender.email} (${limit}/hour). Emails have been deferred until the next available sending window (${deferUntil.toISOString()}).`;
      await deps.notifySlack(email.userId, text);
    }
    await deps.index([emailId]);
    return deferJob(job, token, slot.deferMs);
  }

  if (slot.waitMs > 0) await deps.sleep(slot.waitMs); // wait for the slot this job reserved atomically

  try {
    const result = await deps.sendMail(email.sender, {
      to: email.recipient,
      subject: email.subject,
      text: htmlToText(email.body),
      html: email.body,
      messageId: `<${email.idempotencyKey}@relaydesk.local>`, // stable Message-ID: receivers can dedupe if a crash causes a resend
    });
    await prisma.scheduledEmail.updateMany({
      where: { id: emailId, status: 'processing' },
      data: { status: 'sent', sentAt: new Date(), lockedAt: null, deferredUntil: null, failureReason: null, messageId: result.messageId, previewUrl: result.previewUrl },
    });
    logger.info({ emailId, recipient: email.recipient, count: slot.count }, 'email sent');
    await deps.index([emailId]);
    return 'sent';
  } catch (err) {
    await deps.release(email.senderId, slot.windowIndex).catch(() => undefined); // nothing was delivered: give the quota back
    const message = (err as Error).message.slice(0, 500);
    const permanent = isPermanentMailError(err);
    const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    if (permanent || lastAttempt) {
      await prisma.scheduledEmail.update({ where: { id: emailId }, data: { status: 'failed', failedAt: new Date(), lockedAt: null, failureReason: message } });
      await deps.index([emailId]);
      logger.error({ emailId, permanent, err: message }, 'email failed permanently');
      if (permanent) throw new UnrecoverableError(message);
      throw err;
    }
    await prisma.scheduledEmail.update({ where: { id: emailId }, data: { status: 'queued', lockedAt: null, failureReason: message } });
    logger.warn({ emailId, err: message, attempt: job.attemptsMade + 1 }, 'send failed; will retry with backoff');
    throw err;
  }
}
