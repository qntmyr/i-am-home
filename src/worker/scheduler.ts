// Runs every minute from the Cron Trigger. Sends reminders and alerts, then schedules the next occurrence.
import type { Env } from './env';
import { getContactsForRule, getUser, logEvent, type RuleRow, type UserRow } from './db';
import { notifyUser, sendToContact } from './notify';
import { message } from '../shared/messages';
import { checkinSatisfies, computeNextTimes, formatLocalTime } from '../shared/schedule';

/** If the cron was down for longer than this, we don't alert on stale deadlines. */
const STALE_MS = 6 * 60 * 60 * 1000;

export interface TickReport {
  reminders: number;
  alerts: number;
  satisfied: number;
  skipped: number;
}

export async function runTick(env: Env, nowMs = Date.now()): Promise<TickReport> {
  const report: TickReport = { reminders: 0, alerts: 0, satisfied: 0, skipped: 0 };
  const db = env.DB;

  // 1. Reminders to the user before the deadline.
  const { results: remindRules } = await db
    .prepare('SELECT * FROM rules WHERE enabled = 1 AND next_remind_at IS NOT NULL AND next_remind_at <= ? ORDER BY next_remind_at LIMIT 200')
    .bind(nowMs)
    .all<RuleRow>();
  for (const rule of remindRules) {
    // Claim the reminder first so a concurrent tick doesn't send it twice.
    const claim = await db.prepare('UPDATE rules SET next_remind_at = NULL WHERE id = ? AND next_remind_at = ?').bind(rule.id, rule.next_remind_at).run();
    if (!claim.meta.changes) continue;
    const user = await getUser(db, rule.user_id);
    if (!user || rule.next_fire_at === null) continue;
    if (checkinSatisfies(user.last_checkin_at, rule.next_fire_at, rule.window_hours)) continue;
    if (nowMs > rule.next_fire_at) continue; // too late for a reminder, the alert path will handle it
    await sendReminder(env, user, rule, rule.next_fire_at);
    report.reminders++;
  }

  // 2. Deadlines.
  const { results: dueRules } = await db
    .prepare('SELECT * FROM rules WHERE enabled = 1 AND next_fire_at IS NOT NULL AND next_fire_at <= ? ORDER BY next_fire_at LIMIT 200')
    .bind(nowMs)
    .all<RuleRow>();
  for (const rule of dueRules) {
    const fireAt = rule.next_fire_at!;
    const user = await getUser(db, rule.user_id);
    if (!user) continue;
    const next = rule.kind === 'once' ? { nextFireAt: null, nextRemindAt: null } : computeNextTimes(ruleTiming(rule), user.tz, fireAt);
    // Claim this occurrence atomically by moving the rule to its next occurrence.
    const claim = await db
      .prepare('UPDATE rules SET next_fire_at = ?, next_remind_at = ?, enabled = ?, last_fired_at = ? WHERE id = ? AND next_fire_at = ?')
      .bind(next.nextFireAt, next.nextRemindAt, rule.kind === 'once' ? 0 : 1, fireAt, rule.id, fireAt)
      .run();
    if (!claim.meta.changes) continue;

    let result: 'alerted' | 'ok' | 'skipped';
    if (nowMs - fireAt > STALE_MS) {
      result = 'skipped';
      report.skipped++;
    } else if (checkinSatisfies(user.last_checkin_at, fireAt, rule.window_hours)) {
      result = 'ok';
      report.satisfied++;
      await logEvent(db, user.id, 'rule_ok', { ruleId: rule.id, ruleName: rule.name, fireAt }, nowMs);
    } else {
      result = 'alerted';
      report.alerts++;
      await sendAlert(env, user, rule, fireAt, nowMs);
    }
    await db.prepare('UPDATE rules SET last_result = ? WHERE id = ?').bind(result, rule.id).run();
  }
  return report;
}

export function ruleTiming(rule: RuleRow) {
  return {
    kind: rule.kind,
    timeLocal: rule.time_local,
    days: rule.days,
    onceAt: rule.once_at,
    remindBeforeMin: rule.remind_before_min,
  };
}

async function sendReminder(env: Env, user: UserRow, rule: RuleRow, fireAt: number): Promise<void> {
  const contacts = await getContactsForRule(env.DB, rule.id);
  const contactNames = contacts.map((c) => c.name).join(', ') || (user.locale === 'fr' ? 'tes proches' : 'your contacts');
  const deadline = formatLocalTime(fireAt, user.tz, user.locale);
  const text = message(user.locale, 'reminder', {
    userName: user.name || user.email,
    contactName: contactNames,
    time: deadline,
    deadline,
    appUrl: env.APP_URL,
  });
  const { sent } = await notifyUser(env, user, 'reminder', text, {
    title: user.locale === 'fr' ? 'Tu es rentré ?' : 'Are you home yet?',
    body:
      user.locale === 'fr'
        ? `${contactNames} sera prévenu·e à ${deadline} si tu ne fais pas ton check-in.`
        : `${contactNames} will be told at ${deadline} if you don't check in.`,
    tag: `reminder-${rule.id}`,
    url: '/app',
    checkinAction: true,
  });
  await logEvent(env.DB, user.id, 'reminder', { ruleId: rule.id, ruleName: rule.name, fireAt, sent });
}

export async function sendAlert(env: Env, user: UserRow, rule: RuleRow, fireAt: number, nowMs: number, test = false): Promise<string[]> {
  const contacts = await getContactsForRule(env.DB, rule.id);
  const deadline = formatLocalTime(fireAt, user.tz, user.locale);
  const sentTo: string[] = [];
  const failed: string[] = [];
  for (const contact of contacts) {
    const text = message(user.locale, 'alert', {
      userName: user.name || user.email,
      contactName: contact.name,
      time: deadline,
      deadline,
      custom: rule.message,
      appUrl: env.APP_URL,
    });
    const r = await sendToContact(env, user, contact, test ? 'test' : 'alert', (test ? '[TEST] ' : '') + text);
    (r.ok ? sentTo : failed).push(contact.name);
  }
  await logEvent(env.DB, user.id, test ? 'test' : 'alert', { ruleId: rule.id, ruleName: rule.name, fireAt, sentTo, failed }, nowMs);
  // Tell the user too, so they know their contacts were alerted.
  if (!test) {
    await notifyUser(
      env,
      user,
      'alert_copy',
      user.locale === 'fr'
        ? `⚠️ Pas de check-in avant ${deadline} : ${sentTo.join(', ') || 'personne'} a été prévenu·e.`
        : `⚠️ No check-in by ${deadline}: ${sentTo.join(', ') || 'nobody'} has been told.`,
      {
        title: user.locale === 'fr' ? 'Tes proches ont été prévenus' : 'Your contacts were alerted',
        body: sentTo.join(', '),
        tag: `alert-${rule.id}`,
        url: '/app',
      },
    );
  }
  return sentTo;
}
