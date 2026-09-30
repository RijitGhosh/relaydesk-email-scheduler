import http from 'node:http';
import { Worker } from 'bullmq';
import { env } from './config/env';
import { pingEs } from './elasticsearch/client';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { createRedis, redis } from './lib/redis';
import { closeQueues, EMAIL_QUEUE, EmailJobData, INDEX_QUEUE, IndexJobData } from './queues/queues';
import { processEmail } from './workers/email.processor';
import { processIndexJob } from './workers/index-processor';
import { reconcileQueue } from './services/reconcile.service';

async function main(): Promise<void> {
  await prisma.$connect();
  await reconcileQueue();

  const emailWorker = new Worker<EmailJobData>(EMAIL_QUEUE, (job, token) => processEmail(job, token), {
    connection: createRedis('worker-email'),
    concurrency: env.WORKER_CONCURRENCY,
    lockDuration: 60_000,
  });
  const indexWorker = new Worker<IndexJobData>(INDEX_QUEUE, (job) => processIndexJob(job.data.emailIds), {
    connection: createRedis('worker-index'),
    concurrency: 5,
  });

  emailWorker.on('completed', (job, result) => logger.info({ jobId: job.id, result }, 'job completed'));
  emailWorker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'job failed'));
  emailWorker.on('error', (err) => logger.error({ err: err.message }, 'email worker error'));
  indexWorker.on('failed', (job, err) => logger.warn({ jobId: job?.id, err: err.message }, 'index job failed (will retry)'));
  indexWorker.on('error', (err) => logger.error({ err: err.message }, 'index worker error'));

  logger.info({ concurrency: env.WORKER_CONCURRENCY, minDelayMs: env.MIN_SEND_DELAY_MS, maxPerHour: env.MAX_EMAILS_PER_HOUR_PER_SENDER }, 'worker started');

  // Health server: unhealthy (503) whenever Redis or Postgres is unreachable.
  const health = http.createServer(async (req, res) => {
    if (req.url !== '/health') {
      res.writeHead(404).end();
      return;
    }
    try {
      await redis.ping();
      await prisma.$queryRaw`SELECT 1`;
      const es = await pingEs();
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ status: 'ok', elasticsearch: es ? 'up' : 'down' }));
    } catch {
      res.writeHead(503, { 'Content-Type': 'application/json' }).end(JSON.stringify({ status: 'unhealthy' }));
    }
  });
  health.listen(env.WORKER_HEALTH_PORT, () => logger.info({ port: env.WORKER_HEALTH_PORT }, 'worker health endpoint ready'));

  let closing = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, 'worker shutting down');
    health.close();
    await Promise.allSettled([emailWorker.close(), indexWorker.close()]);
    await closeQueues();
    redis.disconnect();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err: (err as Error).message }, 'worker failed to start');
  process.exit(1);
});
