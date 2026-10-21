// Payment webhooks → plan changes. Lemon Squeezy (x-signature HMAC) and Stripe (Stripe-Signature HMAC).
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

// ---------- Stripe (Payment Links / Checkout, incl. Stripe Managed Payments as merchant of record) ----------

const GRACE_MS = 3 * 24 * 3600 * 1000;

/** Verifies a `Stripe-Signature` header: t=<unix>,v1=<hex hmac of "t.payload">. */
export async function verifyStripeSignature(secret: string, header: string, payload: string, nowMs = Date.now()): Promise<boolean> {
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => (v ?? '').toLowerCase());
  if (!t || !sigs.length) return false;
  if (Math.abs(nowMs / 1000 - Number(t)) > 300) return false; // 5 minutes tolerance, like Stripe's libraries
  const expected = await hmacHex(secret, `${t}.${payload}`);
  return sigs.some((s) => timingSafeEqual(s, expected));
}

interface StripeObject {
  id?: string;
  object?: string;
  mode?: 'payment' | 'subscription' | 'setup';
  payment_status?: string;
  client_reference_id?: string | null;
  customer?: string | null;
  customer_email?: string | null;
  customer_details?: { email?: string | null } | null;
  status?: string;
  current_period_end?: number;
  cancel_at?: number | null;
  ended_at?: number | null;
  items?: { data?: Array<{ current_period_end?: number }> };
}
export interface StripeEvent {
  type?: string;
  data?: { object?: StripeObject };
}

type UserPlanRow = { id: string; plan: string; plan_until: number | null };

export async function applyStripeEvent(env: Env, event: StripeEvent, nowMs = Date.now()): Promise<{ applied: boolean; reason?: string }> {
  const type = event.type ?? '';
  const obj = event.data?.object ?? {};
  const customerId = obj.customer ?? null;
  const findBy = (sql: string, v: string) => env.DB.prepare(sql).bind(v).first<UserPlanRow>();

  let user: UserPlanRow | null = null;
  if (obj.client_reference_id) user = await findBy('SELECT id, plan, plan_until FROM users WHERE id = ?', obj.client_reference_id);
  if (!user && customerId) user = await findBy('SELECT id, plan, plan_until FROM users WHERE stripe_customer_id = ?', customerId);
  const email = obj.customer_details?.email ?? obj.customer_email ?? null;
  if (!user && email) user = await findBy('SELECT id, plan, plan_until FROM users WHERE email = ?', email.toLowerCase());
  if (!user) return { applied: false, reason: 'user_not_found' };
  const isLifetime = user.plan === 'pro' && user.plan_until === null;

  let plan: 'free' | 'pro' | null = null;
  let planUntil: number | null = null;

  if (type === 'checkout.session.completed' || type === 'checkout.session.async_payment_succeeded') {
    if (obj.payment_status !== 'paid' && obj.payment_status !== 'no_payment_required') return { applied: false, reason: 'not_paid' };
    if (obj.mode === 'payment') {
      plan = 'pro';
      planUntil = null; // one-time payment = lifetime
    } else if (obj.mode === 'subscription') {
      if (isLifetime) return { applied: false, reason: 'already_lifetime' };
      plan = 'pro';
      planUntil = nowMs + 35 * 24 * 3600 * 1000; // refined by customer.subscription.* events
    }
  } else if (type.startsWith('customer.subscription.')) {
    if (isLifetime) return { applied: false, reason: 'already_lifetime' };
    const periodEndS = obj.current_period_end ?? obj.items?.data?.[0]?.current_period_end;
    const periodEnd = periodEndS ? periodEndS * 1000 : null;
    const status = obj.status ?? '';
    if (['active', 'trialing', 'past_due'].includes(status)) {
      plan = 'pro';
      planUntil = periodEnd ? periodEnd + GRACE_MS : nowMs + 35 * 24 * 3600 * 1000;
    } else if (['canceled', 'unpaid', 'incomplete_expired'].includes(status)) {
      const ended = obj.ended_at ? obj.ended_at * 1000 : nowMs;
      plan = ended > nowMs ? 'pro' : 'free';
      planUntil = ended > nowMs ? ended : null;
    }
  }
  if (plan === null) return { applied: false, reason: 'ignored_event' };

  await env.DB.prepare('UPDATE users SET plan = ?, plan_until = ?, stripe_customer_id = COALESCE(?, stripe_customer_id) WHERE id = ?')
    .bind(plan, planUntil, customerId, user.id)
    .run();
  await logEvent(env.DB, user.id, 'plan_changed', { plan, planUntil, event: type });
  return { applied: true };
}

billing.post('/stripe', async (c) => {
  const secret = c.env.STRIPE_WEBHOOK_SECRET;
  const raw = await c.req.text();
  if (!secret) return c.json({ error: 'billing_not_configured' }, 503);
  if (!(await verifyStripeSignature(secret, c.req.header('stripe-signature') ?? '', raw))) return c.json({ error: 'bad_signature' }, 401);
  let event: StripeEvent;
  try {
    event = JSON.parse(raw) as StripeEvent;
  } catch {
    return c.json({ error: 'bad_json' }, 400);
  }
  return c.json(await applyStripeEvent(c.env, event));
});
