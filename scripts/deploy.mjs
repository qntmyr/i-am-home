// Production deploy in one command. Run by .github/workflows/deploy.yml on every push to main,
// or locally after `npx wrangler login`:  APP_URL=https://igothome.app node scripts/deploy.mjs
//
// It creates the D1 database if needed, applies migrations, deploys the Worker with production vars,
// pushes the secrets found in the environment, generates Web Push keys once, registers the Telegram
// webhook and checks /api/health. Nothing secret is ever written to the repository.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, appendFileSync } from 'node:fs';
import { webcrypto, createHmac } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildProductionConfig, pickSecrets } from './deploy-config.mjs';

const env = process.env;
const DB_NAME = 'igothome';
const CONFIG = 'wrangler.production.json';

function wrangler(args, { capture = true } = {}) {
  return execFileSync('npx', ['wrangler', ...args], {
    encoding: 'utf8',
    env: { ...env, CI: 'true', WRANGLER_SEND_METRICS: 'false' },
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
}
const step = (msg) => console.log(`\n▶ ${msg}`);
const summary = [];

// 1. D1 database
step('D1 database');
const findDb = () => JSON.parse(wrangler(['d1', 'list', '--json'])).find((d) => d.name === DB_NAME);
let db = findDb();
if (!db) {
  wrangler(['d1', 'create', DB_NAME], { capture: false });
  db = findDb();
}
if (!db?.uuid) throw new Error('Could not find or create the D1 database');
console.log(`  ${DB_NAME} = ${db.uuid}`);

// 2. Public URL: APP_URL if given, otherwise the account's workers.dev address
step('Public URL');
let appUrl = env.APP_URL?.trim();
if (!appUrl && env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/subdomain`, {
    headers: { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
  });
  const body = await res.json().catch(() => ({}));
  if (body?.result?.subdomain) appUrl = `https://igothome.${body.result.subdomain}.workers.dev`;
}
if (!appUrl) throw new Error('Set APP_URL (e.g. https://igothome.app) or provide CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID');
appUrl = new URL(appUrl).origin;
console.log(`  ${appUrl}`);

// 3. Config, migrations, deploy
const base = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
writeFileSync(CONFIG, JSON.stringify(buildProductionConfig(base, { databaseId: db.uuid, appUrl, env }), null, 2));
step('Migrations');
wrangler(['d1', 'migrations', 'apply', DB_NAME, '--remote', '-c', CONFIG], { capture: false });
step('Deploy');
wrangler(['deploy', '-c', CONFIG], { capture: false });

// 4. Secrets: what the environment provides + Web Push keys generated once
step('Secrets');
let existing = [];
try {
  existing = JSON.parse(wrangler(['secret', 'list', '-c', CONFIG, '--format', 'json'])).map((s) => s.name);
} catch {
  existing = [];
}
const secrets = pickSecrets(env);
if (!secrets.VAPID_PRIVATE_KEY && !existing.includes('VAPID_PRIVATE_KEY')) {
  const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const keys = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  secrets.VAPID_PUBLIC_KEY = b64url(await webcrypto.subtle.exportKey('raw', keys.publicKey));
  secrets.VAPID_PRIVATE_KEY = (await webcrypto.subtle.exportKey('jwk', keys.privateKey)).d;
  console.log('  generated Web Push keys');
}
if (!secrets.VAPID_SUBJECT && !existing.includes('VAPID_SUBJECT')) {
  secrets.VAPID_SUBJECT = `mailto:${env.CONTACT_EMAIL?.trim() || 'hello@' + new URL(appUrl).hostname}`;
}
const names = Object.keys(secrets);
if (names.length) {
  const file = join(tmpdir(), `igothome-secrets-${process.pid}.json`);
  writeFileSync(file, JSON.stringify(secrets), { mode: 0o600 });
  try {
    wrangler(['secret', 'bulk', file, '-c', CONFIG], { capture: false });
  } finally {
    rmSync(file, { force: true });
  }
}
console.log(`  set: ${names.join(', ') || 'nothing new'}`);
const has = (k) => names.includes(k) || existing.includes(k);

// 5. Telegram webhook (secret derived from the bot token, same as the Worker does)
const botToken = env.TELEGRAM_BOT_TOKEN?.trim();
if (botToken) {
  step('Telegram webhook');
  const secret = env.TELEGRAM_WEBHOOK_SECRET?.trim() || createHmac('sha256', botToken).update('igothome:telegram-webhook').digest('hex').slice(0, 48);
  const tg = (method, body) =>
    fetch(`https://api.telegram.org/bot${botToken}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
  const hook = await tg('setWebhook', { url: `${appUrl}/api/telegram/webhook`, secret_token: secret, allowed_updates: ['message'] });
  await tg('setMyCommands', {
    commands: [
      { command: 'home', description: "I'm home: check in" },
      { command: 'status', description: 'Last check-in and next deadline' },
      { command: 'help', description: 'Help' },
    ],
  });
  const me = await tg('getMe', {});
  console.log(`  webhook: ${hook.ok ? 'ok' : JSON.stringify(hook)} · bot: @${me?.result?.username ?? '?'}`);
  summary.push(`Telegram bot: @${me?.result?.username ?? '?'} (${hook.ok ? 'webhook ok' : 'webhook FAILED'})`);
}

// 6. Health check
step('Health check');
let healthy = false;
for (let i = 0; i < 12 && !healthy; i++) {
  try {
    const r = await fetch(`${appUrl}/api/health`);
    healthy = r.ok && (await r.json()).ok === true;
  } catch {
    /* DNS for a fresh custom domain can take a minute */
  }
  if (!healthy) await new Promise((r) => setTimeout(r, 5000));
}
console.log(healthy ? '  ok' : '  not reachable yet (a new custom domain can take a few minutes)');

// 7. Summary
const on = (ok, label) => `${ok ? '✅' : '⬜'} ${label}`;
const lines = [
  `## igothome deployed`,
  ``,
  `**URL:** ${appUrl} ${healthy ? '(healthy)' : '(not reachable yet)'}`,
  ``,
  on(has('RESEND_API_KEY'), 'Email sign-in and email contacts (RESEND_API_KEY)'),
  on(has('TELEGRAM_BOT_TOKEN'), 'Telegram contacts and /home (TELEGRAM_BOT_TOKEN)'),
  on(has('VAPID_PRIVATE_KEY'), 'Push reminders'),
  on(has('TWILIO_FROM_SMS'), 'SMS contacts, Pro (TWILIO_*)'),
  on(has('TWILIO_FROM_WHATSAPP'), 'WhatsApp contacts, Pro (TWILIO_FROM_WHATSAPP)'),
  on(!!(env.STRIPE_LINK_LIFETIME || env.STRIPE_LINK_MONTHLY || env.LS_CHECKOUT_LIFETIME || env.LS_CHECKOUT_MONTHLY), 'Upgrade buttons (STRIPE_LINK_* or LS_CHECKOUT_*)'),
  on(has('STRIPE_WEBHOOK_SECRET') || has('LEMONSQUEEZY_WEBHOOK_SECRET'), 'Payment webhook secret'),
  on(has('ADMIN_TOKEN'), 'Launch stats at /api/admin/stats (ADMIN_TOKEN)'),
  ``,
  `Stripe webhook URL: ${appUrl}/api/billing/stripe`,
  `Lemon Squeezy webhook URL: ${appUrl}/api/billing/webhook`,
  ...summary.map((s) => `\n${s}`),
];
console.log('\n' + lines.join('\n'));
if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
if (!has('RESEND_API_KEY')) console.warn('\n⚠ Without RESEND_API_KEY nobody can sign in. Add it and deploy again.');
