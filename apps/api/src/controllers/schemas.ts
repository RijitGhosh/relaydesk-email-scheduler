import { z } from 'zod';
import { env } from '../config/env';

export const scheduleSchema = z.object({
  senderId: z.string().uuid('Choose a valid sender'),
  subject: z.string().trim().min(1, 'Subject is required').max(300),
  body: z.string().trim().min(1, 'Body is required').max(100_000),
  recipients: z.array(z.string().trim().toLowerCase().email('Invalid recipient email')).min(1, 'At least one recipient is required').max(env.MAX_RECIPIENTS_PER_REQUEST),
  startTime: z.coerce.date(),
  delayBetweenEmailsMs: z.number().int().min(0).max(3_600_000),
  hourlyLimit: z.number().int().min(1).max(100_000),
  requestId: z.string().min(8).max(100).optional(),
});

const statusEnum = z.enum(['scheduled', 'queued', 'processing', 'sent', 'failed', 'cancelled']);

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: statusEnum.optional(),
  senderId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const searchQuerySchema = listQuerySchema.extend({
  q: z.string().trim().max(200).default(''),
  tab: z.enum(['scheduled', 'sent']).default('scheduled'),
});

export const createSenderSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  hourlyLimit: z.number().int().min(1).max(100_000).optional(),
  email: z.string().trim().email().optional(),
  smtp: z.object({ host: z.string().min(1), port: z.number().int().min(1).max(65535), user: z.string().min(1), pass: z.string().min(1) }).optional(),
});

export const updateSenderSchema = z
  .object({ active: z.boolean(), hourlyLimit: z.number().int().min(1).max(100_000), displayName: z.string().trim().min(1).max(100) })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const idParam = z.object({ id: z.string().uuid() });

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required').max(128),
});
export const starSchema = z.object({ starred: z.boolean() });
