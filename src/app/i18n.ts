// UI strings. English is the source; other languages are loaded on demand.
import { en, type Key } from './locales/en';

export type { Key };
export type Lang = 'en' | 'fr' | 'cs' | 'de' | 'es' | 'it' | 'pt' | 'pl';
export const LANGS: Array<{ code: Lang; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'cs', label: 'Čeština' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' },
  { code: 'pl', label: 'Polski' },
];
export const LANG_CODES = LANGS.map((l) => l.code);

const loaders: Record<Lang, () => Promise<Record<Key, string>>> = {
  en: async () => en,
  fr: () => import('./locales/fr').then((m) => m.fr),
  cs: () => import('./locales/cs').then((m) => m.cs),
  de: () => import('./locales/de').then((m) => m.de),
  es: () => import('./locales/es').then((m) => m.es),
  it: () => import('./locales/it').then((m) => m.it),
  pt: () => import('./locales/pt').then((m) => m.pt),
  pl: () => import('./locales/pl').then((m) => m.pl),
};
const tables: Partial<Record<Lang, Record<Key, string>>> = { en };

let current: Lang = detectLang();

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANG_CODES as string[]).includes(value);
}

export function detectLang(): Lang {
  try {
    const stored = localStorage.getItem('iah_lang');
    if (isLang(stored)) return stored;
  } catch {
    /* ignore */
  }
  const nav = (navigator.language || 'en').toLowerCase().slice(0, 2);
  return isLang(nav) ? nav : 'en';
}

export function getLang(): Lang {
  return current;
}

/** Loads the strings for `lang` (if needed) and makes it current. */
export async function setLang(lang: Lang): Promise<void> {
  if (!tables[lang]) tables[lang] = await loaders[lang]();
  current = lang;
  try {
    localStorage.setItem('iah_lang', lang);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = lang;
}

/** Make sure the current language's strings are loaded (call once at boot). */
export async function ensureLang(): Promise<void> {
  await setLang(current);
}

export function t(key: Key, vars?: Record<string, string | number>): string {
  let s: string = tables[current]?.[key] ?? en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  return s;
}
