// Offline support: network-first for pages, cache-first for hashed assets.
const CACHE = 'buzzword-dash-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const cacheable = url.origin === self.location.origin || url.hostname === 'unpkg.com';
  if (!cacheable) return;

  const store = (res) => {
    if (res && (res.ok || res.type === 'opaque')) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  };

  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then(store).catch(() => caches.match(req).then((r) => r || caches.match('./'))));
    return;
  }
  event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then(store)));
});
