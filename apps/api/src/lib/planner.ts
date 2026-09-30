const HOUR_MS = 3_600_000;

/** Initial desired schedule: email i goes out at start + i * delay. */
export function plannedTimes(start: Date, count: number, delayMs: number): Date[] {
  return Array.from({ length: count }, (_, i) => new Date(start.getTime() + i * delayMs));
}

/**
 * Estimated completion once the hourly cap is applied: walks the planned slots and pushes any email
 * that would exceed the per-hour cap into the next UTC hour window (same rule the Lua limiter uses).
 */
export function estimateCompletion(start: Date, count: number, delayMs: number, hourlyLimit: number): Date {
  const perWindow = new Map<number, number>();
  let cursor = start.getTime();
  let last = cursor;
  for (let i = 0; i < count; i += 1) {
    let slot = Math.max(cursor, start.getTime() + i * delayMs);
    for (;;) {
      const w = Math.floor(slot / HOUR_MS);
      const used = perWindow.get(w) ?? 0;
      if (used < hourlyLimit) {
        perWindow.set(w, used + 1);
        break;
      }
      slot = (w + 1) * HOUR_MS;
    }
    last = slot;
    cursor = slot + delayMs;
  }
  return new Date(last);
}
