import { api, ApiError } from './api';
import { ensureLang, getLang, setLang, t, type Lang } from './i18n';
import { h, clear, icon, logo, type IconName } from './ui';
import type { MeDTO } from '../shared/types';
import { renderLanding } from './views/landing';
import { renderLogin } from './views/login';
import { renderDashboard } from './views/dashboard';
import { renderContacts } from './views/contacts';
import { renderRules } from './views/rules';
import { renderSettings } from './views/settings';
import { renderGuide, renderPrivacy } from './views/static';

export interface AppState {
  me: MeDTO | null;
  installPrompt: BeforeInstallPromptEvent | null;
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const state: AppState = { me: null, installPrompt: null };

type Cleanup = (() => void) | void;
export type View = (root: HTMLElement, ctx: ViewContext) => Promise<Cleanup> | Cleanup;
export interface ViewContext {
  navigate: (path: string) => void;
  refreshMe: () => Promise<MeDTO | null>;
  state: AppState;
}

const root = document.getElementById('app')!;
let cleanup: Cleanup;

export function navigate(path: string): void {
  if (location.pathname !== path) history.pushState(null, '', path);
  void render();
}

async function refreshMe(): Promise<MeDTO | null> {
  try {
    state.me = await api.me();
    if (state.me.user.locale !== getLang()) await setLang(state.me.user.locale as Lang);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) state.me = null;
    else if (e instanceof ApiError && e.status === 0) {
      /* offline: keep what we have */
    } else state.me = null;
  }
  return state.me;
}

const ctx: ViewContext = { navigate, refreshMe, state };

const appRoutes: Record<string, { view: View; nav: 'home' | 'contacts' | 'rules' | 'settings' }> = {
  '/app': { view: renderDashboard, nav: 'home' },
  '/app/contacts': { view: renderContacts, nav: 'contacts' },
  '/app/rules': { view: renderRules, nav: 'rules' },
  '/app/settings': { view: renderSettings, nav: 'settings' },
};

async function render(): Promise<void> {
  if (typeof cleanup === 'function') cleanup();
  cleanup = undefined;
  const path = location.pathname.replace(/\/+$/, '') || '/';
  document.documentElement.lang = getLang();
  window.scrollTo(0, 0);

  if (path === '/' || path === '/index.html') {
    clear(root);
    cleanup = await renderLanding(root, ctx);
    return;
  }
  if (path === '/login') {
    clear(root);
    cleanup = await renderLogin(root, ctx);
    return;
  }
  if (path === '/privacy') {
    clear(root);
    cleanup = await renderPrivacy(root, ctx);
    return;
  }
  if (path === '/automations' || path === '/shortcuts') {
    clear(root);
    cleanup = await renderGuide(root, ctx);
    return;
  }
  const route = appRoutes[path];
  if (!route) {
    navigate(path.startsWith('/app') ? '/app' : '/');
    return;
  }
  if (!state.me) {
    clear(root);
    root.appendChild(h('div', { class: 'auth' }, h('p', { class: 'muted' }, t('common_loading'))));
    await refreshMe();
    if (!state.me) {
      navigate('/login');
      return;
    }
  }
  clear(root);
  const main = h('main', { class: 'main' });
  root.appendChild(shell(route.nav, main));
  cleanup = await route.view(main, ctx);
}

function shell(active: string, main: HTMLElement): HTMLElement {
  const items: Array<{ key: string; path: string; label: string; icon: IconName }> = [
    { key: 'home', path: '/app', label: t('nav_home'), icon: 'home' },
    { key: 'contacts', path: '/app/contacts', label: t('nav_contacts'), icon: 'users' },
    { key: 'rules', path: '/app/rules', label: t('nav_rules'), icon: 'clock' },
    { key: 'settings', path: '/app/settings', label: t('nav_settings'), icon: 'settings' },
  ];
  const link = (it: (typeof items)[number]) =>
    h('a', { href: it.path, class: it.key === active ? 'active' : '', onClick: (e: Event) => { e.preventDefault(); navigate(it.path); } }, icon(it.icon), h('span', null, it.label));
  const sidebar = h(
    'aside',
    { class: 'sidebar' },
    h('a', { href: '/', class: 'brand', onClick: (e: Event) => { e.preventDefault(); navigate('/'); } }, logo(), h('span', { class: 'wordmark' }, t('brand'))),
    h('nav', { class: 'nav' }, items.map(link)),
    h('div', { class: 'spacer' }),
    h('p', { class: 'small muted', style: 'padding: 0 12px' }, state.me?.user.email ?? ''),
  );
  const tabbar = h('nav', { class: 'tabbar' }, items.map(link));
  const wrap = h('div', { class: 'shell' }, sidebar, h('div', null, offlineBar(), main), tabbar);
  return wrap;
}

function offlineBar(): HTMLElement {
  const bar = h('div', { class: 'offline-bar', hidden: navigator.onLine }, t('common_offline'));
  const update = () => {
    bar.hidden = navigator.onLine;
  };
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  return bar;
}

window.addEventListener('popstate', () => void render());
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  state.installPrompt = e as BeforeInstallPromptEvent;
});

if ('serviceWorker' in navigator && !import.meta.env.DEV) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}

void ensureLang().then(render);
