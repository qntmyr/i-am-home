// Telegram bot webhook: links contacts and users, accepts /home check-ins.
import { Hono } from 'hono';
import type { Env } from '../env';
import { getUser, logEvent, type ContactRow, type UserRow } from '../db';
import { performCheckin } from '../checkin';
import { sendTelegram } from '../notify';
import { message } from '../../shared/messages';
import { formatLocalDateTime, formatLocalTime } from '../../shared/schedule';
import { timingSafeEqual } from '../util';

export const telegram = new Hono<{ Bindings: Env }>();

let cachedBotUsername: string | null | undefined;

export async function getBotUsername(env: Env): Promise<string | null> {
  if (env.TELEGRAM_BOT_USERNAME) return env.TELEGRAM_BOT_USERNAME.replace(/^@/, '');
  if (cachedBotUsername !== undefined) return cachedBotUsername;
  if (!env.TELEGRAM_BOT_TOKEN) {
    cachedBotUsername = null;
    return null;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`);
    const data = (await res.json()) as { ok: boolean; result?: { username?: string } };
    cachedBotUsername = data.ok && data.result?.username ? data.result.username : null;
  } catch {
    cachedBotUsername = null;
  }
  return cachedBotUsername;
}

interface TelegramUpdate {
  message?: {
    chat: { id: number | string; first_name?: string };
    text?: string;
  };
}

/** Handles `/start <token>`: links either a contact (c_…) or the user's own account (u_…). */
export async function handleStart(env: Env, token: string, chatId: string): Promise<string> {
  if (token.startsWith('c_')) {
    const contact = await env.DB.prepare('SELECT * FROM contacts WHERE link_token = ?').bind(token).first<ContactRow>();
    if (!contact) return 'This link is not valid any more.';
    const user = await getUser(env.DB, contact.user_id);
    if (!user) return 'This link is not valid any more.';
    await env.DB.prepare('UPDATE contacts SET telegram_chat_id = ?, verified = 1 WHERE id = ?').bind(chatId, contact.id).run();
    await logEvent(env.DB, user.id, 'contact_linked', { contact: contact.name, channel: 'telegram' });
    return message(user.locale, 'contactLinked', { userName: user.name || user.email, contactName: contact.name, time: '', appUrl: env.APP_URL });
  }
  if (token.startsWith('u_')) {
    const user = await env.DB.prepare('SELECT * FROM users WHERE telegram_link_token = ?').bind(token).first<UserRow>();
    if (!user) return 'This link is not valid any more.';
    await env.DB.prepare('UPDATE users SET telegram_chat_id = ?, telegram_link_token = NULL WHERE id = ?').bind(chatId, user.id).run();
    return message(user.locale, 'userLinked', { userName: user.name, contactName: '', time: '', appUrl: env.APP_URL });
  }
  return `👋 This is the ${env.APP_NAME} bot. Open ${env.APP_URL} to set up check-ins, then use the link from the app to connect this chat.`;
}

async function handleUpdate(env: Env, update: TelegramUpdate): Promise<void> {
  const msg = update.message;
  if (!msg?.text) return;
  const chatId = String(msg.chat.id);
  const text = msg.text.trim();
  const [command, ...rest] = text.split(/\s+/);
  const arg = rest.join(' ');
  const cmd = (command ?? '').toLowerCase().replace(/@.*$/, '');

  if (cmd === '/start') {
    await sendTelegram(env, chatId, await handleStart(env, arg, chatId));
    return;
  }

  const user = await env.DB.prepare('SELECT * FROM users WHERE telegram_chat_id = ?').bind(chatId).first<UserRow>();
  if (cmd === '/home' || cmd === '/checkin' || cmd === '/rentre' || cmd === '/rentree') {
    if (!user) {
      await sendTelegram(env, chatId, `Link your account first: open ${env.APP_URL}/app/settings and tap "Connect Telegram".`);
      return;
    }
    const outcome = await performCheckin(env, user, 'telegram', arg.slice(0, 140));
    const time = formatLocalTime(outcome.at, user.tz, user.locale);
    const ack = message(user.locale, 'checkinAck', {
      userName: user.name,
      contactName: outcome.announcedTo.length ? `→ ${outcome.announcedTo.join(', ')}` : '',
      time,
      appUrl: env.APP_URL,
    });
    await sendTelegram(env, chatId, ack.trim());
    return;
  }
  if (cmd === '/status') {
    if (!user) {
      await sendTelegram(env, chatId, `Not linked. Open ${env.APP_URL}/app/settings to connect this chat.`);
      return;
    }
    const next = await env.DB.prepare('SELECT name, next_fire_at FROM rules WHERE user_id = ? AND enabled = 1 AND next_fire_at IS NOT NULL ORDER BY next_fire_at LIMIT 1')
      .bind(user.id)
      .first<{ name: string; next_fire_at: number }>();
    const last = user.last_checkin_at ? formatLocalDateTime(user.last_checkin_at, user.tz, user.locale) : '—';
    const nextTxt = next ? `${next.name || 'Deadline'}: ${formatLocalDateTime(next.next_fire_at, user.tz, user.locale)}` : user.locale === 'fr' ? 'aucune' : 'none';
    await sendTelegram(
      env,
      chatId,
      user.locale === 'fr' ? `Dernier check-in : ${last}\nProchaine échéance : ${nextTxt}` : `Last check-in: ${last}\nNext deadline: ${nextTxt}`,
    );
    return;
  }
  if (cmd === '/help' || cmd.startsWith('/')) {
    await sendTelegram(env, chatId, `/home – check in\n/status – last check-in and next deadline\n${env.APP_URL}`);
  }
}

telegram.post('/webhook', async (c) => {
  const expected = c.env.TELEGRAM_WEBHOOK_SECRET;
  if (expected) {
    const got = c.req.header('x-telegram-bot-api-secret-token') ?? '';
    if (!timingSafeEqual(got, expected)) return c.text('forbidden', 403);
  }
  const update = await c.req.json<TelegramUpdate>().catch(() => null);
  if (update) {
    c.executionCtx.waitUntil(handleUpdate(c.env, update).catch((e) => console.error('telegram update failed', e)));
  }
  return c.json({ ok: true });
});
