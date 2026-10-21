import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
// @ts-expect-error plain ESM script without types
import { buildProductionConfig, pickSecrets } from '../../scripts/deploy-config.mjs';
import { deriveTelegramSecret } from '../../src/worker/env';
import { checkoutUrl } from '../../src/worker/routes/api';

const base = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));

describe('buildProductionConfig', () => {
  it('drops dev mode, sets the URL and the database id', () => {
    const cfg = buildProductionConfig(base, { databaseId: 'db-123', appUrl: 'https://igothome.quentin.workers.dev/', env: {} });
    expect(cfg.vars.DEV_MODE).toBeUndefined();
    expect(cfg.vars.APP_URL).toBe('https://igothome.quentin.workers.dev');
    expect(cfg.d1_databases[0].database_id).toBe('db-123');
    expect(cfg.routes).toBeUndefined();
    expect(cfg.triggers.crons).toEqual(['* * * * *']);
  });

  it('attaches a custom domain and copies plain settings', () => {
    const cfg = buildProductionConfig(base, {
      databaseId: 'db',
      appUrl: 'https://igothome.app',
      env: { STRIPE_LINK_LIFETIME: ' https://buy.stripe.com/x ', RESEND_API_KEY: 're_1', LEGAL_NAME: 'Quentin' },
    });
    expect(cfg.routes).toEqual([{ pattern: 'igothome.app', custom_domain: true }]);
    expect(cfg.vars.STRIPE_LINK_LIFETIME).toBe('https://buy.stripe.com/x');
    expect(cfg.vars.EMAIL_FROM).toBe('igothome <hello@igothome.app>');
    expect(cfg.vars.LEGAL_NAME).toBe('Quentin');
    expect(cfg.vars.RESEND_API_KEY).toBeUndefined();
  });

  it('keeps the dev config untouched', () => {
    buildProductionConfig(base, { databaseId: 'db', appUrl: 'https://igothome.app', env: {} });
    expect(base.vars.DEV_MODE).toBe('1');
  });
});

describe('pickSecrets', () => {
  it('keeps only non-empty secrets', () => {
    expect(pickSecrets({ RESEND_API_KEY: 're_1', TWILIO_AUTH_TOKEN: '', APP_URL: 'x' })).toEqual({ RESEND_API_KEY: 're_1' });
  });
});

describe('Telegram webhook secret', () => {
  it('is derived the same way in the Worker and in the deploy script', async () => {
    const token = '123456:ABC-DEF';
    const node = createHmac('sha256', token).update('igothome:telegram-webhook').digest('hex').slice(0, 48);
    expect(await deriveTelegramSecret(token)).toBe(node);
  });
});

describe('checkoutUrl', () => {
  const user = { id: 'u_1', email: 'q@example.com' };
  it('prefers a Stripe Payment Link with the user reference', () => {
    const u = new URL(checkoutUrl('https://buy.stripe.com/abc', 'https://x.lemonsqueezy.com/buy/1', user)!);
    expect(u.host).toBe('buy.stripe.com');
    expect(u.searchParams.get('client_reference_id')).toBe('u_1');
    expect(u.searchParams.get('prefilled_email')).toBe('q@example.com');
  });
  it('falls back to Lemon Squeezy, then to nothing', () => {
    const u = new URL(checkoutUrl(undefined, 'https://x.lemonsqueezy.com/buy/1', user)!);
    expect(u.searchParams.get('checkout[custom][user_id]')).toBe('u_1');
    expect(checkoutUrl(undefined, undefined, user)).toBeNull();
  });
});
