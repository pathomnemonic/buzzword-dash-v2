/**
 * ankiimport.js — Anki card import with standards-compliant parsing
 *
 * Owns: js/ankiimport.js (Agent 9)
 *
 * Supports:
 * - Standards-compliant CSV/TSV parsing (RFC 4180 style with liberal extensions)
 * - Quoted fields with escaped quotes, multiline, BOM handling
 * - Parsing .apkg files (Anki deck packages) via dynamic CDN libraries
 * - Raw import of flashcard-only cards (no placeholder distractors)
 * - Optional backend AI conversion (no browser-stored provider keys)
 * - Mount/unmount lifecycle for Settings extension integration
 * - Safe DOM rendering (no innerHTML with untrusted content)
 *
 * Architecture contract compliance (Section 28, 31):
 * - No browser-stored OpenAI/Anthropic keys
 * - No direct provider API calls from browser
 * - SQLite resources cleaned in finally blocks
 * - File size limits enforced before loading
 * - Raw imports use enabledModes: ['flashcard']
 * - No placeholder distractors ['N/A', 'N/A']
 * - Mounts/unmounts safely via settings extension contract
 * - All untrusted content rendered with textContent / safe DOM
 */

// ===== CDN URLs =====
var JSZIP_URL = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
var SQLJS_URL = 'https://cdn.jsdelivr.net/npm/sql.js@1.8.0/dist/sql-wasm.js';
var SQLJS_WASM_URL = 'https://cdn.jsdelivr.net/npm/sql.js@1.8.0/dist/sql-wasm.wasm';

// ===== LIMITS =====
var MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
var MAX_DELIMITED_TEXT_LENGTH = 10 * 1024 * 1024; // 10 MB
var MAX_CARDS_PER_IMPORT = 5000;

// ===== STATE =====
var _mounted = false;
var _containerEl = null;
var _dependencies = null;
var _parsedCards = null;
var _abortController = null;

// ===== DYNAMIC SCRIPT LOADING =====

/**
 * Load a script from a URL, returning a Promise.
 * Deduplicates by checking for existing script tags.
 * @param {string} url
 * @returns {Promise<void>}
 */
function loadScript(url) {
  return new Promise(function (resolve, reject) {
    var existing = document.querySelector('script[src="' + url + '"]');
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
        return;
      }
      var onLoad = function () {
        existing.dataset.loaded = 'true';
        existing.removeEventListener('load', onLoad);
        existing.removeEventListener('error', onError);
        resolve();
      };
      var onError = function () {
        existing.removeEventListener('load', onLoad);
        existing.removeEventListener('error', onError);
        reject(new Error('Failed to load script: ' + url));
      };
      existing.addEventListener('load', onLoad);
      existing.addEventListener('error', onError);
      return;
    }

    var script = document.createElement('script');
    script.src = url;
    script.async = true;

    script.onload = function () {
      script.dataset.loaded = 'true';
      resolve();
    };

    script.onerror = function () {
      reject(new Error('Failed to load script: ' + url));
    };

    document.head.appendChild(script);
  });
}

// ===== BOM HANDLING =====

/**
 * Strip UTF-8 BOM from text if present.
 * @param {string} text
 * @returns {string}
 */
function stripBOM(text) {
  if (text.length > 0 && text.charCodeAt(0) === 0xFEFF) {
    return text.slice(1);
  }
  return text;
}

// ===== HTML STRIPPING =====

/**
 * Strip HTML tags from a string and decode common entities.
 * @param {string} html
 * @returns {string}
 */
function stripHtml(html) {
  if (!html) return '';
  var text = html.replace(/<[^>]*>/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/\s+/g, ' ');
  return text.trim();
}

// ===== CSV/TSV PARSING (RFC 4180 compliant with liberal extensions) =====

/**
 * Parse delimited text (CSV or TSV) into an array of {front, back} objects.
 *
 * Supports:
 * - Tab and comma delimiters (auto-detected or configurable)
 * - Quoted fields with embedded delimiters
 * - Escaped quotes ("" inside quoted fields)
 * - Multiline quoted fields
 * - BOM stripping
 * - CRLF and LF line endings
 * - Empty row skipping
 * - Malformed row reporting
 *
 * @param {string} text - Raw delimited text
 * @param {object} [options]
 * @param {string} [options.delimiter] - Force delimiter (',' or '\t'). Auto-detected if omitted.
 * @param {boolean} [options.hasHeaders=false] - If true, first row is treated as headers.
 * @param {number} [options.frontColumn=0] - Column index for front field.
 * @param {number} [options.backColumn=1] - Column index for back field.
 * @returns {{ cards: Array<{front: string, back: string}>, warnings: string[] }}
 */
