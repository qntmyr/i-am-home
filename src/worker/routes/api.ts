// Authenticated JSON API used by the PWA.
import { Hono } from 'hono';
import type { Env } from '../env';
import { isDev } from '../env';
import {
  contactToDTO,
  eventToDTO,
  getContacts,
  getRuleContactMap,
  getRules,
  logEvent,
  ruleToDTO,
  userToDTO,
  effectivePlan,
  type ContactRow,
  type EventRow,
  type RuleRow,
  type UserRow,
} from '../db';
import { createSession, destroySession, requestMagicLink, requireUser, verifyMagicLink, type Vars } from '../auth';
import { performCheckin } from '../checkin';
import { ruleTiming, sendAlert } from '../scheduler';
import { devOutbox, sendToContact, notifyUser } from '../notify';
import { getBotUsername } from './telegram';
import { HttpError, clampInt, isEmail, isPhone, newId, randomToken, str } from '../util';
import { message, normalizeLocale } from '../../shared/messages';
import { PLAN_LIMITS, type Channel, type MeDTO, type RuleKind, type StatusDTO } from '../../shared/types';
import { computeNextTimes, formatLocalTime, isValidTimeZone, parseTimeLocal, checkinSatisfies } from '../../shared/schedule';

export const api = new Hono<{ Bindings: Env; Variables: Vars }>();

// ---------- Auth ----------

api.post('/auth/request', async (c) => {
  const body = await c.req.json<{ email?: string; locale?: string; tz?: string }>().catch(() => ({}) as { email?: string; locale?: string; tz?: string });
  const result = await requestMagicLink(c.env, body.email ?? '', body.locale, body.tz);
  return c.json(result);
});

api.get('/auth/verify', async (c) => {
  const token = c.req.query('token') ?? '';
  const locale = c.req.query('locale') ?? c.req.header('accept-language') ?? undefined;
  const tz = c.req.query('tz') ?? undefined;
  try {
    const user = await verifyMagicLink(c.env, token, locale, tz);
    await createSession(c, user);
    return c.redirect('/app');
  } catch (e) {
    if (e instanceof HttpError) return c.redirect(`/login?error=${encodeURIComponent(e.code ?? 'error')}`);
    throw e;
  }
});

api.post('/auth/logout', async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

// ---------- Public hook (iOS Shortcuts / Android automations) ----------

async function hookCheckin(env: Env, token: string, note: string): Promise<{ status: 200 | 404; text: string }> {
  const user = await env.DB.prepare('SELECT * FROM users WHERE hook_token = ?').bind(token).first<UserRow>();
  if (!user) return { status: 404, text: 'Unknown token' };
  const outcome = await performCheckin(env, user, 'hook', note);
  const time = formatLocalTime(outcome.at, user.tz, user.locale);
  const text = message(user.locale, 'hookOk', { time });
  return { status: 200, text: text + (outcome.announcedTo.length ? ` → ${outcome.announcedTo.join(', ')}` : '') };
}
api.on(['GET', 'POST'], '/hook/:token', async (c) => {
  const r = await hookCheckin(c.env, c.req.param('token'), str(c.req.query('note') ?? '', 140));
  return c.text(r.text, r.status);
});

// ---------- Everything below requires a session ----------

api.use('/*', requireUser);

function meta(c: { env: Env }, user: UserRow) {
  const hookUrl = `${c.env.APP_URL}/api/hook/${user.hook_token}`;
  return { hookUrl };
}

api.get('/me', async (c) => {
  const user = c.get('user');
  const nowMs = Date.now();
  const bot = await getBotUsername(c.env);
  const plan = effectivePlan(user, nowMs);
  const dto: MeDTO = {
    user: userToDTO(user, nowMs),
    botUsername: bot,
    telegramLink: user.telegram_link_token && bot ? `https://t.me/${bot}?start=${user.telegram_link_token}` : null,
    hookUrl: meta(c, user).hookUrl,
    vapidPublicKey: c.env.VAPID_PUBLIC_KEY ?? null,
    checkout: {
      monthly: c.env.LS_CHECKOUT_MONTHLY ? withCheckoutParams(c.env.LS_CHECKOUT_MONTHLY, user) : null,
      lifetime: c.env.LS_CHECKOUT_LIFETIME ? withCheckoutParams(c.env.LS_CHECKOUT_LIFETIME, user) : null,
    },
    limits: PLAN_LIMITS[plan],
  };
  return c.json(dto);
});

function withCheckoutParams(url: string, user: UserRow): string {
  const u = new URL(url);
  u.searchParams.set('checkout[custom][user_id]', user.id);
  u.searchParams.set('checkout[email]', user.email);
  return u.toString();
}

api.patch('/me', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const name = body.name !== undefined ? str(body.name, 60) : user.name;
  const tz = body.tz !== undefined ? str(body.tz, 64) : user.tz;
  const locale = body.locale !== undefined ? normalizeLocale(str(body.locale, 8)) : user.locale;
  if (!isValidTimeZone(tz)) throw new HttpError(400, 'Unknown time zone', 'bad_tz');
  await c.env.DB.prepare('UPDATE users SET name = ?, tz = ?, locale = ? WHERE id = ?').bind(name, tz, locale, user.id).run();
  if (tz !== user.tz) {
    // Re-plan every rule in the new time zone.
    const rules = await getRules(c.env.DB, user.id);
    const nowMs = Date.now();
    for (const r of rules) {
      if (!r.enabled) continue;
      const next = computeNextTimes(ruleTiming(r), tz, nowMs);
      await c.env.DB.prepare('UPDATE rules SET next_fire_at = ?, next_remind_at = ? WHERE id = ?').bind(next.nextFireAt, next.nextRemindAt, r.id).run();
    }
  }
  return c.json({ ok: true });
});

