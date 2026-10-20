import type { ContactDTO, EventDTO, MeDTO, RuleDTO, StatusDTO } from '../shared/types';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'offline', 'offline');
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; code?: string };
    throw new ApiError(res.status, d.code ?? 'error', d.error ?? res.statusText);
  }
  return data as T;
}

export const api = {
  requestLink: (email: string, locale: string, tz: string) => request<{ ok: true; devLink?: string }>('POST', '/auth/request', { email, locale, tz }),
  logout: () => request<{ ok: true }>('POST', '/auth/logout'),
  me: () => request<MeDTO>('GET', '/me'),
  updateMe: (patch: { name?: string; tz?: string; locale?: string }) => request<{ ok: true }>('PATCH', '/me', patch),
  deleteMe: () => request<{ ok: true }>('DELETE', '/me'),
  regenerateHook: () => request<{ hookUrl: string }>('POST', '/me/hook/regenerate'),
  telegramLink: () => request<{ link: string | null; botUsername: string | null }>('POST', '/me/telegram/link'),
  telegramUnlink: () => request<{ ok: true }>('DELETE', '/me/telegram'),
  status: () => request<StatusDTO>('GET', '/status'),
  checkin: (note = '') => request<{ at: number; announcedTo: string[]; settledRules: string[] }>('POST', '/checkin', { note }),
  events: () => request<{ events: EventDTO[] }>('GET', '/events'),
  contacts: () => request<{ contacts: ContactDTO[] }>('GET', '/contacts'),
  createContact: (c: { name: string; channel: string; address: string; announceCheckins: boolean }) =>
    request<{ contact: ContactDTO }>('POST', '/contacts', c),
  updateContact: (id: string, patch: { name?: string; announceCheckins?: boolean }) => request<{ contact: ContactDTO }>('PATCH', `/contacts/${id}`, patch),
  deleteContact: (id: string) => request<{ ok: true }>('DELETE', `/contacts/${id}`),
  testContact: (id: string) => request<{ ok: true; skipped: boolean }>('POST', `/contacts/${id}/test`),
  rules: () => request<{ rules: RuleDTO[] }>('GET', '/rules'),
  createRule: (r: Partial<RuleDTO>) => request<{ rule: RuleDTO }>('POST', '/rules', r),
  updateRule: (id: string, r: Partial<RuleDTO>) => request<{ rule: RuleDTO }>('PATCH', `/rules/${id}`, r),
  deleteRule: (id: string) => request<{ ok: true }>('DELETE', `/rules/${id}`),
  testRule: (id: string) => request<{ ok: true; sentTo: string[] }>('POST', `/rules/${id}/test`),
  pushSubscribe: (sub: PushSubscriptionJSON) => request<{ ok: true }>('POST', '/push/subscribe', sub),
  pushUnsubscribe: (endpoint?: string) => request<{ ok: true }>('POST', '/push/unsubscribe', { endpoint }),
  pushTest: () => request<{ ok: true; sent: number }>('POST', '/push/test'),
};
