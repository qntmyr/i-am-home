export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;

  APP_NAME: string;
  APP_URL: string;
  /** "1" exposes magic links in API responses and skips external sends when providers are missing. */
  DEV_MODE?: string;


  // Telegram
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_BOT_USERNAME?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;

  // Email (Resend)
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;

  // SMS / WhatsApp (Twilio)
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM_SMS?: string;
  TWILIO_FROM_WHATSAPP?: string;

  // Web push (VAPID)
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;

  // Lemon Squeezy
  LEMONSQUEEZY_WEBHOOK_SECRET?: string;
  LS_CHECKOUT_MONTHLY?: string;
  LS_CHECKOUT_LIFETIME?: string;
  LS_LIFETIME_VARIANT_ID?: string;

  // Stripe (Payment Links, works with Stripe Managed Payments as merchant of record)
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_LINK_MONTHLY?: string;
  STRIPE_LINK_LIFETIME?: string;

  // Legal notice shown on /terms (who runs the service)
  LEGAL_NAME?: string;
  LEGAL_ADDRESS?: string;
  LEGAL_ID?: string;
  CONTACT_EMAIL?: string;

  /** Bearer token for GET /api/admin/stats. */
  ADMIN_TOKEN?: string;
}

export function isDev(env: Env): boolean {
  return env.DEV_MODE === '1' || env.DEV_MODE === 'true';
}

/** Channels whose provider is configured. In dev mode every channel is available (messages go to the outbox). */
export function availableChannels(env: Env): Array<'telegram' | 'email' | 'sms' | 'whatsapp'> {
  if (isDev(env)) return ['telegram', 'email', 'sms', 'whatsapp'];
  const out: Array<'telegram' | 'email' | 'sms' | 'whatsapp'> = [];
  if (env.TELEGRAM_BOT_TOKEN) out.push('telegram');
  if (env.RESEND_API_KEY) out.push('email');
  const twilio = !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN);
  if (twilio && env.TWILIO_FROM_SMS) out.push('sms');
  if (twilio && env.TWILIO_FROM_WHATSAPP) out.push('whatsapp');
  return out;
}

/**
 * Secret Telegram sends back on every webhook call. When TELEGRAM_WEBHOOK_SECRET is not set it is derived from the
 * bot token, so scripts/deploy.mjs can register the webhook without storing another secret.
 */
export async function telegramWebhookSecret(env: Env): Promise<string | null> {
  if (env.TELEGRAM_WEBHOOK_SECRET) return env.TELEGRAM_WEBHOOK_SECRET;
  if (!env.TELEGRAM_BOT_TOKEN) return null;
  return deriveTelegramSecret(env.TELEGRAM_BOT_TOKEN);
}

export async function deriveTelegramSecret(botToken: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(botToken), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('igothome:telegram-webhook'));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 48);
}
