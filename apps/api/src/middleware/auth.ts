import { NextFunction, Request, RequestHandler, Response } from 'express';
import { adminEmails, env } from '../config/env';
import { forbidden, unauthorized } from '../lib/errors';
import { findSession, SESSION_COOKIE } from '../services/auth.service';

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export const requireAuth: RequestHandler = asyncHandler(async (req, _res, next) => {
  const token = (req.cookies as Record<string, string | undefined>)[SESSION_COOKIE];
  if (!token) throw unauthorized();
  const session = await findSession(token);
  if (!session) throw unauthorized('Session expired');
  req.user = session.user;
  req.sessionToken = token;
  next();
});

/** Bull Board: authenticated session required; if ADMIN_EMAILS is set only those users get in. */
export const requireQueueAdmin: RequestHandler = asyncHandler(async (req, res, next) => {
  const token = (req.cookies as Record<string, string | undefined>)[SESSION_COOKIE];
  const session = token ? await findSession(token) : null;
  if (!session) {
    res.redirect(`${env.FRONTEND_URL}/login`);
    return;
  }
  if (adminEmails.length > 0 && !adminEmails.includes(session.user.email.toLowerCase())) throw forbidden('Queue dashboard is restricted to admins');
  req.user = session.user;
  next();
});
