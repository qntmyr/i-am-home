// The core action: a check-in. Records it, announces it to contacts, settles pending one-off rules.
import type { Env } from './env';
import { getContacts, logEvent, type RuleRow, type UserRow } from './db';
import { newId } from './util';
import { sendToContact } from './notify';
import { message } from '../shared/messages';
import { checkinSatisfies, formatLocalTime } from '../shared/schedule';
import type { CheckinSource } from '../shared/types';

/** Don't spam contacts if the user taps the button repeatedly. */
const ANNOUNCE_COOLDOWN_MS = 30 * 60 * 1000;

export interface CheckinOutcome {
  at: number;
  announcedTo: string[];
  settledRules: string[];
}

export async function performCheckin(env: Env, user: UserRow, source: CheckinSource, note = ''): Promise<CheckinOutcome> {
  const at = Date.now();
  const db = env.DB;
  const previous = user.last_checkin_at;

  await db.batch([
    db.prepare('INSERT INTO checkins (id, user_id, at, source, note) VALUES (?, ?, ?, ?, ?)').bind(newId('ci_'), user.id, at, source, note),
    db.prepare('UPDATE users SET last_checkin_at = ? WHERE id = ?').bind(at, user.id),
  ]);
  user.last_checkin_at = at;
  await logEvent(db, user.id, 'checkin', { source, note }, at);

  const outcome: CheckinOutcome = { at, announcedTo: [], settledRules: [] };

  // Announce to contacts who opted in, unless we announced very recently.
  const shouldAnnounce = previous === null || at - previous > ANNOUNCE_COOLDOWN_MS;
  if (shouldAnnounce) {
    const contacts = (await getContacts(db, user.id)).filter((c) => c.announce_checkins && (c.channel !== 'telegram' || c.telegram_chat_id));
    for (const contact of contacts) {
      const text = message(user.locale, 'announce', {
        userName: user.name || user.email,
        contactName: contact.name,
        time: formatLocalTime(at, user.tz, user.locale),
        appUrl: env.APP_URL,
      });
      const r = await sendToContact(env, user, contact, 'announce', text);
      if (r.ok) outcome.announcedTo.push(contact.name);
    }
    if (outcome.announcedTo.length) await logEvent(db, user.id, 'announce', { contacts: outcome.announcedTo, source }, at);
  }

  // A one-off rule ("home by 23:30") is settled by this check-in if it is inside the window.
  const { results: onceRules } = await db
    .prepare("SELECT * FROM rules WHERE user_id = ? AND enabled = 1 AND kind = 'once' AND next_fire_at IS NOT NULL")
    .bind(user.id)
    .all<RuleRow>();
  for (const rule of onceRules) {
    if (rule.next_fire_at !== null && checkinSatisfies(at, rule.next_fire_at, rule.window_hours)) {
      await db.prepare("UPDATE rules SET enabled = 0, next_fire_at = NULL, next_remind_at = NULL, last_fired_at = ?, last_result = 'ok' WHERE id = ?")
        .bind(at, rule.id)
        .run();
      await logEvent(db, user.id, 'rule_ok', { ruleId: rule.id, ruleName: rule.name, settledBy: 'checkin' }, at);
      outcome.settledRules.push(rule.id);
    }
  }
  return outcome;
}
