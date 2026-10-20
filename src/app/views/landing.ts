import type { View } from '../main';
import { LANGS, getLang, setLang, t, type Lang } from '../i18n';
import { h, icon, type IconName } from '../ui';

export const renderLanding: View = (root, ctx) => {
  const go = (path: string) => (e: Event) => {
    e.preventDefault();
    ctx.navigate(path);
  };
  const langSelect = h(
    'select',
    {
      'aria-label': 'Language',
      onChange: async (e: Event) => {
        await setLang((e.target as HTMLSelectElement).value as Lang);
        ctx.navigate('/');
      },
    },
    LANGS.map((l) => h('option', { value: l.code, selected: getLang() === l.code }, l.label)),
  );
  const langSwitch = h('div', { class: 'lang-switch' }, icon('globe'), langSelect);

  const step = (n: number, ico: IconName, title: string, text: string) =>
    h('div', { class: 'step-card' }, h('div', { class: 'num' }, String(n)), h('div', { class: 'ico' }, icon(ico)), h('h3', null, title), h('p', null, text));
  const feature = (ico: IconName, title: string, text: string) =>
    h('div', { class: 'step-card' }, h('div', { class: 'ico' }, icon(ico)), h('h3', null, title), h('p', null, text));
  const faq = (q: string, a: string) => h('details', null, h('summary', null, q), h('p', null, a));

  const phone = h(
    'div',
    { class: 'phone', 'aria-hidden': 'true' },
    h(
      'div',
      { class: 'screen' },
      h('div', { class: 'muted small' }, t('dash_tap')),
      h('div', { class: 'home-btn due' }, icon('home'), h('span', null, t('dash_button'))),
      h('div', { class: 'bubble' }, h('div', { class: 'avatar' }, 'M'), h('div', null, h('div', { class: 'small', style: 'font-weight:600' }, t('contacts_name_ph')), h('div', { class: 'small muted' }, '🏠 ' + t('ev_checkin') + ' · 19:42'))),
    ),
  );

  root.appendChild(
    h(
      'div',
      { class: 'landing' },
      h(
        'header',
        { class: 'topbar' },
        h('a', { href: '/', class: 'brand', onClick: go('/') }, h('span', { class: 'logo', style: 'width:32px;height:32px;border-radius:10px;background:var(--accent);color:#fff;display:grid;place-items:center' }, icon('home')), t('brand')),
        h(
          'nav',
          null,
          langSwitch,
          h('a', { href: '/login', class: 'btn btn-ghost btn-sm hide-m', onClick: go('/login') }, t('nav_login')),
          h('a', { href: '/login', class: 'btn btn-sm', onClick: go('/login') }, t('nav_start')),
        ),
      ),
      h(
        'section',
        { class: 'hero' },
        h(
          'div',
          null,
          h('h1', null, t('hero_title')),
          h('p', { class: 'lead' }, t('hero_sub')),
          h(
            'div',
            { class: 'cta' },
            h('a', { href: '/login', class: 'btn btn-lg', onClick: go('/login') }, t('hero_cta'), icon('arrow')),
            h('a', { href: '#how', class: 'btn btn-ghost btn-lg' }, t('hero_cta2')),
          ),
          h('p', { class: 'small muted' }, t('hero_note')),
        ),
        phone,
      ),
      h(
        'section',
        { class: 'block', id: 'how' },
        h('h2', null, t('how_title')),
        h('div', { class: 'steps' }, step(1, 'users', t('how_1_t'), t('how_1_d')), step(2, 'clock', t('how_2_t'), t('how_2_d')), step(3, 'home', t('how_3_t'), t('how_3_d'))),
      ),
      h(
        'section',
        { class: 'block' },
        h('h2', null, t('who_title')),
        h('div', { class: 'steps' }, feature('globe', t('who_1_t'), t('who_1_d')), feature('moon', t('who_2_t'), t('who_2_d')), feature('heart', t('who_3_t'), t('who_3_d'))),
      ),
      h(
        'section',
        { class: 'block' },
        h('h2', null, t('feat_title')),
        h(
          'div',
          { class: 'features' },
          feature('eyeOff', t('feat_1_t'), t('feat_1_d')),
          feature('bell', t('feat_2_t'), t('feat_2_d')),
          feature('wifi', t('feat_3_t'), t('feat_3_d')),
          feature('send', t('feat_4_t'), t('feat_4_d')),
          feature('phone', t('feat_5_t'), t('feat_5_d')),
          feature('shield', t('feat_6_t'), t('feat_6_d')),
        ),
      ),
      h(
        'section',
        { class: 'block', id: 'pricing' },
        h('h2', null, t('pricing_title')),
        h(
          'div',
          { class: 'pricing' },
          h(
            'div',
            { class: 'price-card' },
            h('h3', null, t('pricing_free')),
            h('div', { class: 'price' }, t('pricing_free_p')),
            h('p', { class: 'muted' }, t('pricing_free_d')),
            h('ul', null, [t('pricing_free_1'), t('pricing_free_2'), t('pricing_free_3')].map((x) => h('li', null, icon('check'), x))),
            h('a', { href: '/login', class: 'btn btn-ghost', onClick: go('/login') }, t('pricing_cta')),
          ),
          h(
            'div',
            { class: 'price-card pro' },
            h('h3', null, t('pricing_pro')),
            h('div', { class: 'price' }, t('pricing_pro_p')),
            h('p', { class: 'muted' }, t('pricing_pro_alt'), h('br'), t('pricing_pro_d')),
            h('ul', null, [t('pricing_pro_1'), t('pricing_pro_2'), t('pricing_pro_3')].map((x) => h('li', null, icon('check'), x))),
            h('a', { href: '/login', class: 'btn', onClick: go('/login') }, t('pricing_cta')),
          ),
        ),
      ),
      h(
        'section',
        { class: 'block faq' },
        h('h2', null, t('faq_title')),
        faq(t('faq_1_q'), t('faq_1_a')),
        faq(t('faq_2_q'), t('faq_2_a')),
        faq(t('faq_3_q'), t('faq_3_a')),
        faq(t('faq_4_q'), t('faq_4_a')),
        faq(t('faq_5_q'), t('faq_5_a')),
      ),
      h(
        'footer',
        { class: 'foot' },
        h('span', null, `© ${new Date().getFullYear()} ${t('brand')} · ${t('footer_made')}`),
        h('span', null, h('a', { href: '/privacy', onClick: go('/privacy') }, t('footer_privacy')), h('a', { href: '/automations', onClick: go('/automations') }, t('footer_shortcuts'))),
      ),
    ),
  );
};
