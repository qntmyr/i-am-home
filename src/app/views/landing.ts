import type { View } from '../main';
import { LANGS, getLang, setLang, t, type Lang } from '../i18n';
import { h, icon, logo, type IconName } from '../ui';

/** Splits "First sentence. Second sentence." so the second part can be highlighted. */
function splitTitle(title: string): [string, string | null] {
  const i = title.indexOf('. ');
  if (i < 0) return [title, null];
  return [title.slice(0, i + 1), title.slice(i + 2)];
}

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

  const eyebrow = (text: string) => h('div', { class: 'eyebrow' }, text);
  const step = (n: number, ico: IconName, title: string, text: string) =>
    h('div', { class: 'step' }, h('div', { class: 'num' }, String(n).padStart(2, '0')), h('div', { class: 'ico' }, icon(ico)), h('h3', null, title), h('p', null, text));
  const who = (ico: IconName, tone: string, title: string, text: string) =>
    h('div', { class: `who-card ${tone}` }, h('div', { class: 'ico' }, icon(ico)), h('h3', null, title), h('p', null, text));
  const feature = (ico: IconName, title: string, text: string, cls = '') =>
    h('div', { class: `feat-card ${cls}`.trim() }, h('div', { class: 'ico' }, icon(ico)), h('h3', null, title), h('p', null, text));
  const faq = (q: string, a: string) => h('details', null, h('summary', null, h('span', null, q), icon('chevron')), h('p', null, a));

  const [titleA, titleB] = splitTitle(t('hero_title'));

  const phone = h(
    'div',
    { class: 'phone', 'aria-hidden': 'true' },
    h(
      'div',
      { class: 'screen' },
      h('div', { class: 'statusbar' }, h('span', null, '19:42'), h('span', { class: 'pill' })),
      h('div', { class: 'muted small' }, t('dash_tap')),
      h('div', { class: 'home-btn due' }, icon('home'), h('span', null, t('dash_button'))),
      h('div', { class: 'bubble' }, h('div', { class: 'avatar' }, 'M'), h('div', null, h('div', { class: 'small', style: 'font-weight:600' }, t('contacts_name_ph')), h('div', { class: 'small muted' }, '🏠 ' + t('ev_checkin') + ' · 19:42'))),
    ),
  );
  const visual = h(
    'div',
    { class: 'hero-visual' },
    h('div', { class: 'glow' }),
    phone,
    h(
      'div',
      { class: 'float msg' },
      h('div', { class: 'avatar tg' }, icon('send')),
      h('div', null, h('div', { class: 'from' }, t('contacts_name_ph'), h('span', { class: 'time' }, '19:42')), h('div', { class: 'text' }, t('demo_msg'))),
    ),
    h('div', { class: 'float rule' }, icon('clock'), h('span', null, t('demo_rule'))),
  );

  root.appendChild(
    h(
      'div',
      { class: 'landing' },
      h(
        'header',
        { class: 'topbar' },
        h('a', { href: '/', class: 'brand', onClick: go('/') }, logo(), h('span', { class: 'wordmark' }, t('brand'))),
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
          { class: 'hero-copy' },
          h('div', { class: 'badge' }, icon('eyeOff'), t('hero_badge')),
          h('h1', null, titleA, titleB ? [' ', h('span', { class: 'hl' }, titleB)] : null),
          h('p', { class: 'lead' }, t('hero_sub')),
          h(
            'div',
            { class: 'cta' },
            h('a', { href: '/login', class: 'btn btn-lg', onClick: go('/login') }, t('hero_cta'), icon('arrow')),
            h('a', { href: '#how', class: 'btn btn-ghost btn-lg' }, t('hero_cta2')),
          ),
          h('p', { class: 'small muted note' }, t('hero_note')),
        ),
        visual,
      ),
      h(
        'section',
        { class: 'block reveal', id: 'how' },
        eyebrow(t('how_eyebrow')),
        h('h2', null, t('how_title')),
        h('div', { class: 'steps' }, step(1, 'users', t('how_1_t'), t('how_1_d')), step(2, 'clock', t('how_2_t'), t('how_2_d')), step(3, 'home', t('how_3_t'), t('how_3_d'))),
      ),
      h(
        'section',
        { class: 'block reveal' },
        eyebrow(t('who_eyebrow')),
        h('h2', null, t('who_title')),
        h('div', { class: 'who' }, who('globe', 'peach', t('who_1_t'), t('who_1_d')), who('moon', 'night', t('who_2_t'), t('who_2_d')), who('heart', 'mint', t('who_3_t'), t('who_3_d'))),
      ),
      h(
        'section',
        { class: 'block reveal' },
        eyebrow(t('feat_eyebrow')),
        h('h2', null, t('feat_title')),
        h(
          'div',
          { class: 'bento' },
          feature('eyeOff', t('feat_1_t'), t('feat_1_d'), 'wide dark'),
          feature('bell', t('feat_2_t'), t('feat_2_d')),
          feature('wifi', t('feat_3_t'), t('feat_3_d')),
          feature('send', t('feat_4_t'), t('feat_4_d')),
          feature('phone', t('feat_5_t'), t('feat_5_d')),
          feature('shield', t('feat_6_t'), t('feat_6_d'), 'wide'),
        ),
      ),
      h(
        'section',
        { class: 'block reveal center', id: 'pricing' },
        eyebrow(t('pricing_eyebrow')),
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
            h('div', { class: 'tag' }, t('pricing_popular')),
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
        { class: 'block reveal faq' },
        eyebrow(t('faq_eyebrow')),
        h('h2', null, t('faq_title')),
        h('div', { class: 'faq-list' }, faq(t('faq_1_q'), t('faq_1_a')), faq(t('faq_2_q'), t('faq_2_a')), faq(t('faq_3_q'), t('faq_3_a')), faq(t('faq_4_q'), t('faq_4_a')), faq(t('faq_5_q'), t('faq_5_a'))),
      ),
      h(
        'section',
        { class: 'cta-band reveal' },
        h('div', null, h('h2', null, t('cta_final_t')), h('p', null, t('cta_final_d'))),
        h('a', { href: '/login', class: 'btn btn-lg btn-cream', onClick: go('/login') }, t('hero_cta'), icon('arrow')),
      ),
      h(
        'footer',
        { class: 'foot' },
        h('div', { class: 'brand' }, logo(), h('span', { class: 'wordmark' }, t('brand'))),
        h('span', { class: 'muted' }, `© ${new Date().getFullYear()} · ${t('footer_made')}`),
        h('span', { class: 'links' }, h('a', { href: '/privacy', onClick: go('/privacy') }, t('footer_privacy')), h('a', { href: '/terms', onClick: go('/terms') }, t('footer_terms')), h('a', { href: '/automations', onClick: go('/automations') }, t('footer_shortcuts'))),
      ),
    ),
  );

  // Reveal sections as they scroll into view (no-op when the browser lacks IntersectionObserver).
  const targets = Array.from(root.querySelectorAll<HTMLElement>('.reveal'));
  if (!('IntersectionObserver' in window)) {
    for (const el of targets) el.classList.add('in');
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      }
    },
    { rootMargin: '0px 0px -10% 0px' },
  );
  for (const el of targets) io.observe(el);
  return () => io.disconnect();
};
