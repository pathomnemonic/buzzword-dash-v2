/**
 * cards.js — Card hub for Dx Dash card database
 *
 * This is the single source of truth for all built-in cards.
 * It imports raw card arrays from subject files, validates and
 * normalizes them at load time (without mutating the originals),
 * and exports frozen collections for use by the rest of the app.
 *
 * Key architectural rules (from ARCHITECTURE.md):
 * - Imported module card objects must not be mutated.
 * - CARD_BY_ID should be a Map.
 * - Exports content version and card-pool hash.
 * - Cards failing validation are dropped with console warnings.
 * - Archive data is excluded from the production build.
 *
 * Agent 18 owns this file exclusively.
 */

import { NEUROLOGY_CARDS } from './cards/neurology.js';
import { CARDIOLOGY_CARDS } from './cards/cardiology.js';
import { NEPHROLOGY_CARDS } from './cards/nephrology.js';
import { PSYCHIATRY_CARDS } from './cards/psychiatry.js';
import { GASTRO_CARDS } from './cards/gastroenterology.js';
import { PULM_CARDS } from './cards/pulmonology.js';
import { ID_CARDS } from './cards/infectious.js';
import { ENDO_CARDS } from './cards/endocrinology.js';
import { HEMEONC_CARDS } from './cards/hemeonc.js';
import { RHEUM_CARDS } from './cards/rheumatology.js';
import { OBGYN_CARDS } from './cards/obgyn.js';
import { PEDS_CARDS } from './cards/pediatrics.js';
import { SURGERY_CARDS } from './cards/surgery.js';
import { EM_CARDS } from './cards/emergency.js';
import { MULTI_CARDS } from './cards/multisystem.js';

// ═══════════════════════════════════════════════════════════
// Canonical enums
// ═══════════════════════════════════════════════════════════

import { clueLeaksAnswer, genericWords, deckGenericWords, strictClueLeak } from './cardleaks.js';
import { SUBJECTS, EXAM_FILTERS, QUESTION_TYPES, SOURCE_DISCIPLINES, CONTENT_VERSION } from './cardmeta.js';
export { SUBJECTS, EXAM_FILTERS, QUESTION_TYPES, SOURCE_DISCIPLINES, CONTENT_VERSION };

// ═══════════════════════════════════════════════════════════
// Internal helpers
// ═══════════════════════════════════════════════════════════

/**
 * Simple deterministic hash for a string.
 * Uses djb2 algorithm — sufficient for card-pool identity checks.
 * Not cryptographic.
 */
function djb2Hash(str) {
  var hash = 5381;
  for (var i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  return (hash >>> 0).toString(16);
}

/**
 * Check if a string contains HTML tags.
 */
function containsHTML(str) {
  if (typeof str !== 'string') return false;
  return /<[a-zA-Z][^>]*>/.test(str);
}

/**
 * Normalize a card without mutating the original.
 * Returns a new object with safe defaults for missing fields.
 */
function normalizeCard(raw) {
  // Shallow clone — never mutate the import
  var c = {};
  for (var key in raw) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      // Deep-clone arrays to avoid shared references
      if (Array.isArray(raw[key])) {
        c[key] = raw[key].slice();
      } else if (raw[key] !== null && typeof raw[key] === 'object' && !Array.isArray(raw[key])) {
        // Shallow clone objects (ww map)
        var obj = {};
        for (var ok in raw[key]) {
          if (Object.prototype.hasOwnProperty.call(raw[key], ok)) {
            obj[ok] = raw[key][ok];
          }
        }
        c[key] = obj;
      } else {
        c[key] = raw[key];
      }
    }
  }

  // Patch missing new-schema fields with safe defaults
  if (c.exams === undefined) c.exams = ['step1', 'step2'];
  if (c.baseDifficulty === undefined) c.baseDifficulty = 2;
  if (c.questionType === undefined) c.questionType = 'buzzword_dx';
  if (c.source === undefined) c.source = 'clinical_medicine';
  if (c.tags === undefined) c.tags = c.subj ? [c.subj.toLowerCase()] : [];
  if (c.hx === undefined) c.hx = false;
  if (c.yr === undefined) c.yr = 2;
  if (c.pearls === undefined) {
    c.pearls = c.tp ? [c.tp.split('.')[0]] : [];
  }
  if (c.enabledModes === undefined) {
    c.enabledModes = ['endless', 'study', 'weakness', 'daily',
      'versus', 'mp_highscore', 'mp_suddendeath', 'mp_race',
      'timed_practice', 'challenge', 'tournament', 'flashcard'];
  }
  if (c.contentVersion === undefined) c.contentVersion = CONTENT_VERSION;
  if (c.reviewedAt === undefined) c.reviewedAt = null;

  return c;
}

