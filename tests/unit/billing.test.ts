import { describe, expect, it } from 'vitest';
import { applyLemonSqueezyEvent } from '../../src/worker/routes/billing';
import type { Env } from '../../src/worker/env';

/** Minimal in-memory stand-in for the two D1 statements the billing code uses. */
function fakeEnv(user: { id: string; email: string; plan: string } | null) {
  const updates: unknown[][] = [];
  const events: unknown[][] = [];
  const prepare = (sql: string) => {
    let bound: unknown[] = [];
    const stmt = {
      bind: (...args: unknown[]) => {
        bound = args;
        return stmt;
      },
      first: async () => {
        if (sql.startsWith('SELECT id, plan FROM users WHERE id')) return user && user.id === bound[0] ? user : null;
        if (sql.startsWith('SELECT id, plan FROM users WHERE email')) return user && user.email === bound[0] ? user : null;
        return null;
      },
      run: async () => {
        if (sql.startsWith('UPDATE users')) updates.push(bound);
        if (sql.startsWith('INSERT INTO events')) events.push(bound);
        return { meta: { changes: 1 } };
      },
    };
    return stmt;
  };
  const env = { DB: { prepare }, APP_NAME: 'test', APP_URL: 'http://x', LS_LIFETIME_VARIANT_ID: '111' } as unknown as Env;
  return { env, updates, events };
}

describe('applyLemonSqueezyEvent', () => {
  const user = { id: 'u_1', email: 'q@example.com', plan: 'free' };

  it('grants lifetime Pro on a lifetime order', async () => {
    const f = fakeEnv(user);
    const r = await applyLemonSqueezyEvent(f.env, {
      meta: { event_name: 'order_created', custom_data: { user_id: 'u_1' } },
      data: { attributes: { customer_id: 42, first_order_item: { variant_id: 111 } } },
    });
    expect(r.applied).toBe(true);
    expect(f.updates[0]).toEqual(['pro', null, '42', 'u_1']);
  });

  it('ignores orders for other variants (subscriptions come through subscription_* events)', async () => {
    const f = fakeEnv(user);
    const r = await applyLemonSqueezyEvent(f.env, {
      meta: { event_name: 'order_created', custom_data: { user_id: 'u_1' } },
      data: { attributes: { first_order_item: { variant_id: 222 } } },
    });
    expect(r).toEqual({ applied: false, reason: 'ignored_event' });
  });

  it('sets Pro with a grace period for active subscriptions', async () => {
    const f = fakeEnv(user);
    await applyLemonSqueezyEvent(f.env, {
      meta: { event_name: 'subscription_created', custom_data: { user_id: 'u_1' } },
      data: { attributes: { status: 'active', renews_at: '2026-11-20T00:00:00Z', customer_id: 7 } },
    });
    expect(f.updates[0]?.[0]).toBe('pro');
    expect(f.updates[0]?.[1]).toBe(Date.parse('2026-11-20T00:00:00Z') + 3 * 24 * 3600 * 1000);
  });

  it('keeps Pro until ends_at when cancelled, then free when expired', async () => {
    const f = fakeEnv(user);
    await applyLemonSqueezyEvent(f.env, {
      meta: { event_name: 'subscription_updated', custom_data: { user_id: 'u_1' } },
      data: { attributes: { status: 'cancelled', ends_at: '2026-12-01T00:00:00Z' } },
    });
    expect(f.updates[0]).toEqual(['pro', Date.parse('2026-12-01T00:00:00Z'), null, 'u_1']);
    await applyLemonSqueezyEvent(f.env, {
      meta: { event_name: 'subscription_expired', custom_data: { user_id: 'u_1' } },
      data: { attributes: { status: 'expired' } },
    });
    expect(f.updates[1]).toEqual(['free', null, null, 'u_1']);
  });

  it('falls back to the customer email when custom data is missing', async () => {
    const f = fakeEnv(user);
    const r = await applyLemonSqueezyEvent(f.env, {
      meta: { event_name: 'subscription_created' },
      data: { attributes: { status: 'active', user_email: 'Q@example.com' } },
    });
    expect(r.applied).toBe(true);
  });

  it('reports unknown users', async () => {
    const f = fakeEnv(null);
    const r = await applyLemonSqueezyEvent(f.env, { meta: { event_name: 'order_created', custom_data: { user_id: 'nope' } }, data: { attributes: {} } });
    expect(r).toEqual({ applied: false, reason: 'user_not_found' });
  });
});

// ---------- Stripe ----------
import { applyStripeEvent, verifyStripeSignature } from '../../src/worker/routes/billing';
import { createHmac } from 'node:crypto';

