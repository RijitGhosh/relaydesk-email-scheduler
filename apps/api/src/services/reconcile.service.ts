import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { enqueueEmails } from '../queues/enqueue';
import { emailQueue } from '../queues/queues';

export const STALE_PROCESSING_MS = 10 * 60_000;

/**
 * Startup self-healing. PostgreSQL is the source of truth, BullMQ/Redis holds the delayed jobs:
 *  - rows stuck in `processing` (worker crashed mid-send) are released back to `queued`
 *  - any scheduled/queued row without a live BullMQ job (crash between insert and enqueue, or Redis wiped)
 *    gets its job re-created. Already-sent rows are never touched, so nothing is sent twice.
 */
export async function reconcileQueue(): Promise<{ released: number; reenqueued: number }> {
  const released = await prisma.scheduledEmail.updateMany({
    where: { status: 'processing', lockedAt: { lt: new Date(Date.now() - STALE_PROCESSING_MS) } },
    data: { status: 'queued', lockedAt: null },
  });

  let reenqueued = 0;
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.scheduledEmail.findMany({
      where: { status: { in: ['scheduled', 'queued'] } },
      orderBy: { id: 'asc' },
      take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, idempotencyKey: true, scheduledAt: true, deferredUntil: true },
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1]?.id;
    const jobs = await Promise.all(rows.map((r) => emailQueue.getJob(r.idempotencyKey)));
    const missing = rows.filter((_, i) => !jobs[i]);
    if (missing.length > 0) {
      const now = Date.now();
      await enqueueEmails(
        missing.map((r) => ({
          emailId: r.id,
          jobId: r.idempotencyKey,
          delayMs: Math.max(r.scheduledAt.getTime(), r.deferredUntil?.getTime() ?? 0) - now,
        })),
      );
      await prisma.scheduledEmail.updateMany({ where: { id: { in: missing.map((m) => m.id) }, status: 'scheduled' }, data: { status: 'queued' } });
      reenqueued += missing.length;
    }
  }
  if (released.count || reenqueued) logger.warn({ released: released.count, reenqueued }, 'queue reconciled');
  return { released: released.count, reenqueued };
}
