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

import { IMPORT_PATHS, FORMAT_HELP, FORMAT_EXAMPLE, buildAiPrompt, parseAiReply } from './importguide.js';
import { copyText } from './platform.js';

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

// ===== LIBRARIES (bundled, loaded only when an .apkg is imported, so they also work offline) =====

async function loadJSZip() {
  var mod = await import('jszip');
  return mod.default || mod;
}

async function loadSqlJs() {
  var mods = await Promise.all([import('sql.js'), import('sql.js/dist/sql-wasm.wasm?url')]);
  var init = mods[0].default || mods[0];
  var wasmUrl = mods[1].default;
  return init({ locateFile: function () { return wasmUrl; } });
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
  var text = html.replace(/\[sound:[^\]]*\]/gi, ' ').replace(/<[^>]*>/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&#x27;|&apos;/g, "'");
  text = text.replace(/\s+/g, ' ');
  return text.trim();
}

/** A side that is only a picture or sound placeholder ("[image]", empty after tags are removed) cannot be studied as text. */
function isMediaOnly(text) {
  var t = String(text || '').trim();
  return t === '' || /^\[?\s*(image|img|picture|photo|audio|sound|video)[^\]a-z]*\]?$/i.test(t);
}

// ===== CLOZE NOTES ({{c1::answer::hint}}) =====

/**
 * Turn a cloze note into one card per cloze number: the front hides that number's answer as [...] (or
 * [hint]) while the other clozes are shown, and the back is the answer, with the note's extra field.
 * @param {string[]} fields the note's fields
 * @returns {Array<{front: string, back: string}>|null} null when the note has no cloze
 */
