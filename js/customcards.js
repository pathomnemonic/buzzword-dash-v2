/**
 * customcards.js — User-created and imported custom cards repository
 *
 * Custom cards use the same schema as built-in cards so they seamlessly enter the card selection pool during gameplay.
 *
 * WHERE THEY LIVE
 *   IndexedDB (cardstore.js) when the browser has it: room for a whole 30,000-card Anki deck. The cards are kept in a
 *   memory cache, so getAll() and the other readers stay synchronous and never parse anything; changes are saved to
 *   IndexedDB in batches (write-behind). `await customCards.init()` loads the cache once at start-up and moves any
 *   cards an older version kept in localStorage into IndexedDB.
 *   localStorage (one JSON entry, about 5 MB) is the fallback when IndexedDB is missing or blocked (some private
 *   windows), with the old, smaller limits.
 *
 * ARCHITECTURE CONTRACT (Agent 8):
 * - Must NOT import from cards.js (prevents circular dependency)
 * - Must NOT import from storage.js or ui.js
 * - Uses cardschema.js for all validation
 * - All mutations return { success, card, errors, warnings }
 * - Imports return { success, importedCount, rejectedCount, imported, rejected, warnings }
 * - Raw imports without distractors get enabledModes: ['flashcard'] only
 * - Placeholder distractors like ['N/A', 'N/A'] are NOT allowed for runner-playable cards
 * - Supports repository subscriptions via subscribe(listener)
 *
 * The list getAll() returns is the cache itself: callers must not change it (it is replaced, never edited, on every change).
 */

import {
  validateCard,
  normalizeComparableText
} from './cardschema.js';
import { idbSupported, openStore, storageEstimate } from './cardstore.js';

var CUSTOM_CARDS_KEY = 'buzzword_dash_custom_cards';
var LIMIT_KEY = 'buzzword_dash_custom_cards_limit';
// localStorage fallback: every card lives in one entry of about 5 MB per site
var LS_DEFAULT_LIMIT = 5000;
var LS_HARD_LIMIT = 50000;
// IndexedDB: the importer reads at most 100,000 cards from one file
var IDB_HARD_LIMIT = 100000;
var FLUSH_DELAY_MS = 80;

// ----- state -----
var _mode = 'ls';          // 'idb' once init() has loaded IndexedDB, else 'ls' (localStorage)
var _store = null;         // the cardstore handle (idb mode)
var _cards = [];           // the cache: usable cards, in order. Replaced (never edited) on every change.
var _lsRaw = null;         // ls mode: the stored text _cards was parsed from, so an unchanged entry is not parsed again
var _version = 0;          // bumped on every change (caches below are keyed to it)
var _index = null;         // id -> card, built on demand
var _indexVersion = -1;
var _haystack = null;      // lower-cased searchable text per card, built on demand
var _haystackVersion = -1;
var _playable = Object.create(null); // mode -> {version, list}
var _orders = new Map();   // idb mode: id -> position stored with the row
var _nextOrder = 1;
var _pending = { put: new Map(), del: new Set(), clear: false };
var _flushTimer = null;
var _flushing = Promise.resolve();
var _ready = null;
var _saveError = null;     // the last background save that failed (the cards stay in memory for this session)
var _saveErrorListeners = [];
var _initInfo = { mode: 'ls', migrated: 0, error: '' };

function _limits() {
  return _mode === 'idb'
    ? { def: IDB_HARD_LIMIT, hard: IDB_HARD_LIMIT, min: 1000 }
    : { def: LS_DEFAULT_LIMIT, hard: LS_HARD_LIMIT, min: LS_DEFAULT_LIMIT };
}

/** How many custom cards the player allows themselves (their choice in the importer; the most the store takes until they change it). */
function _limit() {
  var l = _limits();
  try {
    var v = parseInt(localStorage.getItem(LIMIT_KEY), 10);
    if (v >= l.min && v <= l.hard) return v;
  } catch (e) { /* storage unavailable: use the default */ }
  return l.def;
}

/** Keep imported tags small and plain: text only, no Anki housekeeping tags, at most 15, each at most 100 characters. */
function _cleanTags(tags) {
  var out = [];
  for (var i = 0; i < tags.length && out.length < 15; i++) {
    var t = typeof tags[i] === 'string' ? tags[i].trim().slice(0, 100) : '';
    if (!t || /^(leech|marked)$/i.test(t) || out.indexOf(t) >= 0) continue;
    out.push(t);
  }
  return out;
}

