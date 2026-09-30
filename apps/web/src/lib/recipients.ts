const EMAIL_RE = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;

export interface ParsedRecipients {
  valid: string[];
  invalid: string[];
  duplicates: number;
}

/**
 * Works for any CSV layout (single column, many columns, quoted fields, semicolons) and plain TXT:
 * the text is tokenised and every token containing "@" is validated. Runs entirely in the browser.
 */
export function parseRecipients(text: string): ParsedRecipients {
  const tokens = text.replace(/^\uFEFF/, '').split(/[\s,;|\t"<>()[\]{}]+/);
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  let duplicates = 0;
  for (const raw of tokens) {
    const t = raw.trim().replace(/^[.'-]+|[.'-]+$/g, '');
    if (!t.includes('@')) continue;
    const email = t.toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) {
      invalid.push(raw.trim());
      continue;
    }
    if (seen.has(email)) {
      duplicates += 1;
      continue;
    }
    seen.add(email);
    valid.push(email);
  }
  return { valid, invalid, duplicates };
}

const HOUR_MS = 3_600_000;
/** Mirrors the API planner: initial estimate once the hourly cap is applied (UTC hour windows). */
export function estimateCompletion(startMs: number, count: number, delayMs: number, hourlyLimit: number): number {
  const perWindow = new Map<number, number>();
  let cursor = startMs;
  let last = startMs;
  for (let i = 0; i < count; i += 1) {
    let slot = Math.max(cursor, startMs + i * delayMs);
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
  return last;
}
