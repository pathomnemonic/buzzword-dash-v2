/**
 * cardschema.js — Card schema validation, normalization, and canonical enums
 *
 * This module is the single source of truth for:
 * - Canonical subject names
 * - Exam filter identifiers
 * - Question type identifiers
 * - Source discipline identifiers
 * - Card schema version
 * - Card validation and normalization functions
 *
 * ARCHITECTURE CONTRACT (Agent 8):
 * - Must NOT import from cards.js or customcards.js
 * - Must NOT import from storage.js or ui.js
 * - Exports pure functions and constants only
 * - Runtime validation must not silently rewrite medically meaningful text
 * - Returns structured { success, card, errors, warnings } results
 */

export var CARD_SCHEMA_VERSION = '2.0.0';

export var SUBJECTS = Object.freeze([
  'Neurology',
  'Cardiology',
  'Nephrology',
  'Psychiatry',
  'Gastroenterology',
  'Pulmonology',
  'Infectious Disease',
  'Endocrinology',
  'Hematology/Oncology',
  'Rheumatology',
  'Obstetrics/Gynecology',
  'Pediatrics',
  'Surgery',
  'Emergency Medicine',
  'Multisystem / Mixed'
]);

export var EXAM_FILTERS = Object.freeze([
  'step1', 'step2', 'step3',
  'comlex1', 'comlex2',
  'shelf_im', 'shelf_surg', 'shelf_peds', 'shelf_obgyn',
  'shelf_psych', 'shelf_neuro', 'shelf_fm'
]);

export var QUESTION_TYPES = Object.freeze([
  'buzzword_dx', 'dx_to_tx', 'dx_to_workup', 'mechanism',
  'side_effect', 'lab_dx', 'pharm', 'prevention', 'management'
]);

export var SOURCE_DISCIPLINES = Object.freeze([
  'pathology', 'pharmacology', 'physiology', 'biochemistry',
  'microbiology', 'anatomy', 'embryology', 'behavioral',
  'biostatistics', 'clinical_medicine', 'surgery_principles',
  'genetics', 'immunology', 'ethics'
]);

// All valid runner game modes
var RUNNER_MODES = [
  'endless', 'study', 'weakness', 'daily', 'versus',
  'mp_highscore', 'mp_suddendeath', 'mp_race', 'timed_practice'
];

// All valid modes including flashcard
var ALL_MODES = RUNNER_MODES.concat(['flashcard']);

// Maximum limits
var MAX_BUZZWORD_LENGTH = 120;  // characters per buzzword
var MAX_BUZZWORDS = 8;
var MAX_ANSWER_LENGTH = 200;
var MAX_DISTRACTOR_LENGTH = 200;
var MAX_TEACHING_POINT_LENGTH = 1000;
var MAX_PEARL_LENGTH = 500;
var MAX_PEARLS = 10;
var MAX_ID_LENGTH = 100;

/**
 * Normalize text for comparison purposes.
 * Lowercases, trims, collapses whitespace, removes common punctuation differences.
 *
 * @param {string} value
 * @returns {string}
 */