/** Let the page paint and respond between chunks of a long job. */
function _yieldToUi() {
  return new Promise(function (resolve) { setTimeout(resolve, 0); });
}

// Subscription listeners
var _listeners = [];

/**
 * Notify all subscribers of a change.
 */
function _notifyListeners() {
  for (var i = 0; i < _listeners.length; i++) {
    try {
      _listeners[i]();
    } catch (e) {
      console.warn('Custom cards subscriber error:', e.message);
    }
  }
}

/** A card the game can show: an object with an id, a list of clues and an answer. */
function _usable(c) {
  return !!c && typeof c === 'object' && !Array.isArray(c) && typeof c.id === 'string' && c.id !== '__proto__' &&
    Array.isArray(c.bw) && c.bw.length > 0 && typeof c.ans === 'string' && c.ans.length > 0;
}

// ----- the cache -----

function _setList(list) {
  _cards = list;
  _version++;
}

/** ls mode: the list from the stored text, parsed only when the text is different from last time. */
function _syncFromLocalStorage() {
  var raw = null;
  try { raw = localStorage.getItem(CUSTOM_CARDS_KEY); } catch (e) { raw = null; }
  if (raw === _lsRaw && _lsRaw !== null) return;
  if (raw === null && _lsRaw === null && _cards.length === 0) return;
  _lsRaw = raw;
  var list = [];
  try {
    var parsed = raw ? JSON.parse(raw) : [];
    // whatever the stored text turns out to be, the caller gets a list of usable cards (never null, an object or a number)
    list = Array.isArray(parsed) ? parsed.filter(_usable) : [];
  } catch (e) { list = []; }
  _setList(list);
}

function _current() {
  if (_mode === 'ls') _syncFromLocalStorage();
  return _cards;
}

function _byId(id) {
  var cards = _current();
  if (_index === null || _indexVersion !== _version) {
    _index = new Map();
    for (var i = 0; i < cards.length; i++) _index.set(cards[i].id, cards[i]);
    _indexVersion = _version;
  }
  return _index.get(id) || null;
}

// ----- saving -----

function _saveLocalStorage(cards) {
  try {
    var text = JSON.stringify(cards);
    localStorage.setItem(CUSTOM_CARDS_KEY, text);
    _lsRaw = text;
    return true;
  } catch (e) {
    console.warn('Could not save custom cards:', e.message);
    return false;
  }
}

function _rowFor(card) {
  var o = _orders.get(card.id);
  if (o === undefined) { o = _nextOrder++; _orders.set(card.id, o); }
  return { id: card.id, o: o, c: card };
}

function _reportSaveError(err) {
  _saveError = err;
  for (var i = 0; i < _saveErrorListeners.length; i++) { try { _saveErrorListeners[i](err); } catch (e) { /* a listener must not stop the others */ } }
}

/** idb mode: write what is waiting, in one transaction. Never rejects (a failure is reported to the error listeners). */
function _flushNow() {
  clearTimeout(_flushTimer);
  _flushTimer = null;
  _flushing = _flushing.then(function () {
    if (!_pending.clear && !_pending.put.size && !_pending.del.size) return;
    var snap = _pending;
    _pending = { put: new Map(), del: new Set(), clear: false };
    var change = { clear: snap.clear, del: Array.from(snap.del), put: [] };
    snap.put.forEach(function (card) { change.put.push(_rowFor(card)); });
    return _store.writeBatch(change).then(function () { _saveError = null; }, function (err) { _reportSaveError(err); });
  });
  return _flushing;
}

function _scheduleFlush() {
  if (_flushTimer) return;
  _flushTimer = setTimeout(_flushNow, FLUSH_DELAY_MS);
}

function _queuePut(card) { _pending.put.set(card.id, card); _pending.del.delete(card.id); }
function _queueDel(id) { _pending.put.delete(id); _pending.del.add(id); _orders.delete(id); }

/**
 * Make `next` the list, saving the difference. ls mode writes the whole list and reports whether that worked
 * (when it did not, nothing changes). idb mode changes the cache at once and saves in the background.
 * @param {object[]} next the full new list
 * @param {{put?: object[], del?: string[], clear?: boolean}} diff what changed (idb mode)
 * @returns {boolean}
 */