function stripeEnv(user: { id: string; email: string; plan: string; plan_until: number | null; stripe_customer_id?: string } | null) {
  const updates: unknown[][] = [];
  const prepare = (sql: string) => {
    let bound: unknown[] = [];
    const stmt = {
      bind: (...args: unknown[]) => {
        bound = args;
        return stmt;
      },
      first: async () => {
        if (!user) return null;
        if (sql.includes('WHERE id = ?')) return user.id === bound[0] ? user : null;
        if (sql.includes('WHERE stripe_customer_id = ?')) return user.stripe_customer_id === bound[0] ? user : null;
        if (sql.includes('WHERE email = ?')) return user.email === bound[0] ? user : null;
        return null;
      },
      run: async () => {
        if (sql.startsWith('UPDATE users')) updates.push(bound);
        return { meta: { changes: 1 } };
      },
    };
    return stmt;
  };
  return { env: { DB: { prepare } } as unknown as Env, updates };
}

describe('verifyStripeSignature', () => {
  const secret = 'whsec_test';
  const payload = '{"type":"checkout.session.completed"}';
  const t = 1_800_000_000;
  const sig = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  it('accepts a valid signature within 5 minutes', async () => {
    expect(await verifyStripeSignature(secret, `t=${t},v1=${sig}`, payload, t * 1000 + 60_000)).toBe(true);
  });
  it('rejects a tampered payload, a wrong secret or an old timestamp', async () => {
    expect(await verifyStripeSignature(secret, `t=${t},v1=${sig}`, payload + ' ', t * 1000)).toBe(false);
    expect(await verifyStripeSignature('other', `t=${t},v1=${sig}`, payload, t * 1000)).toBe(false);
    expect(await verifyStripeSignature(secret, `t=${t},v1=${sig}`, payload, t * 1000 + 600_000)).toBe(false);
  });
});

describe('applyStripeEvent', () => {
  const now = Date.parse('2026-10-21T08:00:00Z');
  it('grants lifetime Pro on a paid one-time checkout', async () => {
    const f = stripeEnv({ id: 'u_1', email: 'q@example.com', plan: 'free', plan_until: null });
    const r = await applyStripeEvent(
      f.env,
      { type: 'checkout.session.completed', data: { object: { mode: 'payment', payment_status: 'paid', client_reference_id: 'u_1', customer: 'cus_1' } } },
      now,
    );
    expect(r.applied).toBe(true);
    expect(f.updates[0]).toEqual(['pro', null, 'cus_1', 'u_1']);
  });

  it('ignores unpaid sessions', async () => {
    const f = stripeEnv({ id: 'u_1', email: 'q@example.com', plan: 'free', plan_until: null });
    const r = await applyStripeEvent(f.env, { type: 'checkout.session.completed', data: { object: { mode: 'payment', payment_status: 'unpaid', client_reference_id: 'u_1' } } }, now);
    expect(r).toEqual({ applied: false, reason: 'not_paid' });
  });

  it('keeps Pro until the period end plus grace for an active subscription, matched by customer', async () => {
    const f = stripeEnv({ id: 'u_1', email: 'q@example.com', plan: 'pro', plan_until: now, stripe_customer_id: 'cus_1' });
    const end = Math.floor(Date.parse('2026-11-21T08:00:00Z') / 1000);
    await applyStripeEvent(f.env, { type: 'customer.subscription.updated', data: { object: { customer: 'cus_1', status: 'active', items: { data: [{ current_period_end: end }] } } } }, now);
    expect(f.updates[0]).toEqual(['pro', end * 1000 + 3 * 24 * 3600 * 1000, 'cus_1', 'u_1']);
  });

  it('downgrades a cancelled subscription but never a lifetime customer', async () => {
    const f = stripeEnv({ id: 'u_1', email: 'q@example.com', plan: 'pro', plan_until: now + 1000, stripe_customer_id: 'cus_1' });
    await applyStripeEvent(f.env, { type: 'customer.subscription.deleted', data: { object: { customer: 'cus_1', status: 'canceled', ended_at: Math.floor(now / 1000) - 10 } } }, now);
    expect(f.updates[0]).toEqual(['free', null, 'cus_1', 'u_1']);

    const g = stripeEnv({ id: 'u_2', email: 'l@example.com', plan: 'pro', plan_until: null, stripe_customer_id: 'cus_2' });
    const r = await applyStripeEvent(g.env, { type: 'customer.subscription.deleted', data: { object: { customer: 'cus_2', status: 'canceled' } } }, now);
    expect(r).toEqual({ applied: false, reason: 'already_lifetime' });
  });
});
