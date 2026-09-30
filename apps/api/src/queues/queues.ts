import { Queue } from 'bullmq';
import { createRedis } from '../lib/redis';

export const EMAIL_QUEUE = 'email-send';
export const INDEX_QUEUE = 'email-index';

export interface EmailJobData {
  emailId: string;
}
export interface IndexJobData {
  emailIds: string[];
}

/** Dedicated connection for producers (API + worker enqueue calls). */
export const queueConnection = createRedis('queue');

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE, {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { age: 24 * 3600, count: 5_000 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});

export const indexQueue = new Queue<IndexJobData>(INDEX_QUEUE, {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 10,
    backoff: { type: 'exponential', delay: 2_000 },
    removeOnComplete: { age: 3600, count: 1_000 },
    removeOnFail: { age: 24 * 3600 },
  },
});

export async function closeQueues(): Promise<void> {
  await Promise.allSettled([emailQueue.close(), indexQueue.close()]);
  queueConnection.disconnect();
}
