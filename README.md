# I am home

One tap to tell the people who worry about you that you're home. No location sharing, ever.

- **Check in** from the big button, a Telegram `/home`, a push notification action, or a secret link called by an iOS Shortcut / Android automation when your phone joins your home Wi‑Fi.
- **Rules**: "if I haven't checked in by 20:00 on weekdays, tell Mum" (recurring) or "home by 23:30 tonight" (one-off). You get a reminder before the deadline; your contacts are told only if you miss it.
- **Contacts** receive a short message on Telegram (free), email (free), SMS or WhatsApp (Pro). They don't need an account.
- **PWA**: installs on any phone, works offline for the shell, English and French.
- **Pro** via Lemon Squeezy: up to 20 contacts, SMS and WhatsApp. €2.99/month or €19 once.

## Stack

| Layer | Choice |
| --- | --- |
| Hosting | Cloudflare Workers (API + static assets), Cron Trigger every minute |
| Database | Cloudflare D1 (SQLite), migrations in `migrations/` |
| API | [Hono](https://hono.dev), TypeScript, no ORM |
| Front end | Vite + vanilla TypeScript, no framework, ~24 KB gzipped |
| Auth | Email magic links (Resend), cookie sessions stored in D1 |
| Messaging | Telegram Bot API, Resend, Twilio (SMS/WhatsApp), Web Push (VAPID) |
| Billing | Lemon Squeezy webhooks (handles EU VAT) |
| Tests | Vitest (scheduling, messages, billing) and Playwright (full flows) |

## Layout

```
src/shared/     types, scheduling maths, message templates (used by worker, app and tests)
src/worker/     Hono app: auth, check-ins, scheduler, channels, Telegram + Lemon Squeezy webhooks
src/app/        the PWA: router, i18n, screens, service worker
migrations/     D1 schema
tests/unit      vitest
tests/e2e       Playwright, runs against `wrangler dev`
scripts/        VAPID key generation, Telegram webhook setup
docs/DEPLOY.md  step-by-step production setup
```

## Develop

```sh
npm install
npm run db:migrate:local      # create the local D1 database
npm run build                 # typecheck + build the PWA into dist/
npm run dev                   # wrangler dev on http://localhost:8787 (API + built app + cron)
```

For a live-reloading front end run `npm run dev:app` in a second terminal (Vite on :5173, proxies `/api` to :8787).

`DEV_MODE=1` (set in `wrangler.jsonc` for local dev) makes development painless:

- the sign-in link is returned by `POST /api/auth/request` and shown on the login page;
- messages that can't be sent (no provider configured) are kept in `GET /api/dev/outbox`;
- `POST /api/dev/tick?now=<ms>` runs the scheduler at an arbitrary time;
- `POST /api/dev/telegram-link` simulates a contact opening their Telegram link.

Copy `.dev.vars.example` to `.dev.vars` to try real providers locally. Remove `DEV_MODE` in production.

## Test

```sh
npm test                 # unit tests
npm run test:e2e         # Playwright (starts wrangler dev itself)
```

## Deploy

See [docs/DEPLOY.md](docs/DEPLOY.md): D1 database, secrets, Telegram webhook, Resend, Twilio, VAPID keys, Lemon Squeezy. `npm run deploy` builds and pushes the Worker; the `Deploy` GitHub Action does the same on every push to `main` once the Cloudflare secrets are set.

## How the scheduler works

Every rule stores `next_fire_at` and `next_remind_at` (UTC), computed from the user's time zone with plain `Intl` APIs (no date library). The cron runs each minute:

1. **Reminders** due now go to the user (Telegram if linked, every push subscription, otherwise email), only if there is no check-in inside the rule's window yet.
2. **Deadlines** due now are claimed atomically (the row is moved to its next occurrence in the same `UPDATE`), then either marked `ok` (a check-in within `window_hours` before the deadline exists) or `alerted` (every linked contact gets the alert, the user gets a copy). Deadlines older than 6 hours are skipped rather than alerting late.

A check-in announces itself to contacts who opted in (at most once per 30 minutes) and settles any pending one-off rule.

## API

All JSON, cookie-authenticated except where noted.

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/auth/request` | `{email, locale, tz}` → sends a magic link |
| GET | `/api/auth/verify?token=` | sets the session cookie, redirects to `/app` |
| POST | `/api/auth/logout` | |
| GET/POST | `/api/hook/:token` | **public**: check in with the secret link, `?note=` optional |
| GET | `/api/me` · PATCH `/api/me` · DELETE `/api/me` | profile, limits, checkout links |
| POST | `/api/me/hook/regenerate` · `/api/me/telegram/link` · DELETE `/api/me/telegram` | |
| GET | `/api/status` · `/api/events` | dashboard data |
| POST | `/api/checkin` | `{note?}` |
| GET/POST | `/api/contacts` · PATCH/DELETE `/api/contacts/:id` · POST `/api/contacts/:id/test` | |
| GET/POST | `/api/rules` · PATCH/DELETE `/api/rules/:id` · POST `/api/rules/:id/test` | |
| POST | `/api/push/subscribe` · `/api/push/unsubscribe` · `/api/push/test` | |
| POST | `/api/telegram/webhook` | Telegram updates (secret header checked) |
| POST | `/api/billing/webhook` | Lemon Squeezy events (HMAC checked) |

## License

MIT
