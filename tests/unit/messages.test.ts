import { describe, expect, it } from 'vitest';
import { message, normalizeLocale } from '../../src/shared/messages';

const ctx = { userName: 'Quentin', contactName: 'Mum', time: '19:42', deadline: '20:00', appUrl: 'https://iamhome.example' };

describe('messages', () => {
  it('announces a check-in in both languages', () => {
    expect(message('en', 'announce', ctx)).toBe('🏠 Quentin is home safe (19:42).');
    expect(message('fr', 'announce', ctx)).toContain('Quentin est bien rentré·e (19:42)');
  });
  it('includes the custom text in alerts', () => {
    const text = message('en', 'alert', { ...ctx, custom: 'Call Jana first.' });
    expect(text).toContain("hasn't checked in by 20:00");
    expect(text).toContain('Call Jana first.');
  });
  it('falls back to English for unknown locales', () => {
    expect(message('xx' as never, 'announce', ctx)).toBe(message('en', 'announce', ctx));
  });
  it('normalizes locales', () => {
    expect(normalizeLocale('fr-FR')).toBe('fr');
    expect(normalizeLocale('FR')).toBe('fr');
    expect(normalizeLocale('en-GB')).toBe('en');
    expect(normalizeLocale('cs-CZ')).toBe('cs');
    expect(normalizeLocale('pt_BR')).toBe('pt');
    expect(normalizeLocale('zh')).toBe('en');
    expect(normalizeLocale(undefined)).toBe('en');
  });

  it('has every key in every locale', () => {
    const ctx = { userName: 'Ana', contactName: 'Mum', time: '20:00', deadline: '20:00', custom: 'x', appUrl: 'https://x.y' };
    const keys = ['announce', 'alert', 'reminder', 'reminderTitle', 'reminderBody', 'alertCopy', 'alertCopyTitle', 'hookOk', 'tgStatus', 'tgHelp', 'magicSubject', 'magicBody'] as const;
    for (const locale of ['en', 'fr', 'cs', 'de', 'es', 'it', 'pt', 'pl'] as const) {
      for (const key of keys) {
        const text = message(locale, key, ctx);
        expect(text, `${locale}.${key}`).not.toBe('');
      }
      expect(message(locale, 'announce', ctx)).toContain('Ana');
      expect(message(locale, 'alert', ctx)).toContain('20:00');
    }
    expect(normalizeLocale(undefined)).toBe('en');
  });
});
