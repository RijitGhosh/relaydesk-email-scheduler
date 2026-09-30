import crypto from 'node:crypto';

const KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEYLEN);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

const DUMMY = hashPassword('relaydesk-dummy-password');

/** Constant-time compare; also burns equal time when the account does not exist. */
export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  const [scheme, saltHex, hashHex] = (stored ?? DUMMY).split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), KEYLEN);
  return stored ? crypto.timingSafeEqual(expected, actual) : false;
}
