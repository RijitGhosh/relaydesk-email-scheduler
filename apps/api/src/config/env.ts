import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Loads the repo-root .env (works from apps/api or the root, on any OS). Real env vars always win.
dotenv.config({ path: [path.resolve(process.cwd(), '.env'), path.resolve(__dirname, '../../../../.env')] });

const intFromString = (def: number) =>
  z.preprocess((v) => (v === undefined || v === '' ? def : Number(v)), z.number().int());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: intFromString(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  ELASTICSEARCH_URL: z.string().default('http://localhost:9200'),
  ELASTICSEARCH_INDEX: z.string().default('relaydesk-emails'),

  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_CALLBACK_URL: z.string().default('http://localhost:4000/api/auth/google/callback'),
  GOOGLE_GMAIL_CALLBACK_URL: z.string().default('http://localhost:4000/api/auth/gmail/callback'),

  SLACK_CLIENT_ID: z.string().default(''),
  SLACK_CLIENT_SECRET: z.string().default(''),
  SLACK_REDIRECT_URI: z.string().default('http://localhost:4000/api/slack/callback'),

  ETHEREAL_HOST: z.string().default(''),
  ETHEREAL_PORT: intFromString(465),
  ETHEREAL_USER: z.string().default(''),
  ETHEREAL_PASSWORD: z.string().default(''),
  
  RESEND_API_KEY: z.string().default(''),
  RESEND_FROM_EMAIL: z.string().default('onboarding@resend.dev'),

  WORKER_CONCURRENCY: intFromString(5).pipe(z.number().min(1).max(200)),
  MIN_SEND_DELAY_MS: intFromString(2000).pipe(z.number().min(0)),
  MAX_EMAILS_PER_HOUR_PER_SENDER: intFromString(200).pipe(z.number().min(1)),
  WORKER_HEALTH_PORT: intFromString(4001),
  MAX_RECIPIENTS_PER_REQUEST: intFromString(5000),

  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters'),
  SESSION_TTL_DAYS: intFromString(7),
  ADMIN_EMAILS: z.string().default(''),

  FRONTEND_URL: z.string().default('http://localhost:3000'),
  BACKEND_URL: z.string().default('http://localhost:4000'),
  LOG_LEVEL: z.string().default('info'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
   
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const adminEmails = env.ADMIN_EMAILS.split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);
