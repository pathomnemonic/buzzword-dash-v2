/**
 * cardstore.js — a small IndexedDB wrapper for the player's own cards (imported Anki decks can be 30,000+ cards,
 * far more than the ~5 MB a localStorage entry can hold).
 *
 * One database ("dxdash_cards"), two stores:
 *   cards: rows {id, o, c} where c is the card and o its position (so the list keeps its order)
 *   meta:  small values (not used for card data)
 * No dependency. Every call returns a promise and never throws synchronously. A full disk or browser quota shows up
 * as an Error whose .code is 'quota', and a write that fails changes nothing (one transaction per write).
 * customcards.js keeps the cards in memory and calls this to load at start and to save in batches.
 */

export var DB_NAME = 'dxdash_cards';
var DB_VERSION = 1;
var OPEN_TIMEOUT_MS = 4000; // some browsers (Safari private windows, a blocked profile) never answer
var SLICE = 1000;           // rows queued per step, so a 30,000-card save lets the page breathe between steps

/** Is IndexedDB there at all? (It is missing, or throws on access, in some private windows and locked-down WebViews.) */
export function idbSupported() {
  try { return typeof indexedDB !== 'undefined' && !!indexedDB && typeof indexedDB.open === 'function'; } catch (e) { return false; }
}

function fail(code, cause) {
  var e = new Error((cause && cause.message) || code);
  e.code = code;
  e.cause = cause;
  return e;
}

/** 'quota' for out-of-space errors, 'cancelled' for ours, otherwise 'idb'. */
function classify(err) {
  if (err && err.code === 'cancelled') return err;
  var name = err && err.name;
  if (name === 'QuotaExceededError' || (err && err.code === 22) || /quota/i.test((err && err.message) || '')) return fail('quota', err);
  return fail('idb', err);
}

function openDb() {
  return new Promise(function (resolve, reject) {
    var settled = false;
    var timer = setTimeout(function () { if (!settled) { settled = true; reject(fail('timeout')); } }, OPEN_TIMEOUT_MS);
    var req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { clearTimeout(timer); settled = true; reject(classify(e)); return; }
    req.onupgradeneeded = function () {
      var db = req.result;
      if (!db.objectStoreNames.contains('cards')) db.createObjectStore('cards', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    req.onsuccess = function () {
      clearTimeout(timer);
      if (settled) { try { req.result.close(); } catch (e) { /* too late */ } return; }
      settled = true;
      resolve(req.result);
    };
    req.onerror = function () { clearTimeout(timer); if (!settled) { settled = true; reject(classify(req.error)); } };
    req.onblocked = function () { /* another tab holds an old version; the timeout covers it */ };
  });
}

/**
 * Open the database. Resolves a store object, rejects (code 'timeout' | 'idb' | 'quota') when it cannot be used.
 * @returns {Promise<{loadAll: function(): Promise<{id: string, o: number, c: object}[]>, writeBatch: function(object, object=): Promise<void>, getMeta: function(string): Promise<*>, setMeta: function(string, *): Promise<void>, close: function(): void}>}
 */
export async function openStore() {
  var db = await openDb();
  db.onversionchange = function () { try { db.close(); } catch (e) { /* closing anyway */ } };

  /** Run fn(tx) in one transaction and settle when it commits or aborts. */
  function inTx(storeNames, mode, fn) {
    return new Promise(function (resolve, reject) {
      var tx;
      try { tx = db.transaction(storeNames, mode); } catch (e) { reject(classify(e)); return; }
      var out;
      var rejected = false;
      function bad(e) { if (!rejected) { rejected = true; reject(e); } }
      tx.oncomplete = function () { if (!rejected) resolve(out); };
      tx.onerror = function () { bad(classify(tx.error)); };
      tx.onabort = function () { bad(abortReason || classify(tx.error || new Error('The save was aborted.'))); };
      var abortReason = null;
      try {
        out = fn(tx, function (reason) { abortReason = reason; try { tx.abort(); } catch (e) { /* already finishing */ } });
      } catch (e) {
        abortReason = classify(e);
        try { tx.abort(); } catch (e2) { /* already finishing */ }
        bad(abortReason);
      }
    });
  }

  return {
    /** Every stored card row, in the order the player had them. */
    loadAll: function () {
      return new Promise(function (resolve, reject) {
        var tx;
        try { tx = db.transaction('cards', 'readonly'); } catch (e) { reject(classify(e)); return; }
        var req = tx.objectStore('cards').getAll();
        req.onsuccess = function () {
          var rows = req.result || [];
          rows.sort(function (a, b) { return (a.o || 0) - (b.o || 0); });
          resolve(rows);
        };
        req.onerror = function () { reject(classify(req.error)); };
        tx.onabort = function () { reject(classify(tx.error)); };
      });
    },

    /**
     * One atomic write: optionally clear everything, delete some ids, put some rows. All of it commits, or none.
     * @param {{clear?: boolean, del?: string[], put?: {id: string, o: number, c: object}[]}} change
     * @param {{onProgress?: function(number, number): void, isCancelled?: function(): boolean}} [opts]
     */
    writeBatch: function (change, opts) {
      opts = opts || {};
      var puts = change.put || [];
      var dels = change.del || [];
      if (!change.clear && !puts.length && !dels.length) return Promise.resolve();
      return inTx(['cards'], 'readwrite', function (tx, abort) {
        var store = tx.objectStore('cards');
        if (change.clear) store.clear();
        for (var d = 0; d < dels.length; d++) store.delete(dels[d]);
        var at = 0;
        function step() {
          if (opts.isCancelled && opts.isCancelled()) { abort(fail('cancelled')); return; }
          var end = Math.min(puts.length, at + SLICE);
          var last = null;
          for (; at < end; at++) last = store.put(puts[at]);
          if (opts.onProgress) opts.onProgress(at, puts.length);
          if (at < puts.length && last) last.onsuccess = step; // the next slice is queued from inside the callback, which keeps the transaction open
        }
        step();
      });
    },

    getMeta: function (key) {
      return new Promise(function (resolve) {
        try {
          var req = db.transaction('meta', 'readonly').objectStore('meta').get(key);
          req.onsuccess = function () { resolve(req.result); };
          req.onerror = function () { resolve(undefined); };
        } catch (e) { resolve(undefined); }
      });
    },

    setMeta: function (key, value) {
      return inTx(['meta'], 'readwrite', function (tx) { tx.objectStore('meta').put(value, key); });
    },

    close: function () { try { db.close(); } catch (e) { /* already closed */ } }
  };
}

/**
 * How much the browser lets this site store, when it will say. Rough: browsers round it on purpose.
 * @returns {Promise<{usage: number, quota: number}|null>}
 */
export async function storageEstimate() {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.estimate === 'function') {
      var e = await navigator.storage.estimate();
      if (e && typeof e.quota === 'number' && e.quota > 0) return { usage: e.usage || 0, quota: e.quota };
    }
  } catch (err) { /* not available */ }
  return null;
}

/** Ask the browser not to evict the cards when space runs low (a hint; it may say no, and that is fine). */
export async function askPersistent() {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.persist === 'function') return !!(await navigator.storage.persist());
  } catch (e) { /* not available */ }
  return false;
}
