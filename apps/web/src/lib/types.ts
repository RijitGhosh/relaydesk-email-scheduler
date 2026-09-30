export type EmailStatus = 'scheduled' | 'queued' | 'processing' | 'sent' | 'failed' | 'cancelled';

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

export interface Sender {
  id: string;
  email: string;
  displayName: string;
  active: boolean;
  hourlyLimit: number;
  smtpHost: string;
  createdAt: string;
}

export interface EmailItem {
  id: string;
  campaignId: string;
  recipient: string;
  subject: string;
  status: EmailStatus;
  scheduledAt: string;
  deferredUntil: string | null;
  sentAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  previewUrl: string | null;
  attempts: number;
  preview: string;
  starred: boolean;
  sender: { id: string; email: string; displayName: string };
}

export interface Page<T> {
  source?: 'elasticsearch' | 'postgres';
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface Stats {
  emails: Record<EmailStatus, number>;
  queue: { waiting: number; delayed: number; active: number; completed: number; failed: number };
}

export interface ScheduleSummary {
  campaignId: string;
  recipientCount: number;
  startAt: string;
  delayBetweenEmailsMs: number;
  hourlyLimit: number;
  estimatedCompletionAt: string;
  duplicate: boolean;
}

export interface SlackStatus {
  configured: boolean;
  connected: boolean;
  teamName: string | null;
  connectedAt: string | null;
}

export interface EmailDetail extends EmailItem {
  body: string;
}
