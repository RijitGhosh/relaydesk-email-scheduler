# RelayDesk

> Reliable email delivery, without the guesswork.

RelayDesk is a full-stack email scheduling and delivery dashboard. Schedule thousands of emails from a CSV, send them through per-sender Ethereal SMTP accounts with a **distributed hourly rate limit** and **minimum send spacing**, survive restarts without double-sending, search everything with Elasticsearch, and watch the queue live in Bull Board. Rate-limit events alert you in Slack.

## Architecture

```mermaid
flowchart LR
  Web[Next.js dashboard] -->|/api proxy, cookie session| API[Express API]
  API --> PG[(PostgreSQL<br/>source of truth)]
  API -->|delayed jobs| Redis[(Redis / BullMQ)]
  Worker[BullMQ worker x N] -->|pull jobs| Redis
  Worker -->|CAS claim + status| PG
  Worker -->|Lua: slot + hourly cap| Redis
  Worker -->|SMTP| Ethereal[Ethereal]
  Worker -->|index queue, retried| ES[(Elasticsearch)]
  Worker -->|chat.postMessage| Slack
  API -->|search| ES
  API --> BullBoard[/admin/queues/]
```

Modular monolith plus a separate worker process. In `apps/api/src`: `routes -> controllers -> services -> prisma`, `queues/` (BullMQ + Lua limiter), `workers/` (job processors), `integrations/` (Google, Slack, mailer), `elasticsearch/`.

## Requirement map

| Requirement | Where |
|---|---|
| Delayed scheduling, no cron | `services/email.service.ts` -> `queues/enqueue.ts` (BullMQ `delay`) |
| Restart persistence | Redis AOF + Postgres state + `services/reconcile.service.ts` |
| Idempotency | `workers/email.processor.ts` (CAS claim), unique `idempotencyKey`, stable `Message-ID` |
| Worker concurrency | `WORKER_CONCURRENCY` -> BullMQ `Worker({ concurrency })` |
| Min delay between sends | Redis "next slot" reservation, `queues/rate-limiter.ts` |
| Hourly limit per sender | same Lua script, key `email-rate:{senderId}:{epochHour}` |
| Rate-limit reschedule | `moveToDelayed` to next window; DB row preserved |
| Slack alert (deduped) | `integrations/slack.ts`, key `slack-rate-limit-notified:{sender}:{window}` |
| Elasticsearch | index `relaydesk-emails`, `GET /api/emails/search` |
| Bull Board | `/admin/queues` (session-protected, optional `ADMIN_EMAILS`) |
| Google OAuth | `integrations/google.ts`, `controllers/auth.controller.ts` |
| Ethereal | `integrations/mailer.ts` (auto-provisioned accounts) |

### Frontend features (matches the supplied Figma)

| Requirement | Where |
|---|---|
| Google login (real OAuth) + email/password login and sign-up | `app/login/page.tsx`, `controllers/auth.controller.ts` |
| Sidebar with user name, email, avatar, menu (Senders, Slack, Queue, Bull Board, theme, logout) | `components/layout/app-shell.tsx` |
| Scheduled / Sent lists with live counts, search (Elasticsearch), status filter, refresh, pagination, loading + empty + error states, star | `components/emails/mailbox.tsx` |
| Email detail view (rendered HTML body, Ethereal preview link, cancel a queued email) | `app/(app)/email/[id]/page.tsx` |
| Compose: From, To chips (+N), Upload List (CSV/TXT, detected count), Subject, delay, hourly limit, rich-text editor, Send Later popover, completion estimate | `app/(app)/compose/page.tsx`, `components/compose/*` |
| Dark/light/system theme (persisted) | account menu, `next-themes` |
| Toasts, confirm dialog, responsive layout, keyboard/ARIA support | `components/ui/*` |

## Prerequisites

Node 20+ (tested on 22), npm 10+, Docker with Compose v2.

## Setup

```bash
# 1. Install
npm install

# 2. Config
cp .env.example .env
#    set SESSION_SECRET (32+ random chars) and the Google (+ Slack) credentials, see below

# 3. Infrastructure: Postgres, Redis (AOF), Elasticsearch
npm run infra:up

# 4. Database
npm run db:generate
npm run db:deploy

# 5. Run (three processes)
npm run dev:api        # terminal 1 -> http://localhost:4000
npm run dev:worker     # terminal 2 -> health on :4001/health
npm run dev:web        # terminal 3 -> http://localhost:3000
# or everything at once: npm run dev
```

Open http://localhost:3000 and sign in with Google.

Production: `npm run build`, then `npm run start` (API + worker + web). Set `NODE_ENV=production`, HTTPS URLs and a strong `SESSION_SECRET`; cookies become `Secure`.

## Google OAuth setup

