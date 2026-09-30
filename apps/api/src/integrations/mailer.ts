import nodemailer, { Transporter } from 'nodemailer';
import type { Sender } from '@prisma/client';
import { decrypt } from '../lib/crypto';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
  messageId: string;
}
export interface SentMail {
  messageId: string;
  previewUrl: string | null;
}
export type SenderTransportConfig = Pick<Sender, 'id' | 'email' | 'displayName' | 'smtpHost' | 'smtpPort' | 'smtpUser' | 'smtpPassEnc' | 'updatedAt'>;

const cache = new Map<string, Transporter>();

function transportFor(sender: SenderTransportConfig): Transporter {
  const key = `${sender.id}:${sender.updatedAt.getTime()}`;
  let t = cache.get(key);
  if (!t) {
    t = nodemailer.createTransport({
      host: sender.smtpHost,
      port: sender.smtpPort,
      secure: sender.smtpPort === 465,
      auth: { user: sender.smtpUser, pass: decrypt(sender.smtpPassEnc) },
    });
    cache.set(key, t);
  }
  return t;
}

export async function sendViaSender(sender: SenderTransportConfig, mail: OutgoingMail): Promise<SentMail> {
  const info = await transportFor(sender).sendMail({
    from: { name: sender.displayName, address: sender.email },
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    messageId: mail.messageId,
  });
  const preview = nodemailer.getTestMessageUrl(info);
  return { messageId: String(info.messageId ?? mail.messageId), previewUrl: preview ? preview : null };
}

/** Real Ethereal account provisioning (https://ethereal.email). */
export async function createEtherealAccount(): Promise<{ user: string; pass: string; host: string; port: number }> {
  const acc = await nodemailer.createTestAccount();
  return { user: acc.user, pass: acc.pass, host: acc.smtp.host, port: acc.smtp.port };
}

/** 5xx SMTP replies and auth/envelope problems will never succeed on retry. */
export function isPermanentMailError(err: unknown): boolean {
  const e = err as { responseCode?: number; code?: string };
  if (typeof e.responseCode === 'number' && e.responseCode >= 500 && e.responseCode < 600) return true;
  return e.code === 'EENVELOPE' || e.code === 'EAUTH';
}
