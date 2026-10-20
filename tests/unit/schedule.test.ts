import { describe, expect, it } from 'vitest';
import {
  checkinSatisfies,
  computeNextTimes,
  daysToLabel,
  nextRecurringOccurrence,
  parseTimeLocal,
  toLocalParts,
  zonedTimeToUtc,
} from '../../src/shared/schedule';
import { ALL_DAYS, WEEKDAYS, WEEKEND } from '../../src/shared/types';

const PRAGUE = 'Europe/Prague';

describe('zonedTimeToUtc', () => {
  it('converts Prague summer time (UTC+2)', () => {
    // 2026-07-01 20:00 Prague = 18:00 UTC
    expect(zonedTimeToUtc(2026, 7, 1, 20, 0, PRAGUE)).toBe(Date.UTC(2026, 6, 1, 18, 0));
  });
  it('converts Prague winter time (UTC+1)', () => {
    expect(zonedTimeToUtc(2026, 12, 1, 20, 0, PRAGUE)).toBe(Date.UTC(2026, 11, 1, 19, 0));
  });
  it('handles UTC and negative offsets', () => {
    expect(zonedTimeToUtc(2026, 1, 1, 9, 30, 'UTC')).toBe(Date.UTC(2026, 0, 1, 9, 30));
    expect(zonedTimeToUtc(2026, 1, 1, 9, 30, 'America/New_York')).toBe(Date.UTC(2026, 0, 1, 14, 30));
  });
  it('round-trips through toLocalParts', () => {
    const ms = zonedTimeToUtc(2026, 10, 25, 2, 30, PRAGUE); // DST ends 2026-10-25 in the EU
    const p = toLocalParts(ms, PRAGUE);
    expect([p.hour, p.minute]).toEqual([2, 30]);
  });
});

describe('parseTimeLocal', () => {
  it('accepts HH:MM', () => {
    expect(parseTimeLocal('20:00')).toEqual({ hour: 20, minute: 0 });
    expect(parseTimeLocal('7:05')).toEqual({ hour: 7, minute: 5 });
  });
  it('rejects garbage', () => {
    expect(parseTimeLocal('25:00')).toBeNull();
    expect(parseTimeLocal('20')).toBeNull();
    expect(parseTimeLocal('')).toBeNull();
  });
});

describe('nextRecurringOccurrence', () => {
  // Tuesday 2026-10-20 17:00 Prague (15:00 UTC)
  const tue17 = Date.UTC(2026, 9, 20, 15, 0);

  it('picks today when the time is still ahead', () => {
    const next = nextRecurringOccurrence('20:00', ALL_DAYS, PRAGUE, tue17);
    expect(next).toBe(Date.UTC(2026, 9, 20, 18, 0));
  });
  it('picks tomorrow when the time has passed', () => {
    const next = nextRecurringOccurrence('16:00', ALL_DAYS, PRAGUE, tue17);
    expect(next).toBe(Date.UTC(2026, 9, 21, 14, 0));
  });
  it('skips to the weekend for weekend-only rules', () => {
    const next = nextRecurringOccurrence('10:00', WEEKEND, PRAGUE, tue17)!;
    expect(toLocalParts(next, PRAGUE).weekday).toBe(5); // Saturday
    expect(toLocalParts(next, PRAGUE).day).toBe(24);
  });
  it('skips the weekend for weekday rules', () => {
    const fri21 = Date.UTC(2026, 9, 23, 19, 0); // Friday 21:00 Prague
    const next = nextRecurringOccurrence('20:00', WEEKDAYS, PRAGUE, fri21)!;
    expect(toLocalParts(next, PRAGUE).weekday).toBe(0); // Monday
    expect(toLocalParts(next, PRAGUE).day).toBe(26);
  });
  it('is strictly after `after`', () => {
    const exactly = Date.UTC(2026, 9, 20, 18, 0);
    expect(nextRecurringOccurrence('20:00', ALL_DAYS, PRAGUE, exactly)).toBe(Date.UTC(2026, 9, 21, 18, 0));
  });
  it('crosses the DST change keeping the wall-clock time', () => {
    const sat = Date.UTC(2026, 9, 24, 12, 0); // Sat 2026-10-24 14:00 Prague, DST ends next night
    const next = nextRecurringOccurrence('20:00', 64, PRAGUE, sat)!; // Sunday only
    const p = toLocalParts(next, PRAGUE);
    expect([p.day, p.hour, p.minute]).toEqual([25, 20, 0]);
    expect(next).toBe(Date.UTC(2026, 9, 25, 19, 0)); // now UTC+1
  });
  it('returns null without days or with a bad time', () => {
    expect(nextRecurringOccurrence('20:00', 0, PRAGUE, tue17)).toBeNull();
    expect(nextRecurringOccurrence('nope', ALL_DAYS, PRAGUE, tue17)).toBeNull();
  });
});

