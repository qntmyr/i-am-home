import type { View } from '../main';
import { api, ApiError } from '../api';
import { t } from '../i18n';
import { h, icon, toast, fmtTime, fmtDateTime, fmtDuration, fmtAgo, clear, modal, type IconName } from '../ui';
import type { EventDTO, StatusDTO } from '../../shared/types';
import { enablePush, getPushState } from '../push';

export const renderDashboard: View = async (root, ctx) => {
  const me = ctx.state.me!;
  const name = me.user.name || me.user.email.split('@')[0] || '';
  const tz = me.user.tz;

  const button = h('button', { class: 'home-btn', type: 'button', 'data-testid': 'checkin' }, icon('home'), h('span', null, t('dash_button'))) as HTMLButtonElement;
  const statusLine = h('div', { class: 'status-line' });
  const nextCard = h('div', { class: 'card next-card' });
  const setupCard = h('div', { class: 'card setup', hidden: true });
  const activityCard = h('div', { class: 'card' });
  const tripBtn = h('button', { class: 'btn btn-soft', type: 'button' }, icon('clock'), t('dash_trip_btn'));

  let status: StatusDTO | null = null;
  let timer: number | undefined;

  async function load() {
    try {
      const [s, ev] = await Promise.all([api.status(), api.events()]);
      status = s;
      paintStatus();
      paintEvents(ev.events);
      await paintSetup();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) ctx.navigate('/login');
    }
  }

  function paintStatus() {
    if (!status) return;
    const last = status.lastCheckinAt;
    const next = status.nextDue;
    const recentlyDone = last !== null && Date.now() - last < 60 * 60 * 1000;
    button.classList.toggle('done', recentlyDone);
    button.querySelector('span')!.textContent = recentlyDone ? t('dash_button_done') : t('dash_button');
    button.classList.toggle('due', !recentlyDone && !!next && !next.satisfied && next.fireAt - Date.now() < 2 * 60 * 60 * 1000);

    clear(statusLine);
    if (last === null) statusLine.append(t('dash_never'));
    else statusLine.append(t('dash_last') + ': ', h('strong', null, fmtDateTime(last, tz)), ` (${fmtAgo(last)})`);

    clear(nextCard);
    nextCard.classList.remove('pending', 'satisfied');
    if (!next) {
      nextCard.append(h('div', { class: 'clock' }, icon('clock')), h('div', null, h('div', { class: 'big' }, t('dash_next_none')), h('div', { class: 'muted small' }, t('dash_setup_rule'))));
      return;
    }
    const diff = next.fireAt - Date.now();
    nextCard.classList.add(next.satisfied ? 'satisfied' : 'pending');
    nextCard.append(
      h('div', { class: 'clock' }, icon(next.satisfied ? 'check' : 'bell')),
      h(
        'div',
        { class: 'grow' },
        h('div', { class: 'muted small' }, t('dash_next_title') + (next.ruleName ? ` · ${next.ruleName}` : '')),
        h('div', { class: 'big' }, fmtDateTime(next.fireAt, tz)),
        h('div', { class: 'muted small' }, diff > 0 ? t('dash_in', { duration: fmtDuration(diff) }) : t('dash_overdue')),
        h('div', { class: 'small' }, next.satisfied ? t('dash_next_satisfied') : t('dash_next_pending', { names: next.contactNames.join(', ') })),
      ),
    );
  }

  async function paintSetup() {
    if (!status) return;
    const push = await getPushState(me.vapidPublicKey);
    const pushDone = push === 'on';
    const pushUnavailable = push === 'unsupported' || push === 'noserver';
    const items = [
      { done: status.contactsCount > 0, label: t('dash_setup_contact'), path: '/app/contacts' },
      { done: status.rulesCount > 0, label: t('dash_setup_rule'), path: '/app/rules' },
      ...(pushUnavailable ? [] : [{ done: pushDone, label: pushDone ? t('dash_setup_push_done') : t('dash_setup_push'), path: '/app/settings', push: true }]),
    ];
    const allDone = items.every((i) => i.done);
    setupCard.hidden = allDone;
    if (allDone) return;
    clear(setupCard);
    setupCard.append(
      h('h3', null, t('dash_setup_title')),
      h(
        'ul',
        null,
        items.map((it, i) =>
          h(
            'li',
            { class: it.done ? 'done' : '' },
            h('div', { class: 'step' }, it.done ? icon('check') : String(i + 1)),
            h('span', { class: 'label grow' }, it.label),
            it.done
              ? null
              : h(
                  'button',
                  {
                    class: 'btn btn-sm btn-ghost',
                    type: 'button',
                    onClick: async () => {
                      if ('push' in it && me.vapidPublicKey) {
                        const st = await enablePush(me.vapidPublicKey).catch(() => 'off' as const);
                        if (st === 'on') toast(t('dash_setup_push_done'), 'ok');
                        else if (st === 'denied') toast(t('settings_notif_denied'), 'err');
                        await paintSetup();
                      } else ctx.navigate(it.path);
                    },
                  },
                  icon('arrow'),
                ),
          ),
        ),
      ),
    );
  }

  function paintEvents(events: EventDTO[]) {
    clear(activityCard);
    activityCard.append(h('h3', null, t('dash_activity')));
    if (!events.length) {
      activityCard.append(h('p', { class: 'muted small' }, t('dash_activity_empty')));
      return;
    }
    activityCard.append(
      h(
        'ul',
        { class: 'events' },
        events.slice(0, 20).map((ev) => {
          const d = ev.detail as Record<string, string | string[] | undefined>;
          let text = '';
          let ico: IconName = 'check';
          let cls = '';
          switch (ev.type) {
            case 'checkin': {
              const src = String(d.source ?? 'app');
              const srcKey = (`ev_checkin_src_${src}` as 'ev_checkin_src_app');
              text = t('ev_checkin') + (src !== 'app' && src !== 'test' ? ` (${t(srcKey)})` : '') + (d.note ? ` · ${d.note}` : '');
              ico = 'home';
              cls = 'ok';
              break;
            }
            case 'announce':
              text = t('ev_announce', { names: (d.contacts as string[] | undefined)?.join(', ') ?? '' });
              ico = 'send';
              cls = 'accent';
              break;
            case 'alert':
              text = t('ev_alert', { names: (d.sentTo as string[] | undefined)?.join(', ') ?? '' });
              ico = 'alert';
              cls = 'alert';
              break;
            case 'reminder':
              text = t('ev_reminder');
              ico = 'bell';
              break;
            case 'rule_ok':
              text = t('ev_rule_ok', { name: String(d.ruleName ?? '') });
              ico = 'check';
              cls = 'ok';
              break;
            case 'contact_linked':
              text = t('ev_contact_linked', { name: String(d.contact ?? '') });
              ico = 'link';
              cls = 'accent';
              break;
            case 'plan_changed':
              text = t('ev_plan_changed', { plan: String(d.plan ?? '') });
              ico = 'zap';
              break;
            case 'test':
              text = t('ev_test');
              ico = 'send';
              break;
          }
          return h('li', null, h('div', { class: `dot ${cls}` }, icon(ico)), h('div', { class: 'grow' }, h('div', null, text), h('div', { class: 'when' }, fmtDateTime(ev.at, tz))));
        }),
      ),
    );
  }

  button.addEventListener('click', async () => {
    button.classList.add('busy');
    try {
      const r = await api.checkin();
      button.classList.remove('busy');
      button.classList.add('pop');
      setTimeout(() => button.classList.remove('pop'), 500);
      if (navigator.vibrate) navigator.vibrate([30, 40, 60]);
      const time = fmtTime(r.at, tz);
      toast(r.announcedTo.length ? t('dash_told', { names: r.announcedTo.join(', '), time }) : t('dash_told_none', { time }), 'ok');
      await load();
    } catch (e) {
      button.classList.remove('busy');
      toast(e instanceof ApiError && e.code === 'offline' ? t('common_offline') : t('common_error'), 'err');
    }
  });

  tripBtn.addEventListener('click', () => openTrip());

  function openTrip() {
    const now = new Date();
    const defaultHour = Math.min(23, now.getHours() + 3);
    const time = h('input', { type: 'time', value: `${String(defaultHour).padStart(2, '0')}:00`, required: true }) as HTMLInputElement;
    const tomorrow = h('input', { type: 'checkbox' }) as HTMLInputElement;
    const err = h('div', { class: 'form-error', hidden: true });
    const save = h('button', { class: 'btn', type: 'submit' }, t('trip_set'));
    const form = h(
      'form',
      {
        onSubmit: async (e: Event) => {
          e.preventDefault();
          const [hh, mm] = time.value.split(':').map(Number);
          const d = new Date();
          d.setHours(hh ?? 0, mm ?? 0, 0, 0);
          if (tomorrow.checked || d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
          try {
            const contacts = (await api.contacts()).contacts;
            if (!contacts.length) {
              err.textContent = t('rules_need_contact');
              err.hidden = false;
              return;
            }
            await api.createRule({ kind: 'once', name: t('trip_title'), onceAt: d.getTime(), contactIds: contacts.map((c) => c.id), remindBeforeMin: 30, windowHours: 6 });
            m.close();
            toast(t('rules_next', { when: fmtDateTime(d.getTime(), tz) }), 'ok');
            await load();
          } catch (ex) {
            err.textContent = ex instanceof ApiError ? ex.message : t('common_error');
            err.hidden = false;
          }
        },
      },
      h('p', { class: 'muted' }, t('trip_sub')),
      h('label', { class: 'field' }, h('span', null, t('rules_time')), time),
      h('label', { class: 'check' }, tomorrow, h('span', null, t('trip_tomorrow'), '…')),
      err,
      save,
    );
    const m = modal(t('trip_title'), form);
  }

  root.append(
    h('div', { class: 'page-head' }, h('h1', null, t('dash_hi', { name })), h('p', { class: 'muted' }, t('dash_tap'))),
    h('div', { class: 'hero-btn-wrap' }, button, statusLine),
    h('div', { class: 'stack', style: 'margin-top:18px' }, nextCard, setupCard, h('div', { class: 'card tint' }, h('div', { class: 'row between wrap gap' }, h('div', null, h('h3', null, t('dash_trip_title')), h('p', { class: 'muted small', style: 'margin:0' }, t('dash_trip_d'))), tripBtn)), activityCard),
  );

  await load();
  timer = window.setInterval(() => paintStatus(), 30_000);
  const onVisible = () => {
    if (document.visibilityState === 'visible') void load();
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
};
