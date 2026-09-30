import crypto from 'node:crypto';
import { EmailStatus, Prisma } from '@prisma/client';
import { env } from '../config/env';
import { searchEmailIds } from '../elasticsearch/client';
import { sha256 } from '../lib/crypto';
import { htmlToText, previewOf, sanitizeBody } from '../lib/html';
import { badRequest, notFound } from '../lib/errors';
import { logger } from '../lib/logger';
import { estimateCompletion, plannedTimes } from '../lib/planner';
import { prisma } from '../lib/prisma';
import { enqueueEmails, enqueueIndex } from '../queues/enqueue';
import { emailQueue } from '../queues/queues';

export interface ScheduleInput {
  senderId: string;
  subject: string;
  body: string;
  recipients: string[];
  startTime: Date;
  delayBetweenEmailsMs: number;
  hourlyLimit: number;
  requestId?: string;
}

export interface ScheduleSummary {
  campaignId: string;
  recipientCount: number;
  startAt: Date;
  delayBetweenEmailsMs: number;
  hourlyLimit: number;
  estimatedCompletionAt: Date;
  duplicate: boolean;
}

export const SCHEDULED_TAB: EmailStatus[] = ['scheduled', 'queued', 'processing', 'cancelled'];
export const SENT_TAB: EmailStatus[] = ['sent', 'failed'];

/**
 * 1) validate sender ownership  2) persist campaign + emails (source of truth)
 * 3) add delayed BullMQ jobs    4) flip DB rows to `queued`.
 * If step 3 fails, rows stay `scheduled` and the worker's reconcile pass re-enqueues them.
 */
export async function scheduleEmails(userId: string, input: ScheduleInput, now = new Date()): Promise<ScheduleSummary> {
  if (input.startTime.getTime() < now.getTime() - 5_000) throw badRequest('Start time must be in the future');
  const sender = await prisma.sender.findFirst({ where: { id: input.senderId, userId } });
  if (!sender) throw badRequest('Unknown sender');
  if (!sender.active) throw badRequest('Sender is disabled');

  const recipients = [...new Set(input.recipients.map((r) => r.trim().toLowerCase()))];
  if (recipients.length > env.MAX_RECIPIENTS_PER_REQUEST) throw badRequest(`At most ${env.MAX_RECIPIENTS_PER_REQUEST} recipients per request`);

  const body = sanitizeBody(input.body);
  if (!htmlToText(body)) throw badRequest('Body is required');

  const delayMs = Math.max(input.delayBetweenEmailsMs, env.MIN_SEND_DELAY_MS);
  const hourlyLimit = Math.min(input.hourlyLimit, sender.hourlyLimit);
  const requestKey =
    input.requestId ??
    sha256(JSON.stringify([input.senderId, input.subject, input.body, recipients, input.startTime.toISOString(), delayMs, hourlyLimit]));

  const summaryOf = (campaignId: string, duplicate: boolean): ScheduleSummary => ({
    campaignId,
    recipientCount: recipients.length,
    startAt: input.startTime,
    delayBetweenEmailsMs: delayMs,
    hourlyLimit,
    estimatedCompletionAt: estimateCompletion(input.startTime, recipients.length, delayMs, hourlyLimit),
    duplicate,
  });

  const existing = await prisma.emailCampaign.findUnique({ where: { userId_requestKey: { userId, requestKey } } });
  if (existing) return { ...summaryOf(existing.id, true), recipientCount: existing.recipientCount };

  const times = plannedTimes(input.startTime, recipients.length, delayMs);
  const campaignId = crypto.randomUUID();
  const rows = recipients.map((recipient, i) => {
    const idempotencyKey = sha256(`${userId}:${requestKey}:${recipient}`);
    return {
      id: crypto.randomUUID(),
      campaignId,
      senderId: sender.id,
      userId,
      recipient,
      subject: input.subject,
      body,
      position: i,
      scheduledAt: times[i] as Date,
      status: 'scheduled' as const,
      queueJobId: idempotencyKey,
      idempotencyKey,
    };
  });

  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.emailCampaign.create({
          data: {
            id: campaignId,
            userId,
            senderId: sender.id,
            subject: input.subject,
            body,
            startAt: input.startTime,
            delayBetweenMs: delayMs,
            hourlyLimit,
            recipientCount: rows.length,
            requestKey,
          },
        });
        for (let i = 0; i < rows.length; i += 1000) await tx.scheduledEmail.createMany({ data: rows.slice(i, i + 1000) });
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const dup = await prisma.emailCampaign.findUnique({ where: { userId_requestKey: { userId, requestKey } } });
      if (dup) return { ...summaryOf(dup.id, true), recipientCount: dup.recipientCount };
    }
    throw err;
  }

  const nowMs = Date.now();
  await enqueueEmails(rows.map((r) => ({ emailId: r.id, jobId: r.idempotencyKey, delayMs: r.scheduledAt.getTime() - nowMs })));
  await prisma.scheduledEmail.updateMany({ where: { campaignId, status: 'scheduled' }, data: { status: 'queued' } });
  await enqueueIndex(rows.map((r) => r.id));
  logger.info({ campaignId, count: rows.length, userId }, 'campaign scheduled');
  return summaryOf(campaignId, false);
}

