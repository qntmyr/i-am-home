export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;

  APP_NAME: string;
  APP_URL: string;
  /** "1" exposes magic links in API responses and skips external sends when providers are missing. */
  DEV_MODE?: string;

  SESSION_SECRET?: string;

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
}

export function isDev(env: Env): boolean {
  return env.DEV_MODE === '1' || env.DEV_MODE === 'true';
}