export function normalizeComparableText(value) {
  if (typeof value !== 'string') return '';
  return value
    .toLowerCase()
    .trim()
    .replace(/[\s\-/()]+/g, ' ')
    .replace(/[''""]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if a card is enabled for a given mode.
 *
 * @param {object} card - A validated card object
 * @param {string} mode - One of the canonical mode strings
 * @returns {boolean}
 */
export function isCardEnabledForMode(card, mode) {
  if (!card || !mode) return false;

  // If card has enabledModes array, check it
  if (Array.isArray(card.enabledModes) && card.enabledModes.length > 0) {
    return card.enabledModes.indexOf(mode) >= 0;
  }

  // Cards without explicit enabledModes are enabled for all runner modes
  // but NOT for flashcard-only mode
  return RUNNER_MODES.indexOf(mode) >= 0;
}

/**
 * Create a validation issue object.
 *
 * @param {string} code
 * @param {string} path
 * @param {string} message
 * @param {'error'|'warning'} severity
 * @returns {{ code: string, path: string, message: string, severity: string }}
 */
function issue(code, path, message, severity) {
  return {
    code: code,
    path: path,
    message: message,
    severity: severity || 'error'
  };
}

/**
 * Check if a string contains HTML tags.
 *
 * @param {string} str
 * @returns {boolean}
 */
function containsHTML(str) {
  if (typeof str !== 'string') return false;
  return /<[a-zA-Z][^>]*>/.test(str);
}

/**
 * Validate a single card object.
 *
 * Options:
 *   - strict: boolean (default true) - if false, missing optional fields produce warnings not errors
 *   - requireDistractors: boolean (default true) - if false, allows missing distractors for flashcard-only cards
 *
 * @param {object} input - The card object to validate
 * @param {object} [options]
 * @returns {{ success: boolean, card: object|null, errors: ValidationIssue[], warnings: ValidationIssue[] }}
 */
export function validateCard(input, options) {
  var errors = [];
  var warnings = [];
  var opts = options || {};
  var strict = opts.strict !== false;
  var requireDistractors = opts.requireDistractors !== false;

  if (!input || typeof input !== 'object') {
    errors.push(issue('INVALID_INPUT', '', 'Input must be a non-null object', 'error'));
    return { success: false, card: null, errors: errors, warnings: warnings };
  }

  // Reject oversized payloads (rough check: serialized size)
  try {
    var serialized = JSON.stringify(input);
    if (serialized.length > 50000) {
      errors.push(issue('PAYLOAD_TOO_LARGE', '', 'Card object exceeds maximum allowed size (50KB)', 'error'));
      return { success: false, card: null, errors: errors, warnings: warnings };
    }
  } catch (e) {
    errors.push(issue('UNSERIALIZABLE', '', 'Card object cannot be serialized', 'error'));
    return { success: false, card: null, errors: errors, warnings: warnings };
  }

  // === Required fields ===

  // id
  if (!input.id || typeof input.id !== 'string' || input.id.trim() === '') {
    errors.push(issue('MISSING_ID', 'id', 'Card must have a non-empty string id', 'error'));
  } else if (input.id.length > MAX_ID_LENGTH) {
    errors.push(issue('ID_TOO_LONG', 'id', 'Card id exceeds maximum length of ' + MAX_ID_LENGTH, 'error'));
  }

  // subj
  if (!input.subj || typeof input.subj !== 'string') {
    errors.push(issue('MISSING_SUBJECT', 'subj', 'Card must have a subject (subj)', 'error'));
  } else if (SUBJECTS.indexOf(input.subj) < 0) {
    errors.push(issue('INVALID_SUBJECT', 'subj', 'Subject "' + input.subj + '" is not a canonical subject', 'error'));
  }

  // bw (buzzwords)
  if (!Array.isArray(input.bw) || input.bw.length === 0) {
    errors.push(issue('MISSING_BUZZWORDS', 'bw', 'Card must have at least one buzzword', 'error'));
  } else {
    var hasNonEmpty = false;
    for (var bi = 0; bi < input.bw.length; bi++) {
      if (typeof input.bw[bi] !== 'string') {
        errors.push(issue('INVALID_BUZZWORD_TYPE', 'bw[' + bi + ']', 'Buzzword must be a string', 'error'));
      } else {
        if (input.bw[bi].trim().length > 0) hasNonEmpty = true;
        if (input.bw[bi].length > MAX_BUZZWORD_LENGTH) {
          warnings.push(issue('BUZZWORD_TOO_LONG', 'bw[' + bi + ']', 'Buzzword exceeds recommended maximum length', 'warning'));
        }
        if (containsHTML(input.bw[bi])) {
          errors.push(issue('HTML_IN_BUZZWORD', 'bw[' + bi + ']', 'Buzzword contains HTML tags', 'error'));
        }
      }
    }
    if (!hasNonEmpty) {
      errors.push(issue('EMPTY_BUZZWORDS', 'bw', 'Card must have at least one non-empty buzzword', 'error'));
    }
    if (input.bw.length > MAX_BUZZWORDS) {
      warnings.push(issue('TOO_MANY_BUZZWORDS', 'bw', 'Card has more than ' + MAX_BUZZWORDS + ' buzzwords', 'warning'));
    }
  }

  // ans (answer)
  if (!input.ans || typeof input.ans !== 'string' || input.ans.trim() === '') {
    errors.push(issue('MISSING_ANSWER', 'ans', 'Card must have a non-empty answer', 'error'));
  } else {
    if (input.ans.length > MAX_ANSWER_LENGTH) {
      warnings.push(issue('ANSWER_TOO_LONG', 'ans', 'Answer exceeds recommended maximum length', 'warning'));
    }
    if (containsHTML(input.ans)) {
      errors.push(issue('HTML_IN_ANSWER', 'ans', 'Answer contains HTML tags', 'error'));
    }
  }

  // d (distractors)
  var isFlashcardOnly = Array.isArray(input.enabledModes) &&
    input.enabledModes.length === 1 &&
    input.enabledModes[0] === 'flashcard';

  if (!requireDistractors && isFlashcardOnly) {
    // Flashcard-only cards may omit distractors
    if (input.d && Array.isArray(input.d)) {
      // If they're provided, validate them
      _validateDistractors(input, errors, warnings);
    }
  } else {
    // Runner-playable cards MUST have exactly 2 distractors
    if (!Array.isArray(input.d) || input.d.length !== 2) {
      errors.push(issue('INVALID_DISTRACTORS', 'd', 'Card must have exactly 2 distractors', 'error'));
    } else {
      _validateDistractors(input, errors, warnings);
    }
  }

  // tp (teaching point)
  if (!input.tp || typeof input.tp !== 'string' || input.tp.trim() === '') {
    if (strict) {
      errors.push(issue('MISSING_TEACHING_POINT', 'tp', 'Card must have a teaching point', 'error'));
    } else {
      warnings.push(issue('MISSING_TEACHING_POINT', 'tp', 'Card is missing a teaching point', 'warning'));
    }
  } else {
    if (input.tp.length > MAX_TEACHING_POINT_LENGTH) {
      warnings.push(issue('TEACHING_POINT_TOO_LONG', 'tp', 'Teaching point exceeds recommended maximum length', 'warning'));
    }
    if (containsHTML(input.tp)) {
      warnings.push(issue('HTML_IN_TEACHING_POINT', 'tp', 'Teaching point contains HTML tags', 'warning'));
    }
  }

  // === Optional fields validation ===

  // ww (why wrong) - keys must match distractors
  if (input.ww && typeof input.ww === 'object' && Array.isArray(input.d)) {
    var wwKeys = Object.keys(input.ww);
    for (var wi = 0; wi < wwKeys.length; wi++) {
      if (input.d.indexOf(wwKeys[wi]) < 0) {
        warnings.push(issue('WW_KEY_MISMATCH', 'ww.' + wwKeys[wi],
          'Why-wrong key "' + wwKeys[wi] + '" does not match any distractor', 'warning'));
      }
      if (containsHTML(input.ww[wwKeys[wi]])) {
        warnings.push(issue('HTML_IN_WW', 'ww.' + wwKeys[wi], 'Why-wrong explanation contains HTML tags', 'warning'));
      }
    }
  }

  // baseDifficulty
  if (input.baseDifficulty !== undefined) {
    if (input.baseDifficulty !== 1 && input.baseDifficulty !== 2 && input.baseDifficulty !== 3) {
      warnings.push(issue('INVALID_DIFFICULTY', 'baseDifficulty', 'baseDifficulty must be 1, 2, or 3', 'warning'));
    }
  }

  // questionType
  if (input.questionType !== undefined && typeof input.questionType === 'string') {
    if (QUESTION_TYPES.indexOf(input.questionType) < 0) {
      warnings.push(issue('INVALID_QUESTION_TYPE', 'questionType',
        'Question type "' + input.questionType + '" is not canonical', 'warning'));
    }
  }

  // source
  if (input.source !== undefined && typeof input.source === 'string') {
    if (SOURCE_DISCIPLINES.indexOf(input.source) < 0) {
      warnings.push(issue('INVALID_SOURCE', 'source',
        'Source discipline "' + input.source + '" is not canonical', 'warning'));
    }
  }

  // yr
  if (input.yr !== undefined) {
    if (input.yr !== 1 && input.yr !== 2 && input.yr !== 3 && input.yr !== 4) {
      warnings.push(issue('INVALID_YEAR', 'yr', 'yr must be 1, 2, 3, or 4', 'warning'));
    }
  }

  // exams
  if (input.exams !== undefined && Array.isArray(input.exams)) {
    for (var ei = 0; ei < input.exams.length; ei++) {
      if (EXAM_FILTERS.indexOf(input.exams[ei]) < 0) {
        warnings.push(issue('INVALID_EXAM', 'exams[' + ei + ']',
          'Exam filter "' + input.exams[ei] + '" is not canonical', 'warning'));
      }
    }
  }

  // enabledModes
  if (input.enabledModes !== undefined && Array.isArray(input.enabledModes)) {
    for (var mi = 0; mi < input.enabledModes.length; mi++) {
      if (ALL_MODES.indexOf(input.enabledModes[mi]) < 0) {
        warnings.push(issue('INVALID_MODE', 'enabledModes[' + mi + ']',
          'Mode "' + input.enabledModes[mi] + '" is not recognized', 'warning'));
      }
    }
  }

  // Detect placeholder distractors for runner-playable cards
  if (Array.isArray(input.d) && !isFlashcardOnly) {
    for (var pi = 0; pi < input.d.length; pi++) {
      var normalizedD = normalizeComparableText(input.d[pi]);
      if (normalizedD === 'n/a' || normalizedD === 'na' || normalizedD === 'n a' || normalizedD === '') {
        errors.push(issue('PLACEHOLDER_DISTRACTOR', 'd[' + pi + ']',
          'Runner-playable cards must not use placeholder distractors like "N/A"', 'error'));
      }
    }
  }

  // pearls
  if (input.pearls !== undefined && Array.isArray(input.pearls)) {
    if (input.pearls.length > MAX_PEARLS) {
      warnings.push(issue('TOO_MANY_PEARLS', 'pearls', 'Card has more than ' + MAX_PEARLS + ' pearls', 'warning'));
    }
    for (var pli = 0; pli < input.pearls.length; pli++) {
      if (typeof input.pearls[pli] !== 'string') {
        warnings.push(issue('INVALID_PEARL_TYPE', 'pearls[' + pli + ']', 'Pearl must be a string', 'warning'));
      } else if (input.pearls[pli].length > MAX_PEARL_LENGTH) {
        warnings.push(issue('PEARL_TOO_LONG', 'pearls[' + pli + ']', 'Pearl exceeds recommended maximum length', 'warning'));
      }
    }
  }

  var success = errors.length === 0;
  return {
    success: success,
    card: success ? input : null,
    errors: errors,
    warnings: warnings
  };
}

/**
 * Internal: validate distractors array
 */
function _validateDistractors(input, errors, warnings) {
  for (var di = 0; di < input.d.length; di++) {
    if (typeof input.d[di] !== 'string' || input.d[di].trim() === '') {
      errors.push(issue('EMPTY_DISTRACTOR', 'd[' + di + ']', 'Distractor must be a non-empty string', 'error'));
    } else {
      if (input.d[di].length > MAX_DISTRACTOR_LENGTH) {
        warnings.push(issue('DISTRACTOR_TOO_LONG', 'd[' + di + ']', 'Distractor exceeds recommended maximum length', 'warning'));
      }
      if (containsHTML(input.d[di])) {
        errors.push(issue('HTML_IN_DISTRACTOR', 'd[' + di + ']', 'Distractor contains HTML tags', 'error'));
      }
    }
  }

  // Check distractor uniqueness
  if (input.d.length === 2 && typeof input.d[0] === 'string' && typeof input.d[1] === 'string') {
    if (normalizeComparableText(input.d[0]) === normalizeComparableText(input.d[1])) {
      errors.push(issue('DUPLICATE_DISTRACTORS', 'd', 'Both distractors are identical after normalization', 'error'));
    }

    // Check distractors differ from answer
    if (typeof input.ans === 'string') {
      var normAns = normalizeComparableText(input.ans);
      for (var dj = 0; dj < input.d.length; dj++) {
        if (normalizeComparableText(input.d[dj]) === normAns) {
          errors.push(issue('DISTRACTOR_EQUALS_ANSWER', 'd[' + dj + ']',
            'Distractor "' + input.d[dj] + '" matches the answer after normalization', 'error'));
        }
      }
    }
  }
}

/**
 * Normalize a card input, applying safe defaults for missing optional fields.
 * Does NOT silently rewrite medically meaningful text.
 *
 * @param {object} input
 * @param {object} [options]
 * @returns {{ success: boolean, card: object|null, errors: ValidationIssue[], warnings: ValidationIssue[] }}
 */
export function normalizeCard(input, options) {
  // First validate
  var validation = validateCard(input, options);
  if (!validation.success) {
    return validation;
  }

  var card = {};
  var warnings = validation.warnings.slice();

  // Copy all fields from input
  for (var key in input) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      card[key] = input[key];
    }
  }

  // Apply safe defaults for missing optional fields
  if (card.exams === undefined) {
    card.exams = [];
    warnings.push(issue('DEFAULT_APPLIED', 'exams', 'Added default empty exams array', 'warning'));
  }
  if (card.baseDifficulty === undefined) {
    card.baseDifficulty = 2;
    warnings.push(issue('DEFAULT_APPLIED', 'baseDifficulty', 'Added default baseDifficulty of 2', 'warning'));
  }
  if (card.questionType === undefined) {
    card.questionType = 'buzzword_dx';
    warnings.push(issue('DEFAULT_APPLIED', 'questionType', 'Added default questionType', 'warning'));
  }
  if (card.source === undefined) {
    card.source = 'clinical_medicine';
    warnings.push(issue('DEFAULT_APPLIED', 'source', 'Added default source', 'warning'));
  }
  if (card.tags === undefined) {
    card.tags = card.subj ? [card.subj.toLowerCase()] : [];
  }
  if (card.hx === undefined) {
    card.hx = false;
  }
  if (card.yr === undefined) {
    card.yr = 2;
  }
  if (card.pearls === undefined) {
    card.pearls = card.tp ? [card.tp.split('.')[0]] : [];
  }
  if (card.ww === undefined) {
    card.ww = {};
  }

  // Fix ww keys to match distractors
  if (card.ww && card.d && Array.isArray(card.d)) {
    var newWw = {};
    var wwKeys = Object.keys(card.ww);
    card.d.forEach(function(dist, idx) {
      if (card.ww[dist]) {
        newWw[dist] = card.ww[dist];
      } else if (wwKeys[idx]) {
        newWw[dist] = card.ww[wwKeys[idx]];
        warnings.push(issue('WW_REMAPPED', 'ww',
          'Remapped ww key to match distractor "' + dist + '"', 'warning'));
      }
    });
    card.ww = newWw;
  }

  return {
    success: true,
    card: card,
    errors: [],
    warnings: warnings
  };
}