function parseDelimitedText(text, options) {
  options = options || {};
  var warnings = [];

  if (!text || typeof text !== 'string') {
    return { cards: [], warnings: ['No text provided.'] };
  }

  if (text.length > MAX_DELIMITED_TEXT_LENGTH) {
    return { cards: [], warnings: ['Text exceeds maximum size limit of ' + Math.round(MAX_DELIMITED_TEXT_LENGTH / 1024 / 1024) + ' MB.'] };
  }

  text = stripBOM(text);

  // Auto-detect delimiter if not specified
  var delimiter = options.delimiter || null;
  if (!delimiter) {
    var firstChunk = text.substring(0, Math.min(text.length, 2000));
    var tabCount = 0;
    var commaCount = 0;
    for (var ci = 0; ci < firstChunk.length; ci++) {
      if (firstChunk[ci] === '\t') tabCount++;
      if (firstChunk[ci] === ',') commaCount++;
    }
    delimiter = tabCount >= commaCount ? '\t' : ',';
  }

  var frontCol = typeof options.frontColumn === 'number' ? options.frontColumn : 0;
  var backCol = typeof options.backColumn === 'number' ? options.backColumn : 1;

  // Parse into rows of fields using RFC 4180-style state machine
  var rows = _parseCSVRows(text, delimiter, warnings);

  // Skip header row if configured
  var startRow = options.hasHeaders ? 1 : 0;

  var cards = [];
  var minCols = Math.max(frontCol, backCol) + 1;

  for (var ri = startRow; ri < rows.length; ri++) {
    var row = rows[ri];

    // Skip empty rows
    if (row.length === 0) continue;
    if (row.length === 1 && row[0].trim() === '') continue;

    if (row.length < minCols) {
      warnings.push('Row ' + (ri + 1) + ': expected at least ' + minCols + ' columns, got ' + row.length + '. Skipped.');
      continue;
    }

    var front = row[frontCol] ? row[frontCol].trim() : '';
    var back = row[backCol] ? row[backCol].trim() : '';

    // If back column is not specified and there are more columns, join them
    if (backCol === 1 && row.length > 2 && options.backColumn === undefined) {
      back = row.slice(1).join(', ').trim();
    }

    if (front && back) {
      cards.push({ front: front, back: back });
    }
  }

  if (cards.length > MAX_CARDS_PER_IMPORT) {
    warnings.push('Truncated to ' + MAX_CARDS_PER_IMPORT + ' cards (found ' + cards.length + ').');
    cards = cards.slice(0, MAX_CARDS_PER_IMPORT);
  }

  return { cards: cards, warnings: warnings };
}

/**
 * RFC 4180-style CSV row parser with liberal extensions.
 * Handles quoted fields, escaped quotes, multiline, CRLF/LF.
 *
 * @param {string} text
 * @param {string} delim
 * @param {string[]} warnings
 * @returns {string[][]}
 */