function clozeCards(fields) {
  var text = fields[0] || '';
  var re = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;
  var nums = [];
  var m;
  while ((m = re.exec(text))) { if (nums.indexOf(m[1]) < 0) nums.push(m[1]); }
  if (!nums.length) return null;
  var extra = stripHtml(fields[1] || '');
  var out = [];
  nums.forEach(function (n) {
    var answers = [];
    var front = text.replace(/\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g, function (all, num, ans, hint) {
      if (num === n) { answers.push(stripHtml(ans)); return '[' + (hint ? stripHtml(hint) : '...') + ']'; }
      return ans;
    });
    var back = answers.join(', ');
    if (extra) back += ' (' + extra + ')';
    front = stripHtml(front);
    if (front && back) out.push({ front: front, back: back });
  });
  return out;
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

  // Anki's "Notes in Plain Text" export starts with lines like "#separator:tab", "#html:true", "#guid column:1".
  var directives = {};
  var lines = text.split(/\r\n|\n|\r/);
  var skip = 0;
  while (skip < lines.length && /^#[a-z ]+:/i.test(lines[skip])) {
    var dm = /^#([a-z ]+):(.*)$/i.exec(lines[skip]);
    directives[dm[1].trim().toLowerCase()] = dm[2].trim();
    skip++;
  }
  if (skip > 0) text = lines.slice(skip).join('\n');
  var sep = directives.separator;
  var sepMap = { tab: '\t', comma: ',', semicolon: ';', space: ' ', pipe: '|' };
  var delimiter = options.delimiter || (sep && sepMap[sep.toLowerCase()]) || null;
  var stripTags = directives.html === 'true' || /<(br|div|b|i|u|span|p|sub|sup|img|ul|ol|li)\b[^>]*>/i.test(text.slice(0, 20000));
  // Columns Anki adds that are not card content (1-based in the file).
  var metaCols = {};
  ['guid column', 'notetype column', 'deck column', 'tags column'].forEach(function (k) {
    var n = parseInt(directives[k], 10);
    if (n > 0) metaCols[n - 1] = true;
  });

  // Auto-detect delimiter if not specified
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

  // Drop Anki's GUID / note type / deck / tags columns so only the card fields are left
  if (Object.keys(metaCols).length) {
    rows = rows.map(function (r) { return r.filter(function (_, idx) { return !metaCols[idx]; }); });
  }

  // Skip a header row when asked, or when it plainly is one ("Front,Back", "Question,Answer"...)
  var startRow = options.hasHeaders ? 1 : 0;
  if (!options.hasHeaders && rows.length > 1 && rows[0].length >= 2 &&
      /^(front|question|prompt|term|q|clue|clues|buzzwords?)$/i.test(rows[0][0].trim()) &&
      /^(back|answer|a|definition|response|diagnosis)$/i.test(rows[0][1].trim())) {
    startRow = 1;
  }

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

    if (stripTags) {
      front = stripHtml(front.replace(/<br\s*\/?>/gi, ' / '));
      back = stripHtml(back.replace(/<br\s*\/?>/gi, ' / '));
    }

    // Cloze text ({{c1::answer}}) in a plain export: one card per cloze, like the .apkg importer
    if (/\{\{c\d+::/.test(front)) {
      var cz = clozeCards([front, back]);
      if (cz && cz.length) { cz.forEach(function (c) { cards.push(c); }); continue; }
    }

    if (front && back && !isMediaOnly(front) && !isMediaOnly(back)) {
      cards.push({ front: front, back: back });
    } else if (front || back) {
      warnings.push('Row ' + (ri + 1) + ': one side is empty or only a picture/sound. Skipped.');
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

  // Read the file as ArrayBuffer
  var arrayBuffer = await file.arrayBuffer();

  // Unzip with JSZip
  var JSZip = await loadJSZip();
  var zip = await JSZip.loadAsync(arrayBuffer);

  // Look for the SQLite database file inside the ZIP
  var dbFile = null;
  // collection.anki21 holds the real notes when present (collection.anki2 is then only a stand-in)
  var dbFilenames = ['collection.anki21', 'collection.anki2'];

  for (var fi = 0; fi < dbFilenames.length; fi++) {
    if (zip.files[dbFilenames[fi]]) {
      dbFile = zip.files[dbFilenames[fi]];
      break;
    }
  }

  if (!dbFile) {
    var modern = !!zip.files['collection.anki21b'];
    return {
      cards: [],
      warnings: [
        modern
          ? 'This deck was exported in the newest Anki format, which cannot be read here. In Anki choose Export, tick "Support older Anki versions", and import the new file.'
          : 'Could not find a collection in the .apkg file. Re-export it from Anki with "Support older Anki versions" ticked.'
      ]
    };
  }

  // Extract the database file as Uint8Array
  var dbData = await dbFile.async('uint8array');

  // Initialize sql.js with WASM
  var SQL = await loadSqlJs();

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
          var cloze = clozeCards(fields);
          if (cloze) {
            cloze.forEach(function (c) { results.push(c); });
          } else if (fields.length >= 2) {
            var front = stripHtml(fields[0]).trim();
            var back = stripHtml(fields[1]).trim();
            if (front && back && !isMediaOnly(front) && !isMediaOnly(back)) {
              results.push({ front: front, back: back });
            } else {
              warnings.push('A note with only a picture or sound was skipped.');
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

  // A deck exported without "Support older Anki versions" holds a single note asking you to update Anki
  if (results.length === 1 && /update to the latest anki/i.test(results[0].front + ' ' + results[0].back)) {
    results = [];
    warnings.push('This deck was exported in the newest Anki format, which cannot be read here. In Anki choose Export, tick "Support older Anki versions", and import the new file.');
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

  var limit = Math.min(cards.length, MAX_CARDS_PER_IMPORT);
  var batch = [];

  for (var i = 0; i < limit; i++) {
    var card = cards[i];
    var front = (card.front || '').trim();
    var back = (card.back || '').trim();

    if (!front || !back) {
      rejected++;
      warnings.push('Card ' + (i + 1) + ': empty front or back. Skipped.');
      continue;
    }

    // A raw flashcard-only card (Section 9.4): no distractors, so it is only offered in Flashcard mode
    batch.push({
      subject: 'Multisystem / Mixed',
      buzzwords: [front],
      answer: back,
      distractors: [],
      teachingPoint: back,
      enabledModes: ['flashcard']
    });
  }

  if (typeof customCards.addMany === 'function') {
    // One read and one write for the whole import (adding one at a time made big decks very slow)
    var many = customCards.addMany(batch);
    imported += many.added;
    rejected += many.rejected;
    many.warnings.forEach(function (w) { warnings.push(w); });
  } else {
    batch.forEach(function (cardData, idx) {
      try {
        var res = customCards.add(cardData);
        if (res && res.success === false) { rejected++; warnings.push('Card ' + (idx + 1) + ': not valid. Skipped.'); }
        else imported++;
      } catch (e) {
        rejected++;
        warnings.push('Card ' + (idx + 1) + ': failed to save \u2014 ' + (e.message || String(e)));
      }
    });
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

  while (_containerEl.firstChild) _containerEl.removeChild(_containerEl.firstChild);

  var muted = { fontSize: '12px', color: 'var(--text-secondary, #aaa)', lineHeight: '1.5' };
  var fieldStyle = {
    width: '100%', boxSizing: 'border-box', padding: '8px', borderRadius: '8px',
    background: 'rgba(20,10,50,.6)', color: 'var(--text-primary, #fff)',
    border: '1px solid rgba(187,102,255,.2)', fontSize: '12px', resize: 'vertical', fontFamily: 'inherit'
  };

  var section = _el('div', { className: 'anki-import-section' });
  section.appendChild(_el('h4', { text: '📥 Bring in your own cards' }));
  section.appendChild(_el('p', { text: 'Two ways in. Pick one; both take a minute.', style: muted }));

  // ----- How-to (always visible; the first path is open) -----
  IMPORT_PATHS.forEach(function (path, idx) {
    var details = _el('details', { className: 'import-howto', style: { margin: '8px 0' } });
    if (idx === 0) details.open = true;
    details.appendChild(_el('summary', { text: path.title, style: { cursor: 'pointer', fontWeight: '600', fontSize: '13px' } }));
    var ol = _el('ol', { style: { margin: '6px 0 0', paddingLeft: '20px', fontSize: '12px', lineHeight: '1.6' } });
    path.steps.forEach(function (st) { ol.appendChild(_el('li', { text: st })); });
    details.appendChild(ol);
    section.appendChild(details);
  });

  // ----- Path 1: flashcards -----
  section.appendChild(_el('h5', { text: 'Anki or spreadsheet cards', style: { margin: '14px 0 4px' } }));
  var fileInput = _el('input', {
    type: 'file', accept: '.apkg,.csv,.tsv,.txt',
    style: { width: '100%', marginBottom: '8px', fontSize: '12px', color: 'var(--text-primary, #fff)' }
  });
  fileInput.setAttribute('aria-label', 'Upload an Anki export or spreadsheet (.apkg, .txt, .csv, .tsv)');
  section.appendChild(fileInput);

  var pasteArea = _el('textarea', {
    rows: 5, placeholder: 'Or paste cards here: front, a tab or comma, then back. One card per line.', style: fieldStyle
  });
  pasteArea.setAttribute('aria-label', 'Paste cards, one per line');
  section.appendChild(pasteArea);

  var help = _el('ul', { style: { margin: '6px 0', paddingLeft: '18px', fontSize: '11px', lineHeight: '1.5', color: 'var(--text-secondary, #aaa)' } });
  FORMAT_HELP.forEach(function (h) { help.appendChild(_el('li', { text: h })); });
  section.appendChild(help);

  var exampleBtn = _el('button', { className: 'btn btn-outline btn-sm', text: 'Fill in an example', style: { marginBottom: '8px' } });
  exampleBtn.type = 'button';
  section.appendChild(exampleBtn);

  var previewEl = _el('div', { className: 'anki-import-preview', style: { fontSize: '12px', margin: '4px 0 8px', lineHeight: '1.5' } });
  previewEl.setAttribute('aria-live', 'polite');
  section.appendChild(previewEl);

  var rawImportBtn = _el('button', { className: 'btn btn-primary btn-block', text: 'Import as flashcards' });
  rawImportBtn.type = 'button';
  section.appendChild(rawImportBtn);
  section.appendChild(_el('p', { text: 'Flashcards show up in Flashcard mode. They do not appear as runner questions because they have no wrong answers; use the AI route below for that.', style: Object.assign({}, muted, { marginTop: '6px', fontSize: '11px' }) }));

  // ----- Path 2: quiz cards through an AI chat -----
  section.appendChild(_el('h5', { text: 'Make runner questions with an AI chat', style: { margin: '16px 0 4px' } }));
  var copyPromptBtn = _el('button', { className: 'btn btn-outline btn-block', text: '1. Copy AI prompt' });
  copyPromptBtn.type = 'button';
  section.appendChild(copyPromptBtn);
  section.appendChild(_el('p', { text: '2. Paste it into ChatGPT, Claude or Gemini, then paste your cards below it and send. 3. Copy the reply and paste it here:', style: Object.assign({}, muted, { margin: '6px 0' }) }));

  var aiArea = _el('textarea', { rows: 5, placeholder: 'Paste the AI’s reply here (the JSON).', style: fieldStyle });
  aiArea.setAttribute('aria-label', 'Paste the AI reply');
  section.appendChild(aiArea);
  var aiImportBtn = _el('button', { className: 'btn btn-primary btn-block', text: '4. Import quiz cards', style: { marginTop: '6px' } });
  aiImportBtn.type = 'button';
  section.appendChild(aiImportBtn);

  var statusEl = _el('div', {
    className: 'anki-import-status',
    style: { marginTop: '10px', fontSize: '12px', color: 'var(--text-secondary, #aaa)', textAlign: 'center', minHeight: '16px', lineHeight: '1.5' }
  });
  statusEl.setAttribute('role', 'status');
  statusEl.setAttribute('aria-live', 'polite');
  section.appendChild(statusEl);

  _containerEl.appendChild(section);

  // ===== EVENT BINDING =====

  function setStatus(msg, color) {
    statusEl.textContent = msg;
    statusEl.style.color = color || 'var(--text-secondary, #aaa)';
  }
  var RED = 'var(--accent-red, #ff4466)';
  var GREEN = 'var(--accent-green, #44ff88)';

  function showPreview(result) {
    while (previewEl.firstChild) previewEl.removeChild(previewEl.firstChild);
    if (!result || !result.cards || !result.cards.length) return;
    previewEl.appendChild(_el('div', { text: 'Found ' + result.cards.length + ' card' + (result.cards.length === 1 ? '' : 's') + '. First few:', style: { fontWeight: '600' } }));
    result.cards.slice(0, 3).forEach(function (c) {
      previewEl.appendChild(_el('div', { text: '• ' + c.front.slice(0, 70) + '  →  ' + c.back.slice(0, 50), style: { color: 'var(--text-secondary, #aaa)' } }));
    });
    if (result.warnings && result.warnings.length) {
      previewEl.appendChild(_el('div', { text: result.warnings.length + ' line' + (result.warnings.length === 1 ? ' was' : 's were') + ' skipped: ' + result.warnings[0], style: { color: 'var(--accent-gold, #ffd54f)' } }));
    }
  }

  async function getCards() {
    if (_parsedCards && _parsedCards.length > 0 && !pasteArea.value.trim()) {
      return { cards: _parsedCards, warnings: [] };
    }
    var pasteText = pasteArea.value.trim();
    if (pasteText) return parseDelimitedText(pasteText);
    if (fileInput.files && fileInput.files.length > 0) return await parseFileInput(fileInput.files[0]);
    return { cards: [], warnings: ['Nothing to import yet. Upload a file or paste your cards first.'] };
  }

  async function parseFileInput(file) {
    var name = file.name.toLowerCase();
    if (name.endsWith('.apkg')) {
      setStatus('Reading the Anki deck…');
      return await parseApkg(file);
    }
    return parseDelimitedText(await file.text());
  }

  exampleBtn.addEventListener('click', function () {
    pasteArea.value = FORMAT_EXAMPLE;
    pasteArea.dispatchEvent(new Event('input'));
  });

  var previewTimer = null;
  pasteArea.addEventListener('input', function () {
    _parsedCards = null;
    clearTimeout(previewTimer);
    previewTimer = setTimeout(function () {
      var t = pasteArea.value.trim();
      if (!t) { showPreview(null); return; }
      var r = parseDelimitedText(t);
      showPreview(r);
      if (!r.cards.length) setStatus('No cards found yet. Each line needs a front, a tab or comma, then a back.', RED);
      else setStatus('');
    }, 250);
  });

  fileInput.addEventListener('change', async function () {
    if (!fileInput.files || fileInput.files.length === 0) return;
    try {
      setStatus('Reading file…');
      var result = await parseFileInput(fileInput.files[0]);
      _parsedCards = result.cards;
      showPreview(result);
      if (result.cards.length) setStatus('Ready. Tap "Import as flashcards".', GREEN);
      else setStatus(result.warnings[0] || 'No cards found in that file.', RED);
    } catch (e) {
      _parsedCards = null;
      setStatus('Could not read that file: ' + (e.message || String(e)), RED);
      if (_dependencies && _dependencies.reportError) _dependencies.reportError(e, { system: 'ankiimport', operation: 'parseFile' });
    }
  });

  rawImportBtn.addEventListener('click', async function () {
    try {
      setStatus('Importing…');
      var cardResult = await getCards();
      if (!cardResult.cards || cardResult.cards.length === 0) {
        setStatus(cardResult.warnings.length > 0 ? cardResult.warnings[0] : 'No cards found.', RED);
        return;
      }
      rawImportBtn.disabled = true;
      var result = importRaw(cardResult.cards);
      setStatus(
        'Imported ' + result.imported + ' flashcard' + (result.imported === 1 ? '' : 's') + '.' +
        (result.rejected > 0 ? ' ' + result.rejected + ' skipped.' : '') + ' Find them in Flashcard mode.',
        result.imported > 0 ? GREEN : RED
      );
      rawImportBtn.disabled = false;
      _parsedCards = null;
      showPreview(null);
      if (result.imported > 0 && _dependencies && _dependencies.toast) _dependencies.toast('Imported ' + result.imported + ' flashcards.');
    } catch (e) {
      setStatus('Something went wrong: ' + (e.message || String(e)), RED);
      rawImportBtn.disabled = false;
      if (_dependencies && _dependencies.reportError) _dependencies.reportError(e, { system: 'ankiimport', operation: 'importRaw' });
    }
  });

  copyPromptBtn.addEventListener('click', async function () {
    var ok = await copyText(buildAiPrompt());
    if (ok) {
      setStatus('Prompt copied. Open your AI chat, paste it, then paste your cards underneath.', GREEN);
    } else {
      aiArea.value = buildAiPrompt();
      aiArea.select();
      setStatus('Could not copy automatically. The prompt is in the box below: select all, copy, then clear the box.', RED);
    }
  });

  aiImportBtn.addEventListener('click', function () {
    try {
      var parsed = parseAiReply(aiArea.value);
      if (parsed.error) { setStatus(parsed.error, RED); return; }
      if (!_dependencies || !_dependencies.customCards) { setStatus('Cards are not available right now.', RED); return; }
      var res = _dependencies.customCards.importJSON(JSON.stringify(parsed.cards));
      var skipped = parsed.skipped + res.rejectedCount;
      var firstErr = res.rejected[0] && res.rejected[0].errors && res.rejected[0].errors[0];
      setStatus(
        'Imported ' + res.importedCount + ' quiz card' + (res.importedCount === 1 ? '' : 's') + '.' +
        (skipped ? ' ' + skipped + ' skipped' + (firstErr ? ' (' + firstErr.message + ')' : '') + '.' : '') +
        (res.importedCount ? ' They are in your runs now. Skim them in My Cards.' : ''),
        res.importedCount > 0 ? GREEN : RED
      );
      if (res.importedCount > 0) {
        aiArea.value = '';
        if (_dependencies.toast) _dependencies.toast('Imported ' + res.importedCount + ' quiz cards.');
      }
    } catch (e) {
      setStatus('Something went wrong: ' + (e.message || String(e)), RED);
      if (_dependencies && _dependencies.reportError) _dependencies.reportError(e, { system: 'ankiimport', operation: 'importAiCards' });
    }
  });
}

// ===== EXPORTS =====

export var ankiImport = {
  parseDelimitedText: parseDelimitedText,
  parseApkg: parseApkg,
  clozeCards: clozeCards,
  stripHtml: stripHtml,
  importRaw: importRaw,
  convertWithBackend: convertWithBackend,
  mount: mount,
  unmount: unmount
};