function _commit(next, diff) {
  if (_mode === 'ls') {
    if (!_saveLocalStorage(next)) return false;
    _setList(next);
    return true;
  }
  if (diff.clear) { _pending = { put: new Map(), del: new Set(), clear: true }; _orders.clear(); }
  (diff.del || []).forEach(_queueDel);
  (diff.put || []).forEach(_queuePut);
  _setList(next);
  _scheduleFlush();
  return true;
}

function _installFlushOnHide() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden' && _mode === 'idb') _flushNow(); });
  window.addEventListener('pagehide', function () { if (_mode === 'idb') _flushNow(); });
}

/** First use: open IndexedDB, load the cache, move any localStorage cards across. Falls back to localStorage. */
async function _init() {
  if (!idbSupported()) { _initInfo = { mode: 'ls', migrated: 0, error: 'IndexedDB is not available' }; return _initInfo; }
  var store = null;
  try {
    store = await openStore();
    var rows = await store.loadAll();
    var list = [];
    var seen = new Set();
    var maxO = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r && _usable(r.c) && !seen.has(r.c.id)) {
        seen.add(r.c.id);
        list.push(r.c);
        _orders.set(r.c.id, r.o || 0);
        if ((r.o || 0) > maxO) maxO = r.o || 0;
      }
    }
    _nextOrder = maxO + 1;

    // Cards an earlier version kept in one localStorage entry move across, once.
    var migrated = 0;
    var raw = null;
    try { raw = localStorage.getItem(CUSTOM_CARDS_KEY); } catch (e) { raw = null; }
    if (raw) {
      var old = [];
      try { var parsed = JSON.parse(raw); old = Array.isArray(parsed) ? parsed.filter(_usable) : []; } catch (e) { old = []; }
      var fresh = old.filter(function (c) { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
      if (fresh.length) {
        var put = fresh.map(function (c) { var o = _nextOrder++; _orders.set(c.id, o); return { id: c.id, o: o, c: c }; });
        await store.writeBatch({ put: put }); // throws if it does not fit: the localStorage copy is then still there
        fresh.forEach(function (c) { list.push(c); });
        migrated = fresh.length;
      }
      // Only now is the old copy safe to remove (it is in IndexedDB, or was junk that held no usable card)
      try { localStorage.removeItem(CUSTOM_CARDS_KEY); } catch (e) { /* it stays; the next start finds nothing new */ }
    }
    _store = store;
    _mode = 'idb';
    _lsRaw = null;
    _setList(list);
    _installFlushOnHide();
    _initInfo = { mode: 'idb', migrated: migrated, error: '' };
  } catch (e) {
    if (store) store.close();
    _store = null;
    _mode = 'ls';
    _initInfo = { mode: 'ls', migrated: 0, error: (e && e.message) || String(e) };
    console.warn('Custom cards: IndexedDB is not usable, keeping them in localStorage:', _initInfo.error);
  }
  return _initInfo;
}