api.post('/me/hook/regenerate', async (c) => {
  const user = c.get('user');
  const token = randomToken(32);
  await c.env.DB.prepare('UPDATE users SET hook_token = ? WHERE id = ?').bind(token, user.id).run();
  return c.json({ hookUrl: `${c.env.APP_URL}/api/hook/${token}`, hookToken: token });
});

api.post('/me/telegram/link', async (c) => {
  const user = c.get('user');
  const token = 'u_' + randomToken(24);
  await c.env.DB.prepare('UPDATE users SET telegram_link_token = ? WHERE id = ?').bind(token, user.id).run();
  const bot = await getBotUsername(c.env);
  return c.json({ link: bot ? `https://t.me/${bot}?start=${token}` : null, token, botUsername: bot });
});

api.delete('/me/telegram', async (c) => {
  const user = c.get('user');
  await c.env.DB.prepare('UPDATE users SET telegram_chat_id = NULL, telegram_link_token = NULL WHERE id = ?').bind(user.id).run();
  return c.json({ ok: true });
});

api.delete('/me', async (c) => {
  const user = c.get('user');
  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id).run();
  await destroySession(c);
  return c.json({ ok: true });
});

// ---------- Status & check-in ----------

api.get('/status', async (c) => {
  const user = c.get('user');
  const nowMs = Date.now();
  const rules = (await getRules(c.env.DB, user.id)).filter((r) => r.enabled && r.next_fire_at !== null);
  rules.sort((a, b) => a.next_fire_at! - b.next_fire_at!);
  const contacts = await getContacts(c.env.DB, user.id);
  const map = await getRuleContactMap(c.env.DB, user.id);
  const next = rules[0];
  const pushCount = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?').bind(user.id).first<{ n: number }>();
  const dto: StatusDTO = {
    user: userToDTO(user, nowMs),
    lastCheckinAt: user.last_checkin_at,
    nextDue: next
      ? {
          ruleId: next.id,
          ruleName: next.name,
          fireAt: next.next_fire_at!,
          satisfied: checkinSatisfies(user.last_checkin_at, next.next_fire_at!, next.window_hours),
          contactNames: (map.get(next.id) ?? []).map((id) => contacts.find((ct) => ct.id === id)?.name ?? '').filter(Boolean),
        }
      : null,
    contactsCount: contacts.length,
    rulesCount: rules.length,
    pushEnabled: (pushCount?.n ?? 0) > 0,
  };
  return c.json(dto);
});

api.post('/checkin', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ note?: string; source?: string }>().catch(() => ({}) as { note?: string; source?: string });
  const source = body.source === 'push' ? 'push' : 'app';
  const outcome = await performCheckin(c.env, user, source, str(body.note ?? '', 140));
  return c.json(outcome);
});

api.get('/events', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare('SELECT * FROM events WHERE user_id = ? ORDER BY at DESC LIMIT 50').bind(user.id).all<EventRow>();
  return c.json({ events: results.map(eventToDTO) });
});

// ---------- Contacts ----------

api.get('/contacts', async (c) => {
  const user = c.get('user');
  const bot = await getBotUsername(c.env);
  const rows = await getContacts(c.env.DB, user.id);
  return c.json({ contacts: rows.map((r) => contactToDTO(r, bot)) });
});

