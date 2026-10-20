// Outbound channels: Telegram, email (Resend), SMS / WhatsApp (Twilio), Web Push (VAPID).
import { buildPushPayload, type PushSubscription } from '@block65/webcrypto-web-push';
import type { Env } from './env';
import { isDev } from './env';
import type { ContactRow, PushRow, UserRow } from './db';
import { newId } from './util';
import type { Channel } from '../shared/types';

export interface SendResult {
  ok: boolean;
  error?: string;
  skipped?: boolean;
}

/** In-memory log of what would have been sent, used by DEV_MODE and tests. */
export const devOutbox: Array<{ channel: string; to: string; text: string; at: number }> = [];

function remember(channel: string, to: string, text: string): void {
  devOutbox.push({ channel, to, text, at: Date.now() });
  if (devOutbox.length > 200) devOutbox.splice(0, devOutbox.length - 200);
}

export async function sendTelegram(env: Env, chatId: string, text: string): Promise<SendResult> {
  if (!env.TELEGRAM_BOT_TOKEN) {
    remember('telegram', chatId, text);
    return isDev(env) ? { ok: true, skipped: true } : { ok: false, error: 'telegram_not_configured' };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    if (!res.ok) return { ok: false, error: `telegram_${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `telegram_fetch: ${(e as Error).message}` };
  }
}

export async function sendEmail(env: Env, to: string, subject: string, text: string): Promise<SendResult> {
  if (!env.RESEND_API_KEY) {
    remember('email', to, `${subject}\n\n${text}`);
    return isDev(env) ? { ok: true, skipped: true } : { ok: false, error: 'email_not_configured' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_FROM ?? 'I am home <noreply@example.com>', to: [to], subject, text }),
    });
    if (!res.ok) return { ok: false, error: `resend_${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `resend_fetch: ${(e as Error).message}` };
  }
}

export async function sendTwilio(env: Env, channel: 'sms' | 'whatsapp', to: string, text: string): Promise<SendResult> {
  const from = channel === 'sms' ? env.TWILIO_FROM_SMS : env.TWILIO_FROM_WHATSAPP;
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !from) {
    remember(channel, to, text);
    return isDev(env) ? { ok: true, skipped: true } : { ok: false, error: `${channel}_not_configured` };
  }
  const toAddr = channel === 'whatsapp' ? `whatsapp:${to}` : to;
  const fromAddr = channel === 'whatsapp' && !from.startsWith('whatsapp:') ? `whatsapp:${from}` : from;
  try {
    const body = new URLSearchParams({ To: toAddr, From: fromAddr, Body: text });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        authorization: 'Basic ' + btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`),
        'content-type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!res.ok) return { ok: false, error: `twilio_${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `twilio_fetch: ${(e as Error).message}` };
  }
}

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  /** Show an "I'm home" action button on the notification. */
  checkinAction?: boolean;
}

export async function sendPush(env: Env, sub: PushRow, payload: PushPayload): Promise<SendResult & { gone?: boolean }> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    remember('push', sub.endpoint, JSON.stringify(payload));
    return isDev(env) ? { ok: true, skipped: true } : { ok: false, error: 'push_not_configured' };
  }
  const subscription: PushSubscription = {
    endpoint: sub.endpoint,
    expirationTime: null,
    keys: { p256dh: sub.p256dh, auth: sub.auth },
  };
  try {
    const init = await buildPushPayload(
      { data: JSON.stringify(payload), options: { ttl: 3600, urgency: 'high' } },
      subscription,
      { subject: env.VAPID_SUBJECT ?? 'mailto:admin@example.com', publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY },
    );
    const res = await fetch(sub.endpoint, init);
    if (res.status === 404 || res.status === 410) return { ok: false, gone: true, error: `push_${res.status}` };
    if (!res.ok) return { ok: false, error: `push_${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `push_fetch: ${(e as Error).message}` };
  }
}

/** Send a text to a contact on their channel and record the delivery. */
export async function sendToContact(
  env: Env,
  user: UserRow,
  contact: ContactRow,
  kind: string,
  text: string,
  subject?: string,
): Promise<SendResult> {
  let result: SendResult;
  switch (contact.channel) {
    case 'telegram':
      result = contact.telegram_chat_id ? await sendTelegram(env, contact.telegram_chat_id, text) : { ok: false, error: 'telegram_not_linked' };
      break;
    case 'email':
      result = await sendEmail(env, contact.address, subject ?? `${env.APP_NAME}: ${user.name || user.email}`, text);
      break;
    case 'sms':
    case 'whatsapp':
      result = await sendTwilio(env, contact.channel, contact.address, text);
      break;
    default:
      result = { ok: false, error: 'unknown_channel' };
  }
  await recordDelivery(env, user.id, contact.id, contact.channel, kind, result);
  return result;
}

/** Notify the user themselves (reminders): Telegram if linked, every push subscription, else email. */
export async function notifyUser(
  env: Env,
  user: UserRow,
  kind: string,
  text: string,
  push: PushPayload,
): Promise<{ sent: number }> {
  let sent = 0;
  if (user.telegram_chat_id) {
    const r = await sendTelegram(env, user.telegram_chat_id, text);
    await recordDelivery(env, user.id, null, 'telegram', kind, r);
    if (r.ok) sent++;
  }
  const { results: subs } = await env.DB.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').bind(user.id).all<PushRow>();
  for (const sub of subs) {
    const r = await sendPush(env, sub, push);
    if (r.gone) await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(sub.id).run();
    await recordDelivery(env, user.id, null, 'push', kind, r);
    if (r.ok) sent++;
  }
  if (sent === 0) {
    const r = await sendEmail(env, user.email, push.title, text);
    await recordDelivery(env, user.id, null, 'email', kind, r);
    if (r.ok) sent++;
  }
  return { sent };
}

export async function recordDelivery(
  env: Env,
  userId: string,
  contactId: string | null,
  channel: Channel | 'push',
  kind: string,
  result: SendResult,
): Promise<void> {
  await env.DB.prepare('INSERT INTO deliveries (id, user_id, contact_id, channel, kind, ok, error, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(newId('dl_'), userId, contactId, channel, kind, result.ok ? 1 : 0, result.error ?? null, Date.now())
    .run();
}
