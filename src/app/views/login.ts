import type { View } from '../main';
import { api, ApiError } from '../api';
import { getLang, t } from '../i18n';
import { h, icon, logo } from '../ui';

export const renderLogin: View = async (root, ctx) => {
  // Already signed in? Straight to the app.
  const me = await ctx.refreshMe();
  if (me) {
    ctx.navigate('/app');
    return;
  }
  const params = new URLSearchParams(location.search);
  const errCode = params.get('error');
  const errorText = errCode === 'bad_token' ? t('login_err_bad_token') : errCode === 'too_soon' ? t('login_err_too_soon') : errCode ? t('login_err_generic') : '';

  const email = h('input', { type: 'email', name: 'email', required: true, autocomplete: 'email', inputmode: 'email', placeholder: 'you@example.com', autofocus: true }) as HTMLInputElement;
  const submit = h('button', { class: 'btn btn-lg', type: 'submit', style: 'width:100%' }, t('login_btn'), icon('send')) as HTMLButtonElement;
  const error = h('div', { class: 'form-error', hidden: !errorText }, errorText);
  const form = h(
    'form',
    {
      onSubmit: async (e: Event) => {
        e.preventDefault();
        submit.disabled = true;
        error.hidden = true;
        try {
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
          const res = await api.requestLink(email.value, getLang(), tz);
          card.replaceChildren(
            brand(),
            h('h1', { style: 'font-size:1.6rem' }, t('login_sent_t')),
            h('p', { class: 'muted' }, t('login_sent_d', { email: email.value })),
            h('div', null, res.devLink ? [h('p', { class: 'small muted' }, t('login_dev')), h('a', { href: res.devLink, class: 'btn', 'data-testid': 'dev-link' }, 'Open link')] : null),
          );
        } catch (err) {
          error.textContent = err instanceof ApiError && err.code === 'too_soon' ? t('login_err_too_soon') : err instanceof ApiError && err.code === 'invalid_email' ? err.message : t('login_err_generic');
          error.hidden = false;
          submit.disabled = false;
        }
      },
    },
    h('label', { class: 'field' }, h('span', null, t('login_email')), email),
    error,
    submit,
  );
  const brand = () =>
    h('a', { href: '/', class: 'brand', onClick: (e: Event) => { e.preventDefault(); ctx.navigate('/'); } }, logo(), h('span', { class: 'wordmark' }, t('brand')));
  const card = h('div', { class: 'card' }, brand(), h('h1', { style: 'font-size:1.6rem' }, t('login_title')), h('p', { class: 'muted' }, t('login_sub')), form);
  root.appendChild(h('div', { class: 'auth' }, card));
};
