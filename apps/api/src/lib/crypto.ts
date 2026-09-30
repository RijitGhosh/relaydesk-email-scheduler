import crypto from 'node:crypto';
import { env } from '../config/env';

const key = crypto.createHash('sha256').update(`relaydesk:enc:${env.SESSION_SECRET}`).digest();

/** AES-256-GCM. Output: base64(iv | tag | ciphertext). */
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
}

export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
}

export const sha256 = (v: string): string => crypto.createHash('sha256').update(v).digest('hex');
export const randomToken = (bytes = 32): string => crypto.randomBytes(bytes).toString('hex');
