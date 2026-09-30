import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { htmlToText, sanitizeBody } from '../src/lib/html';
import { prisma } from '../src/lib/prisma';
import { makeUser, resetAll, shutdown } from './helpers';

const app = createApp();
const origin = 'http://localhost:3000';
beforeEach(resetAll);
afterAll(shutdown);

const future = () => new Date(Date.now() + 3_600_000).toISOString();

describe('email + password auth', () => {
  it('registers, logs in, rejects wrong password, and blocks duplicates', async () => {
    const reg = await request(app).post('/api/auth/register').set('Origin', origin).send({ name: 'Ada', email: 'Ada@Example.com', password: 'correct-horse' });
    expect(reg.status).toBe(201);
    expect(reg.body.data.email).toBe('ada@example.com');
    const setCookie = (reg.headers['set-cookie'] as unknown as string[]) ?? [];
    expect(setCookie[0]).toContain('HttpOnly');
    const me = await request(app).get('/api/auth/me').set('Cookie', setCookie);
    expect(me.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: 'ada@example.com' } })).passwordHash).not.toContain('correct-horse');

    expect((await request(app).post('/api/auth/register').set('Origin', origin).send({ name: 'Ada', email: 'ada@example.com', password: 'another-pass' })).status).toBe(409);
    expect((await request(app).post('/api/auth/login').set('Origin', origin).send({ email: 'ada@example.com', password: 'wrong-password' })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').set('Origin', origin).send({ email: 'nobody@example.com', password: 'whatever12' })).status).toBe(401);
    const ok = await request(app).post('/api/auth/login').set('Origin', origin).send({ email: 'ada@example.com', password: 'correct-horse' });
    expect(ok.status).toBe(200);
  });

  it('validates short passwords and throttles brute force', async () => {
    expect((await request(app).post('/api/auth/register').set('Origin', origin).send({ name: 'A', email: 'a@example.com', password: 'short' })).status).toBe(400);
    let last = 0;
    for (let i = 0; i < 12; i += 1) last = (await request(app).post('/api/auth/login').set('Origin', origin).send({ email: 'brute@example.com', password: 'nope-nope' })).status;
    expect(last).toBe(429);
  });
});

describe('rich body + mailbox endpoints', () => {
  it('sanitises editor HTML and derives plain text', () => {
    const dirty = '<p onclick="x()">Hi <b>there</b></p><script>alert(1)</script><a href="javascript:alert(1)">bad</a><img src=x onerror=alert(1)>';
    const clean = sanitizeBody(dirty);
    expect(clean).not.toMatch(/script|onclick|onerror|javascript:|<img/i);
    expect(clean).toContain('<b>there</b>');
    expect(htmlToText('<p>A &amp; B</p><p>Line 2</p>')).toBe('A & B\nLine 2');
    expect(sanitizeBody('plain\ntext')).toBe('<p>plain<br />text</p>');
  });

  it('stores sanitised HTML, returns detail + preview, toggles star, and searches (postgres fallback when ES is down)', async () => {
    const { token, sender } = await makeUser();
    const cookie = `rd_session=${token}`;
    const sched = await request(app)
      .post('/api/emails/schedule')
      .set('Cookie', cookie)
      .send({ senderId: sender.id, subject: 'Quarterly numbers', body: '<p>Hello <b>Ava</b></p><script>steal()</script>', recipients: ['ava@example.com', 'ben@example.com'], startTime: future(), delayBetweenEmailsMs: 0, hourlyLimit: 10 });
    expect(sched.status).toBe(201);

    const list = await request(app).get('/api/emails/scheduled').set('Cookie', cookie);
    const item = list.body.data.items[0];
    expect(item.preview).toBe('Hello Ava');
    expect(item.starred).toBe(false);

    const detail = await request(app).get(`/api/emails/${item.id}`).set('Cookie', cookie);
    expect(detail.body.data.body).toBe('<p>Hello <b>Ava</b></p>');

    expect((await request(app).post(`/api/emails/${item.id}/star`).set('Cookie', cookie).send({ starred: true })).status).toBe(200);
    expect((await request(app).get(`/api/emails/${item.id}`).set('Cookie', cookie)).body.data.starred).toBe(true);

    const search = await request(app).get('/api/emails/search?q=quarterly&tab=scheduled').set('Cookie', cookie);
    expect(search.status).toBe(200);
    expect(search.body.data.total).toBe(2);
    expect(search.body.data.source).toBe('postgres');
    const byRecipient = await request(app).get('/api/emails/search?q=ben@&tab=scheduled').set('Cookie', cookie);
    expect(byRecipient.body.data.total).toBe(1);
  });

  it("cannot read or star another user's email", async () => {
    const a = await makeUser();
    const b = await makeUser();
    await request(app).post('/api/emails/schedule').set('Cookie', `rd_session=${a.token}`).send({ senderId: a.sender.id, subject: 's', body: 'b', recipients: ['x@example.com'], startTime: future(), delayBetweenEmailsMs: 0, hourlyLimit: 5 });
    const row = await prisma.scheduledEmail.findFirstOrThrow();
    expect((await request(app).get(`/api/emails/${row.id}`).set('Cookie', `rd_session=${b.token}`)).status).toBe(404);
    expect((await request(app).post(`/api/emails/${row.id}/star`).set('Cookie', `rd_session=${b.token}`).send({ starred: true })).status).toBe(404);
  });

  it('rejects an empty rich-text body', async () => {
    const { token, sender } = await makeUser();
    const res = await request(app).post('/api/emails/schedule').set('Cookie', `rd_session=${token}`).send({ senderId: sender.id, subject: 's', body: '<p><br></p>', recipients: ['x@example.com'], startTime: future(), delayBetweenEmailsMs: 0, hourlyLimit: 5 });
    expect(res.status).toBe(400);
  });
});
