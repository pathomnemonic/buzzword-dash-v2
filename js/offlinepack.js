/**
 * offlinepack.js — "Play with no connection": download everything the game needs once.
 *
 * The card database and the game code are cached as they are first used, but the 3D heroes, monsters and maps are
 * only cached when they are first seen. This fetches the whole list the build publishes (offline-manifest.json) so the
 * service worker keeps it all, and remembers when that finished. The phone apps already ship with everything inside.
 */

import { storage } from './storage.js';

var MANIFEST = 'offline-manifest.json';

/**
 * Work out what to download.
 * @param {{files?: {url: string, size: number}[]}} manifest
 * @returns {{urls: string[], bytes: number}}
 */
export function planPack(manifest) {
  var files = manifest && Array.isArray(manifest.files) ? manifest.files : [];
  var urls = [];
  var bytes = 0;
  files.forEach(function (f) {
    if (!f || typeof f.url !== 'string' || !f.url) return;
    urls.push(f.url);
    bytes += Number(f.size) > 0 ? Number(f.size) : 0;
  });
  return { urls: urls, bytes: bytes };
}

/** "12.4 MB", "820 KB" */
export function formatBytes(n) {
  if (!(n > 0)) return '0 KB';
  if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
  return Math.max(1, Math.round(n / 1024)) + ' KB';
}

/** Can this device keep a copy? (a built web app with a service worker; the phone apps already have everything) */
export function canDownloadPack(env) {
  env = env || {};
  var nav = env.navigator || (typeof navigator !== 'undefined' ? navigator : {});
  var native = typeof env.isNative === 'boolean' ? env.isNative : false;
  return !native && 'serviceWorker' in nav && !!nav.serviceWorker && !!(nav.serviceWorker.controller || env.assumeWorker);
}

/**
 * Download the pack, a few files at a time.
 * @param {{fetch?: function, onProgress?: function(done: number, total: number), loadCards?: function(): Promise, now?: function(): number, concurrency?: number}} [deps]
 * @returns {Promise<{ok: boolean, files: number, failed: number, bytes: number}>}
 */
export function downloadPack(deps) {
  deps = deps || {};
  var doFetch = deps.fetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  if (!doFetch) return Promise.resolve({ ok: false, files: 0, failed: 0, bytes: 0 });
  var onProgress = deps.onProgress || function () {};
  var lanes = Math.max(1, deps.concurrency || 4);

  var cards = typeof deps.loadCards === 'function' ? deps.loadCards() : Promise.resolve();
  return Promise.resolve(cards).catch(function () {}).then(function () {
    return doFetch(MANIFEST, { cache: 'no-cache' });
  }).then(function (res) {
    if (!res || !res.ok) throw new Error('no manifest');
    return res.json();
  }).then(function (manifest) {
    var plan = planPack(manifest);
    if (!plan.urls.length) throw new Error('empty manifest');
    var next = 0;
    var done = 0;
    var failed = 0;
    onProgress(0, plan.urls.length);
    function worker() {
      if (next >= plan.urls.length) return Promise.resolve();
      var url = plan.urls[next++];
      return doFetch(url).then(function (r) { if (!r || !r.ok) failed++; return r && r.arrayBuffer ? r.arrayBuffer() : null; })
        .catch(function () { failed++; })
        .then(function () { done++; onProgress(done, plan.urls.length); return worker(); });
    }
    var workers = [];
    for (var i = 0; i < lanes; i++) workers.push(worker());
    return Promise.all(workers).then(function () {
      var ok = failed === 0;
      if (ok) storage.set('offlinePackAt', (deps.now || Date.now)());
      return { ok: ok, files: plan.urls.length, failed: failed, bytes: plan.bytes };
    });
  }).catch(function () {
    return { ok: false, files: 0, failed: 0, bytes: 0 };
  });
}

/** A sentence for Settings. */
export function packStatus(savedAt, now) {
  if (!savedAt) return 'Not downloaded yet.';
  var days = Math.floor(((now || Date.now()) - savedAt) / 86400000);
  return days <= 0 ? 'Ready: saved on this device today.' : 'Ready: saved ' + days + (days === 1 ? ' day' : ' days') + ' ago. Download again after a big update.';
}