function _parseCSVRows(text, delim, warnings) {
  var rows = [];
  var currentRow = [];
  var currentField = '';
  var inQuote = false;
  var i = 0;
  var len = text.length;
  var rowNum = 1;

  while (i < len) {
    var ch = text[i];

    if (inQuote) {
      if (ch === '"') {
        // Check for escaped quote ""
        if (i + 1 < len && text[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        }
        // End of quoted field
        inQuote = false;
        i++;
        continue;
      }
      // Any character inside quotes (including newlines and delimiters)
      currentField += ch;
      if (ch === '\n') rowNum++;
      i++;
      continue;
    }

    // Not in quote
    if (ch === '"') {
      if (currentField.length === 0) {
        // Start of quoted field
        inQuote = true;
        i++;
        continue;
      }
      // Quote in the middle of unquoted field — liberal: treat as literal
      currentField += ch;
      i++;
      continue;
    }

    if (ch === delim) {
      currentRow.push(currentField);
      currentField = '';
      i++;
      continue;
    }

    if (ch === '\r') {
      // CRLF or bare CR
      if (i + 1 < len && text[i + 1] === '\n') {
        i++; // skip the \n in CRLF
      }
      // End of row
      currentRow.push(currentField);
      currentField = '';
      rows.push(currentRow);
      currentRow = [];
      rowNum++;
      i++;
      continue;
    }

    if (ch === '\n') {
      // End of row (LF only)
      currentRow.push(currentField);
      currentField = '';
      rows.push(currentRow);
      currentRow = [];
      rowNum++;
      i++;
      continue;
    }

    currentField += ch;
    i++;
  }

  // Handle last field/row
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  if (inQuote) {
    warnings.push('Unterminated quoted field detected near row ' + rowNum + '.');
  }

  return rows;
}

// ===== APKG PARSING =====

/**
 * Parse an .apkg file (Anki deck package).
 * Loads JSZip and sql.js dynamically from CDN.
 * The .apkg is a ZIP containing a SQLite database with notes table.
 * Fields in each note are separated by \x1f (unit separator). [2]
 *
 * SQLite resources are cleaned in finally blocks per Section 28.3.
 * File size is checked before loading per Section 28.3.
 *
 * @param {File} file - A File object (.apkg)
 * @param {object} [options]
 * @returns {Promise<{ cards: Array<{front: string, back: string}>, warnings: string[] }>}
 */
async function parseApkg(file, options) {
  options = options || {};
  var warnings = [];

  if (!file) {
    return { cards: [], warnings: ['No file provided.'] };
  }

  // File size limit check (Section 28.3)
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      cards: [],
      warnings: ['File too large (' + Math.round(file.size / 1024 / 1024) + ' MB). Maximum is ' + Math.round(MAX_FILE_SIZE_BYTES / 1024 / 1024) + ' MB.']
    };
  }

  // Load JSZip
  await loadScript(JSZIP_URL);
  if (typeof JSZip === 'undefined') {
    throw new Error('JSZip failed to load.');
  }

  // Load sql.js
  await loadScript(SQLJS_URL);
  if (typeof initSqlJs === 'undefined') {
    throw new Error('sql.js failed to load.');
  }

  // Read the file as ArrayBuffer
  var arrayBuffer = await file.arrayBuffer();

  // Unzip with JSZip
  var zip = await JSZip.loadAsync(arrayBuffer);

  // Look for the SQLite database file inside the ZIP
  var dbFile = null;
  var dbFilenames = ['collection.anki2', 'collection.anki21'];

  for (var fi = 0; fi < dbFilenames.length; fi++) {
    if (zip.files[dbFilenames[fi]]) {
      dbFile = zip.files[dbFilenames[fi]];
      break;
    }
  }

  if (!dbFile) {
    return {
      cards: [],
      warnings: [
        'Could not find collection.anki2 or collection.anki21 in the .apkg file. ' +
        'If this is a newer Anki export, try re-exporting with "Support older Anki versions" enabled.'
      ]
    };
  }

  // Extract the database file as Uint8Array
  var dbData = await dbFile.async('uint8array');

  // Initialize sql.js with WASM
  var SQL = await initSqlJs({
    locateFile: function () {
      return SQLJS_WASM_URL;
    }
  });

  // Open the database — cleanup in finally (Section 28.3)
  var db = null;
  var stmt = null;
  var results = [];

  try {
    db = new SQL.Database(dbData);

    try {
      stmt = db.prepare('SELECT flds FROM notes');

      while (stmt.step()) {
        var row = stmt.get();
        var flds = row[0];

        if (typeof flds === 'string') {
          var fields = flds.split('\x1f');
          if (fields.length >= 2) {
            var front = stripHtml(fields[0]).trim();
            var back = stripHtml(fields[1]).trim();
            if (front && back) {
              results.push({ front: front, back: back });
            }
          }
        }
      }
    } finally {
      // Always free the statement (Section 28.3)
      if (stmt) {
        try { stmt.free(); } catch (e) {
          // Best-effort cleanup: statement may already be freed.
        }
      }
    }
  } catch (e) {
    warnings.push('Error reading notes from database: ' + (e.message || String(e)));
  } finally {
    // Always close the database (Section 28.3)
    if (db) {
      try { db.close(); } catch (e) {
        // Best-effort cleanup: db may already be closed.
      }
    }
  }

  if (results.length > MAX_CARDS_PER_IMPORT) {
    warnings.push('Truncated to ' + MAX_CARDS_PER_IMPORT + ' cards (found ' + results.length + ').');
    results = results.slice(0, MAX_CARDS_PER_IMPORT);
  }

  return { cards: results, warnings: warnings };
}

