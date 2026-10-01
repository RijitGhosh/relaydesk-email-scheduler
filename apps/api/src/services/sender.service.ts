import { Prisma, Sender } from '@prisma/client';
import { env } from '../config/env';
import { createEtherealAccount } from '../integrations/mailer';
import { encrypt } from '../lib/crypto';
import { conflict, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';

export interface SenderDto {
  id: string;
  provider: string;
  email: string;
  displayName: string;
  active: boolean;
  hourlyLimit: number;
  smtpHost: string;
  createdAt: Date;
}

export const toSenderDto = (s: Sender): SenderDto => ({
  id: s.id,
  provider: s.provider,
  email: s.email,
  displayName: s.displayName,
  active: s.active,
  hourlyLimit: s.hourlyLimit,
  smtpHost: s.smtpHost,
  createdAt: s.createdAt,
});

export async function listSenders(userId: string): Promise<SenderDto[]> {
  const rows = await prisma.sender.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  return rows.map(toSenderDto);
}

export interface CreateSenderInput {
  displayName: string;
  hourlyLimit?: number;
  email?: string;
  smtp?: { host: string; port: number; user: string; pass: string };
}

/** Creates a real Ethereal SMTP account unless explicit SMTP credentials are supplied. */
export async function createSender(userId: string, input: CreateSenderInput): Promise<SenderDto> {
  const creds = input.smtp
    ? { host: input.smtp.host, port: input.smtp.port, user: input.smtp.user, pass: input.smtp.pass }
    : await createEtherealAccount();
  const email = (input.email ?? ('user' in creds ? creds.user : '')).toLowerCase();
  try {
    const row = await prisma.sender.create({
      data: {
        userId,
        email,
        displayName: input.displayName,
        smtpHost: creds.host,
        smtpPort: creds.port,
        smtpUser: creds.user,
        smtpPassEnc: encrypt(creds.pass),
        hourlyLimit: input.hourlyLimit ?? env.MAX_EMAILS_PER_HOUR_PER_SENDER,
      },
    });
    return toSenderDto(row);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw conflict('A sender with this email already exists');
    throw err;
  }
}

export async function updateSender(userId: string, id: string, patch: { active?: boolean; hourlyLimit?: number; displayName?: string }): Promise<SenderDto> {
  const existing = await prisma.sender.findFirst({ where: { id, userId } });
  if (!existing) throw notFound('Sender not found');
  const row = await prisma.sender.update({ where: { id }, data: patch });
  return toSenderDto(row);
}

/** First login convenience: use env Ethereal credentials if provided, otherwise mint a new Ethereal account. */
export async function ensureDefaultSender(userId: string, name: string): Promise<void> {
  const count = await prisma.sender.count({ where: { userId } });
  if (count > 0) return;
  if (env.ETHEREAL_USER && env.ETHEREAL_PASSWORD && env.ETHEREAL_HOST) {
    await createSender(userId, {
      displayName: name,
      email: env.ETHEREAL_USER,
      smtp: { host: env.ETHEREAL_HOST, port: env.ETHEREAL_PORT, user: env.ETHEREAL_USER, pass: env.ETHEREAL_PASSWORD },
    });
    return;
  }
  await createSender(userId, { displayName: name });
}
