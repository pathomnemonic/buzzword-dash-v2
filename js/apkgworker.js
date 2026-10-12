/**
 * apkgworker.js — runs apkgparse.js off the page's thread, so reading a 30,000-note deck never freezes the screen
 * and the big database lives (and is freed) in the worker's own memory.
 *
 * Messages in:  {type: 'read', file}
 * Messages out: {type: 'progress', stage, done, total} | {type: 'cards', batch} | {type: 'done', stats} | {type: 'error', code, message}
 * Cancelling is done by the page terminating the worker.
 */

import { readApkg } from './apkgparse.js';

self.onmessage = function (ev) {
  var msg = ev.data || {};
  if (msg.type !== 'read') return;
  var lastProgress = 0;
  readApkg(msg.file, {
    emit: function (batch) { self.postMessage({ type: 'cards', batch: batch }); },
    onProgress: function (stage, done, total) {
      var now = Date.now();
      if (now - lastProgress < 80 && done < total) return;
      lastProgress = now;
      self.postMessage({ type: 'progress', stage: stage, done: done, total: total });
    }
  }).then(function (stats) {
    self.postMessage({ type: 'done', stats: stats });
  }, function (err) {
    self.postMessage({ type: 'error', code: (err && err.code) || 'error', message: (err && err.message) || String(err) });
  });
};
