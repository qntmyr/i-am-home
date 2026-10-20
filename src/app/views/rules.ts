import type { View } from '../main';
import { api, ApiError } from '../api';
import { t, getLang } from '../i18n';
import { h, icon, toast, modal, confirmDialog, clear, fmtDateTime } from '../ui';
import type { ContactDTO, RuleDTO, RuleKind } from '../../shared/types';
import { ALL_DAYS, WEEKDAYS, WEEKEND } from '../../shared/types';
import { daysToLabel } from '../../shared/schedule';

const DAY_KEYS = ['day_mon', 'day_tue', 'day_wed', 'day_thu', 'day_fri', 'day_sat', 'day_sun'] as const;

export const renderRules: View = async (root, ctx) => {
  const me = ctx.state.me!;
  const tz = me.user.tz;
  const list = h('div', { class: 'list' });
  const addBtn = h('button', { class: 'btn', type: 'button', 'data-testid': 'add-rule' }, icon('plus'), t('rules_add'));
  let rules: RuleDTO[] = [];
  let contacts: ContactDTO[] = [];

  async function load() {
    const [r, c] = await Promise.all([api.rules(), api.contacts()]);
    rules = r.rules;
    contacts = c.contacts;
    paint();
  }

  function paint() {
    clear(list);
    if (!rules.length) {
      list.append(h('div', { class: 'empty' }, t('rules_empty')));
      return;
    }
    const sorted = [...rules].sort((a, b) => Number(b.enabled) - Number(a.enabled) || (a.nextFireAt ?? Infinity) - (b.nextFireAt ?? Infinity));
    for (const r of sorted) list.append(item(r));
  }

  function item(r: RuleDTO): HTMLElement {
    const names = r.contactIds.map((id) => contacts.find((c) => c.id === id)?.name).filter(Boolean).join(', ');
    const when = r.kind === 'once' ? (r.onceAt ? fmtDateTime(r.onceAt, tz) : '') : `${r.timeLocal} · ${daysToLabel(r.days, getLang())}`;
    const badge = !r.enabled
      ? h('span', { class: 'badge' }, r.kind === 'once' && r.lastResult ? t('rules_done') : t('rules_paused'))
      : r.nextFireAt
        ? h('span', { class: 'badge accent' }, t('rules_next', { when: fmtDateTime(r.nextFireAt, tz) }))
        : null;
    const last = r.lastResult === 'alerted' ? h('span', { class: 'badge danger' }, t('rules_last_alerted')) : r.lastResult === 'ok' ? h('span', { class: 'badge ok' }, t('rules_last_ok')) : null;
    const toggle = h('label', { class: 'switch', title: t('rules_enabled') }, h('input', { type: 'checkbox', checked: r.enabled, onChange: async (e: Event) => {
      const on = (e.target as HTMLInputElement).checked;
      try {
        await api.updateRule(r.id, { enabled: on });
        await load();
      } catch (ex) {
        toast(ex instanceof ApiError ? ex.message : t('common_error'), 'err');
        await load();
      }
    } }));
    return h(
      'div',
      { class: 'item', 'data-testid': 'rule' },
      h('div', { class: 'avatar' }, icon(r.kind === 'once' ? 'zap' : 'clock')),
      h(
        'div',
        { class: 'grow' },
        h('div', { class: 'row gap wrap' }, h('span', { class: 'title' }, r.name || (r.kind === 'once' ? t('rules_kind_once') : t('rules_kind_recurring'))), badge, last),
        h('div', { class: 'sub' }, when, names ? ` → ${names}` : ''),
      ),
      toggle,
      h('button', { class: 'btn-icon', type: 'button', 'aria-label': 'Edit', onClick: () => openForm(r) }, icon('settings')),
    );
  }

  function openForm(existing?: RuleDTO, presetKind: RuleKind = 'recurring') {
    if (!contacts.length) {
      toast(t('rules_need_contact'), 'err');
      ctx.navigate('/app/contacts');
      return;
    }
    let kind: RuleKind = existing?.kind ?? presetKind;
    let days = existing?.days ?? WEEKDAYS;
    const selected = new Set(existing?.contactIds ?? contacts.map((c) => c.id));

    const name = h('input', { type: 'text', value: existing?.name ?? '', placeholder: t('rules_name_ph'), maxlength: 60 }) as HTMLInputElement;
    const time = h('input', { type: 'time', value: existing?.timeLocal ?? '20:00', required: true }) as HTMLInputElement;
    const onceAt = h('input', { type: 'datetime-local', value: existing?.onceAt ? toLocalInput(existing.onceAt) : toLocalInput(Date.now() + 3 * 3600_000) }) as HTMLInputElement;
    const remind = h('select', null, [0, 15, 30, 60, 120].map((n) => h('option', { value: String(n), selected: (existing?.remindBeforeMin ?? 30) === n }, n === 0 ? t('rules_remind_none') : t('rules_min', { n })))) as HTMLSelectElement;
    const windowSel = h('select', null, [3, 6, 12, 18, 24].map((n) => h('option', { value: String(n), selected: (existing?.windowHours ?? 12) === n }, t('rules_hours', { n })))) as HTMLSelectElement;
    const message = h('textarea', { placeholder: t('rules_message_ph'), maxlength: 300 }, existing?.message ?? '') as HTMLTextAreaElement;
    const err = h('div', { class: 'form-error', hidden: true });
    const save = h('button', { class: 'btn', type: 'submit', 'data-testid': 'save-rule' }, t('rules_save'));
    const cancel = h('button', { class: 'btn btn-ghost', type: 'button' }, t('contacts_cancel'));
    const test = existing ? h('button', { class: 'btn btn-ghost', type: 'button' }, icon('send'), t('rules_test')) : null;
    const del = existing ? h('button', { class: 'btn btn-ghost', type: 'button', style: 'color:var(--danger)' }, icon('trash'), t('rules_delete')) : null;

    const kindChips = h('div', { class: 'chips' });
    const dayBtns = h('div', { class: 'days' });
    const presets = h('div', { class: 'chips', style: 'margin-top:8px' });
    const daysField = h('div', { class: 'field' }, h('span', { class: 'field-label' }, t('rules_days')), dayBtns, presets);
    const timeField = h('label', { class: 'field' }, h('span', null, t('rules_time')), time);
    const onceField = h('label', { class: 'field' }, h('span', null, t('rules_once_at')), onceAt);

    const paintKind = () => {
      clear(kindChips);
      (['recurring', 'once'] as RuleKind[]).forEach((k) =>
        kindChips.append(h('button', { type: 'button', class: `chip ${kind === k ? 'on' : ''}`, onClick: () => { kind = k; paintKind(); } }, t(k === 'once' ? 'rules_kind_once' : 'rules_kind_recurring'))),
      );
      daysField.hidden = kind === 'once';
      timeField.hidden = kind === 'once';
      onceField.hidden = kind !== 'once';
    };
    const paintDays = () => {
      clear(dayBtns);
      DAY_KEYS.forEach((k, i) => dayBtns.append(h('button', { type: 'button', class: days & (1 << i) ? 'on' : '', onClick: () => { days ^= 1 << i; paintDays(); } }, t(k))));
      clear(presets);
      ([
        [t('days_every'), ALL_DAYS],
        [t('days_weekdays'), WEEKDAYS],
        [t('days_weekend'), WEEKEND],
      ] as Array<[string, number]>).forEach(([label, mask]) => presets.append(h('button', { type: 'button', class: `chip ${days === mask ? 'on' : ''}`, onClick: () => { days = mask; paintDays(); } }, label)));
    };
    paintKind();
    paintDays();

    const contactChips = h(
      'div',
      { class: 'chips' },
      contacts.map((c) => {
        const b = h('button', { type: 'button', class: `chip ${selected.has(c.id) ? 'on' : ''}` }, c.name);
        b.addEventListener('click', () => {
          if (selected.has(c.id)) selected.delete(c.id);
          else selected.add(c.id);
          b.classList.toggle('on', selected.has(c.id));
        });
        return b;
      }),
    );

    const el = h(
      'form',
      {
        onSubmit: async (e: Event) => {
          e.preventDefault();
          save.disabled = true;
          err.hidden = true;
          const payload: Partial<RuleDTO> = {
            kind,
            name: name.value,
            timeLocal: time.value,
            days,
            onceAt: kind === 'once' ? new Date(onceAt.value).getTime() : null,
            remindBeforeMin: Number(remind.value),
            windowHours: Number(windowSel.value),
            message: message.value,
            contactIds: [...selected],
          };
          try {
            if (existing) await api.updateRule(existing.id, payload);
            else await api.createRule({ ...payload, enabled: true });
            m.close();
            await load();
          } catch (ex) {
            err.textContent = ex instanceof ApiError ? ex.message : t('common_error');
            err.hidden = false;
            save.disabled = false;
          }
        },
      },
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, t('rules_kind')), kindChips),
      h('label', { class: 'field' }, h('span', null, t('rules_name')), name),
      timeField,
      onceField,
      daysField,
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, t('rules_contacts')), contactChips),
      h('div', { class: 'grid2' },
        h('label', { class: 'field' }, h('span', null, t('rules_remind')), remind, h('div', { class: 'hint' }, t('rules_reminder_hint'))),
        h('label', { class: 'field' }, h('span', null, t('rules_window')), windowSel),
      ),
      h('label', { class: 'field' }, h('span', null, t('rules_message')), message),
      err,
      h('div', { class: 'row gap wrap' }, save, cancel, test, del),
    );
    const m = modal(existing ? existing.name || t('rules_title') : t('rules_add'), el, { wide: true });
    cancel.addEventListener('click', m.close);
    test?.addEventListener('click', async () => {
      test.disabled = true;
      try {
        const r = await api.testRule(existing!.id);
        toast(t('rules_test_ok', { names: r.sentTo.join(', ') }), 'ok');
      } catch (ex) {
        toast(ex instanceof ApiError ? ex.message : t('common_error'), 'err');
      }
      test.disabled = false;
    });
    del?.addEventListener('click', async () => {
      if (!(await confirmDialog(`${t('rules_delete')} ${existing!.name || ''}?`))) return;
      await api.deleteRule(existing!.id);
      m.close();
      await load();
    });
  }

  addBtn.addEventListener('click', () => openForm());

  root.append(
    h('div', { class: 'page-head row between wrap gap' }, h('div', null, h('h1', null, t('rules_title')), h('p', { class: 'muted', style: 'margin:0' }, t('rules_sub'))), addBtn),
    list,
  );
  await load();
};

function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
