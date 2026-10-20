// Pure scheduling helpers. No I/O, so they run in the Worker, the PWA and unit tests.

export interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number;
  minute: number;
  second: number;
  /** 0 = Monday ... 6 = Sunday (ISO order, matches the rule day bitmask). */
  weekday: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      weekday: 'short',
    });
    formatterCache.set(tz, f);
  }
  return f;
}

const WEEKDAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Break a UTC timestamp (ms) into local wall-clock parts in `tz`. */
export function toLocalParts(ms: number, tz: string): LocalParts {
  const parts = formatter(tz).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: WEEKDAY_INDEX[get('weekday')] ?? 0,
  };
}

/** Offset of `tz` from UTC in ms at the given instant. */
export function tzOffsetMs(ms: number, tz: string): number {
  const p = toLocalParts(ms, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/**
 * Convert a local wall-clock time in `tz` to a UTC timestamp (ms).
 * During a DST gap the time is shifted forward; during an overlap the first
 * occurrence wins. Good enough for "notify at 20:00".
 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz: string,
): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offset1 = tzOffsetMs(guess, tz);
  const utc1 = guess - offset1;
  const offset2 = tzOffsetMs(utc1, tz);
  if (offset2 === offset1) return utc1;
  return guess - offset2;
}

export function parseTimeLocal(timeLocal: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(timeLocal.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/**
 * Next occurrence (UTC ms) of a recurring rule strictly after `afterMs`.
 * `days` is a bitmask, bit 0 = Monday. Returns null when no day is selected.
 */
export function nextRecurringOccurrence(
  timeLocal: string,
  days: number,
  tz: string,
  afterMs: number,
): number | null {
  const t = parseTimeLocal(timeLocal);
  if (!t || (days & 127) === 0) return null;
  const base = toLocalParts(afterMs, tz);
  // Walk up to 8 local days forward (today may still qualify).
  for (let i = 0; i <= 8; i++) {
    // Add i days to the local date using UTC arithmetic on the date part only.
    const d = new Date(Date.UTC(base.year, base.month - 1, base.day + i));
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const candidate = zonedTimeToUtc(year, month, day, t.hour, t.minute, tz);
    if (candidate <= afterMs) continue;
    const weekday = toLocalParts(candidate, tz).weekday;
    if (days & (1 << weekday)) return candidate;
  }
  return null;
}

export interface RuleTiming {
  kind: 'recurring' | 'once';
  timeLocal: string;
  days: number;
  onceAt: number | null;
  remindBeforeMin: number;
}

/** Compute next_fire_at / next_remind_at for a rule after `afterMs`. */
export function computeNextTimes(
  rule: RuleTiming,
  tz: string,
  afterMs: number,
): { nextFireAt: number | null; nextRemindAt: number | null } {
  let nextFireAt: number | null = null;
  if (rule.kind === 'once') {
    nextFireAt = rule.onceAt !== null && rule.onceAt > afterMs ? rule.onceAt : null;
  } else {
    nextFireAt = nextRecurringOccurrence(rule.timeLocal, rule.days, tz, afterMs);
  }
  if (nextFireAt === null) return { nextFireAt: null, nextRemindAt: null };
  // No reminder when the deadline is already closer than the lead time: an instant nag would be noise.
  const remindAt = nextFireAt - rule.remindBeforeMin * 60_000;
  const nextRemindAt = rule.remindBeforeMin > 0 && remindAt > afterMs ? remindAt : null;
  return { nextFireAt, nextRemindAt };
}

/** True when a check-in at `checkinAt` satisfies a deadline at `fireAt`. */
export function checkinSatisfies(checkinAt: number | null, fireAt: number, windowHours: number): boolean {
  if (checkinAt === null) return false;
  const windowStart = fireAt - windowHours * 3_600_000;
  return checkinAt >= windowStart && checkinAt <= fireAt + 60_000;
}

/** Format an instant as local "HH:MM" in `tz`. */
export function formatLocalTime(ms: number, tz: string, locale = 'en'): string {
  return new Intl.DateTimeFormat(locale, { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    new Date(ms),
  );
}

export function formatLocalDateTime(ms: number, tz: string, locale = 'en'): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(ms));
}

const DAY_NAMES: Record<string, string[]> & { en: string[] } = {
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  fr: ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'],
  cs: ['po', 'út', 'st', 'čt', 'pá', 'so', 'ne'],
  de: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'],
  es: ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'],
  it: ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'],
  pt: ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'],
  pl: ['pon', 'wt', 'śr', 'czw', 'pt', 'sob', 'niedz'],
};
const DAY_PRESETS: Record<string, [string, string, string]> & { en: [string, string, string] } = {
  en: ['every day', 'weekdays', 'weekends'],
  fr: ['tous les jours', 'en semaine', 'le week-end'],
  cs: ['každý den', 've všední dny', 'o víkendu'],
  de: ['jeden Tag', 'werktags', 'am Wochenende'],
  es: ['todos los días', 'entre semana', 'fines de semana'],
  it: ['ogni giorno', 'nei giorni feriali', 'nel fine settimana'],
  pt: ['todos os dias', 'dias úteis', 'fins de semana'],
  pl: ['codziennie', 'w dni robocze', 'w weekendy'],
};

export function daysToLabel(days: number, locale = 'en'): string {
  const names = DAY_NAMES[locale] ?? DAY_NAMES.en;
  const presets = DAY_PRESETS[locale] ?? DAY_PRESETS.en;
  if ((days & 127) === 127) return presets[0];
  if ((days & 127) === 31) return presets[1];
  if ((days & 127) === 96) return presets[2];
  return names.filter((_, i) => days & (1 << i)).join(', ');
}
