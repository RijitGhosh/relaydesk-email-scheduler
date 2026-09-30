import { logger } from '../lib/logger';
import { emailQueue, indexQueue } from './queues';

/** Resilient ES indexing: goes through a retried BullMQ queue; never throws into callers. */
export async function enqueueIndex(emailIds: string[]): Promise<void> {
  if (emailIds.length === 0) return;
  try {
    for (let i = 0; i < emailIds.length; i += 200) {
      await indexQueue.add('index', { emailIds: emailIds.slice(i, i + 200) });
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'could not enqueue index job (run npm run es:reindex to repair)');
  }
}

export interface EnqueueItem {
  emailId: string;
  jobId: string;
  delayMs: number;
}

export async function enqueueEmails(items: EnqueueItem[]): Promise<void> {
  for (let i = 0; i < items.length; i += 500) {
    const chunk = items.slice(i, i + 500);
    await emailQueue.addBulk(
      chunk.map((it) => ({
        name: 'send',
        data: { emailId: it.emailId },
        opts: { jobId: it.jobId, delay: Math.max(0, it.delayMs) },
      })),
    );
  }
}
