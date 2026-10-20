// Passwordless auth: email magic links + cookie sessions stored in D1.
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Env } from './env';
import { isDev } from './env';
import { getUser, type UserRow } from './db';
import { HttpError, isEmail, newId, randomToken, sha256Hex } from './util';
import { sendEmail } from './notify';
import { message, normalizeLocale } from '../shared/messages';
import { isValidTimeZone } from '../shared/schedule';

export const SESSION_COOKIE = 'iah_session';
const SESSION_TTL_MS = 90 * 24 * 3600 * 1000;
const MAGIC_TTL_MS = 15 * 60 * 1000;
const MAGIC_COOLDOWN_MS = 30 * 1000;

export type Vars = { user: UserRow };
export type AppContext = Context<{ Bindings: Env; Variables: Vars }>;

export async function requestMagicLink(
  env: Env,
  emailRaw: string,
  locale: string | undefined,
  tz: string | undefined,
): Promise<{ ok: true; devLink?: string }> {
  const email = emailRaw.trim().toLowerCase();
  if (!isEmail(email)) throw new HttpError(400, 'Invalid email address', 'invalid_email');
  const nowMs = Date.now();
  const recent = await env.DB.prepare('SELECT created_at FROM magic_links WHERE email = ? ORDER BY created_at DESC LIMIT 1')
    .bind(email)
    .first<{ created_at: number }>();
  if (recent && nowMs - recent.created_at < MAGIC_COOLDOWN_MS) {
    throw new HttpError(429, 'Please wait a moment before requesting another link', 'too_soon');
  }
  const token = randomToken(40);
  await env.DB.prepare('INSERT INTO magic_links (token_hash, email, expires_at, used, created_at) VALUES (?, ?, ?, 0, ?)')
    .bind(await sha256Hex(token), email, nowMs + MAGIC_TTL_MS, nowMs)
    .run();
  const loc = normalizeLocale(locale);
  const params = new URLSearchParams({ token, locale: loc });
  if (tz && tz.length < 64 && isValidTimeZone(tz)) params.set('tz', tz);
  const link = `${env.APP_URL}/api/auth/verify?${params.toString()}`;
  const ctx = { userName: '', contactName: '', time: '', custom: link, appUrl: env.APP_URL };
  const result = await sendEmail(env, email, message(loc, 'magicSubject', ctx), message(loc, 'magicBody', ctx));
  if (!result.ok && !isDev(env)) throw new HttpError(502, 'Could not send the sign-in email', 'email_failed');
  return isDev(env) ? { ok: true, devLink: link } : { ok: true };
}

export async function verifyMagicLink(env: Env, token: string, locale: string | undefined, tz: string | undefined): Promise<UserRow> {
  const nowMs = Date.now();
  const hash = await sha256Hex(token);
  const row = await env.DB.prepare('SELECT * FROM magic_links WHERE token_hash = ?')
    .bind(hash)
    .first<{ token_hash: string; email: string; expires_at: number; used: number }>();
  if (!row || row.used || row.expires_at < nowMs) throw new HttpError(400, 'This link is invalid or has expired', 'bad_token');
  await env.DB.prepare('UPDATE magic_links SET used = 1 WHERE token_hash = ?').bind(hash).run();
  let user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(row.email).first<UserRow>();
  if (!user) {
    const id = newId('u_');
    await env.DB.prepare(
      'INSERT INTO users (id, email, name, tz, locale, plan, hook_token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(id, row.email, '', tz && tz.length < 64 ? tz : 'Europe/Prague', normalizeLocale(locale), 'free', randomToken(32), nowMs)
      .run();
    user = (await getUser(env.DB, id))!;
  }
  return user;
}

export async function createSession(c: AppContext, user: UserRow): Promise<void> {
  const raw = randomToken(48);
  const nowMs = Date.now();
  await c.env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256Hex(raw), user.id, nowMs + SESSION_TTL_MS, nowMs)
    .run();
  setCookie(c, SESSION_COOKIE, raw, {
    httpOnly: true,
    secure: c.env.APP_URL.startsWith('https://'),
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function destroySession(c: AppContext): Promise<void> {
  const raw = getCookie(c, SESSION_COOKIE);
  if (raw) await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256Hex(raw)).run();
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

export async function userFromRequest(c: AppContext): Promise<UserRow | null> {
  const raw = getCookie(c, SESSION_COOKIE);
  if (!raw) return null;
  const row = await c.env.DB.prepare(
    'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?',
  )
    .bind(await sha256Hex(raw), Date.now())
    .first<UserRow>();
  return row ?? null;
}

export const requireUser: MiddlewareHandler<{ Bindings: Env; Variables: Vars }> = async (c, next) => {
  const user = await userFromRequest(c as AppContext);
  if (!user) return c.json({ error: 'unauthorized', code: 'unauthorized' }, 401);
  c.set('user', user);
  await next();
};
