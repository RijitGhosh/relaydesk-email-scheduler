import { htmlToText } from '../lib/html';
import { prisma } from '../lib/prisma';
import { bulkIndex, EmailDoc } from './client';

export async function indexEmailsById(ids: string[]): Promise<number> {
  const rows = await prisma.scheduledEmail.findMany({ where: { id: { in: ids } }, include: { sender: { select: { email: true } } } });
  const docs: EmailDoc[] = rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    campaignId: r.campaignId,
    senderId: r.senderId,
    senderEmail: r.sender.email,
    recipient: r.recipient,
    subject: r.subject,
    body: htmlToText(r.body),
    status: r.status,
    scheduledAt: r.scheduledAt.toISOString(),
    sentAt: r.sentAt ? r.sentAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));
  await bulkIndex(docs);
  return docs.length;
}
