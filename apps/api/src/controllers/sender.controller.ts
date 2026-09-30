import { Request, Response } from 'express';
import * as senders from '../services/sender.service';
import { createSenderSchema, idParam, updateSenderSchema } from './schemas';

const userId = (req: Request): string => (req.user as { id: string }).id;

export async function list(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await senders.listSenders(userId(req)) });
}
export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json({ success: true, data: await senders.createSender(userId(req), createSenderSchema.parse(req.body)) });
}
export async function update(req: Request, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  res.json({ success: true, data: await senders.updateSender(userId(req), id, updateSenderSchema.parse(req.body)) });
}
