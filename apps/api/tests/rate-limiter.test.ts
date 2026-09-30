import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { redis } from '../src/lib/redis';
import { claimRateLimitNotice, reserveSendSlot } from '../src/queues/rate-limiter';
import { resetAll, shutdown } from './helpers';

beforeEach(resetAll);
afterAll(shutdown);

describe('distributed rate limiter (Redis Lua)', () => {
  it('never lets more than `limit` reservations through under 50 concurrent workers', async () => {
    const results = await Promise.all(Array.from({ length: 50 }, () => reserveSendSlot(redis, { senderId: 's1', minDelayMs: 0, limit: 7 })));
    expect(results.filter((r) => r.allowed)).toHaveLength(7);
    expect(results.filter((r) => !r.allowed)).toHaveLength(43);
  });

  it('reports a defer time that lands on the next hour boundary', async () => {
    await Promise.all(Array.from({ length: 3 }, () => reserveSendSlot(redis, { senderId: 's2', minDelayMs: 0, limit: 3 })));
    const blocked = await reserveSendSlot(redis, { senderId: 's2', minDelayMs: 0, limit: 3 });
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.deferMs).toBeGreaterThan(0);
      expect(blocked.deferMs).toBeLessThanOrEqual(3_600_000);
      expect((Date.now() + blocked.deferMs) % 3_600_000).toBeLessThan(2_000); // ≈ top of the hour
    }
  });

  it('enforces the minimum spacing across concurrent reservations', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => reserveSendSlot(redis, { senderId: 's3', minDelayMs: 250, limit: 100 })));
    const waits = results.map((r) => (r.allowed ? r.waitMs : -1)).sort((a, b) => a - b);
    expect(waits.every((w) => w >= 0)).toBe(true);
    for (let i = 1; i < waits.length; i += 1) expect((waits[i] as number) - (waits[i - 1] as number)).toBeGreaterThanOrEqual(249);
  });

  it('scopes limits per sender', async () => {
    await Promise.all(Array.from({ length: 2 }, () => reserveSendSlot(redis, { senderId: 'A', minDelayMs: 0, limit: 2 })));
    expect((await reserveSendSlot(redis, { senderId: 'A', minDelayMs: 0, limit: 2 })).allowed).toBe(false);
    expect((await reserveSendSlot(redis, { senderId: 'B', minDelayMs: 0, limit: 2 })).allowed).toBe(true);
  });

  it('claims the Slack notice exactly once per sender/window', async () => {
    const claims = await Promise.all(Array.from({ length: 10 }, () => claimRateLimitNotice(redis, 'sx', 42)));
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await claimRateLimitNotice(redis, 'sx', 43)).toBe(true);
  });
});
