// Builds the production Wrangler config from wrangler.jsonc (which stays set up for local development).
// Kept free of side effects so it can be unit tested.

/** Plain (non-secret) settings copied from the environment into the Worker's vars when they are set. */
export const PUBLIC_VARS = [
  'TELEGRAM_BOT_USERNAME',
  'EMAIL_FROM',
  'LS_CHECKOUT_MONTHLY',
  'LS_CHECKOUT_LIFETIME',
  'LS_LIFETIME_VARIANT_ID',
  'STRIPE_LINK_MONTHLY',
  'STRIPE_LINK_LIFETIME',
  'LEGAL_NAME',
  'LEGAL_ADDRESS',
  'LEGAL_ID',
  'CONTACT_EMAIL',
];

/** Secrets pushed to the Worker when they are set in the environment (GitHub secrets). */
export const SECRET_VARS = [
  'RESEND_API_KEY',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_FROM_SMS',
  'TWILIO_FROM_WHATSAPP',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
  'LEMONSQUEEZY_WEBHOOK_SECRET',
  'STRIPE_WEBHOOK_SECRET',
  'ADMIN_TOKEN',
];

const clean = (v) => (typeof v === 'string' ? v.trim() : '');

/**
 * @param {object} base parsed wrangler.jsonc
 * @param {{ databaseId: string, appUrl: string, env: Record<string, string | undefined> }} opts
 */
export function buildProductionConfig(base, { databaseId, appUrl, env }) {
  const cfg = structuredClone(base);
  delete cfg.$schema;
  const url = new URL(appUrl);
  cfg.d1_databases = (cfg.d1_databases ?? []).map((d) => (d.binding === 'DB' ? { ...d, database_id: databaseId } : d));
  const vars = { ...(cfg.vars ?? {}) };
  delete vars.DEV_MODE;
  vars.APP_URL = url.origin;
  for (const key of PUBLIC_VARS) {
    const v = clean(env[key]);
    if (v) vars[key] = v;
  }
  if (!vars.EMAIL_FROM && clean(env.RESEND_API_KEY)) {
    vars.EMAIL_FROM = `igothome <hello@${url.hostname.endsWith('.workers.dev') ? 'example.com' : url.hostname}>`;
  }
  cfg.vars = vars;
  // A real domain (bought on or moved to Cloudflare) is attached to the Worker; workers.dev needs nothing.
  if (!url.hostname.endsWith('.workers.dev') && url.hostname !== 'localhost') {
    cfg.routes = [{ pattern: url.hostname, custom_domain: true }];
    cfg.workers_dev = true;
  }
  return cfg;
}

/** Secrets to push: everything set in the environment, minus nothing. Empty values are skipped. */
export function pickSecrets(env) {
  const out = {};
  for (const key of SECRET_VARS) {
    const v = clean(env[key]);
    if (v) out[key] = v;
  }
  return out;
}