/**
 * Validate a single normalized card.
 * Returns { valid: boolean, errors: string[], warnings: string[] }
 */
var MAX_CLUE_WORDS = 30;

function validateCard(c) {
  var errors = [];
  var warnings = [];

  // Required fields
  if (!c || !c.id || typeof c.id !== 'string') {
    errors.push('missing or invalid id');
    return { valid: false, errors: errors, warnings: warnings };
  }
  if (!c.subj || SUBJECTS.indexOf(c.subj) < 0) {
    errors.push(c.id + ': invalid subject "' + c.subj + '"');
  }
  if (!c.bw || !Array.isArray(c.bw) || c.bw.length < 1) {
    errors.push(c.id + ': missing or empty buzzwords');
  }
  if (!c.ans || typeof c.ans !== 'string' || c.ans.trim() === '') {
    errors.push(c.id + ': missing answer');
  }
  if (!c.d || !Array.isArray(c.d) || c.d.length !== 2) {
    errors.push(c.id + ': needs exactly 2 distractors, has ' + (c.d ? c.d.length : 0));
  }

  // Distractor uniqueness and distinctness from answer
  if (c.d && c.d.length === 2) {
    // Compared without parentheticals and punctuation, so "Gout (Acute)" and "Gout" count as the same
    var plain = function (t) { return String(t || '').toLowerCase().replace(/\s*\([^)]*\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); };
    var ansNorm = plain(c.ans);
    var d0Norm = plain(c.d[0]);
    var d1Norm = plain(c.d[1]);
    if (d0Norm === d1Norm) {
      errors.push(c.id + ': distractors are identical');
    }
    if (d0Norm === ansNorm) {
      errors.push(c.id + ': distractor[0] matches answer');
    }
    if (d1Norm === ansNorm) {
      errors.push(c.id + ': distractor[1] matches answer');
    }
  }

  // ww keys must match actual distractors
  if (c.ww && c.d && c.d.length === 2) {
    var wwKeys = Object.keys(c.ww);
    var newWw = {};
    var wwFixed = false;
    c.d.forEach(function (dist, idx) {
      if (c.ww[dist]) {
        newWw[dist] = c.ww[dist];
      } else if (wwKeys[idx]) {
        newWw[dist] = c.ww[wwKeys[idx]];
        wwFixed = true;
      } else {
        newWw[dist] = 'See teaching point for comparison.';
        wwFixed = true;
      }
    });
    if (wwFixed) {
      warnings.push(c.id + ': remapped ww keys to match distractors');
    }
    c.ww = newWw;
  }

  // Validate enums
  if (c.baseDifficulty !== 1 && c.baseDifficulty !== 2 && c.baseDifficulty !== 3) {
    warnings.push(c.id + ': baseDifficulty should be 1, 2, or 3; defaulting to 2');
    c.baseDifficulty = 2;
  }
  if (QUESTION_TYPES.indexOf(c.questionType) < 0) {
    warnings.push(c.id + ': unknown questionType "' + c.questionType + '"; defaulting');
    c.questionType = 'buzzword_dx';
  }
  if (SOURCE_DISCIPLINES.indexOf(c.source) < 0) {
    warnings.push(c.id + ': unknown source "' + c.source + '"; defaulting');
    c.source = 'clinical_medicine';
  }
  if (c.yr !== 1 && c.yr !== 2 && c.yr !== 3 && c.yr !== 4) {
    warnings.push(c.id + ': yr should be 1-4; defaulting to 2');
    c.yr = 2;
  }

  // HTML detection
  var textFields = [c.ans, c.tp].concat(c.bw || []).concat(c.d || []);
  for (var ti = 0; ti < textFields.length; ti++) {
    if (containsHTML(textFields[ti])) {
      warnings.push(c.id + ': contains HTML in text field');
      break;
    }
  }

  // Answer-leak filtering: drop clues that contain the answer, or a word distinctive to it (whole words only;
  // words common across the deck's answers name a category and are fine). See cardleaks.js.
  if (c.ans && c.bw && c.d) {
    var leaksFound = 0;
    var safeBuzzwords = c.bw.filter(function (bw) {
      if (clueLeaksAnswer(bw, c.ans, c.d, _genericWords)) { leaksFound++; return false; }
      return true;
    });

    // Some cards are topic cards whose clues naturally repeat the title. Rather than lose them, fall back to
    // removing only clues that contain the whole answer phrase, and say so (these cards want better clues).
    if (safeBuzzwords.length < 2) {
      var ansPhrase = c.ans.toLowerCase().replace(/\s*\([^)]*\)/g, '').trim();
      var phraseSafe = c.bw.filter(function (bw) {
        return !ansPhrase || !bw.toLowerCase().includes(ansPhrase);
      });
      if (phraseSafe.length >= 2) {
        warnings.push(c.id + ': weak clues: kept ' + phraseSafe.length +
          ' buzzword(s) that share a word with the answer (only the whole answer was removed)');
        safeBuzzwords = phraseSafe;
        leaksFound = c.bw.length - phraseSafe.length;
      }
    }

    if (safeBuzzwords.length < 2) {
      errors.push(c.id + ': only ' + safeBuzzwords.length +
        ' buzzword(s) left after removing ' + leaksFound + ' leak(s)');
    } else {
      if (leaksFound > 0) {
        warnings.push(c.id + ': removed ' + leaksFound +
          ' leaking buzzword(s), ' + safeBuzzwords.length + ' remain');
      }
      c.bw = safeBuzzwords;
    }

    // Second, stricter pass (initials, acronym spelled out, short words like "Rai" or "CLL"). It only trims
    // while at least three clues survive, so a card is never starved; the CI test keeps built-in cards clean.
    var strictSafe = c.bw.filter(function (bw) { return !strictClueLeak(bw, c, _strictGeneric); });
    if (strictSafe.length >= 3 && strictSafe.length < c.bw.length) {
      warnings.push(c.id + ': removed ' + (c.bw.length - strictSafe.length) + ' clue(s) that still give the answer away');
      c.bw = strictSafe;
    }
  }

  // Only absurdly long clues are split, so ordinary clues are never cut mid-sentence
  c.bw = c.bw.flatMap(function (b) {
    var words = b.split(/\s+/);
    if (words.length > MAX_CLUE_WORDS) {
      warnings.push(c.id + ': split long buzzword "' + b.substring(0, 40) + '..."');
      var chunks = [];
      for (var j = 0; j < words.length; j += MAX_CLUE_WORDS) {
        chunks.push(words.slice(j, j + MAX_CLUE_WORDS).join(' '));
      }
      return chunks;
    }
    return [b];
  });

  return { valid: errors.length === 0, errors: errors, warnings: warnings };
}