// ===== RAW IMPORT (flashcard-only, no placeholder distractors) =====

/**
 * Import raw front/back cards as flashcard-only custom cards.
 * Per Section 9.4: raw imports use enabledModes: ['flashcard']
 * and must NOT use placeholder distractors.
 *
 * @param {Array<{front: string, back: string}>} cards
 * @param {object} [options]
 * @returns {{ imported: number, rejected: number, warnings: string[] }}
 */
function importRaw(cards, options) {
  options = options || {};
  var warnings = [];
  var imported = 0;
  var rejected = 0;

  if (!cards || !Array.isArray(cards) || cards.length === 0) {
    return { imported: 0, rejected: 0, warnings: ['No cards to import.'] };
  }

  if (!_dependencies || !_dependencies.customCards) {
    return { imported: 0, rejected: 0, warnings: ['Custom cards module not available.'] };
  }

  var customCards = _dependencies.customCards;

  // Attempt to use cardschema validation if available
  var validateCard = _dependencies.validateCard || null;

  var limit = Math.min(cards.length, MAX_CARDS_PER_IMPORT);

  for (var i = 0; i < limit; i++) {
    var card = cards[i];
    var front = (card.front || '').trim();
    var back = (card.back || '').trim();

    if (!front || !back) {
      rejected++;
      warnings.push('Card ' + (i + 1) + ': empty front or back. Skipped.');
      continue;
    }

    // Build a raw flashcard-only card (Section 9.4)
    // No distractors — enabledModes restricted to flashcard
    var cardData = {
      subject: 'Multisystem / Mixed',
      buzzwords: [front],
      answer: back,
      distractors: [], // No placeholder distractors per Section 9.4
      teachingPoint: back,
      enabledModes: ['flashcard']
    };

    // Validate if validator is available
    if (validateCard) {
      var validation = validateCard(cardData);
      if (validation && !validation.success && validation.errors && validation.errors.length > 0) {
        // For raw imports, we are lenient — only reject truly broken cards
        var hasBlockingError = false;
        for (var ve = 0; ve < validation.errors.length; ve++) {
          var err = validation.errors[ve];
          // Distractor errors are expected for raw imports
          if (err.path && err.path.indexOf('distractor') >= 0) continue;
          if (err.path && err.path.indexOf('enabledModes') >= 0) continue;
          hasBlockingError = true;
        }
        if (hasBlockingError) {
          rejected++;
          warnings.push('Card ' + (i + 1) + ': validation failed. Skipped.');
          continue;
        }
      }
    }

    try {
      customCards.add(cardData);
      imported++;
    } catch (e) {
      rejected++;
      warnings.push('Card ' + (i + 1) + ': failed to save — ' + (e.message || String(e)));
    }
  }

  if (cards.length > MAX_CARDS_PER_IMPORT) {
    warnings.push('Only the first ' + MAX_CARDS_PER_IMPORT + ' cards were processed.');
  }

  return { imported: imported, rejected: rejected, warnings: warnings };
}

// ===== BACKEND AI CONVERSION (Section 28.4) =====

/**
 * Convert flashcards using an optional backend service.
 *
 * Per Section 28.4:
 * - The browser must NOT store provider API keys
 * - The browser must NOT call provider APIs directly
 * - Conversion goes through an application backend endpoint
 *
 * @param {Array<{front: string, back: string}>} cards
 * @param {object} [options]
 * @param {string} [options.backendUrl] - Backend conversion endpoint URL
 * @param {string} [options.sessionToken] - Application session bearer token
 * @param {string} [options.subjectHint] - Optional subject hint
 * @param {function} [options.onProgress] - Progress callback(current, total)
 * @returns {Promise<{ converted: object[], rejected: Array<{index: number, reason: string}>, warnings: string[] }>}
 */