function validateContact(body: Record<string, unknown>, plan: 'free' | 'pro') {
  const name = str(body.name, 60);
  const channel = str(body.channel, 16) as Channel;
  const address = str(body.address, 120);
  if (!name) throw new HttpError(400, 'A name is required', 'name_required');
  if (!['telegram', 'email', 'sms', 'whatsapp'].includes(channel)) throw new HttpError(400, 'Unknown channel', 'bad_channel');
  if (!PLAN_LIMITS[plan].channels.includes(channel)) throw new HttpError(402, 'This channel needs the Pro plan', 'plan_required');
  if (channel === 'email' && !isEmail(address)) throw new HttpError(400, 'Invalid email address', 'bad_address');
  if ((channel === 'sms' || channel === 'whatsapp') && !isPhone(address.replace(/[\s().-]/g, '')))
    throw new HttpError(400, 'Phone number must be international, e.g. +420777123456', 'bad_address');
  const cleanAddress = channel === 'email' ? address.toLowerCase() : channel === 'telegram' ? '' : address.replace(/[\s().-]/g, '');
  return { name, channel, address: cleanAddress, announce: body.announceCheckins === undefined ? true : !!body.announceCheckins };
}

api.post('/contacts', async (c) => {
  const user = c.get('user');
  const plan = effectivePlan(user, Date.now());
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const existing = await getContacts(c.env.DB, user.id);
  if (existing.length >= PLAN_LIMITS[plan].maxContacts) throw new HttpError(402, 'Contact limit reached for your plan', 'plan_limit');
  const v = validateContact(body, plan);
  const id = newId('c_');
  const linkToken = v.channel === 'telegram' ? 'c_' + randomToken(24) : null;
  await c.env.DB.prepare(
    'INSERT INTO contacts (id, user_id, name, channel, address, link_token, verified, announce_checkins, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(id, user.id, v.name, v.channel, v.address, linkToken, v.channel === 'telegram' ? 0 : 1, v.announce ? 1 : 0, Date.now())
    .run();
  const row = await c.env.DB.prepare('SELECT * FROM contacts WHERE id = ?').bind(id).first<ContactRow>();
  return c.json({ contact: contactToDTO(row!, await getBotUsername(c.env)) }, 201);
});

api.patch('/contacts/:id', async (c) => {
  const user = c.get('user');
  const row = await c.env.DB.prepare('SELECT * FROM contacts WHERE id = ? AND user_id = ?').bind(c.req.param('id'), user.id).first<ContactRow>();
  if (!row) throw new HttpError(404, 'Contact not found', 'not_found');
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const name = body.name !== undefined ? str(body.name, 60) || row.name : row.name;
  const announce = body.announceCheckins !== undefined ? (body.announceCheckins ? 1 : 0) : row.announce_checkins;
  await c.env.DB.prepare('UPDATE contacts SET name = ?, announce_checkins = ? WHERE id = ?').bind(name, announce, row.id).run();
  const updated = await c.env.DB.prepare('SELECT * FROM contacts WHERE id = ?').bind(row.id).first<ContactRow>();
  return c.json({ contact: contactToDTO(updated!, await getBotUsername(c.env)) });
});

api.delete('/contacts/:id', async (c) => {
  const user = c.get('user');
  await c.env.DB.prepare('DELETE FROM contacts WHERE id = ? AND user_id = ?').bind(c.req.param('id'), user.id).run();
  return c.json({ ok: true });
});

api.post('/contacts/:id/test', async (c) => {
  const user = c.get('user');
  const row = await c.env.DB.prepare('SELECT * FROM contacts WHERE id = ? AND user_id = ?').bind(c.req.param('id'), user.id).first<ContactRow>();
  if (!row) throw new HttpError(404, 'Contact not found', 'not_found');
  const text = message(user.locale, 'testContact', { userName: user.name || user.email, contactName: row.name, time: '', appUrl: c.env.APP_URL });
  const r = await sendToContact(c.env, user, row, 'test', text);
  await logEvent(c.env.DB, user.id, 'test', { contact: row.name, ok: r.ok, error: r.error });
  if (!r.ok) throw new HttpError(502, r.error ?? 'send_failed', r.error ?? 'send_failed');
  return c.json({ ok: true, skipped: !!r.skipped });
});

// ---------- Rules ----------

api.get('/rules', async (c) => {
  const user = c.get('user');
  const rows = await getRules(c.env.DB, user.id);
  const map = await getRuleContactMap(c.env.DB, user.id);
  return c.json({ rules: rows.map((r) => ruleToDTO(r, map.get(r.id) ?? [])) });
});

async function validateRule(c: { env: Env }, userId: string, body: Record<string, unknown>, existing?: RuleRow) {
  const kind = (body.kind !== undefined ? str(body.kind, 16) : (existing?.kind ?? 'recurring')) as RuleKind;
  if (kind !== 'recurring' && kind !== 'once') throw new HttpError(400, 'Unknown rule kind', 'bad_kind');
  const name = body.name !== undefined ? str(body.name, 60) : (existing?.name ?? '');
  const timeLocal = body.timeLocal !== undefined ? str(body.timeLocal, 5) : (existing?.time_local ?? '20:00');
  if (!parseTimeLocal(timeLocal)) throw new HttpError(400, 'Time must be HH:MM', 'bad_time');
  const days = body.days !== undefined ? clampInt(body.days, 0, 127, 127) : (existing?.days ?? 127);
  if (kind === 'recurring' && days === 0) throw new HttpError(400, 'Pick at least one day', 'no_days');
  const onceAt = body.onceAt !== undefined ? clampInt(body.onceAt, 0, 4102444800000, 0) || null : (existing?.once_at ?? null);
  if (kind === 'once' && (onceAt === null || onceAt < Date.now() - 60_000)) throw new HttpError(400, 'The deadline must be in the future', 'bad_once');
  const windowHours = body.windowHours !== undefined ? clampInt(body.windowHours, 1, 24, 12) : (existing?.window_hours ?? 12);
  const remindBeforeMin = body.remindBeforeMin !== undefined ? clampInt(body.remindBeforeMin, 0, 240, 30) : (existing?.remind_before_min ?? 30);
  const msg = body.message !== undefined ? str(body.message, 300) : (existing?.message ?? '');
  const enabled = body.enabled !== undefined ? !!body.enabled : (existing ? !!existing.enabled : true);
  let contactIds: string[] | undefined;
  if (Array.isArray(body.contactIds)) {
    const owned = new Set((await getContacts(c.env.DB, userId)).map((ct) => ct.id));
    contactIds = body.contactIds.filter((id): id is string => typeof id === 'string' && owned.has(id));
    if (contactIds.length === 0) throw new HttpError(400, 'Pick at least one contact', 'no_contacts');
  }
  return { kind, name, timeLocal, days, onceAt, windowHours, remindBeforeMin, msg, enabled, contactIds };
}

api.post('/rules', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const v = await validateRule(c, user.id, body);
  if (!v.contactIds) throw new HttpError(400, 'Pick at least one contact', 'no_contacts');
  const id = newId('r_');
  const nowMs = Date.now();
  const next = v.enabled
    ? computeNextTimes({ kind: v.kind, timeLocal: v.timeLocal, days: v.days, onceAt: v.onceAt, remindBeforeMin: v.remindBeforeMin }, user.tz, nowMs)
    : { nextFireAt: null, nextRemindAt: null };
  const stmts = [
    c.env.DB.prepare(
      'INSERT INTO rules (id, user_id, kind, name, time_local, days, once_at, window_hours, remind_before_min, message, enabled, next_fire_at, next_remind_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(id, user.id, v.kind, v.name, v.timeLocal, v.days, v.onceAt, v.windowHours, v.remindBeforeMin, v.msg, v.enabled ? 1 : 0, next.nextFireAt, next.nextRemindAt, nowMs),
    ...v.contactIds.map((cid) => c.env.DB.prepare('INSERT INTO rule_contacts (rule_id, contact_id) VALUES (?, ?)').bind(id, cid)),
  ];
  await c.env.DB.batch(stmts);
  const row = await c.env.DB.prepare('SELECT * FROM rules WHERE id = ?').bind(id).first<RuleRow>();
  return c.json({ rule: ruleToDTO(row!, v.contactIds) }, 201);
});

api.patch('/rules/:id', async (c) => {
  const user = c.get('user');
  const row = await c.env.DB.prepare('SELECT * FROM rules WHERE id = ? AND user_id = ?').bind(c.req.param('id'), user.id).first<RuleRow>();
  if (!row) throw new HttpError(404, 'Rule not found', 'not_found');
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const v = await validateRule(c, user.id, body, row);
  const nowMs = Date.now();
  const next = v.enabled
    ? computeNextTimes({ kind: v.kind, timeLocal: v.timeLocal, days: v.days, onceAt: v.onceAt, remindBeforeMin: v.remindBeforeMin }, user.tz, nowMs)
    : { nextFireAt: null, nextRemindAt: null };
  const stmts = [
    c.env.DB.prepare(
      'UPDATE rules SET kind = ?, name = ?, time_local = ?, days = ?, once_at = ?, window_hours = ?, remind_before_min = ?, message = ?, enabled = ?, next_fire_at = ?, next_remind_at = ? WHERE id = ?',
    ).bind(v.kind, v.name, v.timeLocal, v.days, v.onceAt, v.windowHours, v.remindBeforeMin, v.msg, v.enabled ? 1 : 0, next.nextFireAt, next.nextRemindAt, row.id),
  ];
  if (v.contactIds) {
    stmts.push(c.env.DB.prepare('DELETE FROM rule_contacts WHERE rule_id = ?').bind(row.id));
    stmts.push(...v.contactIds.map((cid) => c.env.DB.prepare('INSERT INTO rule_contacts (rule_id, contact_id) VALUES (?, ?)').bind(row.id, cid)));
  }
  await c.env.DB.batch(stmts);
  const updated = await c.env.DB.prepare('SELECT * FROM rules WHERE id = ?').bind(row.id).first<RuleRow>();
  const map = await getRuleContactMap(c.env.DB, user.id);
  return c.json({ rule: ruleToDTO(updated!, map.get(row.id) ?? []) });
});

api.delete('/rules/:id', async (c) => {
  const user = c.get('user');
  await c.env.DB.prepare('DELETE FROM rules WHERE id = ? AND user_id = ?').bind(c.req.param('id'), user.id).run();
  return c.json({ ok: true });
});

/** Send the alert now, marked as a test, so the user sees what contacts would receive. */
api.post('/rules/:id/test', async (c) => {
  const user = c.get('user');
  const row = await c.env.DB.prepare('SELECT * FROM rules WHERE id = ? AND user_id = ?').bind(c.req.param('id'), user.id).first<RuleRow>();
  if (!row) throw new HttpError(404, 'Rule not found', 'not_found');
  const nowMs = Date.now();
  const sentTo = await sendAlert(c.env, user, row, row.next_fire_at ?? nowMs, nowMs, true);
  return c.json({ ok: true, sentTo });
});

// ---------- Web push ----------

api.post('/push/subscribe', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ endpoint?: string; keys?: { p256dh?: string; auth?: string } }>().catch(() => ({}) as never);
  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) throw new HttpError(400, 'Invalid subscription', 'bad_subscription');
  await c.env.DB.prepare(
    'INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth',
  )
    .bind(newId('ps_'), user.id, body.endpoint, body.keys.p256dh, body.keys.auth, Date.now())
    .run();
  return c.json({ ok: true });
});