// ═══════════════════════════════════════════════════════════
// Build the card collection
// ═══════════════════════════════════════════════════════════

var RAW_SOURCES = [
  NEUROLOGY_CARDS,
  CARDIOLOGY_CARDS,
  NEPHROLOGY_CARDS,
  PSYCHIATRY_CARDS,
  GASTRO_CARDS,
  PULM_CARDS,
  ID_CARDS,
  ENDO_CARDS,
  HEMEONC_CARDS,
  RHEUM_CARDS,
  OBGYN_CARDS,
  PEDS_CARDS,
  SURGERY_CARDS,
  EM_CARDS,
  MULTI_CARDS
];

// Words common across the deck's answers ("syndrome", "acute"...) name a category, so a clue may use them
var _genericWords = genericWords(RAW_SOURCES.reduce(function (all, src) {
  return all.concat(Array.isArray(src) ? src.map(function (r) { return r && r.ans || ''; }) : []);
}, []));

var _strictGeneric = deckGenericWords(RAW_SOURCES.reduce(function (all, src) {
  return all.concat(Array.isArray(src) ? src.map(function (r) { return r && r.ans || ''; }) : []);
}, []));

var _cards = [];
var _cardById = new Map();
var _dropped = [];
var _warnings = [];
var _seenIds = {};