async function convertWithBackend(cards, options) {
  options = options || {};
  var warnings = [];

  if (!cards || !Array.isArray(cards) || cards.length === 0) {
    return { converted: [], rejected: [], warnings: ['No cards to convert.'] };
  }

  var backendUrl = options.backendUrl || '';
  if (!backendUrl) {
    return {
      converted: [],
      rejected: [],
      warnings: [
        'No backend URL configured. AI conversion requires a server endpoint. ' +
        'Use "Import Without AI" to add cards as flashcard-only.'
      ]
    };
  }

  var sessionToken = options.sessionToken || '';
  var subjectHint = options.subjectHint || null;

  // Prepare the request payload (Section 28.4 contract)
  var requestPayload = {
    cards: cards.map(function (c) {
      return { front: c.front || '', back: c.back || '' };
    }),
    options: {
      subjectHint: subjectHint
    }
  };

  var headers = {
    'Content-Type': 'application/json'
  };
  if (sessionToken) {
    headers['Authorization'] = 'Bearer ' + sessionToken;
  }

  try {
    var response = await fetch(backendUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestPayload)
    });

    if (!response.ok) {
      var errText = '';
      try { errText = await response.text(); } catch (e) {
        // Best-effort: response body may not be readable.
      }
      warnings.push('Backend returned status ' + response.status + ': ' + errText.substring(0, 200));
      return { converted: [], rejected: [], warnings: warnings };
    }

    var data = await response.json();

    var converted = [];
    var rejected = data.rejected || [];

    if (data.converted && Array.isArray(data.converted)) {
      for (var ci = 0; ci < data.converted.length; ci++) {
        var card = data.converted[ci];

        // Validate locally even though backend produced it (Section 28.4)
        if (_isValidConvertedCard(card)) {
          converted.push(card);
        } else {
          rejected.push({ index: ci, reason: 'Invalid card structure from backend.' });
          warnings.push('Card ' + (ci + 1) + ': backend output failed local validation.');
        }
      }
    }

    if (options.onProgress) {
      options.onProgress(cards.length, cards.length);
    }

    return { converted: converted, rejected: rejected, warnings: warnings };

  } catch (e) {
    warnings.push('Backend conversion error: ' + (e.message || String(e)));
    return { converted: [], rejected: [], warnings: warnings };
  }
}

/**
 * Validate a converted card has required fields.
 * @param {object} card
 * @returns {boolean}
 */
function _isValidConvertedCard(card) {
  if (!card) return false;
  if (!card.buzzwords || !Array.isArray(card.buzzwords) || card.buzzwords.length < 1) return false;
  if (!card.answer || typeof card.answer !== 'string' || card.answer.trim() === '') return false;
  if (!card.distractors || !Array.isArray(card.distractors) || card.distractors.length !== 2) return false;
  if (!card.distractors[0] || !card.distractors[1]) return false;
  if (card.distractors[0].trim() === '' || card.distractors[1].trim() === '') return false;
  // No N/A placeholders (Section 9.4)
  if (card.distractors[0] === 'N/A' || card.distractors[1] === 'N/A') return false;
  if (!card.teachingPoint || typeof card.teachingPoint !== 'string') return false;
  return true;
}

/**
 * Save validated converted cards to the custom cards system.
 * @param {Array} convertedCards
 * @returns {{ imported: number, rejected: number, warnings: string[] }}
 */
function _saveConvertedCards(convertedCards) {
  var warnings = [];
  var imported = 0;
  var rejected = 0;

  if (!_dependencies || !_dependencies.customCards) {
    return { imported: 0, rejected: 0, warnings: ['Custom cards module not available.'] };
  }

  var customCards = _dependencies.customCards;

  var SUBJECTS = [
    'Neurology', 'Cardiology', 'Nephrology', 'Psychiatry', 'Gastroenterology',
    'Pulmonology', 'Infectious Disease', 'Endocrinology', 'Hematology/Oncology',
    'Rheumatology', 'Obstetrics/Gynecology', 'Pediatrics', 'Surgery',
    'Emergency Medicine', 'Multisystem / Mixed'
  ];

  for (var i = 0; i < convertedCards.length; i++) {
    var card = convertedCards[i];
    try {
      var subject = card.subject || 'Multisystem / Mixed';
      if (SUBJECTS.indexOf(subject) < 0) {
        subject = 'Multisystem / Mixed';
      }

      customCards.add({
        subject: subject,
        buzzwords: card.buzzwords,
        answer: card.answer,
        distractors: card.distractors.slice(0, 2),
        teachingPoint: card.teachingPoint || '',
        whyWrong1: (card.whyWrong && card.whyWrong[card.distractors[0]]) || '',
        whyWrong2: (card.whyWrong && card.whyWrong[card.distractors[1]]) || ''
      });
      imported++;
    } catch (e) {
      rejected++;
      warnings.push('Failed to save converted card ' + (i + 1) + ': ' + (e.message || String(e)));
    }
  }

  return { imported: imported, rejected: rejected, warnings: warnings };
}

