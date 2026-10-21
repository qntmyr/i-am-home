# Deploying igothome

One Cloudflare Worker serves the app, the API and the scheduler (cron every minute). The free Workers plan is enough to start.

Deployment is automated by `scripts/deploy.mjs`, run by the **Deploy** GitHub workflow on every push to `main`. It:

1. creates the `igothome` D1 database if it does not exist and applies the migrations,
2. builds the production config from `wrangler.jsonc` (no `DEV_MODE`, real `APP_URL`, custom domain attached),
3. deploys the Worker,
4. pushes every secret found in the environment, and generates the Web Push (VAPID) keys once,
5. registers the Telegram webhook and bot commands,
6. checks `/api/health` and writes a summary of what is switched on.

Nothing secret lives in the repository. `wrangler.jsonc` stays the local development config.

## 1. Accounts (about 40 minutes)

| Service | What to do | Cost |
| --- | --- | --- |
| Cloudflare | Buy the domain on Cloudflare Registrar (so it is attached automatically). Create an API token from the template **Edit Cloudflare Workers** and add **D1: Edit**. Note the Account ID. | domain only |
| Resend | Add the domain (accept the automatic Cloudflare DNS setup), create an API key. Required: magic-link sign-in uses it. | free up to 3,000 emails/month |
| Telegram | [@BotFather](https://t.me/BotFather) → `/newbot`, username e.g. `IGotHomeBot`, copy the token. | free |
| Twilio (Pro, later) | Buy a number with SMS. WhatsApp needs an approved sender (Meta business verification). | pay as you go |
| Stripe or Lemon Squeezy (Pro, later) | See [Payments](#4-payments). | about 5 % + 0.50 $ per sale |

## 2. GitHub settings

Repository → Settings → Secrets and variables → Actions.

**Secrets**

| Name | Required | Notes |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | yes | token from step 1 |
| `CLOUDFLARE_ACCOUNT_ID` | yes | |
| `RESEND_API_KEY` | yes | without it nobody can sign in |
| `TELEGRAM_BOT_TOKEN` | recommended | the free channel |
| `ADMIN_TOKEN` | recommended | any long random string, protects `/api/admin/stats` |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_SMS`, `TWILIO_FROM_WHATSAPP` | no | SMS / WhatsApp stay hidden in the app until set |
| `STRIPE_WEBHOOK_SECRET` or `LEMONSQUEEZY_WEBHOOK_SECRET` | with payments | |

**Variables**

| Name | Example | Notes |
| --- | --- | --- |
| `DEPLOY_ENABLED` | `true` | turns the workflow on |
| `APP_URL` | `https://igothome.app` | omit to use `https://igothome.<account>.workers.dev` |
| `CONTACT_EMAIL` | `hello@igothome.app` | shown on /terms, used as the push contact |
| `LEGAL_NAME`, `LEGAL_ADDRESS`, `LEGAL_ID` | `Quentin …`, `Praha`, `IČO 12345678` | legal notice on /terms |
| `EMAIL_FROM` | `igothome <hello@igothome.app>` | defaults to `hello@<your domain>` |
| `TELEGRAM_BOT_USERNAME` | `IGotHomeBot` | optional, otherwise read from Telegram |
| `STRIPE_LINK_MONTHLY`, `STRIPE_LINK_LIFETIME` | `https://buy.stripe.com/…` | Payment Links |
| `LS_CHECKOUT_MONTHLY`, `LS_CHECKOUT_LIFETIME`, `LS_LIFETIME_VARIANT_ID` | | Lemon Squeezy alternative |

## 3. Deploy

Actions → **Deploy** → Run workflow. The run summary shows the URL, what is switched on and the webhook URLs to paste into the payment provider. Every merge into `main` deploys again.

Local alternative, with the same environment variables exported:

```sh
npx wrangler login
npm run build
APP_URL=https://igothome.app RESEND_API_KEY=… TELEGRAM_BOT_TOKEN=… node scripts/deploy.mjs
```

## 4. Payments

The Upgrade buttons appear as soon as a checkout link is set. Stripe links win over Lemon Squeezy when both are set.

**Stripe (Payment Links, works with Stripe Managed Payments as merchant of record)**

1. Create two products: *igothome Pro monthly* (recurring, €2.99) and *igothome Pro lifetime* (one-time, €19).
2. Create a Payment Link for each. After payment, redirect to `https://igothome.app/app/settings`.
3. Put the links in `STRIPE_LINK_MONTHLY` / `STRIPE_LINK_LIFETIME`. The app adds `client_reference_id` (the user id) and `prefilled_email`.
4. Developers → Webhooks → endpoint `https://igothome.app/api/billing/stripe`, events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Put the signing secret in `STRIPE_WEBHOOK_SECRET`.

**Lemon Squeezy**

1. Products *Pro monthly* (subscription, €2.99) and *Pro lifetime* (one-time, €19).
2. Checkout URLs in `LS_CHECKOUT_MONTHLY` / `LS_CHECKOUT_LIFETIME`, the lifetime variant id in `LS_LIFETIME_VARIANT_ID`.
3. Webhook `https://igothome.app/api/billing/webhook` with `order_created` and all `subscription_*` events; signing secret in `LEMONSQUEEZY_WEBHOOK_SECRET`.

Plan logic (`src/worker/routes/billing.ts`): one-time payment → Pro forever; active subscription → Pro until the period end + 3 days; cancelled → Pro until it ends, then Free. A lifetime customer is never downgraded by a subscription event.

## 5. Launch stats

```sh
curl -H "authorization: Bearer $ADMIN_TOKEN" https://igothome.app/api/admin/stats
```

Returns users, users with a linked contact, users with a rule, weekly active, check-ins in the last 24 h, alerts in the last 7 days and Pro customers.

## Checklist before going public

- [ ] Deploy summary shows the URL as healthy
- [ ] Sign-in email arrives in a real inbox (check spam)
- [ ] A Telegram contact links and receives a check-in
- [ ] Push test from Settings works on a phone (iOS: after adding to the home screen)
- [ ] A missed deadline alerts the contact (set a rule two minutes ahead and wait)
- [ ] /terms shows your legal notice
- [ ] Payment: a test purchase turns the account Pro, a refund in the provider dashboard works
