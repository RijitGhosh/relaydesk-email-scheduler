import { Request, Response } from 'express';
import { env } from '../config/env';
import { connectSlack, disconnectSlack, slackAuthorizeUrl, slackConfigured } from '../integrations/slack';
import { randomToken } from '../lib/crypto';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { findSession, SESSION_COOKIE } from '../services/auth.service';

export async function connect(req: Request, res: Response): Promise<void> {
  if (!slackConfigured()) throw new AppError(503, 'SLACK_NOT_CONFIGURED', 'Slack OAuth is not configured. Set SLACK_CLIENT_ID and SLACK_CLIENT_SECRET.');
  const state = randomToken(16);
  await redis.set(`oauth:slack:${state}`, (req.user as { id: string }).id, 'EX', 600);
  res.redirect(slackAuthorizeUrl(state));
}

/** Callback is browser-driven: the user's session cookie must match the user that started the flow. */
export async function callback(req: Request, res: Response): Promise<void> {
  const { code, state, error } = req.query as Record<string, string | undefined>;
  const back = (q: string) => res.redirect(`${env.FRONTEND_URL}/integrations?${q}`);
  if (error) return back(`slack=error&reason=${encodeURIComponent(error)}`);
  if (!code || !state) return back('slack=error&reason=missing_params');
  const stateKey = `oauth:slack:${state}`;
  const userId = await redis.get(stateKey);
  await redis.del(stateKey);
  const token = (req.cookies as Record<string, string | undefined>)[SESSION_COOKIE];
  const session = token ? await findSession(token) : null;
  if (!userId || !session || session.userId !== userId) return back('slack=error&reason=invalid_state');
  try {
    await connectSlack(userId, code);
    back('slack=connected');
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'slack callback failed');
    back('slack=error&reason=exchange_failed');
  }
}

export async function status(req: Request, res: Response): Promise<void> {
  const conn = await prisma.slackConnection.findUnique({ where: { userId: (req.user as { id: string }).id } });
  res.json({
    success: true,
    data: {
      configured: slackConfigured(),
      connected: Boolean(conn),
      teamName: conn?.teamName ?? null,
      connectedAt: conn?.connectedAt ?? null,
    },
  });
}

export async function disconnect(req: Request, res: Response): Promise<void> {
  await disconnectSlack((req.user as { id: string }).id);
  res.json({ success: true, data: { connected: false } });
}