// ===== SAFE DOM HELPERS =====
// These use textContent and createElement to avoid innerHTML with untrusted content.

/**
 * Create an element with optional class, text, and attributes.
 * @param {string} tag
 * @param {object} [opts]
 * @returns {HTMLElement}
 */
function _el(tag, opts) {
  opts = opts || {};
  var el = document.createElement(tag);
  if (opts.className) el.className = opts.className;
  if (opts.text !== undefined) el.textContent = opts.text;
  if (opts.type) el.type = opts.type;
  if (opts.placeholder) el.placeholder = opts.placeholder;
  if (opts.value !== undefined) el.value = opts.value;
  if (opts.htmlFor) el.htmlFor = opts.htmlFor;
  if (opts.rows) el.rows = opts.rows;
  if (opts.accept) el.accept = opts.accept;
  if (opts.disabled) el.disabled = true;
  if (opts.style) {
    for (var key in opts.style) {
      if (Object.prototype.hasOwnProperty.call(opts.style, key)) {
        el.style[key] = opts.style[key];
      }
    }
  }
  if (opts.dataset) {
    for (var dk in opts.dataset) {
      if (Object.prototype.hasOwnProperty.call(opts.dataset, dk)) {
        el.dataset[dk] = opts.dataset[dk];
      }
    }
  }
  if (opts.children) {
    for (var ci = 0; ci < opts.children.length; ci++) {
      if (opts.children[ci]) el.appendChild(opts.children[ci]);
    }
  }
  return el;
}

// ===== MOUNT / UNMOUNT (Section 21.1, Settings extension) =====

/**
 * Mount the Anki import UI into a container element.
 * Uses safe DOM APIs — no innerHTML with interpolated untrusted values.
 *
 * @param {HTMLElement} container - The container DOM element
 * @param {object} dependencies - Required modules
 * @param {object} dependencies.customCards - customCards module
 * @param {object} [dependencies.storage] - storage module (optional)
 * @param {function} [dependencies.normalizeCard] - from cardschema.js (optional)
 * @param {function} [dependencies.validateCard] - from cardschema.js (optional)
 * @param {function} [dependencies.reportError] - from errors.js (optional)
 * @param {function} [dependencies.showUserError] - from errors.js (optional)
 * @param {object} [dependencies.dom] - safe DOM utilities from dom.js (optional)
 */
function mount(container, dependencies) {
  if (_mounted) {
    unmount();
  }

  if (!container) return;

  _containerEl = container;
  _dependencies = dependencies || {};
  _parsedCards = null;
  _mounted = true;

  _renderUI();
}

/**
 * Unmount the Anki import UI and clean up event listeners.
 */
function unmount() {
  _mounted = false;
  _parsedCards = null;

  if (_abortController) {
    try { _abortController.abort(); } catch (e) {
      // Best-effort cleanup.
    }
    _abortController = null;
  }

  if (_containerEl) {
    // Clear children safely
    while (_containerEl.firstChild) {
      _containerEl.removeChild(_containerEl.firstChild);
    }
  }

  _containerEl = null;
  _dependencies = null;
}

// ===== UI RENDERING (safe DOM only) =====

