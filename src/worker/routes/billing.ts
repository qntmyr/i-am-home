// Lemon Squeezy webhook → plan changes. Verified with the HMAC signature header.
import { Hono } from 'hono';
import type { Env } from '../env';
import { logEvent } from '../db';
import { hmacHex, timingSafeEqual } from '../util';

export const billing = new Hono<{ Bindings: Env }>();

interface LsEvent {
  meta?: { event_name?: string; custom_data?: { user_id?: string } };
  data?: {
    id?: string;
    attributes?: {
      status?: string;
      customer_id?: number;
      user_email?: string;
      renews_at?: string | null;
      ends_at?: string | null;
      variant_id?: number;
      first_order_item?: { variant_id?: number };
    };
  };
}

export async function applyLemonSqueezyEvent(env: Env, event: LsEvent): Promise<{ applied: boolean; reason?: string }> {
  const name = event.meta?.event_name ?? '';
  const attrs = event.data?.attributes ?? {};
  const userId = event.meta?.custom_data?.user_id;
  let user = userId ? await env.DB.prepare('SELECT id, plan FROM users WHERE id = ?').bind(userId).first<{ id: string; plan: string }>() : null;
  if (!user && attrs.user_email) {
    user = await env.DB.prepare('SELECT id, plan FROM users WHERE email = ?').bind(attrs.user_email.toLowerCase()).first<{ id: string; plan: string }>();
  }
  if (!user) return { applied: false, reason: 'user_not_found' };
  const customerId = attrs.customer_id ? String(attrs.customer_id) : null;

  let plan: 'free' | 'pro' | null = null;
  let planUntil: number | null = null;

  if (name === 'order_created') {
    const variant = String(attrs.first_order_item?.variant_id ?? '');
    const lifetime = !env.LS_LIFETIME_VARIANT_ID || variant === env.LS_LIFETIME_VARIANT_ID;
    if (lifetime) {
      plan = 'pro';
      planUntil = null;
    }
  } else if (name.startsWith('subscription_')) {
    const status = attrs.status ?? '';
    const endsAt = attrs.ends_at ? Date.parse(attrs.ends_at) : null;
    const renewsAt = attrs.renews_at ? Date.parse(attrs.renews_at) : null;
    if (['active', 'on_trial', 'past_due', 'paused'].includes(status)) {
      plan = 'pro';
      planUntil = renewsAt ? renewsAt + 3 * 24 * 3600 * 1000 : null; // 3 days grace after renewal date
    } else if (status === 'cancelled') {
      plan = 'pro';
      planUntil = endsAt ?? renewsAt;
    } else if (status === 'expired' || status === 'unpaid') {
      plan = 'free';
      planUntil = null;
    }
  }
  if (plan === null) return { applied: false, reason: 'ignored_event' };

  await env.DB.prepare('UPDATE users SET plan = ?, plan_until = ?, ls_customer_id = COALESCE(?, ls_customer_id) WHERE id = ?')
    .bind(plan, planUntil, customerId, user.id)
    .run();
  await logEvent(env.DB, user.id, 'plan_changed', { plan, planUntil, event: name });
  return { applied: true };
}

billing.post('/webhook', async (c) => {
  const secret = c.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  const raw = await c.req.text();
  if (!secret) return c.json({ error: 'billing_not_configured' }, 503);
  const signature = c.req.header('x-signature') ?? '';
  const expected = await hmacHex(secret, raw);
  if (!timingSafeEqual(signature.toLowerCase(), expected)) return c.json({ error: 'bad_signature' }, 401);
  let event: LsEvent;
  try {
    event = JSON.parse(raw) as LsEvent;
  } catch {
    return c.json({ error: 'bad_json' }, 400);
  }
  const result = await applyLemonSqueezyEvent(c.env, event);
  return c.json(result);
});
