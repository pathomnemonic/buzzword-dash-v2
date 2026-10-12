/**
 * customcards.js — User-created custom cards repository
 *
 * Stores custom cards in localStorage separately from save data.
 * Custom cards use the same schema as built-in cards so they
 * seamlessly enter the card selection pool during gameplay.
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
 * - localStorage allows up to 5 MiB per origin
 *
 * Maximum custom cards: 5000 unless the player raises it (at most 50000), to keep the single localStorage entry from overflowing
 */

import {
  validateCard,
  normalizeComparableText
} from './cardschema.js';

var CUSTOM_CARDS_KEY = 'buzzword_dash_custom_cards';
var DEFAULT_LIMIT = 5000; // (an Anki deck is often a few thousand cards)
var HARD_LIMIT = 50000;   // the most a player may raise it to: every card lives in one localStorage entry (about 5 MB per site)
var LIMIT_KEY = 'buzzword_dash_custom_cards_limit';

/** How many custom cards the player allows themselves (their choice in the importer, 5000 until they change it). */
function _limit() {
  try {
    var v = parseInt(localStorage.getItem(LIMIT_KEY), 10);
    if (v >= DEFAULT_LIMIT && v <= HARD_LIMIT) return v;
  } catch (e) { /* storage unavailable: use the default */ }
  return DEFAULT_LIMIT;
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

export var customCards = {

  /**
   * Get all custom cards.
   * @returns {object[]}
   */
  getAll: function() {
    try {
      var raw = localStorage.getItem(CUSTOM_CARDS_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      // whatever the stored text turns out to be, the caller gets a list of usable cards (never null, an object or a number)
      return Array.isArray(parsed) ? parsed.filter(_usable) : [];
    } catch (e) {
      return [];
    }
  },

  /**
   * Replace every custom card (used when restoring a backup). Cards that are not usable are dropped.
   * @param {object[]} cards
   * @returns {number} how many were kept
   */
  replaceAll: function(cards) {
    var seen = {};
    var kept = (Array.isArray(cards) ? cards : []).filter(function(c) {
      if (!_usable(c) || seen[c.id]) return false;
      seen[c.id] = true;
      return true;
    }).slice(0, HARD_LIMIT);
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
    var cards = this.getAll();
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].id === cardId) return cards[i];
    }
    return null;
  },

  /**
   * Save all cards to localStorage.
   * @param {object[]} cards
   */
  _saveAll: function(cards) {
    try {
      localStorage.setItem(CUSTOM_CARDS_KEY, JSON.stringify(cards));
      return true;
    } catch (e) {
      console.warn('Could not save custom cards:', e.message);
      return false;
    }
  },

  /** The most custom cards the player has allowed (default 5000, at most 50000). */
  getLimit: function() { return _limit(); },
  getHardLimit: function() { return HARD_LIMIT; },
  getDefaultLimit: function() { return DEFAULT_LIMIT; },

  /** Raise or lower that allowance. Returns the value now in force. */
  setLimit: function(n) {
    var v = Math.max(DEFAULT_LIMIT, Math.min(HARD_LIMIT, Math.round(Number(n)) || DEFAULT_LIMIT));
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
    var cards = this.getAll();

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

    cards.push(card);
    this._saveAll(cards);
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
    var cards = this.getAll();
    var kept = cards.filter(function(c) { return !shouldRemove(c); });
    var removed = cards.length - kept.length;
    if (removed > 0) {
      this._saveAll(kept);
      _notifyListeners();
    }
    return removed;
  },

  /**
   * Add many cards at once (an import). One read and one write, instead of one of each per card, which is what
   * made a large import slow, and every card gets its own id.
   *
   * @param {object[]} inputs - the same shape add() takes
   * @returns {{ added: number, rejected: number, warnings: string[], limitReached: boolean }}
   */
  addMany: function(inputs) {
    var cards = this.getAll();
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
      out.added++;
    }
    if (out.added > 0) {
      this._saveAll(cards);
      _notifyListeners();
    }
    return out;
  },

  /**
   * Add many cards in chunks without freezing the page, and refresh the ones imported before.
   * A card whose `key` (an Anki note guid, or a hash of the card text) matches a stored card updates it in place
   * (same id, so its study history stays); every other card is added. One read and one write for the whole job.
   *
   * @param {object[]} inputs the same shape add() takes, plus optional `tags` (string[]) and `key` (string)
   * @param {{chunkSize?: number, onProgress?: function(number, number), limit?: number}} [opts]
   * @returns {Promise<{added: number, updated: number, unchanged: number, rejected: number, warnings: string[], limitReached: boolean, saved: boolean}>}
   */
  upsertMany: async function(inputs, opts) {
    opts = opts || {};
    var chunk = Math.max(50, opts.chunkSize || 400);
    var cards = this.getAll();
    var limit = opts.limit ? Math.min(HARD_LIMIT, opts.limit) : _limit();
    var out = { added: 0, updated: 0, unchanged: 0, rejected: 0, warnings: [], limitReached: false, saved: true };
    var byKey = Object.create(null);
    cards.forEach(function(c, i) { if (c.ak) byKey[c.ak] = i; });
    var stamp = Date.now();
    var total = inputs.length;
    for (var i = 0; i < total; i++) {
      if (i > 0 && i % chunk === 0) {
        if (opts.onProgress) opts.onProgress(i, total);
        await _yieldToUi();
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
        if (old.bw[0] === card.bw[0] && old.ans === card.ans && old.tp === card.tp && JSON.stringify(old.tags || []) === JSON.stringify(card.tags || []) && old.subj === card.subj) {
          out.unchanged++;
        } else {
          cards[at] = card;
          out.updated++;
        }
      } else {
        cards.push(card);
        if (card.ak) byKey[card.ak] = cards.length - 1;
        out.added++;
      }
    }
    if (opts.onProgress) opts.onProgress(total, total);
    if (out.added > 0 || out.updated > 0) {
      out.saved = this._saveAll(cards);
      if (!out.saved) {
        out.warnings.push('Your browser ran out of storage space, so nothing was saved. Import fewer cards (use the tag filter) or delete some first.');
        out.added = 0; out.updated = 0;
      } else {
        _notifyListeners();
      }
    }
    return out;
  },

  /**
   * Update an existing custom card.
   *
   * @param {string} cardId
   * @param {object} cardData
   * @returns {{ success: boolean, card: object|null, errors: ValidationIssue[], warnings: ValidationIssue[] }}
   */
  update: function(cardId, cardData) {
    var cards = this.getAll();
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

    cards[index] = updatedCard;
    this._saveAll(cards);
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
    var cards = this.getAll();
    var filtered = cards.filter(function(c) { return c.id !== cardId; });
    this._saveAll(filtered);
    _notifyListeners();
  },

  /**
   * Get count of custom cards.
   * @returns {number}
   */
  count: function() {
    return this.getAll().length;
  },

  /**
   * Clear all custom cards.
   */
  clear: function() {
    this._saveAll([]);
    _notifyListeners();
  },

  /**
   * Get all custom cards playable in the given mode.
   *
   * @param {string} mode
   * @returns {object[]}
   */
  getPlayable: function(mode) {
    var cards = this.getAll();
    return cards.filter(function(c) {
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

    var existing = this.getAll();

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
      if (!raw.id || typeof raw.id !== 'string') {
        raw.id = 'custom_' + Date.now() + '_' + i + '_' + Math.floor(Math.random() * 1000);
      } else {
        // Ensure ID is unique among existing + already-imported
        var existingIds = existing.map(function(c) { return c.id; })
          .concat(result.imported.map(function(c) { return c.id; }));
        if (existingIds.indexOf(raw.id) >= 0) {
          raw.id = 'custom_' + Date.now() + '_' + i + '_' + Math.floor(Math.random() * 1000);
        }
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

    this._saveAll(existing);
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
    return JSON.stringify(this.getAll(), null, 2);
  }
};

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