export var customCards = {

  /**
   * Load the card cache (IndexedDB), once. Await this at start-up, before anything reads the cards. Never rejects.
   * @returns {Promise<{mode: 'idb'|'ls', migrated: number, error: string}>}
   */
  init: function() {
    if (!_ready) _ready = _init();
    return _ready;
  },

  /** 'idb' or 'ls': where the cards are kept this session. */
  getMode: function() { return _mode; },

  /** Everything is written to the store (resolves when the background save has finished). */
  flush: function() { return _flushNow(); },

  /** The last background save that failed (e.g. {code: 'quota'}), or null. */
  getSaveError: function() { return _saveError; },

  /** Call back when a background save fails (the browser is out of space, say). Returns an unsubscribe function. */
  onSaveError: function(fn) {
    if (typeof fn !== 'function') return function() {};
    _saveErrorListeners.push(fn);
    return function() { var i = _saveErrorListeners.indexOf(fn); if (i >= 0) _saveErrorListeners.splice(i, 1); };
  },

  /** How much the browser says it can store and how much is used (null when it will not say). */
  storageEstimate: storageEstimate,

  /** Changes every time the list changes: caches built from the list use it as their key. */
  version: function() { _current(); return _version; },

  /**
   * Get all custom cards. This is the cache: do not change the list or the cards in it.
   * @returns {object[]}
   */
  getAll: function() {
    return _current();
  },

  /**
   * Replace every custom card (used when restoring a backup). Cards that are not usable are dropped.
   * @param {object[]} cards
   * @returns {number} how many were kept
   */
  replaceAll: function(cards) {
    var seen = {};
    var hard = _limits().hard;
    var kept = (Array.isArray(cards) ? cards : []).filter(function(c) {
      if (!_usable(c) || seen[c.id]) return false;
      seen[c.id] = true;
      return true;
    }).slice(0, hard);
    this._saveAll(kept);
    _notifyListeners();
    return kept.length;
  },

  /**
   * Get a custom card by ID.
   * @param {string} cardId
   * @returns {object|null}
   */
  getById: function(cardId) {
    return _byId(cardId);
  },

  /**
   * Make this exactly the stored list (every other change goes through a more specific method).
   * @param {object[]} cards
   * @returns {boolean} whether it was saved
   */
  _saveAll: function(cards) {
    _current();
    return _commit(cards.slice(), { clear: true, put: cards });
  },

  /** The most custom cards the player has allowed (the most the store takes until they lower it). */
  getLimit: function() { return _limit(); },
  getHardLimit: function() { return _limits().hard; },
  getDefaultLimit: function() { return _limits().def; },

  /** Raise or lower that allowance. Returns the value now in force. */
  setLimit: function(n) {
    var l = _limits();
    var v = Math.max(l.min, Math.min(l.hard, Math.round(Number(n)) || l.def));
    try { localStorage.setItem(LIMIT_KEY, String(v)); } catch (e) { /* keep the old one */ }
    return _limit();
  },

  /**
   * Add a new custom card.
   *
   * @param {object} cardData - { subject, buzzwords, answer, distractors, teachingPoint, whyWrong1, whyWrong2 }
   * @returns {{ success: boolean, card: object|null, errors: ValidationIssue[], warnings: ValidationIssue[] }}
   */
  add: function(cardData) {
    var cards = _current();

    // Check count limit
    if (cards.length >= _limit()) {
      return {
        success: false,
        card: null,
        errors: [{ code: 'MAX_CARDS_REACHED', path: '', message: 'Maximum of ' + _limit() + ' custom cards reached', severity: 'error' }],
        warnings: []
      };
    }

    // Build card object from input
    var card = _buildCardFromInput(cardData);

    // Validate
    var hasPlaceholderDistractors = _hasPlaceholderDistractors(card);
    var validationOpts = {
      strict: false,
      requireDistractors: !hasPlaceholderDistractors
    };

    // If distractors are placeholders, force flashcard-only mode
    if (hasPlaceholderDistractors) {
      card.enabledModes = ['flashcard'];
    }

    var result = validateCard(card, validationOpts);
    if (!result.success) {
      return result;
    }

    // Answer-leak check (warning only, not blocking)
    var leakWarnings = _checkAnswerLeaks(card);
    var allWarnings = result.warnings.concat(leakWarnings);

    _commit(cards.concat([card]), { put: [card] });
    _notifyListeners();

    return {
      success: true,
      card: card,
      errors: [],
      warnings: allWarnings
    };
  },

  /**
   * Remove every card the test says yes to (a whole imported deck at once). One write.
   * @param {function(object): boolean} shouldRemove
   * @returns {number} how many were removed
   */
  removeWhere: function(shouldRemove) {
    var cards = _current();
    var kept = [];
    var gone = [];
    for (var i = 0; i < cards.length; i++) {
      if (shouldRemove(cards[i])) gone.push(cards[i].id); else kept.push(cards[i]);
    }
    if (gone.length > 0) {
      if (_commit(kept, kept.length === 0 ? { clear: true } : { del: gone })) _notifyListeners(); else return 0;
    }
    return gone.length;
  },

  /**
   * Add many cards at once (an import). One read and one write, instead of one of each per card, which is what
   * made a large import slow, and every card gets its own id.
   *
   * @param {object[]} inputs - the same shape add() takes
   * @returns {{ added: number, rejected: number, warnings: string[], limitReached: boolean }}
   */
  addMany: function(inputs) {
    var cards = _current().slice();
    var fresh = [];
    var out = { added: 0, rejected: 0, warnings: [], limitReached: false };
    var stamp = Date.now();
    for (var i = 0; i < inputs.length; i++) {
      if (cards.length >= _limit()) {
        out.limitReached = true;
        out.rejected += inputs.length - i;
        out.warnings.push('Stopped at ' + _limit() + ' custom cards, the most the app keeps. Delete some in My Cards to add more.');
        break;
      }
      var card = _buildCardFromInput(inputs[i]);
      card.id = 'custom_' + stamp + '_' + cards.length + '_' + i;
      var placeholders = _hasPlaceholderDistractors(card);
      if (placeholders) card.enabledModes = ['flashcard'];
      var result = validateCard(card, { strict: false, requireDistractors: !placeholders });
      if (!result.success) {
        out.rejected++;
        out.warnings.push('Card ' + (i + 1) + ': ' + ((result.errors[0] && result.errors[0].message) || 'not valid') + '. Skipped.');
        continue;
      }
      cards.push(card);
      fresh.push(card);
      out.added++;
    }
    if (out.added > 0) {
      if (_commit(cards, { put: fresh })) _notifyListeners();
      else { out.added = 0; out.warnings.push('Your browser ran out of storage space, so nothing was saved.'); }
    }
    return out;
  },

  /**
   * Add many cards in chunks without freezing the page, and refresh the ones imported before.
   * A card whose `key` (an Anki note guid, or a hash of the card text) matches a stored card updates it in place
   * (same id, so its study history stays); every other card is added. The whole job is saved in ONE transaction at
   * the end: if it fails (out of space) or is cancelled, the cards imported earlier are exactly as they were.
   *
   * @param {object[]} inputs the same shape add() takes, plus optional `tags` (string[]) and `key` (string)
   * @param {{chunkSize?: number, onProgress?: function(number, number, string=), limit?: number, isCancelled?: function(): boolean}} [opts]
   *        onProgress(done, total, phase) with phase 'prepare' (checking cards) then 'save' (writing them)
   * @returns {Promise<{added: number, updated: number, unchanged: number, rejected: number, warnings: string[], limitReached: boolean, saved: boolean, cancelled: boolean, errorCode: string}>}
   */
  upsertMany: async function(inputs, opts) {
    opts = opts || {};
    var chunk = Math.max(50, opts.chunkSize || 400);
    var cards = _current().slice();
    var limit = opts.limit ? Math.min(_limits().hard, opts.limit) : _limit();
    var out = { added: 0, updated: 0, unchanged: 0, rejected: 0, warnings: [], limitReached: false, saved: true, cancelled: false, errorCode: '' };
    var byKey = Object.create(null);
    cards.forEach(function(c, i) { if (c.ak) byKey[c.ak] = i; });
    var changed = [];
    var changedSet = new Set();
    var stamp = Date.now();
    var total = inputs.length;
    var progress = opts.onProgress || function() {};
    for (var i = 0; i < total; i++) {
      if (i > 0 && i % chunk === 0) {
        progress(i, total, 'prepare');
        await _yieldToUi();
        if (opts.isCancelled && opts.isCancelled()) { out.cancelled = true; out.saved = false; out.added = out.updated = out.unchanged = 0; return out; }
      }
      var card = _buildCardFromInput(inputs[i]);
      var at = card.ak && byKey[card.ak] !== undefined ? byKey[card.ak] : -1;
      if (at < 0 && cards.length >= limit) {
        out.limitReached = true;
        out.rejected += total - i;
        out.warnings.push('Stopped at ' + limit + ' custom cards, the most you have allowed. Raise the limit in the importer, or delete some in My Cards.');
        break;
      }
      card.id = at >= 0 ? cards[at].id : 'custom_' + stamp + '_' + cards.length + '_' + i;
      if (at >= 0 && cards[at].createdAt) card.createdAt = cards[at].createdAt;
      var placeholders = _hasPlaceholderDistractors(card);
      if (placeholders) card.enabledModes = ['flashcard'];
      var result = validateCard(card, { strict: false, requireDistractors: !placeholders });
      if (!result.success) {
        out.rejected++;
        if (out.warnings.length < 20) out.warnings.push('Card ' + (i + 1) + ': ' + ((result.errors[0] && result.errors[0].message) || 'not valid') + '. Skipped.');
        continue;
      }
      if (at >= 0) {
        var old = cards[at];
        if (old.bw[0] === card.bw[0] && old.ans === card.ans && old.tp === card.tp && _sameTags(old.tags, card.tags) && old.subj === card.subj) {
          out.unchanged++;
        } else {
          cards[at] = card;
          if (!changedSet.has(card.id)) { changedSet.add(card.id); changed.push(card); } else { changed[changed.findIndex(function(c) { return c.id === card.id; })] = card; }
          out.updated++;
        }
      } else {
        cards.push(card);
        if (card.ak) byKey[card.ak] = cards.length - 1;
        changedSet.add(card.id);
        changed.push(card);
        out.added++;
      }
    }
    progress(total, total, 'prepare');
    if (opts.isCancelled && opts.isCancelled()) { out.cancelled = true; out.saved = false; out.added = out.updated = out.unchanged = 0; return out; }
    if (out.added > 0 || out.updated > 0) {
      var wrote = await this._saveBatch(cards, changed, opts, function(d, n) { progress(d, n, 'save'); });
      if (!wrote.ok) {
        out.saved = false;
        out.cancelled = wrote.code === 'cancelled';
        out.errorCode = wrote.code;
        out.warnings.unshift(wrote.code === 'quota'
          ? 'Your browser ran out of storage space, so nothing was saved and your earlier cards are unchanged. Import fewer cards (use the tag filter) or delete some first.'
          : (wrote.code === 'cancelled' ? 'Cancelled. Nothing was imported.' : 'Your browser could not save the cards, so nothing was imported and your earlier cards are unchanged.'));
        out.added = 0; out.updated = 0;
      } else {
        _notifyListeners();
      }
    }
    return out;
  },

  /**
   * Save an imported batch as one unit and make it the list, or change nothing.
   * @returns {Promise<{ok: boolean, code: string}>}
   */
  _saveBatch: async function(next, changed, opts, onSaveProgress) {
    if (_mode === 'ls') {
      if (!_saveLocalStorage(next)) return { ok: false, code: 'quota' };
      _setList(next);
      return { ok: true, code: '' };
    }
    await _flushNow(); // earlier edits first, so the order numbers stay in step
    var rows = changed.map(_rowFor);
    try {
      await _store.writeBatch({ put: rows }, { onProgress: onSaveProgress, isCancelled: opts && opts.isCancelled });
    } catch (err) {
      _forgetOrders(changed); // the order numbers handed out for rows that never reached the disk
      return { ok: false, code: (err && err.code) || 'idb' };
    }
    _setList(next);
    return { ok: true, code: '' };
  },

  /**
   * Update an existing custom card.
   *
   * @param {string} cardId
   * @param {object} cardData
   * @returns {{ success: boolean, card: object|null, errors: ValidationIssue[], warnings: ValidationIssue[] }}
   */
  update: function(cardId, cardData) {
    var cards = _current();
    var index = -1;
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].id === cardId) {
        index = i;
        break;
      }
    }

    if (index < 0) {
      return {
        success: false,
        card: null,
        errors: [{ code: 'CARD_NOT_FOUND', path: 'id', message: 'Card with id "' + cardId + '" not found', severity: 'error' }],
        warnings: []
      };
    }

    // Preserve existing card properties, overlay new ones
    var updatedCard = _buildCardFromInput(cardData);
    updatedCard.id = cardId;
    updatedCard.createdAt = cards[index].createdAt;
    updatedCard.updatedAt = Date.now();

    var hasPlaceholderDistractors = _hasPlaceholderDistractors(updatedCard);
    if (hasPlaceholderDistractors) {
      updatedCard.enabledModes = ['flashcard'];
    }

    var result = validateCard(updatedCard, { strict: false, requireDistractors: !hasPlaceholderDistractors });
    if (!result.success) {
      return result;
    }

    var leakWarnings = _checkAnswerLeaks(updatedCard);

    var next = cards.slice();
    next[index] = updatedCard;
    _commit(next, { put: [updatedCard] });
    _notifyListeners();

    return {
      success: true,
      card: updatedCard,
      errors: [],
      warnings: result.warnings.concat(leakWarnings)
    };
  },

  /**
   * Remove a custom card by ID.
   *
   * @param {string} cardId
   */
  remove: function(cardId) {
    var cards = _current();
    var filtered = cards.filter(function(c) { return c.id !== cardId; });
    _commit(filtered, filtered.length === 0 && cards.length > 0 ? { clear: true } : { del: [cardId] });
    _notifyListeners();
  },

  /**
   * Get count of custom cards.
   * @returns {number}
   */
  count: function() {
    return _current().length;
  },

  /**
   * Clear all custom cards.
   */
  clear: function() {
    _current();
    _commit([], { clear: true });
    _notifyListeners();
  },

  /**
   * Get all custom cards playable in the given mode (computed once per change, not per call).
   *
   * @param {string} mode
   * @returns {object[]}
   */
  getPlayable: function(mode) {
    var cards = _current();
    var hit = _playable[mode];
    if (hit && hit.version === _version) return hit.list;
    var list = cards.filter(function(c) {
      // Check enabledModes
      if (Array.isArray(c.enabledModes) && c.enabledModes.length > 0) {
        return c.enabledModes.indexOf(mode) >= 0;
      }
      // Cards without enabledModes are runner-playable if they have valid distractors
      if (mode === 'flashcard') return true;
      return Array.isArray(c.d) && c.d.length === 2 &&
        c.d[0] && c.d[0].trim() !== '' &&
        c.d[1] && c.d[1].trim() !== '' &&
        normalizeComparableText(c.d[0]) !== 'n/a' &&
        normalizeComparableText(c.d[1]) !== 'n/a';
    });
    _playable[mode] = { version: _version, list: list };
    return list;
  },

  /**
   * Cards whose clues, answer, teaching point or tags contain every word of the query (case-insensitive). The text
   * to search is built once per change, so typing in a search box over 30,000 cards stays quick.
   * @param {string} query
   * @returns {object[]} the whole list when the query is empty
   */
  search: function(query) {
    var cards = _current();
    var words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return cards;
    if (_haystack === null || _haystackVersion !== _version) {
      _haystack = new Array(cards.length);
      for (var i = 0; i < cards.length; i++) {
        var c = cards[i];
        _haystack[i] = (c.bw.join(' ') + ' ' + c.ans + ' ' + (c.tp || '') + ' ' + (c.tags || []).join(' ')).toLowerCase();
      }
      _haystackVersion = _version;
    }
    var out = [];
    for (var j = 0; j < cards.length; j++) {
      var text = _haystack[j];
      var ok = true;
      for (var w = 0; w < words.length; w++) { if (text.indexOf(words[w]) < 0) { ok = false; break; } }
      if (ok) out.push(cards[j]);
    }
    return out;
  },

  /**
   * Subscribe to changes in the custom cards repository.
   *
   * @param {function} listener - Called with no arguments when cards change
   * @returns {function} Unsubscribe function
   */
  subscribe: function(listener) {
    if (typeof listener !== 'function') return function() {};
    _listeners.push(listener);
    return function() {
      var idx = _listeners.indexOf(listener);
      if (idx >= 0) _listeners.splice(idx, 1);
    };
  },

  /**
   * Import cards from a JSON string.
   *
   * @param {string} jsonString
   * @param {object} [options]
   * @returns {{ success: boolean, importedCount: number, rejectedCount: number, imported: object[], rejected: { index: number, errors: ValidationIssue[] }[], warnings: ValidationIssue[] }}
   */
  importJSON: function(jsonString, options) {
    var result = {
      success: false,
      importedCount: 0,
      rejectedCount: 0,
      imported: [],
      rejected: [],
      warnings: []
    };

    var parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (e) {
      result.rejected.push({ index: -1, errors: [{ code: 'INVALID_JSON', path: '', message: 'Invalid JSON: ' + e.message, severity: 'error' }] });
      result.rejectedCount = 1;
      return result;
    }

    if (!Array.isArray(parsed)) {
      result.rejected.push({ index: -1, errors: [{ code: 'NOT_ARRAY', path: '', message: 'Expected an array of card objects', severity: 'error' }] });
      result.rejectedCount = 1;
      return result;
    }

    var existing = _current().slice();
    var usedIds = new Set(existing.map(function(c) { return c.id; }));

    // Check if we'd exceed the limit
    if (existing.length + parsed.length > _limit()) {
      result.warnings.push({ code: 'WOULD_EXCEED_LIMIT', path: '',
        message: 'Import would exceed maximum of ' + _limit() + ' custom cards. Only importing what fits.',
        severity: 'warning' });
    }

    var remaining = _limit() - existing.length;

    for (var i = 0; i < parsed.length; i++) {
      if (result.importedCount >= remaining) {
        result.rejected.push({
          index: i,
          errors: [{ code: 'LIMIT_REACHED', path: '', message: 'Maximum custom card limit reached', severity: 'error' }]
        });
        result.rejectedCount++;
        continue;
      }

      var raw = parsed[i];

      // Ensure it has a unique ID
      if (!raw.id || typeof raw.id !== 'string' || usedIds.has(raw.id)) {
        raw.id = 'custom_' + Date.now() + '_' + i + '_' + Math.floor(Math.random() * 1000);
      }

      raw.isCustom = true;
      if (!raw.createdAt) raw.createdAt = Date.now();

      // Check for placeholder distractors → flashcard only
      var hasPlaceholders = _hasPlaceholderDistractors(raw);
      if (hasPlaceholders) {
        raw.enabledModes = ['flashcard'];
      }

      var validation = validateCard(raw, {
        strict: false,
        requireDistractors: !hasPlaceholders
      });

      if (validation.success) {
        existing.push(raw);
        usedIds.add(raw.id);
        result.imported.push(raw);
        result.importedCount++;
        if (validation.warnings.length > 0) {
          result.warnings = result.warnings.concat(validation.warnings);
        }
      } else {
        result.rejected.push({
          index: i,
          errors: validation.errors
        });
        result.rejectedCount++;
      }
    }

    _commit(existing, { put: result.imported });
    result.success = result.importedCount > 0;

    if (result.importedCount > 0) {
      _notifyListeners();
    }

    return result;
  },

  /**
   * Export all custom cards as a JSON string.
   * @returns {string}
   */
  exportJSON: function() {
    return JSON.stringify(_current(), null, 2);
  }
};

