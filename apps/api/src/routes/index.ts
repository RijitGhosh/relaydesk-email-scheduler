import { Router } from 'express';
import * as auth from '../controllers/auth.controller';
import * as email from '../controllers/email.controller';
import { health } from '../controllers/health.controller';
import * as sender from '../controllers/sender.controller';
import * as slack from '../controllers/slack.controller';
import { asyncHandler, requireAuth } from '../middleware/auth';

export const api = Router();

api.get('/health', asyncHandler(health));

api.get('/auth/google', asyncHandler(auth.googleStart));
api.get('/auth/google/callback', asyncHandler(auth.googleCallback));
api.post('/auth/register', asyncHandler(auth.register));
api.post('/auth/login', asyncHandler(auth.login));
api.get('/auth/me', requireAuth, auth.me);
api.post('/auth/logout', requireAuth, asyncHandler(auth.logout));

api.post('/emails/schedule', requireAuth, asyncHandler(email.schedule));
api.get('/emails/scheduled', requireAuth, asyncHandler(email.listScheduled));
api.get('/emails/sent', requireAuth, asyncHandler(email.listSent));
api.get('/emails/search', requireAuth, asyncHandler(email.search));
api.get('/emails/stats', requireAuth, asyncHandler(email.stats));
api.get('/emails/:id', requireAuth, asyncHandler(email.detail));
api.post('/emails/:id/star', requireAuth, asyncHandler(email.star));
api.post('/emails/:id/cancel', requireAuth, asyncHandler(email.cancel));
api.get('/campaigns', requireAuth, asyncHandler(email.campaigns));

api.get('/senders', requireAuth, asyncHandler(sender.list));
api.post('/senders', requireAuth, asyncHandler(sender.create));
api.patch('/senders/:id', requireAuth, asyncHandler(sender.update));

api.get('/slack/connect', requireAuth, asyncHandler(slack.connect));
api.get('/slack/callback', asyncHandler(slack.callback));
api.get('/slack/status', requireAuth, asyncHandler(slack.status));
api.post('/slack/disconnect', requireAuth, asyncHandler(slack.disconnect));