for (var si = 0; si < RAW_SOURCES.length; si++) {
  var source = RAW_SOURCES[si];
  if (!Array.isArray(source)) continue;

  for (var ci = 0; ci < source.length; ci++) {
    var raw = source[ci];
    if (!raw || !raw.id) {
      _dropped.push({ id: '??', reason: 'missing id' });
      continue;
    }

    // Duplicate ID check
    if (_seenIds[raw.id]) {
      _dropped.push({ id: raw.id, reason: 'duplicate ID (already seen)' });
      continue;
    }
    _seenIds[raw.id] = true;

    // Normalize without mutating original
    var normalized = normalizeCard(raw);

    // Validate
    var result = validateCard(normalized);

    if (!result.valid) {
      for (var ei = 0; ei < result.errors.length; ei++) {
        _dropped.push({ id: normalized.id, reason: result.errors[ei] });
      }
      continue;
    }

    // Collect warnings
    for (var wi = 0; wi < result.warnings.length; wi++) {
      _warnings.push(result.warnings[wi]);
    }

    _cards.push(normalized);
    _cardById.set(normalized.id, normalized);
  }
}

// ═══════════════════════════════════════════════════════════
// Console reporting
// ═══════════════════════════════════════════════════════════

console.log(
  '[Dx Dash] ' + _cards.length + ' cards loaded, ' +
  _dropped.length + ' dropped, ' + _warnings.length + ' auto-fixes applied'
);

if (_dropped.length > 0) {
  console.warn('[Dx Dash] Dropped ' + _dropped.length + ' card(s):');
  for (var di2 = 0; di2 < _dropped.length; di2++) {
    console.warn('  ✖ ' + _dropped[di2].id + ': ' + _dropped[di2].reason);
  }
}

var _isProdBuild = typeof import.meta !== 'undefined' && !!(import.meta.env && import.meta.env.PROD);

// The per-card auto-fix list is only useful while developing.
if (_warnings.length > 0 && !_isProdBuild) {
  console.groupCollapsed(
    '[Dx Dash] ' + _warnings.length + ' auto-fix(es) applied (click to expand)'
  );
  for (var w = 0; w < _warnings.length; w++) {
    console.log('  🔧 ' + _warnings[w]);
  }
  console.groupEnd();
}

// ═══════════════════════════════════════════════════════════
// Card-pool hash
// ═══════════════════════════════════════════════════════════

/**
 * Compute a deterministic hash of the card pool for
 * multiplayer content-version verification.
 * Hashes: id + ans + d[0] + d[1] for each card, sorted by id.
 */
function computeCardPoolHash(cards) {
  var sorted = cards.slice().sort(function (a, b) {
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  var segments = [];
  for (var i = 0; i < sorted.length; i++) {
    var c = sorted[i];
    segments.push(c.id + '|' + c.ans + '|' + (c.d ? c.d.join('|') : ''));
  }
  return djb2Hash(segments.join('\n'));
}

/** What the validator changed or flagged while loading (for the audit tool and tests). */
export function getLoadReport() {
  return {
    loaded: _cards.length,
    dropped: _dropped.slice(),
    warnings: _warnings.slice(),
    weakClueIds: _warnings.filter(function (w) { return w.indexOf(': weak clues') > 0; }).map(function (w) { return w.split(':')[0]; })
  };
}

export const BUILT_IN_CARD_POOL_HASH = computeCardPoolHash(_cards);

// ═══════════════════════════════════════════════════════════
// Public exports
// ═══════════════════════════════════════════════════════════

/** All validated, normalized built-in cards. */
export const CARDS = _cards;

/** Map of card ID → card object for O(1) lookups. */
export const CARD_BY_ID = _cardById;

/**
 * Get a built-in card by ID.
 * @param {string} cardId
 * @returns {object|undefined}
 */
export function getBuiltInCardById(cardId) {
  return _cardById.get(cardId);
}
