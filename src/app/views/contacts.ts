import type { View } from '../main';
import { api, ApiError } from '../api';
import { t } from '../i18n';
import { h, icon, toast, modal, confirmDialog, clear, copyText, type IconName } from '../ui';
import type { Channel, ContactDTO } from '../../shared/types';

const CHANNEL_ICON: Record<Channel, IconName> = { telegram: 'send', email: 'mail', sms: 'phone', whatsapp: 'message' };

export const renderContacts: View = async (root, ctx) => {
  const me = ctx.state.me!;
  const list = h('div', { class: 'list' });
  const addBtn = h('button', { class: 'btn', type: 'button', 'data-testid': 'add-contact' }, icon('plus'), t('contacts_add'));
  const limitNote = h('p', { class: 'small muted', hidden: true }, t('contacts_limit'), ' ', h('a', { href: '/app/settings', onClick: (e: Event) => { e.preventDefault(); ctx.navigate('/app/settings'); } }, t('settings_plan')));
  let contacts: ContactDTO[] = [];

  async function load() {
    contacts = (await api.contacts()).contacts;
    paint();
  }

  function paint() {
    clear(list);
    const atLimit = contacts.length >= me.limits.maxContacts;
    addBtn.disabled = atLimit;
    limitNote.hidden = !atLimit || me.user.plan === 'pro';
    if (!contacts.length) {
      list.append(h('div', { class: 'empty' }, t('contacts_empty')));
      return;
    }
    for (const c of contacts) list.append(item(c));
  }

  function item(c: ContactDTO): HTMLElement {
    const status = c.channel === 'telegram' && !c.verified ? h('span', { class: 'badge warn' }, t('contacts_pending')) : h('span', { class: 'badge ok' }, icon('check'), t('contacts_linked'));
    const sub = [t(`channel_${c.channel}`), c.address, c.announceCheckins ? t('contacts_announce_on') : t('contacts_announce_off')].filter(Boolean).join(' · ');
    return h(
      'div',
      { class: 'item', 'data-testid': 'contact' },
      h('div', { class: 'avatar' }, c.name.slice(0, 1).toUpperCase()),
      h('div', { class: 'grow' }, h('div', { class: 'row gap wrap' }, h('span', { class: 'title' }, c.name), status), h('div', { class: 'sub' }, icon(CHANNEL_ICON[c.channel], 'small'), ' ', sub)),
      h('button', { class: 'btn-icon', type: 'button', 'aria-label': 'Edit', onClick: () => openEdit(c) }, icon('settings')),
    );
  }

  function form(existing?: ContactDTO) {
    const name = h('input', { type: 'text', value: existing?.name ?? '', placeholder: t('contacts_name_ph'), required: true, maxlength: 60 }) as HTMLInputElement;
    const channel = h(
      'select',
      { disabled: !!existing },
      (['telegram', 'email', 'sms', 'whatsapp'] as Channel[]).map((ch) =>
        h('option', { value: ch, selected: (existing?.channel ?? 'telegram') === ch, disabled: !me.limits.channels.includes(ch) }, t(`channel_${ch}`)),
      ),
    ) as HTMLSelectElement;
    const address = h('input', { type: 'text', value: existing?.address ?? '', maxlength: 120, disabled: !!existing }) as HTMLInputElement;
    const addressField = h('label', { class: 'field' }, h('span', null, ''), address);
    const announce = h('input', { type: 'checkbox', checked: existing ? existing.announceCheckins : true }) as HTMLInputElement;
    const err = h('div', { class: 'form-error', hidden: true });
    const proNote = h('p', { class: 'small muted' }, me.user.plan === 'pro' ? '' : t('contacts_pro_channel'));
    const save = h('button', { class: 'btn', type: 'submit', 'data-testid': 'save-contact' }, t('contacts_save'));
    const cancel = h('button', { class: 'btn btn-ghost', type: 'button' }, t('contacts_cancel'));

    const syncAddress = () => {
      const ch = channel.value as Channel;
      addressField.hidden = ch === 'telegram';
      const span = addressField.querySelector('span')!;
      span.textContent = ch === 'email' ? t('contacts_address_email') : t('contacts_address_phone');
      address.type = ch === 'email' ? 'email' : 'tel';
      address.required = ch !== 'telegram';
      address.placeholder = ch === 'email' ? 'mum@example.com' : '+420 777 123 456';
    };
    channel.addEventListener('change', syncAddress);
    syncAddress();

    const el = h(
      'form',
      {
        onSubmit: async (e: Event) => {
          e.preventDefault();
          save.disabled = true;
          err.hidden = true;
          try {
            if (existing) await api.updateContact(existing.id, { name: name.value, announceCheckins: announce.checked });
            else {
              const { contact } = await api.createContact({ name: name.value, channel: channel.value, address: address.value, announceCheckins: announce.checked });
              m.close();
              await load();
              if (contact.channel === 'telegram') openEdit(contact);
              return;
            }
            m.close();
            await load();
          } catch (ex) {
            err.textContent = ex instanceof ApiError ? ex.message : t('common_error');
            err.hidden = false;
            save.disabled = false;
          }
        },
      },
      h('label', { class: 'field' }, h('span', null, t('contacts_name')), name),
      h('label', { class: 'field' }, h('span', null, t('contacts_channel')), channel, proNote),
      addressField,
      h('label', { class: 'check' }, announce, h('span', null, t('contacts_announce'), h('div', { class: 'hint' }, t('contacts_announce_d')))),
      err,
      h('div', { class: 'row gap wrap' }, save, cancel),
    );
    const m = modal(existing ? existing.name : t('contacts_add'), el);
    cancel.addEventListener('click', m.close);
    return m;
  }

  function openEdit(c: ContactDTO) {
    const body = h('div', { class: 'stack' });
    if (c.channel === 'telegram' && c.telegramLink) {
      const link = c.telegramLink;
      body.append(
        h(
          'div',
          { class: 'card', style: 'background:var(--soft)' },
          h('p', { class: 'small' }, c.verified ? t('contacts_linked') + ' ✅' : t('contacts_tg_share', { name: c.name })),
          h('div', { class: 'code' }, link),
          h(
            'div',
            { class: 'row gap wrap', style: 'margin-top:10px' },
            h('button', { class: 'btn btn-sm', type: 'button', onClick: async () => { if (await copyText(link)) toast(t('contacts_copied'), 'ok'); } }, icon('copy'), t('contacts_tg_copy')),
            'share' in navigator
              ? h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onClick: () => navigator.share({ title: t('brand'), text: t('contacts_tg_share', { name: c.name }), url: link }).catch(() => undefined) }, icon('share'), t('contacts_tg_share_btn'))
              : null,
            h('a', { class: 'btn btn-sm btn-ghost', href: link, target: '_blank', rel: 'noopener' }, icon('send'), 'Telegram'),
          ),
        ),
      );
    }
    const name = h('input', { type: 'text', value: c.name, required: true, maxlength: 60 }) as HTMLInputElement;
    const announce = h('input', { type: 'checkbox', checked: c.announceCheckins }) as HTMLInputElement;
    const save = h('button', { class: 'btn', type: 'submit' }, t('contacts_save'));
    const test = h('button', { class: 'btn btn-ghost', type: 'button' }, icon('send'), t('contacts_test'));
    const del = h('button', { class: 'btn btn-ghost', type: 'button', style: 'color:var(--danger)' }, icon('trash'), t('contacts_delete'));
    const err = h('div', { class: 'form-error', hidden: true });
    body.append(
      h(
        'form',
        {
          onSubmit: async (e: Event) => {
            e.preventDefault();
            try {
              await api.updateContact(c.id, { name: name.value, announceCheckins: announce.checked });
              m.close();
              await load();
            } catch (ex) {
              err.textContent = ex instanceof ApiError ? ex.message : t('common_error');
              err.hidden = false;
            }
          },
        },
        h('label', { class: 'field' }, h('span', null, t('contacts_name')), name),
        h('p', { class: 'small muted' }, t(`channel_${c.channel}`), c.address ? ` · ${c.address}` : ''),
        h('label', { class: 'check' }, announce, h('span', null, t('contacts_announce'), h('div', { class: 'hint' }, t('contacts_announce_d')))),
        err,
        h('div', { class: 'row gap wrap' }, save, test, del),
      ),
    );
    const m = modal(c.name, body);
    test.addEventListener('click', async () => {
      test.disabled = true;
      try {
        const r = await api.testContact(c.id);
        toast(r.skipped ? t('contacts_test_skipped') : t('contacts_test_ok'), 'ok');
      } catch (ex) {
        toast(ex instanceof ApiError ? ex.message : t('common_error'), 'err');
      }
      test.disabled = false;
    });
    del.addEventListener('click', async () => {
      if (!(await confirmDialog(`${t('contacts_delete')} ${c.name}?`))) return;
      await api.deleteContact(c.id);
      m.close();
      await load();
    });
  }

  addBtn.addEventListener('click', () => form());

  root.append(
    h('div', { class: 'page-head row between wrap gap' }, h('div', null, h('h1', null, t('contacts_title')), h('p', { class: 'muted', style: 'margin:0' }, t('contacts_sub'))), addBtn),
    limitNote,
    list,
  );
  await load();
};
