import { env } from '../config/env';

export interface GoogleProfile {
  sub: string;
  name: string;
  email: string;
  picture?: string;
  email_verified?: boolean;
}

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

export const googleConfigured = (): boolean =>
  Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

export function googleAuthorizeUrl(
  state: string,
  redirectUri = env.GOOGLE_CALLBACK_URL,
): string {
  const u = new URL(GOOGLE_AUTH_URL);

  u.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', 'openid email profile');
  u.searchParams.set('state', state);
  u.searchParams.set('access_type', 'offline');
  u.searchParams.set('prompt', 'consent select_account');

  return u.toString();
}

export async function exchangeGoogleCode(
  code: string,
  redirectUri = env.GOOGLE_CALLBACK_URL,
): Promise<{
  profile: GoogleProfile;
  tokens: GoogleTokens;
}> {
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    const details = await tokenRes.text();
    throw new Error(`Google token exchange failed: ${details}`);
  }

  const tokens = (await tokenRes.json()) as GoogleTokens;

  const profileRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
    },
  });

  if (!profileRes.ok) {
    throw new Error('Could not retrieve Google account information');
  }

  const profile = (await profileRes.json()) as GoogleProfile;

  return { profile, tokens };
}
