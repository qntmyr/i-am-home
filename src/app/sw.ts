// Service worker: app shell cache, push notifications with a one-tap "I'm home" action.
const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = 'iah-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png'];

sw.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL).catch(() => undefined))
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== sw.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // never cache API calls

  // Hashed build assets: cache first.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
    return;
  }

  // Navigations and everything else: network first, fall back to the cached shell.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && (req.mode === 'navigate' || SHELL.includes(url.pathname))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req.mode === 'navigate' ? '/' : req, copy));
        }
        return res;
      })
      .catch(async () => (await caches.match(req)) ?? (await caches.match('/')) ?? Response.error()),
  );
});

interface PushData {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  checkinAction?: boolean;
}

sw.addEventListener('push', (event) => {
  let data: PushData = { title: 'igothome', body: '' };
  try {
    data = { ...data, ...(event.data?.json() as PushData) };
  } catch {
    data.body = event.data?.text() ?? '';
  }
  const actions = data.checkinAction ? [{ action: 'checkin', title: "I'm home 🏠" }] : [];
  event.waitUntil(
    sw.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url ?? '/app' },
      actions,
      requireInteraction: !!data.checkinAction,
    } as NotificationOptions),
  );
});

sw.addEventListener('notificationclick', (event) => {
  const n = event.notification;
  n.close();
  if (event.action === 'checkin') {
    event.waitUntil(
      fetch('/api/checkin', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: 'push' }),
      })
        .then((res) =>
          sw.registration.showNotification('igothome', {
            body: res.ok ? 'Checked in. ✅' : 'Could not check in, open the app.',
            tag: 'checkin-result',
            icon: '/icon-192.png',
          }),
        )
        .catch(() => sw.registration.showNotification('igothome', { body: 'Offline: open the app to check in.', tag: 'checkin-result' })),
    );
    return;
  }
  const url = (n.data as { url?: string } | undefined)?.url ?? '/app';
  event.waitUntil(
    sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return sw.clients.openWindow(url);
    }),
  );
});