/** Equal tag lists (both missing counts as equal). */
function _sameTags(a, b) {
  var x = a || [];
  var y = b || [];
  if (x.length !== y.length) return false;
  for (var i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

/** Forget the order numbers of rows that were never written (an aborted save), unless they were already stored. */
function _forgetOrders(changed) {
  var stored = new Set(_cards.map(function(c) { return c.id; }));
  changed.forEach(function(c) { if (!stored.has(c.id)) _orders.delete(c.id); });
}

// ===== Internal Helper Functions =====

/**
 * Build a card object from the UI-friendly input format.
 */
function _buildCardFromInput(cardData) {
  var card = {
    id: 'custom_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    subj: cardData.subject || 'Multisystem / Mixed',
    bw: Array.isArray(cardData.buzzwords) ? cardData.buzzwords : [],
    ans: cardData.answer || '',
    d: Array.isArray(cardData.distractors) ? cardData.distractors : [],
    tp: cardData.teachingPoint || '',
    ww: {},
    isCustom: true,
    createdAt: Date.now()
  };

  if (Array.isArray(cardData.tags)) {
    var tags = _cleanTags(cardData.tags);
    if (tags.length) card.tags = tags;
  }
  if (typeof cardData.key === 'string' && cardData.key) card.ak = cardData.key.slice(0, 120);

  if (cardData.whyWrong1 && card.d[0]) {
    card.ww[card.d[0]] = cardData.whyWrong1;
  }
  if (cardData.whyWrong2 && card.d[1]) {
    card.ww[card.d[1]] = cardData.whyWrong2;
  }

  return card;
}

/**
 * Check if a card has placeholder distractors (N/A, empty, etc.)
 */
function _hasPlaceholderDistractors(card) {
  if (!Array.isArray(card.d) || card.d.length < 2) return true;

  for (var i = 0; i < card.d.length; i++) {
    if (typeof card.d[i] !== 'string') return true;
    var norm = normalizeComparableText(card.d[i]);
    if (norm === 'n/a' || norm === 'na' || norm === 'n a' || norm === '') return true;
  }

  return false;
}

/**
 * Check for answer leaks in buzzwords (warning-level only).
 */
function _checkAnswerLeaks(card) {
  var warnings = [];

  if (!card.ans || !Array.isArray(card.bw)) return warnings;

  var ansWords = card.ans
    .toLowerCase()
    .split(/[\s\-/()]+/)
    .filter(function(w) { return w.length > 4; });

  // Get distractor words for comparison
  var distractorWords = new Set();
  if (Array.isArray(card.d)) {
    for (var di = 0; di < card.d.length; di++) {
      if (typeof card.d[di] === 'string') {
        card.d[di].toLowerCase().split(/[\s\-/()]+/).forEach(function(w) {
          if (w.length > 4) distractorWords.add(w);
        });
      }
    }
  }

  for (var bi = 0; bi < card.bw.length; bi++) {
    if (typeof card.bw[bi] !== 'string') continue;
    var bwLower = card.bw[bi].toLowerCase();

    for (var wi = 0; wi < ansWords.length; wi++) {
      if (bwLower.indexOf(ansWords[wi]) >= 0 && !distractorWords.has(ansWords[wi])) {
        warnings.push({
          code: 'ANSWER_LEAK',
          path: 'bw[' + bi + ']',
          message: 'Buzzword "' + card.bw[bi] + '" may reveal the answer word "' + ansWords[wi] + '"',
          severity: 'warning'
        });
        break;
      }
    }
  }

  return warnings;
}