describe('computeNextTimes', () => {
  const now = Date.UTC(2026, 9, 20, 15, 0);
  it('schedules a reminder before the deadline', () => {
    const r = computeNextTimes({ kind: 'recurring', timeLocal: '20:00', days: ALL_DAYS, onceAt: null, remindBeforeMin: 30 }, PRAGUE, now);
    expect(r.nextFireAt).toBe(Date.UTC(2026, 9, 20, 18, 0));
    expect(r.nextRemindAt).toBe(Date.UTC(2026, 9, 20, 17, 30));
  });
  it('drops the reminder when the deadline is already closer than the lead time', () => {
    const r = computeNextTimes({ kind: 'recurring', timeLocal: '17:10', days: ALL_DAYS, onceAt: null, remindBeforeMin: 30 }, PRAGUE, now);
    expect(r.nextFireAt).toBe(Date.UTC(2026, 9, 20, 15, 10));
    expect(r.nextRemindAt).toBeNull();
  });
  it('handles one-off rules', () => {
    const onceAt = now + 3 * 3600_000;
    expect(computeNextTimes({ kind: 'once', timeLocal: '', days: 0, onceAt, remindBeforeMin: 60 }, PRAGUE, now)).toEqual({
      nextFireAt: onceAt,
      nextRemindAt: onceAt - 3600_000,
    });
    expect(computeNextTimes({ kind: 'once', timeLocal: '', days: 0, onceAt: now - 1, remindBeforeMin: 60 }, PRAGUE, now)).toEqual({
      nextFireAt: null,
      nextRemindAt: null,
    });
  });
});

describe('checkinSatisfies', () => {
  const fireAt = Date.UTC(2026, 9, 20, 18, 0);
  it('accepts a check-in inside the window', () => {
    expect(checkinSatisfies(fireAt - 2 * 3600_000, fireAt, 12)).toBe(true);
    expect(checkinSatisfies(fireAt - 11.9 * 3600_000, fireAt, 12)).toBe(true);
  });
  it('rejects old or missing check-ins', () => {
    expect(checkinSatisfies(null, fireAt, 12)).toBe(false);
    expect(checkinSatisfies(fireAt - 13 * 3600_000, fireAt, 12)).toBe(false);
  });
  it('tolerates a check-in within a minute after the deadline', () => {
    expect(checkinSatisfies(fireAt + 30_000, fireAt, 12)).toBe(true);
    expect(checkinSatisfies(fireAt + 5 * 60_000, fireAt, 12)).toBe(false);
  });
});

describe('daysToLabel', () => {
  it('names the common presets', () => {
    expect(daysToLabel(ALL_DAYS)).toBe('every day');
    expect(daysToLabel(WEEKDAYS, 'fr')).toBe('en semaine');
    expect(daysToLabel(WEEKEND)).toBe('weekends');
    expect(daysToLabel(1 | 4)).toBe('Mon, Wed');
  });
});
