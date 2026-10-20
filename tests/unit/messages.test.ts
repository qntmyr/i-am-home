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
    expect(normalizeLocale(undefined)).toBe('en');
  });
});
