# Deploying igothome

Everything runs on one Cloudflare Worker (free plan is enough to start: 100k requests/day, D1 5 GB, cron included).

## 1. Cloudflare

```sh
npx wrangler login
npx wrangler d1 create igothome
```

Paste the returned `database_id` into `wrangler.jsonc`, set `APP_URL` to your production URL (e.g. `https://igothome.<account>.workers.dev` or a custom domain) and **delete the `DEV_MODE` var**.

```sh
npx wrangler secret put SESSION_SECRET      # any long random string
npm run db:migrate                          # apply migrations to the remote D1
npm run deploy
```

Custom domain: Workers & Pages → your Worker → Settings → Domains & Routes → Add custom domain. Then update `APP_URL`.

## 2. Email sign-in (Resend)

Magic links need an email provider. [Resend](https://resend.com) gives 3,000 emails/month free.

1. Add and verify your domain (DNS records), or use the `onboarding@resend.dev` sender for tests.
2. `npx wrangler secret put RESEND_API_KEY`
3. `npx wrangler secret put EMAIL_FROM` → `igothome <hello@yourdomain.com>`

Without it, nobody can sign in (except in DEV_MODE).

## 3. Telegram bot (free channel)

1. Talk to [@BotFather](https://t.me/BotFather): `/newbot`, pick a name and a username (e.g. `IGotHomeBot`). Copy the token.
2. Secrets:
   ```sh
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put TELEGRAM_WEBHOOK_SECRET   # random string, 1–256 chars [A-Za-z0-9_-]
   ```
   and add `"TELEGRAM_BOT_USERNAME": "IGotHomeBot"` to `vars` in `wrangler.jsonc` (optional, otherwise fetched from the API).
3. Register the webhook and the bot commands:
   ```sh
   TELEGRAM_BOT_TOKEN=… TELEGRAM_WEBHOOK_SECRET=… APP_URL=https://your.app node scripts/telegram-setup.mjs
   ```

Contacts open `https://t.me/IGotHomeBot?start=c_…` once; users connect their own account from Settings and can then send `/home`.

## 4. Web push reminders (VAPID)

```sh
node scripts/gen-vapid.mjs
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_SUBJECT        # mailto:you@yourdomain.com
```

Push works in Chrome, Edge, Firefox, Android, and on iOS 16.4+ once the app is added to the home screen.

## 5. SMS and WhatsApp (Twilio, Pro channels)

1. Buy a number with SMS capability (a Czech or French number works for EU recipients). For WhatsApp, enable the WhatsApp sender in the Twilio console (sandbox for tests, approved sender for production).
2. Secrets:
   ```sh
   npx wrangler secret put TWILIO_ACCOUNT_SID
   npx wrangler secret put TWILIO_AUTH_TOKEN
   npx wrangler secret put TWILIO_FROM_SMS          # +420…
   npx wrangler secret put TWILIO_FROM_WHATSAPP     # whatsapp:+1415…
   ```

SMS cost roughly €0.05–0.10 in the EU; the Pro price covers a normal usage (a few alerts a month). Free users cannot create SMS/WhatsApp contacts.

## 6. Payments (Lemon Squeezy)

1. Create a store and two products: **Pro monthly** (subscription, €2.99) and **Pro lifetime** (one-time, €19). Lemon Squeezy is the merchant of record and handles EU VAT.
2. Copy each product's checkout URL into `vars` (`LS_CHECKOUT_MONTHLY`, `LS_CHECKOUT_LIFETIME`) and the lifetime variant id into `LS_LIFETIME_VARIANT_ID`. The app appends `checkout[custom][user_id]` and the email so the webhook can match the user.
3. Settings → Webhooks → add `https://your.app/api/billing/webhook`, choose a signing secret, enable `order_created`, `subscription_created`, `subscription_updated`, `subscription_cancelled`, `subscription_expired`, `subscription_payment_failed`, `subscription_resumed`.
4. `npx wrangler secret put LEMONSQUEEZY_WEBHOOK_SECRET`

Plan logic (`src/worker/routes/billing.ts`): lifetime order → Pro forever; active subscription → Pro until renewal + 3 days grace; cancelled → Pro until `ends_at`; expired/unpaid → Free.

## 7. GitHub Actions

`CI` runs typecheck, unit tests, build and the desktop Playwright suite on every push and PR.

`Deploy` runs on pushes to `main` when the repository variable `DEPLOY_ENABLED` is `true` and these secrets exist: `CLOUDFLARE_API_TOKEN` (template "Edit Cloudflare Workers" + D1 edit) and `CLOUDFLARE_ACCOUNT_ID`.

## Checklist before going public

- [ ] `DEV_MODE` removed from `wrangler.jsonc`
- [ ] `APP_URL` is the real https URL (cookies are `Secure` only on https)
- [ ] Resend domain verified, test sign-in from a real inbox
- [ ] Telegram webhook registered (`getWebhookInfo` shows your URL)
- [ ] VAPID keys set, push test from Settings works on a phone
- [ ] Lemon Squeezy webhook test event returns `{"applied":…}`
- [ ] Cron visible in the Worker's Triggers tab (`* * * * *`)
