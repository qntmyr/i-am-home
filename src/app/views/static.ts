import type { View } from '../main';
import { t } from '../i18n';
import { h, icon, toast, copyText } from '../ui';

function page(ctx: Parameters<View>[1], title: string, ...children: (HTMLElement | null)[]): HTMLElement {
  return h(
    'div',
    { class: 'doc' },
    h('p', null, h('a', { href: '/', onClick: (e: Event) => { e.preventDefault(); ctx.navigate(ctx.state.me ? '/app/settings' : '/'); } }, '← ', t('brand'))),
    h('h1', { style: 'font-size:2rem' }, title),
    ...children,
  );
}

export const renderPrivacy: View = (root, ctx) => {
  root.appendChild(page(ctx, t('privacy_title'), h('p', null, t('privacy_body')), h('p', null, t('privacy_pay'))));
};

interface PublicInfo {
  legalName: string | null;
  legalAddress: string | null;
  legalId: string | null;
  contactEmail: string | null;
}

export const renderTerms: View = async (root, ctx) => {
  const section = (title: string, body: string) => [h('h3', { style: 'margin-top:24px' }, title), h('p', null, body)];
  const operator = h('div', { 'data-testid': 'operator' });
  root.appendChild(
    page(
      ctx,
      t('terms_title'),
      h('p', { class: 'small muted' }, t('terms_updated')),
      h('div', { class: 'notice' }, icon('alert'), h('span', null, h('strong', null, t('terms_safety_t')), ' · ', t('terms_safety'))),
      ...section(t('terms_service_t'), t('terms_service')),
      ...section(t('terms_account_t'), t('terms_account')),
      ...section(t('terms_pay_t'), t('terms_pay')),
      ...section(t('terms_end_t'), t('terms_end')),
      ...section(t('terms_liability_t'), t('terms_liability')),
      operator,
    ),
  );
  try {
    const res = await fetch('/api/public');
    const info = (await res.json()) as PublicInfo;
    const lines = [info.legalName, info.legalAddress, info.legalId].filter(Boolean) as string[];
    if (lines.length || info.contactEmail) {
      operator.append(h('h3', { style: 'margin-top:24px' }, t('terms_operator_t')), h('p', null, lines.flatMap((l, i) => (i ? [h('br'), l] : [l]))));
      if (info.contactEmail) operator.append(h('p', null, t('terms_contact'), ': ', h('a', { href: `mailto:${info.contactEmail}` }, info.contactEmail)));
    }
  } catch {
    /* offline: the legal notice is optional on screen */
  }
};

export const renderGuide: View = async (root, ctx) => {
  const me = ctx.state.me ?? (await ctx.refreshMe());
  const link = me?.hookUrl ?? 'https://…/api/hook/your-secret-token';
  const steps = (items: string[]) => h('ol', null, items.map((s) => h('li', null, s)));
  root.appendChild(
    page(
      ctx,
      t('guide_title'),
      h('p', { class: 'muted' }, t('guide_sub')),
      h('h3', null, t('guide_link')),
      h('div', { class: 'code' }, link),
      me ? h('p', null, h('button', { class: 'btn btn-sm', type: 'button', onClick: async () => { if (await copyText(link)) toast(t('contacts_copied'), 'ok'); } }, icon('copy'), t('settings_hook_copy'))) : null,
      h('div', { class: 'notice' }, icon('shield'), h('span', null, t('guide_security'))),
      h('h3', { style: 'margin-top:28px' }, t('guide_ios')),
      steps([t('guide_ios_1'), t('guide_ios_2'), t('guide_ios_3'), t('guide_ios_4')]),
      h('h3', { style: 'margin-top:28px' }, t('guide_android')),
      steps([t('guide_android_1'), t('guide_android_2'), t('guide_android_3')]),
      h('h3', { style: 'margin-top:28px' }, t('guide_other')),
      h('p', null, t('guide_other_d')),
      h('div', { class: 'code' }, `curl "${link}?note=wifi"`),
    ),
  );
};
