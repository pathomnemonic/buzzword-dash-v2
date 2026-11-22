/**
 * apkgclient.js — starts reading an Anki package, in a Web Worker when the browser has one, otherwise on the page.
 *
 *   var job = startApkgRead(file, { onProgress(stage, done, total), onCards(batch) });
 *   job.promise  -> resolves {warnings, notes, cards, ...} or rejects with an ApkgError (code, friendly text via friendlyApkgMessage)
 *   job.cancel() -> stops it at once (the worker is terminated; on the page it stops before the next step)
 */

import { ApkgError } from './apkgzip.js';
import { readApkg } from './apkgparse.js';

/**
 * @param {Blob|object} file
 * @param {{onProgress?: function(string, number, number): void, onCards?: function(object[]): void, forceMainThread?: boolean}} h
 * @returns {{promise: Promise<object>, cancel: function(): void, usesWorker: boolean}}
 */
export function startApkgRead(file, h) {
  h = h || {};
  var cancelled = false;
  var worker = null;
  var settle = { resolve: null, reject: null };
  var promise = new Promise(function (resolve, reject) { settle.resolve = resolve; settle.reject = reject; });

  function onMain() {
    readApkg(file, {
      emit: function (batch) { if (h.onCards) h.onCards(batch); },
      onProgress: h.onProgress,
      isCancelled: function () { return cancelled; }
    }).then(settle.resolve, settle.reject);
  }

  var canWorker = !h.forceMainThread && typeof Worker === 'function' && typeof Blob === 'function' && file && typeof file.slice === 'function';
  if (canWorker) {
    try {
      worker = new Worker(new URL('./apkgworker.js', import.meta.url), { type: 'module' });
    } catch (e) { worker = null; }
  }
  if (!worker) {
    onMain();
    return { promise: promise, usesWorker: false, cancel: function () { cancelled = true; } };
  }

  var heard = false;
  worker.onmessage = function (ev) {
    heard = true;
    var m = ev.data || {};
    if (m.type === 'cards') { if (h.onCards) h.onCards(m.batch); }
    else if (m.type === 'progress') { if (h.onProgress) h.onProgress(m.stage, m.done, m.total); }
    else if (m.type === 'done') { stop(); settle.resolve(m.stats); }
    else if (m.type === 'error') { stop(); settle.reject(new ApkgError(m.code, m.message)); }
  };
  worker.onerror = function (ev) {
    // A worker that cannot even start (old browser, blocked by policy): read on the page instead
    if (!heard && !cancelled) { if (ev && ev.preventDefault) ev.preventDefault(); stop(); onMain(); return; }
    stop();
    settle.reject(new ApkgError('memory', 'The reader stopped unexpectedly.'));
  };
  function stop() { if (worker) { try { worker.terminate(); } catch (e) { /* gone already */ } worker = null; } }
  try { worker.postMessage({ type: 'read', file: file }); } catch (e) { stop(); onMain(); }

  return {
    promise: promise,
    usesWorker: true,
    cancel: function () {
      cancelled = true;
      if (worker) { stop(); settle.reject(new ApkgError('cancelled', 'Cancelled.')); }
    }
  };
}
