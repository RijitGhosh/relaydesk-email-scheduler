import type { Redis } from 'ioredis';

/**
 * Atomic "reserve the next send slot" script. It fuses two constraints in ONE Redis round-trip so no
 * interleaving of workers can violate either one:
 *
 *  1. Minimum spacing between sends of the same sender (sender-next-send:{senderId})
 *  2. Hourly cap per sender, counted in the hour-window the reserved slot falls in
 *     (email-rate:{senderId}:{epochHour})
 *
 * The clock is Redis' own TIME so workers with skewed clocks agree.
 *
 * KEYS[1] = next-slot key
 * ARGV    = minDelayMs, limit, ratePrefix
 * Returns { allowed(1|0), waitMsOrDeferMs, countInWindow, windowIndex }
 */
const RESERVE_SLOT_LUA = `
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local minDelay = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local prefix = ARGV[3]
local windowMs = 3600000

local nextAt = redis.call('GET', KEYS[1])
if not nextAt then nextAt = 0 else nextAt = tonumber(nextAt) end

local slot = now
if nextAt > slot then slot = nextAt end

local windowIdx = math.floor(slot / windowMs)
local rateKey = prefix .. ':' .. windowIdx
local count = redis.call('GET', rateKey)
if not count then count = 0 else count = tonumber(count) end

if count >= limit then
  return { 0, (windowIdx + 1) * windowMs - now, count, windowIdx }
end

count = redis.call('INCR', rateKey)
redis.call('EXPIRE', rateKey, 7200)
redis.call('SET', KEYS[1], slot + minDelay, 'PX', (slot + minDelay - now) + 7200000)
return { 1, slot - now, count, windowIdx }
`;

declare module 'ioredis' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface RedisCommander<Context> {
    rdReserveSlot(nextKey: string, minDelayMs: number, limit: number, ratePrefix: string): Promise<number[]>;
  }
}

const registered = new WeakSet<Redis>();
function register(client: Redis): void {
  if (registered.has(client)) return;
  client.defineCommand('rdReserveSlot', { numberOfKeys: 1, lua: RESERVE_SLOT_LUA });
  registered.add(client);
}

export type SlotReservation =
  | { allowed: true; waitMs: number; count: number; windowIndex: number }
  | { allowed: false; deferMs: number; count: number; windowIndex: number };

export async function reserveSendSlot(
  client: Redis,
  opts: { senderId: string; minDelayMs: number; limit: number },
): Promise<SlotReservation> {
  register(client);
  const [allowed, ms, count, windowIndex] = await client.rdReserveSlot(
    `sender-next-send:${opts.senderId}`,
    opts.minDelayMs,
    opts.limit,
    `email-rate:${opts.senderId}`,
  );
  if (allowed === 1) {
    return { allowed: true, waitMs: Math.max(0, ms ?? 0), count: count ?? 0, windowIndex: windowIndex ?? 0 };
  }
  return { allowed: false, deferMs: Math.max(1, ms ?? 1), count: count ?? 0, windowIndex: windowIndex ?? 0 };
}

/** Only the first caller per sender+window gets `true` — used to send ONE Slack alert. */
export async function claimRateLimitNotice(client: Redis, senderId: string, windowIndex: number): Promise<boolean> {
  const res = await client.set(`slack-rate-limit-notified:${senderId}:${windowIndex}`, '1', 'EX', 7200, 'NX');
  return res === 'OK';
}

const RELEASE_LUA = `
local c = redis.call('GET', KEYS[1])
if c and tonumber(c) > 0 then return redis.call('DECR', KEYS[1]) end
return 0
`;

/** Refund a reserved hourly slot when the SMTP send did not actually go out, so failed attempts never eat quota. */
export async function releaseSendSlot(client: Redis, senderId: string, windowIndex: number): Promise<void> {
  await client.eval(RELEASE_LUA, 1, `email-rate:${senderId}:${windowIndex}`);
}
