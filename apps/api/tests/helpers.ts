import crypto from 'node:crypto';
import { encrypt, randomToken, sha256 } from '../src/lib/crypto';
import { prisma } from '../src/lib/prisma';
import { redis } from '../src/lib/redis';
import { closeQueues, emailQueue, indexQueue } from '../src/queues/queues';

export async function resetAll(): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE "ScheduledEmail","EmailCampaign","Sender","SlackConnection","Session","User" CASCADE');
  await redis.flushdb();
  await emailQueue.obliterate({ force: true }).catch(() => undefined);
  await indexQueue.obliterate({ force: true }).catch(() => undefined);
}

export async function shutdown(): Promise<void> {
  await closeQueues();
  redis.disconnect();
  await prisma.$disconnect();
}

export async function makeUser(email = `user-${crypto.randomUUID().slice(0, 8)}@example.com`) {
  const user = await prisma.user.create({ data: { googleId: crypto.randomUUID(), name: 'Test User', email } });
  const token = randomToken();
  await prisma.session.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 3600_000) } });
  const sender = await makeSender(user.id);
  return { user, token, sender };
}

export async function makeSender(userId: string, over: Partial<{ hourlyLimit: number; active: boolean; email: string }> = {}) {
  return prisma.sender.create({
    data: {
      userId,
      email: over.email ?? `sender-${crypto.randomUUID().slice(0, 8)}@ethereal.email`,
      displayName: 'Sender',
      smtpHost: 'smtp.ethereal.email',
      smtpPort: 587,
      smtpUser: 'u',
      smtpPassEnc: encrypt('p'),
      hourlyLimit: over.hourlyLimit ?? 200,
      active: over.active ?? true,
    },
  });
}

/** Creates a campaign + one email row directly (worker tests need no API/queue). */
export async function makeEmail(opts: { userId: string; senderId: string; status?: 'scheduled' | 'queued' | 'sent'; hourlyLimit?: number; delayMs?: number }) {
  const campaign = await prisma.emailCampaign.create({
    data: {
      userId: opts.userId,
      senderId: opts.senderId,
      subject: 'Hello',
      body: 'Body',
      startAt: new Date(),
      delayBetweenMs: opts.delayMs ?? 0,
      hourlyLimit: opts.hourlyLimit ?? 100,
      recipientCount: 1,
      requestKey: crypto.randomUUID(),
    },
  });
  const key = crypto.randomUUID().replace(/-/g, '');
  return prisma.scheduledEmail.create({
    data: {
      campaignId: campaign.id,
      senderId: opts.senderId,
      userId: opts.userId,
      recipient: `to-${key.slice(0, 6)}@example.com`,
      subject: 'Hello',
      body: 'Body',
      position: 0,
      scheduledAt: new Date(),
      status: opts.status ?? 'queued',
      idempotencyKey: key,
      queueJobId: key,
    },
  });
}
