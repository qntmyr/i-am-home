// Types shared by the Worker API and the PWA.

export type Plan = 'free' | 'pro';
export type Channel = 'telegram' | 'email' | 'sms' | 'whatsapp';
export type RuleKind = 'recurring' | 'once';
export type Locale = 'en' | 'fr' | 'cs' | 'de' | 'es' | 'it' | 'pt' | 'pl';
export const LOCALES: Locale[] = ['en', 'fr', 'cs', 'de', 'es', 'it', 'pt', 'pl'];
export type CheckinSource = 'app' | 'hook' | 'telegram' | 'push' | 'test';

export interface UserDTO {
  id: string;
  email: string;
  name: string;
  tz: string;
  locale: Locale;
  plan: Plan;
  planUntil: number | null;
  hookToken: string;
  telegramLinked: boolean;
  lastCheckinAt: number | null;
  createdAt: number;
}

export interface ContactDTO {
  id: string;
  name: string;
  channel: Channel;
  address: string;
  verified: boolean;
  announceCheckins: boolean;
  createdAt: number;
  /** Telegram deep link the contact must open to receive messages. */
  telegramLink?: string;
}

export interface RuleDTO {
  id: string;
  kind: RuleKind;
  name: string;
  timeLocal: string;
  days: number;
  onceAt: number | null;
  windowHours: number;
  remindBeforeMin: number;
  message: string;
  enabled: boolean;
  contactIds: string[];
  nextFireAt: number | null;
  nextRemindAt: number | null;
  lastFiredAt: number | null;
  lastResult: 'alerted' | 'ok' | 'skipped' | null;
  createdAt: number;
}

export interface EventDTO {
  id: string;
  at: number;
  type:
    | 'checkin'
    | 'alert'
    | 'reminder'
    | 'announce'
    | 'rule_ok'
    | 'contact_linked'
    | 'plan_changed'
    | 'test';
  detail: Record<string, unknown>;
}

export interface StatusDTO {
  user: UserDTO;
  lastCheckinAt: number | null;
  /** The next deadline that still needs a check-in, if any. */
  nextDue: { ruleId: string; ruleName: string; fireAt: number; satisfied: boolean; contactNames: string[] } | null;
  contactsCount: number;
  rulesCount: number;
  pushEnabled: boolean;
}

export interface MeDTO {
  user: UserDTO;
  botUsername: string | null;
  telegramLink: string | null;
  hookUrl: string;
  vapidPublicKey: string | null;
  checkout: { monthly: string | null; lifetime: string | null };
  limits: PlanLimits;
}

export interface PlanLimits {
  maxContacts: number;
  channels: Channel[];
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { maxContacts: 1, channels: ['telegram', 'email'] },
  pro: { maxContacts: 20, channels: ['telegram', 'email', 'sms', 'whatsapp'] },
};

/** Day bitmask helpers: bit 0 = Monday ... bit 6 = Sunday. */
export const DAY_BITS = { mon: 1, tue: 2, wed: 4, thu: 8, fri: 16, sat: 32, sun: 64 } as const;
export const ALL_DAYS = 127;
export const WEEKDAYS = 31;
export const WEEKEND = 96;