1. https://console.cloud.google.com -> create or select a project.
2. **APIs & Services -> OAuth consent screen**: user type *External*, fill the app name (RelayDesk) and emails, add yourself under **Test users**.
3. **Credentials -> Create credentials -> OAuth client ID -> Web application**.
4. **Authorized redirect URI**: `http://localhost:4000/api/auth/google/callback`
5. Put the Client ID and secret in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env`, restart the API.

## Slack OAuth setup

1. https://api.slack.com/apps -> **Create New App -> From scratch**.
2. **OAuth & Permissions -> Redirect URLs**: add `http://localhost:4000/api/slack/callback`. If Slack requires HTTPS, run `ngrok http 4000`, use the https URL here and in `SLACK_REDIRECT_URI`, and set `BACKEND_URL` to it.
3. **Bot Token Scopes**: `chat:write`, `im:write`.
4. **Basic Information**: copy Client ID / Secret into `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET`, restart the API.
5. In RelayDesk open **Slack -> Connect Slack**. Alerts arrive as a DM from the app to the user who authorized it.

## Ethereal

[Ethereal](https://ethereal.email) is a fake SMTP service: mail is captured, never delivered. RelayDesk creates a real Ethereal account per sender with `nodemailer.createTestAccount()` (needs internet). Each sent email stores its preview URL, shown in the Sent tab. To use one fixed account for your default sender, fill `ETHEREAL_HOST/PORT/USER/PASSWORD`. SMTP passwords and Slack tokens are AES-256-GCM encrypted at rest.

## Environment variables

See `.env.example`. Validated with Zod at startup; the process exits with a clear message if invalid. Key knobs: `WORKER_CONCURRENCY` (default 5), `MIN_SEND_DELAY_MS` (default 2000, a floor on top of the per-campaign delay), `MAX_EMAILS_PER_HOUR_PER_SENDER` (default cap for new senders; editable per sender).

## How it works

### Scheduling
`POST /api/emails/schedule` validates, creates a campaign and one `ScheduledEmail` row per recipient (status `scheduled`, deterministic `idempotencyKey`) in one transaction, adds BullMQ **delayed** jobs (`delay = scheduledAt - now`, `jobId = idempotencyKey`), then flips rows to `queued`. Email *i* is planned at `start + i * delay`. That is the **initial desired schedule**; at execution time the Redis limiter is authoritative, so sends can land later.

### Persistence / restart
Postgres holds state; Redis (AOF on) holds delayed jobs. Restart the worker or API and nothing is lost. On worker start, `reconcileQueue()` releases rows stuck in `processing` after a crash and re-creates any `scheduled/queued` row whose BullMQ job is missing (crash between insert and enqueue, or Redis wiped).

### Idempotency
1. Unique `idempotencyKey = sha256(user:requestId:recipient)`, used as the BullMQ `jobId` too: repeated API calls create nothing new (the UI sends a stable `requestId`).
2. The worker skips `sent / cancelled / failed` rows.
3. Send ownership is a compare-and-swap: `UPDATE ... SET status='processing' WHERE id=? AND status IN ('scheduled','queued')` (or a stale `processing` row older than 10 min). Only one worker gets `count = 1`.
4. Stable SMTP `Message-ID` derived from the key, so the unavoidable crash-after-SMTP-before-DB-write window is deduplicable by receivers. SMTP cannot be exactly-once; this is at-least-once with strong dedupe.

### Concurrency
`WORKER_CONCURRENCY` jobs run in parallel per worker process; run more processes to scale. All coordination goes through Redis/Postgres.

### Minimum send delay + hourly limit (one atomic Lua script)
`reserveSendSlot` runs one Lua script per attempt, using Redis `TIME`: `slot = max(now, sender-next-send)`; window = `floor(slot / 1h)`; if `email-rate:{sender}:{window} >= limit` then deny and defer to the next hour boundary; otherwise `INCR` the counter and set `sender-next-send = slot + minDelay`. The worker waits for the slot it reserved. Because both constraints are decided atomically, any number of workers or 1000 simultaneously-ready jobs cannot exceed the cap or the spacing. Failed sends refund their quota unit.

Trade-offs: a worker holds a concurrency slot while waiting (bounded by `concurrency x delay`); windows are fixed UTC hours, not sliding; Redis Cluster would need hash-tagged keys.

### Rate-limit behaviour
On deny the row returns to `queued` with `deferredUntil`, the job is moved (`moveToDelayed`) to the next window, other senders are unaffected (per-sender keys), and one Slack DM is sent per sender per window (`SET NX EX`). Nothing is dropped or failed. BullMQ orders delayed jobs by timestamp then insertion, so order is kept approximately, never at the cost of correctness.

### Retries
5 attempts, exponential backoff (5 s base). SMTP 5xx, `EENVELOPE` and `EAUTH` are permanent (`UnrecoverableError`, marked `failed`). Every retry goes through the same claim + limiter path.

### Elasticsearch
Index `relaydesk-emails` (created on first use). Every state change enqueues an **index job** on a separate BullMQ queue (10 retries with backoff) that re-reads the row from Postgres and upserts it. If ES is down the scheduler is unaffected, index jobs retry until it returns, `/api/health` reports `degraded`, and `npm run es:reindex` rebuilds the index from Postgres. Search (`GET /api/emails/search?q=&tab=`) queries ES, then hydrates rows from Postgres so statuses are never stale. Trade-off: search is eventually consistent by a few seconds.

### Load: 1000+ emails at once
No per-email timers: 1000 delayed jobs sit in one Redis sorted set. When due, workers pull `concurrency` at a time, each atomically reserves a slot, over-limit jobs are moved to the next hour. Postgres writes are batched (`createMany`, chunked `addBulk`).

### Security
Server-side Google auth-code flow with a state nonce (cookie + Redis). Sessions are random 256-bit tokens stored hashed in Postgres, `HttpOnly`, `SameSite=Lax`, `Secure` in production; logout deletes the row. CSRF: SameSite plus an Origin check on non-GET. Helmet, CORS allow-list, Zod on every input, secrets server-side only, log redaction. Bull Board requires a session (and membership in `ADMIN_EMAILS` if set).

## API

All responses are `{ success, data }` or `{ success: false, error: { code, message } }`.

`GET /api/health` · `POST /api/auth/register` · `POST /api/auth/login` · `GET /api/auth/google` · `GET /api/auth/google/callback` · `GET /api/auth/me` · `POST /api/auth/logout` · `POST /api/emails/schedule` · `GET /api/emails/scheduled|sent?page&pageSize&status` · `GET /api/emails/search?q&tab` · `GET /api/emails/stats` · `GET /api/emails/:id` · `POST /api/emails/:id/star` · `POST /api/emails/:id/cancel` · `GET /api/campaigns` · `GET|POST /api/senders` · `PATCH /api/senders/:id` · `GET /api/slack/connect|callback|status` · `POST /api/slack/disconnect` · `/admin/queues`

## Testing

```bash
npm run infra:up
# one-time: test database
docker compose -f infra/docker-compose.yml exec postgres psql -U relaydesk -c 'CREATE DATABASE relaydesk_test;'
DATABASE_URL=postgresql://relaydesk:relaydesk@localhost:5432/relaydesk_test npm run db:deploy
npm test
npm run lint && npm run typecheck
```

Tests need Postgres and Redis (they use DB `relaydesk_test` and Redis db 1). 33 tests cover scheduling (rows, delayed jobs and delays, duplicate request), idempotency (already-sent skip, concurrent processors send once), rate limiting (50 concurrent workers yield exactly `limit`, next-hour deferral, spacing, per-sender scope, Slack dedupe), the worker (success, permanent and transient failure, quota refund), and the API (validation, Google-independent email/password auth with throttling, HTML sanitising, tenant isolation, CSRF, logout, Bull Board protection, degraded health, search fallback).

## Demo (about 5 minutes)

1. `npm run infra:up`, then `npm run dev`.
2. Sign in with Google, toggle the theme.
3. **Slack -> Connect Slack**.
4. Account menu -> **Senders**: set the hourly limit to 3.
5. **Compose**: click *Upload List* with `sample-leads.example.csv` (shows "5 valid email addresses detected"), set delay 2 s, hourly limit 3, click the clock icon -> pick a time about 1 minute ahead -> Done -> **Send Later**.
6. Sidebar -> Scheduled (orange time pills); open **Bull Board** and show the delayed jobs.
7. Stop the worker before the start time and restart it: jobs are still there.
8. Watch the Sent tab and open an Ethereal preview link.
9. With limit 3 and 5 leads: 3 send, 2 show "Rate-limited -> next hour", and one Slack DM arrives.
10. Search a recipient (Elasticsearch).

## Troubleshooting

* `Invalid environment configuration`: fix the listed variables in `.env`.
* Google `redirect_uri_mismatch`: the URI must equal `GOOGLE_CALLBACK_URL` exactly.
* Sender creation fails: Ethereal needs internet, or fill `ETHEREAL_*`.
* Nothing sends: is `npm run dev:worker` running? `GET /api/health` should show `workers >= 1`.
* Search returns nothing: Elasticsearch may still be starting; run `npm run es:reindex`.
* Elasticsearch exits on Linux: `sudo sysctl -w vm.max_map_count=262144`.

## Assumptions and limitations

* Email/password accounts are an addition for the Figma's login form; passwords use scrypt and login is throttled in Redis. Google login links to an existing account with the same email.
* Message bodies are authored in a lightweight rich-text editor; the HTML is sanitised server-side (allow-list) before storing/sending, and a plain-text alternative is generated.
* Not implemented from the Figma: file attachments (paperclip) and archive/trash-to-archive. The trash icon on a scheduled email cancels it.
* If Elasticsearch is unreachable, search falls back to a Postgres `ILIKE` query (the UI says so) instead of failing.

* Slack alerts are DMs to the user who connected the workspace.
* Hourly windows are fixed UTC hours; the sender limit is a ceiling that a campaign can only lower.
* SMTP delivery is at-least-once (see Idempotency).
* Ethereal never delivers to real inboxes, by design.
