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
 * Maximum custom cards: 500 (to prevent localStorage overflow)
 */

import {
  validateCard,
  normalizeComparableText
} from './cardschema.js';

var CUSTOM_CARDS_KEY = 'buzzword_dash_custom_cards';
var MAX_CUSTOM_CARDS = 5000; // (an Anki deck is often a few thousand cards)

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

export var customCards = {

  /**
   * Get all custom cards.
   * @returns {object[]}
   */
  getAll: function() {
    try {
      var raw = localStorage.getItem(CUSTOM_CARDS_KEY);
      return raw ? JSON.parse(raw) : [];
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
      if (!c || typeof c !== 'object' || typeof c.id !== 'string' || seen[c.id]) return false;
      if (!Array.isArray(c.bw) || !c.bw.length || typeof c.ans !== 'string' || !c.ans) return false;
      seen[c.id] = true;
      return true;
    }).slice(0, MAX_CUSTOM_CARDS);
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
    } catch (e) {
      console.warn('Could not save custom cards:', e.message);
    }
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
    if (cards.length >= MAX_CUSTOM_CARDS) {
      return {
        success: false,
        card: null,
        errors: [{ code: 'MAX_CARDS_REACHED', path: '', message: 'Maximum of ' + MAX_CUSTOM_CARDS + ' custom cards reached', severity: 'error' }],
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
      if (cards.length >= MAX_CUSTOM_CARDS) {
        out.limitReached = true;
        out.rejected += inputs.length - i;
        out.warnings.push('Stopped at ' + MAX_CUSTOM_CARDS + ' custom cards, the most the app keeps. Delete some in My Cards to add more.');
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
    if (existing.length + parsed.length > MAX_CUSTOM_CARDS) {
      result.warnings.push({ code: 'WOULD_EXCEED_LIMIT', path: '',
        message: 'Import would exceed maximum of ' + MAX_CUSTOM_CARDS + ' custom cards. Only importing what fits.',
        severity: 'warning' });
    }

    var remaining = MAX_CUSTOM_CARDS - existing.length;

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
