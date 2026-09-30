import { env } from '../config/env';
import { decrypt, encrypt } from '../lib/crypto';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';

const SCOPES = 'chat:write,im:write';

export const slackConfigured = (): boolean => Boolean(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET);

export function slackAuthorizeUrl(state: string): string {
  const u = new URL('https://slack.com/oauth/v2/authorize');
  u.searchParams.set('client_id', env.SLACK_CLIENT_ID);
  u.searchParams.set('scope', SCOPES);
  u.searchParams.set('redirect_uri', env.SLACK_REDIRECT_URI);
  u.searchParams.set('state', state);
  return u.toString();
}

interface SlackOAuthResponse {
  ok: boolean;
  error?: string;
  access_token?: string;
  team?: { id: string; name: string };
  authed_user?: { id: string };
}

export async function connectSlack(userId: string, code: string): Promise<{ teamName: string }> {
  const body = new URLSearchParams({
    code,
    client_id: env.SLACK_CLIENT_ID,
    client_secret: env.SLACK_CLIENT_SECRET,
    redirect_uri: env.SLACK_REDIRECT_URI,
  });
  const res = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = (await res.json()) as SlackOAuthResponse;
  if (!data.ok || !data.access_token || !data.team || !data.authed_user) {
    throw new Error(`Slack OAuth failed: ${data.error ?? 'unknown_error'}`);
  }
  const values = {
    accessTokenEnc: encrypt(data.access_token),
    slackUserId: data.authed_user.id,
    teamId: data.team.id,
    teamName: data.team.name,
  };
  await prisma.slackConnection.upsert({
    where: { userId },
    create: { userId, ...values },
    update: { ...values, connectedAt: new Date() },
  });
  logger.info({ userId, team: data.team.name }, 'slack connected');
  return { teamName: data.team.name };
}

export async function disconnectSlack(userId: string): Promise<void> {
  const conn = await prisma.slackConnection.findUnique({ where: { userId } });
  if (!conn) return;
  try {
    await fetch('https://slack.com/api/auth.revoke', {
      method: 'POST',
      headers: { Authorization: `Bearer ${decrypt(conn.accessTokenEnc)}` },
    });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'slack token revoke failed (continuing)');
  }
  await prisma.slackConnection.delete({ where: { userId } });
}

async function slackCall<T>(token: string, method: string, payload: Record<string, unknown>): Promise<T & { ok: boolean; error?: string }> {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  return (await res.json()) as T & { ok: boolean; error?: string };
}

/** Sends a real Slack DM to the user who connected the workspace. Returns false when not connected. */
export async function sendSlackMessage(userId: string, text: string): Promise<boolean> {
  const conn = await prisma.slackConnection.findUnique({ where: { userId } });
  if (!conn) return false;
  const token = decrypt(conn.accessTokenEnc);
  try {
    const opened = await slackCall<{ channel?: { id: string } }>(token, 'conversations.open', { users: conn.slackUserId });
    if (!opened.ok || !opened.channel) throw new Error(opened.error ?? 'conversations.open failed');
    const posted = await slackCall<Record<string, never>>(token, 'chat.postMessage', { channel: opened.channel.id, text });
    if (!posted.ok) throw new Error(posted.error ?? 'chat.postMessage failed');
    logger.info({ userId }, 'slack notification sent');
    return true;
  } catch (err) {
    logger.error({ userId, err: (err as Error).message }, 'slack notification failed');
    return false;
  }
}
