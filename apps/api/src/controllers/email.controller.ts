import { Request, Response } from 'express';
import { emailQueue } from '../queues/queues';
import * as emails from '../services/email.service';
import { idParam, listQuerySchema, scheduleSchema, searchQuerySchema, starSchema } from './schemas';

const userId = (req: Request): string => (req.user as { id: string }).id;

export async function schedule(req: Request, res: Response): Promise<void> {
  const input = scheduleSchema.parse(req.body);
  const summary = await emails.scheduleEmails(userId(req), input);
  res.status(summary.duplicate ? 200 : 201).json({ success: true, data: summary });
}

export async function listScheduled(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await emails.listEmails(userId(req), 'scheduled', listQuerySchema.parse(req.query)) });
}

export async function listSent(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await emails.listEmails(userId(req), 'sent', listQuerySchema.parse(req.query)) });
}

export async function search(req: Request, res: Response): Promise<void> {
  const { q, tab, ...rest } = searchQuerySchema.parse(req.query);
  res.json({ success: true, data: await emails.searchEmails(userId(req), tab, q, rest) });
}

export async function cancel(req: Request, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  await emails.cancelEmail(userId(req), id);
  res.json({ success: true, data: { id, status: 'cancelled' } });
}

export async function stats(req: Request, res: Response): Promise<void> {
  const [byStatus, queue] = await Promise.all([
    emails.emailStats(userId(req)),
    emailQueue.getJobCounts('waiting', 'delayed', 'active', 'completed', 'failed'),
  ]);
  res.json({ success: true, data: { emails: byStatus, queue } });
}

export async function campaigns(req: Request, res: Response): Promise<void> {
  const q = listQuerySchema.parse(req.query);
  res.json({ success: true, data: await emails.listCampaigns(userId(req), q.page, q.pageSize) });
}

export async function detail(req: Request, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  res.json({ success: true, data: await emails.getEmail(userId(req), id) });
}

export async function star(req: Request, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  const { starred } = starSchema.parse(req.body);
  await emails.setStar(userId(req), id, starred);
  res.json({ success: true, data: { id, starred } });
}
