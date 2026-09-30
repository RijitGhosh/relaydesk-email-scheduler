import { env } from '../config/env';

export const googleConfigured = (): boolean => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

export function googleAuthorizeUrl(state: string): string {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  u.searchParams.set('redirect_uri', env.GOOGLE_CALLBACK_URL);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', 'openid email profile');
  u.searchParams.set('state', state);
  u.searchParams.set('prompt', 'select_account');
  return u.toString();
}

export interface GoogleProfile {
  sub: string;
  name: string;
  email: string;
  picture?: string;
  email_verified?: boolean;
}

export async function exchangeGoogleCode(code: string): Promise<GoogleProfile> {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_CALLBACK_URL,
      grant_type: 'authorization_code',
    }),
  });
  const token = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!tokenRes.ok || !token.access_token) throw new Error(`Google token exchange failed: ${token.error ?? tokenRes.status}`);

  const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!infoRes.ok) throw new Error(`Google userinfo failed: ${infoRes.status}`);
  const profile = (await infoRes.json()) as GoogleProfile;
  if (!profile.sub || !profile.email) throw new Error('Google profile missing sub/email');
  return profile;
}
