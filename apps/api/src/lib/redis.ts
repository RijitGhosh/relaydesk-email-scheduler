import IORedis, { Redis } from 'ioredis';
import { env } from '../config/env';
import { logger } from './logger';

/** BullMQ requires maxRetriesPerRequest=null on connections used by Workers. */
export function createRedis(name: string): Redis {
  const client = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: true });
  client.on('error', (err) => logger.error({ err: err.message, conn: name }, 'redis error'));
  return client;
}

/** General purpose connection (rate limiter, OAuth state, dedupe keys). */
export const redis = createRedis('app');
