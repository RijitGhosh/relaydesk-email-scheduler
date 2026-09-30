import { Request, Response } from 'express';
import { pingEs } from '../elasticsearch/client';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { emailQueue } from '../queues/queues';

export async function health(_req: Request, res: Response): Promise<void> {
  const check = async (fn: () => Promise<unknown>): Promise<'up' | 'down'> => {
    try {
      await fn();
      return 'up';
    } catch {
      return 'down';
    }
  };
  const [postgres, redisStatus, elasticsearch] = await Promise.all([
    check(() => prisma.$queryRaw`SELECT 1`),
    check(() => redis.ping()),
    check(async () => {
      if (!(await pingEs())) throw new Error('down');
    }),
  ]);
  const workers = redisStatus === 'up' ? await emailQueue.getWorkers().then((w) => w.length).catch(() => 0) : 0;
  // Core = Postgres + Redis. Elasticsearch is degradable (search only): the scheduler keeps working without it.
  const core = postgres === 'up' && redisStatus === 'up';
  const status = !core ? 'unhealthy' : elasticsearch === 'up' ? 'ok' : 'degraded';
  res.status(core ? 200 : 503).json({ success: core, data: { status, api: 'up', postgres, redis: redisStatus, elasticsearch, workers } });
}
