// Offline support: network-first for pages, cache-first for hashed assets.
// __BUILD_ID__ is replaced with the commit (or build time) by vite.config.js at build time.
//
// Two caches:
//   dx-dash-<build>  the page and everything else; replaced on every deploy.
//   dx-assets        the hashed files in /assets/ (their name changes whenever their content does, so an
//                    old copy is never wrong). It survives deploys, so an update only downloads the
//                    files that actually changed (for example one subject of the card database, not all fifteen).
const CACHE = 'dx-dash-__BUILD_ID__';
const ASSETS = 'dx-assets';
const MAX_ASSETS = 150;
const HASHED = /\/assets\/[^/]+-[A-Za-z0-9_-]{8}\.[a-z0-9]+$/;

self.addEventListener('install', () => self.skipWaiting());

// Keep the asset cache from growing for ever: drop the oldest entries beyond MAX_ASSETS
function pruneAssets() {
  return caches.open(ASSETS).then((c) => c.keys().then((keys) => Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)).map((k) => c.delete(k)))));
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== ASSETS).map((k) => caches.delete(k))))
      .then(pruneAssets)
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const into = (name) => (res) => {
    if (res && (res.ok || res.type === 'opaque')) {
      const copy = res.clone();
      caches.open(name).then((c) => c.put(req, copy));
    }
    return res;
  };
  const store = into(CACHE);

  if (req.mode === 'navigate') {
    event.respondWith(fetch(req, { cache: 'no-cache' }).then(store).catch(() => caches.match(req).then((r) => r || caches.match('./'))));
    return;
  }
  if (HASHED.test(url.pathname)) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then(into(ASSETS))));
    return;
  }
  event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then(store)));
});
