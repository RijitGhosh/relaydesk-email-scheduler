import { env } from './config/env';
import { createApp } from './app';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';
import { es } from './elasticsearch/client';
import { closeQueues } from './queues/queues';

async function main(): Promise<void> {
  await prisma.$connect();
  const app = createApp();
  const server = app.listen(env.PORT, () => logger.info({ port: env.PORT, env: env.NODE_ENV }, 'RelayDesk API listening'));

  let closing = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, 'API shutting down');
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await closeQueues();
    redis.disconnect();
    await Promise.allSettled([es.close(), prisma.$disconnect()]);
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err: (err as Error).message }, 'API failed to start');
  process.exit(1);
});
