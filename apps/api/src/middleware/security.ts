import { RequestHandler } from 'express';
import { env } from '../config/env';
import { forbidden } from '../lib/errors';

const allowedOrigins = new Set([env.FRONTEND_URL, env.BACKEND_URL].map((u) => new URL(u).origin));

/**
 * CSRF defence in depth (cookies are also SameSite=Lax): state-changing requests that carry an Origin
 * (or Referer) must come from our own frontend/backend. Non-browser clients send neither and are allowed.
 */
export const originGuard: RequestHandler = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin') ?? (req.get('referer') ? new URL(req.get('referer') as string).origin : undefined);
  if (origin && !allowedOrigins.has(origin)) return next(forbidden('Cross-origin request blocked'));
  next();
};
