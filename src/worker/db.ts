import type { Channel, ContactDTO, EventDTO, Locale, Plan, RuleDTO, RuleKind, UserDTO } from '../shared/types';

export interface UserRow {
  id: string;
  email: string;
  name: string;
  tz: string;
  locale: Locale;
  plan: Plan;
  plan_until: number | null;
  ls_customer_id: string | null;
  hook_token: string;
  telegram_chat_id: string | null;
  telegram_link_token: string | null;
  last_checkin_at: number | null;
  created_at: number;
}

export interface ContactRow {
  id: string;
  user_id: string;
  name: string;
  channel: Channel;
  address: string;
  telegram_chat_id: string | null;
  link_token: string | null;
  verified: number;
  announce_checkins: number;
  created_at: number;
}

export interface RuleRow {
  id: string;
  user_id: string;
  kind: RuleKind;
  name: string;
  time_local: string;
  days: number;
  once_at: number | null;
  window_hours: number;
  remind_before_min: number;
  message: string;
  enabled: number;
  next_fire_at: number | null;
  next_remind_at: number | null;
  last_fired_at: number | null;
  last_result: RuleDTO['lastResult'];
  created_at: number;
}

export interface EventRow {
  id: string;
  user_id: string;
  at: number;
  type: EventDTO['type'];
  detail: string;
}

export interface PushRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: number;
}

export function effectivePlan(u: UserRow, nowMs: number): Plan {
  if (u.plan === 'pro' && (u.plan_until === null || u.plan_until > nowMs)) return 'pro';
  return 'free';
}

export function userToDTO(u: UserRow, nowMs: number): UserDTO {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    tz: u.tz,
    locale: u.locale,
    plan: effectivePlan(u, nowMs),
    planUntil: u.plan_until,
    hookToken: u.hook_token,
    telegramLinked: !!u.telegram_chat_id,
    lastCheckinAt: u.last_checkin_at,
    createdAt: u.created_at,
  };
}

export function contactToDTO(c: ContactRow, botUsername: string | null): ContactDTO {
  const dto: ContactDTO = {
    id: c.id,
    name: c.name,
    channel: c.channel,
    address: c.address,
    verified: !!c.verified,
    announceCheckins: !!c.announce_checkins,
    createdAt: c.created_at,
  };
  if (c.channel === 'telegram' && c.link_token) {
    dto.telegramLink = botUsername ? `https://t.me/${botUsername}?start=${c.link_token}` : `tg://start?token=${c.link_token}`;
  }
  return dto;
}

export function ruleToDTO(r: RuleRow, contactIds: string[]): RuleDTO {
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    timeLocal: r.time_local,
    days: r.days,
    onceAt: r.once_at,
    windowHours: r.window_hours,
    remindBeforeMin: r.remind_before_min,
    message: r.message,
    enabled: !!r.enabled,
    contactIds,
    nextFireAt: r.next_fire_at,
    nextRemindAt: r.next_remind_at,
    lastFiredAt: r.last_fired_at,
    lastResult: r.last_result,
    createdAt: r.created_at,
  };
}

export function eventToDTO(e: EventRow): EventDTO {
  let detail: Record<string, unknown> = {};
  try {
    detail = JSON.parse(e.detail);
  } catch {
    /* ignore */
  }
  return { id: e.id, at: e.at, type: e.type, detail };
}

export async function getUser(db: D1Database, id: string): Promise<UserRow | null> {
  return db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
}

export async function getContactsForRule(db: D1Database, ruleId: string): Promise<ContactRow[]> {
  const { results } = await db
    .prepare('SELECT c.* FROM contacts c JOIN rule_contacts rc ON rc.contact_id = c.id WHERE rc.rule_id = ? ORDER BY c.created_at')
    .bind(ruleId)
    .all<ContactRow>();
  return results;
}

export async function getContacts(db: D1Database, userId: string): Promise<ContactRow[]> {
  const { results } = await db.prepare('SELECT * FROM contacts WHERE user_id = ? ORDER BY created_at').bind(userId).all<ContactRow>();
  return results;
}

export async function getRules(db: D1Database, userId: string): Promise<RuleRow[]> {
  const { results } = await db.prepare('SELECT * FROM rules WHERE user_id = ? ORDER BY created_at').bind(userId).all<RuleRow>();
  return results;
}

export async function getRuleContactMap(db: D1Database, userId: string): Promise<Map<string, string[]>> {
  const { results } = await db
    .prepare('SELECT rc.rule_id, rc.contact_id FROM rule_contacts rc JOIN rules r ON r.id = rc.rule_id WHERE r.user_id = ?')
    .bind(userId)
    .all<{ rule_id: string; contact_id: string }>();
  const map = new Map<string, string[]>();
  for (const row of results) {
    const list = map.get(row.rule_id) ?? [];
    list.push(row.contact_id);
    map.set(row.rule_id, list);
  }
  return map;
}

export async function logEvent(
  db: D1Database,
  userId: string,
  type: EventDTO['type'],
  detail: Record<string, unknown>,
  at = Date.now(),
): Promise<void> {
  const id = 'ev_' + crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  await db.prepare('INSERT INTO events (id, user_id, at, type, detail) VALUES (?, ?, ?, ?, ?)').bind(id, userId, at, type, JSON.stringify(detail)).run();
}
