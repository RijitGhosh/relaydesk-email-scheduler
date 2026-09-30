import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { emailQueue } from '../src/queues/queues';
import { scheduleEmails } from '../src/services/email.service';
import { estimateCompletion } from '../src/lib/planner';
import { makeUser, resetAll, shutdown } from './helpers';

beforeEach(resetAll);
afterAll(shutdown);

const HOUR = 3_600_000;

describe('scheduling', () => {
  it('creates DB records and delayed BullMQ jobs with the right delay', async () => {
    const { user, sender } = await makeUser();
    const start = new Date(Date.now() + HOUR);
    const summary = await scheduleEmails(user.id, {
      senderId: sender.id,
      subject: 'Hi',
      body: 'Hello there',
      recipients: ['a@example.com', 'b@example.com', 'c@example.com', 'A@example.com'],
      startTime: start,
      delayBetweenEmailsMs: 2000,
      hourlyLimit: 100,
      requestId: 'req-12345678',
    });
    expect(summary.recipientCount).toBe(3); // duplicate (case-insensitive) removed
    expect(summary.duplicate).toBe(false);

    const rows = await prisma.scheduledEmail.findMany({ orderBy: { position: 'asc' } });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.status === 'queued')).toBe(true);
    expect(rows.map((r) => r.scheduledAt.getTime() - start.getTime())).toEqual([0, 2000, 4000]);

    for (const [i, row] of rows.entries()) {
      const job = await emailQueue.getJob(row.queueJobId as string);
      expect(job).toBeTruthy();
      expect(await job?.getState()).toBe('delayed');
      const expected = row.scheduledAt.getTime() - Date.now();
      expect(Math.abs((job?.delay ?? 0) - expected)).toBeLessThan(3000);
      expect(i).toBe(row.position);
    }
    expect((await emailQueue.getJobCounts('delayed')).delayed).toBe(3);
  });

  it('is idempotent for a repeated request (no duplicate rows or jobs)', async () => {
    const { user, sender } = await makeUser();
    const input = { senderId: sender.id, subject: 'Hi', body: 'Body', recipients: ['a@example.com', 'b@example.com'], startTime: new Date(Date.now() + HOUR), delayBetweenEmailsMs: 1000, hourlyLimit: 50, requestId: 'same-request-id' };
    const first = await scheduleEmails(user.id, input);
    const second = await scheduleEmails(user.id, input);
    expect(second.duplicate).toBe(true);
    expect(second.campaignId).toBe(first.campaignId);
    expect(await prisma.scheduledEmail.count()).toBe(2);
    expect((await emailQueue.getJobCounts('delayed')).delayed).toBe(2);
  });

  it('rejects a past start time and a foreign/unknown sender', async () => {
    const { user, sender } = await makeUser();
    const other = await makeUser();
    const base = { subject: 's', body: 'b', recipients: ['a@example.com'], delayBetweenEmailsMs: 0, hourlyLimit: 10 };
    await expect(scheduleEmails(user.id, { ...base, senderId: sender.id, startTime: new Date(Date.now() - HOUR) })).rejects.toThrow(/future/);
    await expect(scheduleEmails(user.id, { ...base, senderId: other.sender.id, startTime: new Date(Date.now() + HOUR) })).rejects.toThrow(/sender/i);
  });

  it('estimates completion across hourly windows', () => {
    const start = new Date(Math.floor(Date.now() / HOUR) * HOUR + 10 * 60_000);
    const done = estimateCompletion(start, 25, 1000, 10);
    expect(done.getTime()).toBeGreaterThanOrEqual(start.getTime() + 2 * HOUR - 10 * 60_000);
  });
});
