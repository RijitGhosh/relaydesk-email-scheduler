import { Request, Response } from 'express';
import { env, isProd } from '../config/env';
import { exchangeGoogleCode, googleAuthorizeUrl, googleConfigured } from '../integrations/google';
import { randomToken } from '../lib/crypto';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { redis } from '../lib/redis';
import { createSession, destroySession, loginWithPassword, registerWithPassword, SESSION_COOKIE, upsertGoogleUser } from '../services/auth.service';
import { loginSchema, registerSchema } from './schemas';

const STATE_COOKIE = 'rd_oauth_state';
const cookieBase = { httpOnly: true, sameSite: 'lax' as const, secure: isProd, path: '/' };

export async function googleStart(_req: Request, res: Response): Promise<void> {
  if (!googleConfigured()) throw new AppError(503, 'GOOGLE_NOT_CONFIGURED', 'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
  const state = randomToken(16);
  await redis.set(`oauth:google:${state}`, '1', 'EX', 600);
  res.cookie(STATE_COOKIE, state, { ...cookieBase, maxAge: 600_000 });
  res.redirect(googleAuthorizeUrl(state));
}

export async function googleCallback(req: Request, res: Response): Promise<void> {
  const { code, state, error } = req.query as Record<string, string | undefined>;
  const cookieState = (req.cookies as Record<string, string | undefined>)[STATE_COOKIE];
  res.clearCookie(STATE_COOKIE, cookieBase);
  const fail = (reason: string) => res.redirect(`${env.FRONTEND_URL}/login?error=${encodeURIComponent(reason)}`);
  if (error) return fail(error);
  if (!code || !state || state !== cookieState) return fail('invalid_state');
  const validState = await redis.del(`oauth:google:${state}`);
  if (validState !== 1) return fail('expired_state');
  try {
    const profile = await exchangeGoogleCode(code);
    const user = await upsertGoogleUser(profile);
    await startSession(res, user.id);
    logger.info({ userId: user.id }, 'user signed in');
    res.redirect(`${env.FRONTEND_URL}/`);
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'google login failed');
    fail('login_failed');
  }
}

export function me(req: Request, res: Response): void {
  const u = req.user;
  res.json({ success: true, data: { id: u?.id, name: u?.name, email: u?.email, avatarUrl: u?.avatarUrl } });
}

export async function logout(req: Request, res: Response): Promise<void> {
  if (req.sessionToken) await destroySession(req.sessionToken);
  res.clearCookie(SESSION_COOKIE, cookieBase);
  res.json({ success: true, data: { loggedOut: true } });
}

async function startSession(res: Response, userId: string): Promise<void> {
  const { token, expiresAt } = await createSession(userId);
  res.cookie(SESSION_COOKIE, token, { ...cookieBase, expires: expiresAt });
}

const publicUser = (u: { id: string; name: string; email: string; avatarUrl: string | null }) => ({ id: u.id, name: u.name, email: u.email, avatarUrl: u.avatarUrl });

/** 10 attempts / 15 min per IP+email (Redis) to blunt password guessing. */
async function throttle(req: Request, email: string): Promise<string> {
  const key = `login-attempts:${req.ip}:${email}`;
  const n = await redis.incr(key);
  if (n === 1) await redis.expire(key, 900);
  if (n > 10) throw new AppError(429, 'TOO_MANY_ATTEMPTS', 'Too many attempts. Try again in a few minutes.');
  return key;
}

export async function register(req: Request, res: Response): Promise<void> {
  const input = registerSchema.parse(req.body);
  await throttle(req, input.email);
  const user = await registerWithPassword(input);
  await startSession(res, user.id);
  logger.info({ userId: user.id }, 'user registered');
  res.status(201).json({ success: true, data: publicUser(user) });
}

export async function login(req: Request, res: Response): Promise<void> {
  const input = loginSchema.parse(req.body);
  const key = await throttle(req, input.email);
  const user = await loginWithPassword(input.email, input.password);
  await redis.del(key);
  await startSession(res, user.id);
  logger.info({ userId: user.id }, 'user signed in (password)');
  res.json({ success: true, data: publicUser(user) });
}
