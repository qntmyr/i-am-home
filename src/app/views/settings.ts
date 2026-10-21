import type { View } from '../main';
import { api, ApiError } from '../api';
import { LANGS, getLang, setLang, t, type Lang } from '../i18n';
import { h, icon, toast, confirmDialog, copyText, fmtDate, clear } from '../ui';
import { disablePush, enablePush, getPushState, type PushState } from '../push';

const TIMEZONES = (() => {
  try {
    const sv = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone');
    if (sv?.length) return sv;
  } catch {
    /* ignore */
  }
  return ['Europe/Prague', 'Europe/Paris', 'Europe/London', 'Europe/Berlin', 'Europe/Madrid', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'Australia/Sydney', 'UTC'];
})();

export const renderSettings: View = async (root, ctx) => {
  let me = ctx.state.me!;

  // ----- Profile -----
  const name = h('input', { type: 'text', value: me.user.name, maxlength: 60, placeholder: 'Quentin' }) as HTMLInputElement;
  const tz = h('select', null, TIMEZONES.map((z) => h('option', { value: z, selected: z === me.user.tz }, z))) as HTMLSelectElement;
  if (!TIMEZONES.includes(me.user.tz)) tz.prepend(h('option', { value: me.user.tz, selected: true }, me.user.tz));
  const lang = h('select', null, LANGS.map((l) => h('option', { value: l.code, selected: me.user.locale === l.code }, l.label))) as HTMLSelectElement;
  const profileSave = h('button', { class: 'btn', type: 'submit' }, t('settings_save'));
  const profile = h(
    'form',
    {
      class: 'card',
      onSubmit: async (e: Event) => {
        e.preventDefault();
        profileSave.disabled = true;
        try {
          await api.updateMe({ name: name.value, tz: tz.value, locale: lang.value });
          const changedLang = lang.value !== getLang();
          if (changedLang) await setLang(lang.value as Lang);
          await ctx.refreshMe();
          toast(t('settings_saved'), 'ok');
          if (changedLang) ctx.navigate('/app/settings');
        } catch (ex) {
          toast(ex instanceof ApiError ? ex.message : t('common_error'), 'err');
        }
        profileSave.disabled = false;
      },
    },
    h('h3', null, t('settings_profile')),
    h('label', { class: 'field' }, h('span', null, t('settings_name')), name, h('div', { class: 'hint' }, t('settings_name_d', { name: me.user.name || 'Quentin' }))),
    h('div', { class: 'grid2' }, h('label', { class: 'field' }, h('span', null, t('settings_tz')), tz), h('label', { class: 'field' }, h('span', null, t('settings_lang')), lang)),
    profileSave,
  );

  // ----- Push -----
  const pushBody = h('div');
  async function paintPush() {
    const st: PushState = await getPushState(me.vapidPublicKey);
    clear(pushBody);
    const line = (text: string, cls = 'muted small') => h('p', { class: cls }, text);
    if (st === 'unsupported') pushBody.append(line(t('settings_notif_unsupported')));
    else if (st === 'noserver') pushBody.append(line(t('settings_notif_noserver')));
    else if (st === 'denied') pushBody.append(line(t('settings_notif_denied')));
    else if (st === 'on') {
      pushBody.append(
        h('p', null, h('span', { class: 'badge ok' }, icon('check'), t('settings_notif_enabled'))),
        h(
          'div',
          { class: 'row gap wrap' },
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: async () => { try { const r = await api.pushTest(); toast(r.sent ? t('contacts_test_ok') : t('contacts_test_skipped'), 'ok'); } catch { toast(t('common_error'), 'err'); } } }, icon('bell'), t('settings_notif_test')),
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: async () => { await disablePush(); await paintPush(); } }, t('settings_notif_off')),
        ),
      );
    } else {
      pushBody.append(
        h('button', { class: 'btn', type: 'button', onClick: async () => {
          try {
            const r = await enablePush(me.vapidPublicKey!);
            if (r === 'denied') toast(t('settings_notif_denied'), 'err');
          } catch {
            toast(t('common_error'), 'err');
          }
          await paintPush();
        } }, icon('bell'), t('settings_notif_on')),
      );
    }
  }
  const pushCard = h('div', { class: 'card' }, h('h3', null, t('settings_notif')), h('p', { class: 'muted small' }, t('settings_notif_d')), pushBody);

  // ----- Install -----
  const isStandalone = matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const installCard = isStandalone
    ? null
    : h(
        'div',
        { class: 'card' },
        h('h3', null, t('settings_install')),
        h('p', { class: 'muted small' }, t('settings_install_d')),
        ctx.state.installPrompt
          ? h('button', { class: 'btn', type: 'button', onClick: async () => { await ctx.state.installPrompt?.prompt(); } }, icon('download'), t('settings_install_btn'))
          : isIOS
            ? h('p', { class: 'small' }, t('settings_install_ios'))
            : null,
      );

  // ----- Telegram -----
  const tgBody = h('div');
  function paintTelegram() {
    clear(tgBody);
    if (!me.botUsername) {
      tgBody.append(h('p', { class: 'muted small' }, t('settings_telegram_nobot')));
      return;
    }
    if (me.user.telegramLinked) {
      tgBody.append(
        h('p', null, h('span', { class: 'badge ok' }, icon('check'), t('settings_telegram_linked'))),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: async () => { await api.telegramUnlink(); me = (await ctx.refreshMe())!; paintTelegram(); } }, t('settings_telegram_unlink')),
      );
      return;
    }
    const btn = h('button', { class: 'btn', type: 'button' }, icon('send'), t('settings_telegram_connect'));
    btn.addEventListener('click', async () => {
      const r = await api.telegramLink();
      if (!r.link) return;
      clear(tgBody);
      tgBody.append(
        h('p', { class: 'small' }, t('settings_telegram_wait')),
        h('div', { class: 'row gap wrap' }, h('a', { class: 'btn', href: r.link, target: '_blank', rel: 'noopener' }, icon('send'), t('settings_telegram_open')), h('button', { class: 'btn btn-ghost', type: 'button', onClick: async () => { me = (await ctx.refreshMe())!; paintTelegram(); } }, icon('check'), 'OK')),
      );
    });
    tgBody.append(btn);
  }
  const tgCard = h('div', { class: 'card' }, h('h3', null, t('settings_telegram')), h('p', { class: 'muted small' }, t('settings_telegram_d')), tgBody);

  // ----- Hook -----
  const hookCode = h('div', { class: 'code', 'data-testid': 'hook-url' }, me.hookUrl);
  const hookCard = h(
    'div',
    { class: 'card' },
    h('h3', null, t('settings_hook')),
    h('p', { class: 'muted small' }, t('settings_hook_d')),
    hookCode,
    h(
      'div',
      { class: 'row gap wrap', style: 'margin-top:10px' },
      h('button', { class: 'btn btn-sm', type: 'button', onClick: async () => { if (await copyText(hookCode.textContent ?? '')) toast(t('contacts_copied'), 'ok'); } }, icon('copy'), t('settings_hook_copy')),
      h('a', { class: 'btn btn-sm btn-ghost', href: '/automations', onClick: (e: Event) => { e.preventDefault(); ctx.navigate('/automations'); } }, icon('wifi'), t('settings_hook_guide')),
      h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onClick: async () => {
        if (!(await confirmDialog(t('settings_hook_regen_confirm')))) return;
        const r = await api.regenerateHook();
        hookCode.textContent = r.hookUrl;
        await ctx.refreshMe();
      } }, t('settings_hook_regen')),
    ),
  );

  // ----- Plan -----
  const isPro = me.user.plan === 'pro';
  const planCard = h(
    'div',
    { class: 'card' },
    h('h3', null, t('settings_plan'), ' ', h('span', { class: `badge ${isPro ? 'accent' : ''}` }, isPro ? 'Pro' : t('pricing_free'))),
    h('p', { class: 'small' }, isPro ? t('settings_plan_pro') : t('settings_plan_free')),
    isPro && me.user.planUntil ? h('p', { class: 'small muted' }, t('settings_plan_until', { date: fmtDate(me.user.planUntil) })) : null,
    isPro
      ? null
      : me.checkout.monthly || me.checkout.lifetime
        ? h(
            'div',
            { class: 'row gap wrap' },
            me.checkout.lifetime ? h('a', { class: 'btn', href: me.checkout.lifetime }, icon('zap'), t('settings_upgrade_l')) : null,
            me.checkout.monthly ? h('a', { class: 'btn btn-ghost', href: me.checkout.monthly }, t('settings_upgrade_m')) : null,
          )
        : h('p', { class: 'small muted' }, t('settings_upgrade_soon')),
  );

  // ----- Account -----
  const accountCard = h(
    'div',
    { class: 'card' },
    h('h3', null, t('settings_danger')),
    h('p', { class: 'small muted' }, me.user.email),
    h(
      'div',
      { class: 'row gap wrap' },
      h('button', { class: 'btn btn-ghost', type: 'button', 'data-testid': 'logout', onClick: async () => { await api.logout(); ctx.state.me = null; ctx.navigate('/'); } }, icon('logout'), t('settings_logout')),
      h('button', { class: 'btn btn-ghost', type: 'button', style: 'color:var(--danger)', onClick: async () => {
        if (!(await confirmDialog(t('settings_delete_confirm')))) return;
        await api.deleteMe();
        ctx.state.me = null;
        ctx.navigate('/');
      } }, icon('trash'), t('settings_delete')),
    ),
  );

  root.append(h('div', { class: 'page-head' }, h('h1', null, t('settings_title'))), profile, pushCard, installCard ?? '', tgCard, hookCard, planCard, accountCard, h('p', { class: 'small muted center', style: 'margin-top:20px' }, h('a', { href: '/privacy', onClick: (e: Event) => { e.preventDefault(); ctx.navigate('/privacy'); } }, t('footer_privacy')), ' · ', h('a', { href: '/terms', onClick: (e: Event) => { e.preventDefault(); ctx.navigate('/terms'); } }, t('footer_terms'))));
  paintTelegram();
  await paintPush();
};