/**
 * Validate a collection of cards, checking for duplicates and collection-level issues.
 *
 * @param {object[]} cards
 * @param {object} [options]
 * @returns {{ success: boolean, card: null, errors: ValidationIssue[], warnings: ValidationIssue[] }}
 */
export function validateCardCollection(cards, options) {
  var errors = [];
  var warnings = [];

  if (!Array.isArray(cards)) {
    errors.push(issue('INVALID_COLLECTION', '', 'Input must be an array of cards', 'error'));
    return { success: false, card: null, errors: errors, warnings: warnings };
  }

  var seenIds = {};

  for (var i = 0; i < cards.length; i++) {
    var result = validateCard(cards[i], options);

    // Prefix card-level issues with index
    for (var ei = 0; ei < result.errors.length; ei++) {
      var e = result.errors[ei];
      errors.push(issue(e.code, 'cards[' + i + '].' + e.path, e.message, 'error'));
    }
    for (var wi = 0; wi < result.warnings.length; wi++) {
      var w = result.warnings[wi];
      warnings.push(issue(w.code, 'cards[' + i + '].' + w.path, w.message, 'warning'));
    }

    // Check for duplicate IDs
    if (cards[i] && cards[i].id) {
      if (seenIds[cards[i].id]) {
        errors.push(issue('DUPLICATE_ID', 'cards[' + i + '].id',
          'Duplicate card ID: "' + cards[i].id + '"', 'error'));
      }
      seenIds[cards[i].id] = true;
    }
  }

  return {
    success: errors.length === 0,
    card: null,
    errors: errors,
    warnings: warnings
  };
}
