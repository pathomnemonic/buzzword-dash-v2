// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Runs public/sw.js against a fake browser to check where each kind of file is cached.
function load() {
  const listeners = {};
  const stores = {};
  const cache = (name) => stores[name] || (stores[name] = new Map());
  const caches = {
    open: async (name) => ({ put: async (req, res) => { cache(name).set(req.url, res); }, keys: async () => [...cache(name).keys()].map((u) => ({ url: u })), delete: async (k) => { cache(name).delete(k.url); } }),
    match: async (req) => { for (const m of Object.values(stores)) if (m.has(req.url)) return m.get(req.url); return undefined; },
    keys: async () => Object.keys(stores),
    delete: async (n) => { delete stores[n]; }
  };
  const self = { location: { origin: 'https://x.test' }, addEventListener: (t, f) => { listeners[t] = f; }, skipWaiting() {}, clients: { claim: async () => {} } };
  const fetchFn = async (req) => ({ ok: true, url: req.url, clone() { return this; } });
  new Function('self', 'caches', 'fetch', readFileSync('public/sw.js', 'utf8').replace(/__BUILD_ID__/g, 'b1'))(self, caches, fetchFn);
  const request = async (url, mode) => {
    let done;
    const p = new Promise((r) => { done = r; });
    listeners.fetch({ request: { method: 'GET', url, mode: mode || 'cors' }, respondWith: (x) => done(x) });
    await p;
    await new Promise((r) => setTimeout(r, 0));
  };
  return { stores, request, listeners };
}

describe('service worker caches', () => {
  it('keeps hashed assets in a cache that survives deploys, and everything else in the build cache', async () => {
    const sw = load();
    await sw.request('https://x.test/assets/cards-renal-Bnz5F6Lk.js');
    await sw.request('https://x.test/portraits/hero-face.webp');
    await sw.request('https://x.test/', 'navigate');
    expect([...sw.stores['dx-assets'].keys()]).toEqual(['https://x.test/assets/cards-renal-Bnz5F6Lk.js']);
    expect([...sw.stores['dx-dash-b1'].keys()].sort()).toEqual(['https://x.test/', 'https://x.test/portraits/hero-face.webp']);
  });

  it('on activation drops old build caches but keeps the asset cache', async () => {
    const sw = load();
    sw.stores['dx-dash-old'] = new Map([['a', 1]]);
    sw.stores['dx-assets'] = new Map([['https://x.test/assets/a-12345678.js', 1]]);
    let waited;
    sw.listeners.activate({ waitUntil: (p) => { waited = p; } });
    await waited;
    expect(Object.keys(sw.stores).sort()).toEqual(['dx-assets']);
    expect(sw.stores['dx-assets'].size).toBe(1);
  });

  it('ignores other origins and non-GET requests', async () => {
    const sw = load();
    let responded = false;
    sw.listeners.fetch({ request: { method: 'POST', url: 'https://x.test/a', mode: 'cors' }, respondWith: () => { responded = true; } });
    sw.listeners.fetch({ request: { method: 'GET', url: 'https://other.test/a', mode: 'cors' }, respondWith: () => { responded = true; } });
    expect(responded).toBe(false);
  });
});
