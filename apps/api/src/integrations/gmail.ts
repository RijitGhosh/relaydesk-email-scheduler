import { google } from 'googleapis';
import { env } from '../config/env';
import { decrypt } from '../lib/crypto';
import { prisma } from '../lib/prisma';

export async function sendViaGmail(
  userId: string,
  mail: {
    to: string;
    subject: string;
    text: string;
    html: string;
    messageId: string;
  },
): Promise<{ messageId: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      gmailEmail: true,
      gmailRefreshTokenEnc: true,
    },
  });

  if (!user?.gmailRefreshTokenEnc || !user.gmailEmail) {
    throw new Error('Gmail is not connected. Connect Gmail before sending.');
  }

  const auth = new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_CALLBACK_URL,
  );

  auth.setCredentials({
    refresh_token: decrypt(user.gmailRefreshTokenEnc),
  });

  const gmail = google.gmail({ version: 'v1', auth });

  const boundary = `relaydesk_${Date.now()}`;
  const message = [
    `To: ${mail.to}`,
    `From: ${user.gmailEmail}`,
    `Subject: ${mail.subject}`,
    `Message-ID: ${mail.messageId}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    mail.text,
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    mail.html,
    `--${boundary}--`,
  ].join('\r\n');

  const raw = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  });

  if (!result.data.id) {
    throw new Error('Gmail did not return a message ID.');
  }

  return { messageId: result.data.id };
}