export interface EmailDto {
  id: string;
  campaignId: string;
  recipient: string;
  subject: string;
  status: EmailStatus;
  scheduledAt: Date;
  deferredUntil: Date | null;
  sentAt: Date | null;
  failedAt: Date | null;
  failureReason: string | null;
  previewUrl: string | null;
  attempts: number;
  preview: string;
  starred: boolean;
  sender: { id: string; email: string; displayName: string };
}

type EmailRow = Prisma.ScheduledEmailGetPayload<{ include: { sender: true } }>;

const toDto = (e: EmailRow): EmailDto => ({
  id: e.id,
  campaignId: e.campaignId,
  recipient: e.recipient,
  subject: e.subject,
  status: e.status,
  scheduledAt: e.scheduledAt,
  deferredUntil: e.deferredUntil,
  sentAt: e.sentAt,
  failedAt: e.failedAt,
  failureReason: e.failureReason,
  previewUrl: e.previewUrl,
  attempts: e.attempts,
  preview: previewOf(e.body),
  starred: e.starred,
  sender: { id: e.sender.id, email: e.sender.email, displayName: e.sender.displayName },
});

export interface Page<T> {
  source?: 'elasticsearch' | 'postgres';
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const paged = <T>(items: T[], total: number, page: number, pageSize: number): Page<T> => ({
  items,
  total,
  page,
  pageSize,
  totalPages: Math.max(1, Math.ceil(total / pageSize)),
});

export interface ListParams {
  page: number;
  pageSize: number;
  status?: EmailStatus;
  senderId?: string;
  from?: Date;
  to?: Date;
}

function whereFor(userId: string, tab: 'scheduled' | 'sent', p: ListParams): Prisma.ScheduledEmailWhereInput {
  const allowed = tab === 'scheduled' ? SCHEDULED_TAB : SENT_TAB;
  const dateField = tab === 'scheduled' ? 'scheduledAt' : 'sentAt';
  return {
    userId,
    status: p.status && allowed.includes(p.status) ? p.status : { in: allowed },
    ...(p.senderId ? { senderId: p.senderId } : {}),
    ...(p.from || p.to ? { [dateField]: { ...(p.from ? { gte: p.from } : {}), ...(p.to ? { lte: p.to } : {}) } } : {}),
  };
}

export async function listEmails(userId: string, tab: 'scheduled' | 'sent', p: ListParams): Promise<Page<EmailDto>> {
  const where = whereFor(userId, tab, p);
  const orderBy: Prisma.ScheduledEmailOrderByWithRelationInput[] =
    tab === 'scheduled' ? [{ scheduledAt: 'asc' }, { position: 'asc' }] : [{ sentAt: { sort: 'desc', nulls: 'last' } }, { failedAt: { sort: 'desc', nulls: 'last' } }];
  const [total, rows] = await Promise.all([
    prisma.scheduledEmail.count({ where }),
    prisma.scheduledEmail.findMany({ where, orderBy, skip: (p.page - 1) * p.pageSize, take: p.pageSize, include: { sender: true } }),
  ]);
  return paged(rows.map(toDto), total, p.page, p.pageSize);
}

/**
 * Search is served by Elasticsearch; rows are then hydrated from Postgres so statuses are always fresh.
 * If Elasticsearch is unreachable the request degrades to a Postgres ILIKE search instead of failing.
 */
export async function searchEmails(userId: string, tab: 'scheduled' | 'sent', q: string, p: ListParams): Promise<Page<EmailDto>> {
  const allowed = tab === 'scheduled' ? SCHEDULED_TAB : SENT_TAB;
  try {
    const { ids, total } = await searchEmailIds({
      userId,
      q,
      statuses: p.status && allowed.includes(p.status) ? [p.status] : allowed,
      senderId: p.senderId,
      from: p.from,
      to: p.to,
      dateField: tab === 'scheduled' ? 'scheduledAt' : 'sentAt',
      page: p.page,
      pageSize: p.pageSize,
      sort: tab === 'scheduled' ? 'asc' : 'desc',
    });
    const rows = await prisma.scheduledEmail.findMany({ where: { id: { in: ids }, userId }, include: { sender: true } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = ids.map((id) => byId.get(id)).filter((r): r is EmailRow => Boolean(r));
    return { ...paged(ordered.map(toDto), total, p.page, p.pageSize), source: 'elasticsearch' };
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'elasticsearch unavailable; falling back to postgres search');
    const contains = { contains: q, mode: 'insensitive' as const };
    const where: Prisma.ScheduledEmailWhereInput = {
      ...whereFor(userId, tab, p),
      OR: [{ recipient: contains }, { subject: contains }, { body: contains }, { sender: { email: contains } }],
    };
    const orderBy: Prisma.ScheduledEmailOrderByWithRelationInput[] = tab === 'scheduled' ? [{ scheduledAt: 'asc' }, { position: 'asc' }] : [{ sentAt: { sort: 'desc', nulls: 'last' } }];
    const [total, rows] = await Promise.all([
      prisma.scheduledEmail.count({ where }),
      prisma.scheduledEmail.findMany({ where, orderBy, skip: (p.page - 1) * p.pageSize, take: p.pageSize, include: { sender: true } }),
    ]);
    return { ...paged(rows.map(toDto), total, p.page, p.pageSize), source: 'postgres' };
  }
}

export async function getEmail(userId: string, id: string): Promise<EmailDto & { body: string }> {
  const row = await prisma.scheduledEmail.findFirst({ where: { id, userId }, include: { sender: true } });
  if (!row) throw notFound('Email not found');
  return { ...toDto(row), body: row.body };
}

export async function setStar(userId: string, id: string, starred: boolean): Promise<void> {
  const res = await prisma.scheduledEmail.updateMany({ where: { id, userId }, data: { starred } });
  if (res.count === 0) throw notFound('Email not found');
}

/** Only scheduled/queued emails can be cancelled; the CAS update makes it race-safe against the worker. */
export async function cancelEmail(userId: string, id: string): Promise<void> {
  const res = await prisma.scheduledEmail.updateMany({
    where: { id, userId, status: { in: ['scheduled', 'queued'] } },
    data: { status: 'cancelled', deferredUntil: null },
  });
  if (res.count === 0) {
    const exists = await prisma.scheduledEmail.findFirst({ where: { id, userId }, select: { status: true } });
    if (!exists) throw notFound('Email not found');
    throw badRequest(`Cannot cancel an email that is ${exists.status}`);
  }
  const email = await prisma.scheduledEmail.findUnique({ where: { id }, select: { queueJobId: true } });
  if (email?.queueJobId) {
    const job = await emailQueue.getJob(email.queueJobId);
    await job?.remove().catch(() => undefined); // an active job is skipped by the worker (status is cancelled)
  }
  await enqueueIndex([id]);
}

export async function emailStats(userId: string): Promise<Record<EmailStatus, number>> {
  const groups = await prisma.scheduledEmail.groupBy({ by: ['status'], where: { userId }, _count: { _all: true } });
  const out: Record<EmailStatus, number> = { scheduled: 0, queued: 0, processing: 0, sent: 0, failed: 0, cancelled: 0 };
  for (const g of groups) out[g.status] = g._count._all;
  return out;
}

export async function listCampaigns(userId: string, page: number, pageSize: number) {
  const [total, rows] = await Promise.all([
    prisma.emailCampaign.count({ where: { userId } }),
    prisma.emailCampaign.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { sender: { select: { email: true, displayName: true } } },
    }),
  ]);
  const items = rows.map((c) => ({
    id: c.id,
    subject: c.subject,
    startAt: c.startAt,
    recipientCount: c.recipientCount,
    delayBetweenMs: c.delayBetweenMs,
    hourlyLimit: c.hourlyLimit,
    createdAt: c.createdAt,
    sender: c.sender,
  }));
  return paged(items, total, page, pageSize);
}
