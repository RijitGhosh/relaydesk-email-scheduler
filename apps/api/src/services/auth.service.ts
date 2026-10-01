import { env } from '../config/env';
import { GoogleProfile } from '../integrations/google';
import { encrypt, randomToken, sha256 } from '../lib/crypto';
import { conflict, unauthorized } from '../lib/errors';
import { hashPassword, verifyPassword } from './password';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { ensureDefaultSender } from './sender.service';

export const SESSION_COOKIE = 'rd_session';

export async function upsertGoogleUser(profile: GoogleProfile, refreshToken?: string) {
  const email = profile.email.toLowerCase();
  const name = profile.name ?? profile.email;
  const avatarUrl = profile.picture ?? null;

  const gmailData = refreshToken
    ? {
        gmailEmail: email,
        gmailRefreshTokenEnc: encrypt(refreshToken),
        gmailConnectedAt: new Date(),
      }
    : {};

  let user = await prisma.user.findUnique({ where: { googleId: profile.sub } });

  if (user) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { name, avatarUrl, ...gmailData },
    });
  } else {
    const byEmail = await prisma.user.findUnique({ where: { email } });

    user = byEmail
      ? await prisma.user.update({
          where: { id: byEmail.id },
          data: {
            googleId: profile.sub,
            avatarUrl: byEmail.avatarUrl ?? avatarUrl,
            ...gmailData,
          },
        })
      : await prisma.user.create({
          data: {
            googleId: profile.sub,
            name,
            email,
            avatarUrl,
            ...gmailData,
          },
        });
  }

  provisionSender(user.id, user.name);
  return user;
}

function provisionSender(userId: string, name: string): void {
  ensureDefaultSender(userId, name).catch((err) =>
    logger.warn(
      { err: (err as Error).message },
      'default sender provisioning failed (add one from the Senders page)',
    ),
  );
}

export async function registerWithPassword(input: {
  name: string;
  email: string;
  password: string;
}) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });

  if (existing) {
    throw conflict(
      existing.passwordHash
        ? 'An account with this email already exists'
        : 'This email is registered with Google. Use "Login with Google".',
    );
  }

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash: hashPassword(input.password),
    },
  });

  provisionSender(user.id, user.name);
  return user;
}

export async function loginWithPassword(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = verifyPassword(password, user?.passwordHash);

  if (!user || !ok) {
    throw unauthorized('Invalid email or password');
  }

  return user;
}

export async function createSession(userId: string): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_DAYS * 24 * 3600 * 1000);

  await prisma.session.create({
    data: { userId, tokenHash: sha256(token), expiresAt },
  });

  return { token, expiresAt };
}

export async function findSession(token: string) {
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  return session;
}

export async function deleteSession(token: string) {
  await prisma.session.deleteMany({
    where: { tokenHash: sha256(token) },
  });
}
export async function destroySession(token: string): Promise<void> {
  await prisma.session.deleteMany({
    where: { tokenHash: sha256(token) },
  });
}
