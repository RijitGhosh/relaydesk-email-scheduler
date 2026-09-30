import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { makeUser, resetAll, shutdown } from './helpers';

const app = createApp();
beforeEach(resetAll);
afterAll(shutdown);

const future = () => new Date(Date.now() + 3_600_000).toISOString();

describe('API', () => {
  it('rejects unauthenticated access', async () => {
    const res = await request(app).post('/api/emails/schedule').send({});
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
    expect((await request(app).get('/api/emails/scheduled')).status).toBe(401);
  });

  it('protects Bull Board (redirects to login when signed out, serves it when signed in)', async () => {
    const anon = await request(app).get('/admin/queues');
    expect(anon.status).toBe(302);
    const { token } = await makeUser();
    const ok = await request(app).get('/admin/queues/').set('Cookie', `rd_session=${token}`);
    expect(ok.status).toBe(200);
  });

  it('validates the schedule payload with Zod', async () => {
    const { token, sender } = await makeUser();
    const res = await request(app)
      .post('/api/emails/schedule')
      .set('Cookie', `rd_session=${token}`)
      .send({ senderId: sender.id, subject: '', body: 'x', recipients: ['not-an-email'], startTime: future(), delayBetweenEmailsMs: 1000, hourlyLimit: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('schedules emails for an authenticated user and lists them with pagination', async () => {
    const { token, sender } = await makeUser();
    const res = await request(app)
      .post('/api/emails/schedule')
      .set('Cookie', `rd_session=${token}`)
      .send({ senderId: sender.id, subject: 'Hello', body: 'Body', recipients: ['a@example.com', 'b@example.com', 'c@example.com'], startTime: future(), delayBetweenEmailsMs: 2000, hourlyLimit: 100 });
    expect(res.status).toBe(201);
    expect(res.body.data.recipientCount).toBe(3);

    const list = await request(app).get('/api/emails/scheduled?page=1&pageSize=2').set('Cookie', `rd_session=${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toMatchObject({ total: 3, page: 1, pageSize: 2, totalPages: 2 });
    expect(list.body.data.items).toHaveLength(2);
    expect(list.body.data.items[0].status).toBe('queued');
  });

  it("does not leak another user's emails", async () => {
    const a = await makeUser();
    const b = await makeUser();
    await request(app)
      .post('/api/emails/schedule')
      .set('Cookie', `rd_session=${a.token}`)
      .send({ senderId: a.sender.id, subject: 'Hello', body: 'Body', recipients: ['a@example.com'], startTime: future(), delayBetweenEmailsMs: 0, hourlyLimit: 10 });
    const list = await request(app).get('/api/emails/scheduled').set('Cookie', `rd_session=${b.token}`);
    expect(list.body.data.total).toBe(0);
  });

  it('blocks cross-origin state-changing requests', async () => {
    const { token } = await makeUser();
    const res = await request(app).post('/api/auth/logout').set('Cookie', `rd_session=${token}`).set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
  });

  it('logout invalidates the session server-side', async () => {
    const { token } = await makeUser();
    const cookie = `rd_session=${token}`;
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(200);
    expect((await request(app).post('/api/auth/logout').set('Cookie', cookie).set('Origin', 'http://localhost:3000')).status).toBe(200);
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
    expect(await prisma.session.count()).toBe(0);
  });

  it('health reports degraded (not down) when only Elasticsearch is unavailable', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ postgres: 'up', redis: 'up', elasticsearch: 'down', status: 'degraded' });
  });

  it('cancels a queued email and refuses to cancel a sent one', async () => {
    const { token, sender } = await makeUser();
    await request(app)
      .post('/api/emails/schedule')
      .set('Cookie', `rd_session=${token}`)
      .send({ senderId: sender.id, subject: 'Hello', body: 'Body', recipients: ['a@example.com', 'b@example.com'], startTime: future(), delayBetweenEmailsMs: 0, hourlyLimit: 10 });
    const [first, second] = await prisma.scheduledEmail.findMany({ orderBy: { position: 'asc' } });
    const ok = await request(app).post(`/api/emails/${first?.id}/cancel`).set('Cookie', `rd_session=${token}`);
    expect(ok.status).toBe(200);
    await prisma.scheduledEmail.update({ where: { id: second?.id }, data: { status: 'sent' } });
    const bad = await request(app).post(`/api/emails/${second?.id}/cancel`).set('Cookie', `rd_session=${token}`);
    expect(bad.status).toBe(400);
  });
});