function _renderUI() {
  if (!_containerEl || !_mounted) return;

  // Clear existing
  while (_containerEl.firstChild) {
    _containerEl.removeChild(_containerEl.firstChild);
  }

  // Section container
  var section = _el('div', { className: 'anki-import-section' });

  // Title
  var title = _el('h4', { text: '📥 Import Anki / CSV Cards' });
  section.appendChild(title);

  // File input
  var fileLabel = _el('label', {
    text: 'Upload file (.apkg, .csv, .tsv, .txt)',
    style: { fontSize: '11px', color: 'var(--text-secondary, #aaa)', display: 'block', marginBottom: '4px' }
  });
  section.appendChild(fileLabel);

  var fileInput = _el('input', {
    type: 'file',
    accept: '.apkg,.csv,.tsv,.txt',
    style: { width: '100%', marginBottom: '10px', fontSize: '12px', color: 'var(--text-primary, #fff)' }
  });
  section.appendChild(fileInput);

  // Textarea for paste
  var pasteLabel = _el('label', {
    text: 'Or paste tab-separated cards',
    style: { fontSize: '11px', color: 'var(--text-secondary, #aaa)', display: 'block', marginBottom: '4px' }
  });
  section.appendChild(pasteLabel);

  var pasteArea = _el('textarea', {
    rows: 6,
    placeholder: 'Paste tab-separated cards (front\tback per line)...',
    style: {
      width: '100%', boxSizing: 'border-box', padding: '8px', borderRadius: '8px',
      background: 'rgba(20,10,50,.6)', color: 'var(--text-primary, #fff)',
      border: '1px solid rgba(187,102,255,.2)', fontSize: '12px', resize: 'vertical',
      fontFamily: 'inherit'
    }
  });
  section.appendChild(pasteArea);

  // Backend URL input (optional, for AI conversion)
  var backendLabel = _el('label', {
    text: 'AI Conversion Backend URL (optional)',
    style: { fontSize: '11px', color: 'var(--text-secondary, #aaa)', display: 'block', margin: '8px 0 4px' }
  });
  section.appendChild(backendLabel);

  var backendInput = _el('input', {
    type: 'text',
    placeholder: 'https://your-server.com/api/cards/convert',
    className: 'anki-api-key-input',
    style: {
      width: '100%', boxSizing: 'border-box', padding: '8px', borderRadius: '8px',
      background: 'rgba(20,10,50,.6)', color: 'var(--text-primary, #fff)',
      border: '1px solid rgba(187,102,255,.2)', fontSize: '12px', marginBottom: '12px'
    }
  });
  section.appendChild(backendInput);

  // Buttons
  var convertBtn = _el('button', {
    className: 'btn btn-primary btn-block',
    text: '🤖 Convert & Import with AI',
    style: { marginBottom: '6px' }
  });
  section.appendChild(convertBtn);

  var rawImportBtn = _el('button', {
    className: 'btn btn-outline btn-block',
    text: '📋 Import Without AI (Flashcard-Only)'
  });
  section.appendChild(rawImportBtn);

  // Progress bar
  var progressContainer = _el('div', {
    className: 'anki-import-progress',
    style: { marginTop: '10px', display: 'none', height: '8px', background: 'rgba(255,255,255,.1)', borderRadius: '4px', overflow: 'hidden' }
  });
  var progressFill = _el('div', {
    className: 'anki-import-progress-fill',
    style: {
      height: '100%', width: '0%',
      background: 'linear-gradient(90deg, var(--accent-cyan, #18ffff), var(--accent-purple, #bb66ff))',
      transition: 'width 0.3s ease', borderRadius: '4px'
    }
  });
  progressContainer.appendChild(progressFill);
  section.appendChild(progressContainer);

  // Status text
  var statusEl = _el('div', {
    className: 'anki-import-status',
    style: { marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary, #aaa)', textAlign: 'center', minHeight: '16px' }
  });
  section.appendChild(statusEl);

  _containerEl.appendChild(section);

  // ===== EVENT BINDING =====

  function setStatus(msg, color) {
    statusEl.textContent = msg;
    statusEl.style.color = color || 'var(--text-secondary, #aaa)';
  }

  function showProgress(show) {
    progressContainer.style.display = show ? 'block' : 'none';
    progressFill.style.width = '0%';
  }

  function updateProgress(current, total) {
    if (total > 0) {
      progressFill.style.width = Math.round((current / total) * 100) + '%';
    }
    setStatus('Processing card ' + current + ' of ' + total + '...');
  }

  /**
   * Get cards from either the file input or the textarea.
   */
  async function getCards() {
    if (_parsedCards && _parsedCards.length > 0) {
      return { cards: _parsedCards, warnings: [] };
    }

    var pasteText = pasteArea.value.trim();
    if (pasteText) {
      return parseDelimitedText(pasteText);
    }

    if (fileInput.files && fileInput.files.length > 0) {
      return await parseFileInput(fileInput.files[0]);
    }

    return { cards: [], warnings: ['No cards found. Upload a file or paste cards above.'] };
  }

  /**
   * Parse a file input based on extension.
   */
  async function parseFileInput(file) {
    var name = file.name.toLowerCase();

    if (name.endsWith('.apkg')) {
      setStatus('Parsing .apkg file (loading libraries)...');
      return await parseApkg(file);
    } else {
      var text = await file.text();
      return parseDelimitedText(text);
    }
  }

  // File change handler
  fileInput.addEventListener('change', async function () {
    if (!fileInput.files || fileInput.files.length === 0) return;

    var file = fileInput.files[0];
    try {
      setStatus('Reading file...');
      var result = await parseFileInput(file);
      _parsedCards = result.cards;
      setStatus(
        'Parsed ' + result.cards.length + ' cards from file.' +
        (result.warnings.length > 0 ? ' (' + result.warnings.length + ' warnings)' : ''),
        'var(--accent-green, #44ff88)'
      );
      if (result.warnings.length > 0) {
        console.warn('[Anki Import] Parse warnings:', result.warnings);
      }
    } catch (e) {
      _parsedCards = null;
      setStatus('Error reading file: ' + (e.message || String(e)), 'var(--accent-red, #ff4466)');
      if (_dependencies && _dependencies.reportError) {
        _dependencies.reportError(e, { system: 'ankiimport', operation: 'parseFile' });
      }
    }
  });

  // Convert & Import button
  convertBtn.addEventListener('click', async function () {
    try {
      var backendUrl = backendInput.value.trim();
      if (!backendUrl) {
        setStatus(
          'No backend URL configured. AI conversion requires a server endpoint. Use "Import Without AI" for raw import.',
          'var(--accent-red, #ff4466)'
        );
        return;
      }

      setStatus('Loading cards...');
      var cardResult = await getCards();

      if (!cardResult.cards || cardResult.cards.length === 0) {
        setStatus(
          cardResult.warnings.length > 0 ? cardResult.warnings[0] : 'No cards found.',
          'var(--accent-red, #ff4466)'
        );
        return;
      }

      convertBtn.disabled = true;
      showProgress(true);
      setStatus('Converting ' + cardResult.cards.length + ' cards with AI...');

      var convertResult = await convertWithBackend(cardResult.cards, {
        backendUrl: backendUrl,
        onProgress: updateProgress
      });

      if (convertResult.converted.length === 0) {
        setStatus(
          'No cards were successfully converted.' +
          (convertResult.warnings.length > 0 ? ' ' + convertResult.warnings[0] : ''),
          'var(--accent-red, #ff4466)'
        );
        convertBtn.disabled = false;
        showProgress(false);
        return;
      }

      var saveResult = _saveConvertedCards(convertResult.converted);

      showProgress(false);
      setStatus(
        '✅ Imported ' + saveResult.imported + ' AI-converted cards!' +
        (saveResult.rejected > 0 ? ' (' + saveResult.rejected + ' failed)' : ''),
        'var(--accent-green, #44ff88)'
      );
      convertBtn.disabled = false;
      _parsedCards = null;

    } catch (e) {
      setStatus('Error: ' + (e.message || String(e)), 'var(--accent-red, #ff4466)');
      convertBtn.disabled = false;
      showProgress(false);
      if (_dependencies && _dependencies.reportError) {
        _dependencies.reportError(e, { system: 'ankiimport', operation: 'convertWithBackend' });
      }
    }
  });

  // Raw Import button
  rawImportBtn.addEventListener('click', async function () {
    try {
      setStatus('Loading cards...');
      var cardResult = await getCards();

      if (!cardResult.cards || cardResult.cards.length === 0) {
        setStatus(
          cardResult.warnings.length > 0 ? cardResult.warnings[0] : 'No cards found.',
          'var(--accent-red, #ff4466)'
        );
        return;
      }

      rawImportBtn.disabled = true;

      var result = importRaw(cardResult.cards);

      setStatus(
        '✅ Imported ' + result.imported + ' flashcard-only cards!' +
        (result.rejected > 0 ? ' (' + result.rejected + ' skipped)' : '') +
        ' These cards are available in Flashcard mode.',
        'var(--accent-green, #44ff88)'
      );
      rawImportBtn.disabled = false;
      _parsedCards = null;

      if (result.warnings.length > 0) {
        console.warn('[Anki Import] Import warnings:', result.warnings);
      }

    } catch (e) {
      setStatus('Error: ' + (e.message || String(e)), 'var(--accent-red, #ff4466)');
      rawImportBtn.disabled = false;
      if (_dependencies && _dependencies.reportError) {
        _dependencies.reportError(e, { system: 'ankiimport', operation: 'importRaw' });
      }
    }
  });
}

// ===== EXPORTS =====

export var ankiImport = {
  parseDelimitedText: parseDelimitedText,
  parseApkg: parseApkg,
  importRaw: importRaw,
  convertWithBackend: convertWithBackend,
  mount: mount,
  unmount: unmount
};