api.post('/push/unsubscribe', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ endpoint?: string }>().catch(() => ({}) as never);
  if (body.endpoint) await c.env.DB.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').bind(user.id, body.endpoint).run();
  else await c.env.DB.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').bind(user.id).run();
  return c.json({ ok: true });
});

api.post('/push/test', async (c) => {
  const user = c.get('user');
  const { sent } = await notifyUser(
    c.env,
    user,
    'test',
    message(user.locale, 'pushTest'),
    { title: 'iamhome', body: message(user.locale, 'pushTestBody'), tag: 'test', url: '/app' },
  );
  return c.json({ ok: true, sent });
});

// ---------- Dev helpers (only when DEV_MODE=1) ----------

api.get('/dev/outbox', (c) => {
  if (!isDev(c.env)) return c.json({ error: 'not_found' }, 404);
  return c.json({ outbox: devOutbox.slice(-50).reverse() });
});

api.post('/dev/tick', async (c) => {
  if (!isDev(c.env)) return c.json({ error: 'not_found' }, 404);
  const { runTick } = await import('../scheduler');
  const at = Number(c.req.query('now')) || Date.now();
  return c.json(await runTick(c.env, at));
});

api.post('/dev/plan', async (c) => {
  if (!isDev(c.env)) return c.json({ error: 'not_found' }, 404);
  const user = c.get('user');
  const body = await c.req.json<{ plan?: string }>().catch(() => ({}) as never);
  await c.env.DB.prepare('UPDATE users SET plan = ?, plan_until = NULL WHERE id = ?').bind(body.plan === 'pro' ? 'pro' : 'free', user.id).run();
  return c.json({ ok: true });
});

/** Simulate a Telegram contact opening the deep link (dev only). */
api.post('/dev/telegram-link', async (c) => {
  if (!isDev(c.env)) return c.json({ error: 'not_found' }, 404);
  const user = c.get('user');
  const body = await c.req.json<{ token?: string; chatId?: string }>().catch(() => ({}) as never);
  const { handleStart } = await import('./telegram');
  const reply = await handleStart(c.env, body.token ?? '', body.chatId ?? 'dev-chat-' + randomToken(6));
  return c.json({ ok: true, reply, userId: user.id });
});
