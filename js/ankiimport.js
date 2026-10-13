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

import { requireGate } from './pro.js';
import { applyProLock } from './proui.js';
import { track } from './analytics/index.js';
import { IMPORT_PATHS, FORMAT_HELP, FORMAT_EXAMPLE, buildAiPrompt, parseAiReply, POPULAR_DECKS, POPULAR_DECK_STEPS, NO_AUTO_DOWNLOAD } from './importguide.js';
import { copyText, openExternal } from './platform.js';
import { renderFilterPanel } from './ankifilterui.js';
import { renderOpenDecks } from './opendecksui.js';
import { guessSubject } from './ankitags.js';
import { stripHtml, hashKey, splitTags, noteRecords, clozeCards, parseCloze, isMediaOnly } from './ankinotes.js';
import { readApkg, friendlyApkgMessage, MAX_PARSED_CARDS } from './apkgparse.js';
import { startApkgRead } from './apkgclient.js';

// ===== LIMITS =====
var MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024 * 1024; // 4 GB: only the collection inside is read, so media does not count against memory
var MAX_DELIMITED_TEXT_LENGTH = 10 * 1024 * 1024; // 10 MB pasted
var MAX_DELIMITED_FILE_BYTES = 80 * 1024 * 1024;  // 80 MB for a text export read from a file
var MAX_CARDS_PER_IMPORT = 5000; // what importRaw takes when the caller does not say otherwise

// ===== STATE =====
var _mounted = false;
var _containerEl = null;
var _dependencies = null;
var _parsedCards = null;
var _abortController = null;
var _readJob = null; // the .apkg being read right now (see apkgclient.js)
var _openDecks = null; // the Open decks list (see opendecksui.js)

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

  var maxLength = options.maxLength || MAX_DELIMITED_TEXT_LENGTH;
  if (text.length > maxLength) {
    return { cards: [], warnings: ['Text exceeds maximum size limit of ' + Math.round(maxLength / 1024 / 1024) + ' MB.'] };
  }

  text = stripBOM(text);

  // Anki's "Notes in Plain Text" export starts with lines like "#separator:tab", "#html:true", "#guid column:1".
  var directives = {};
  var lines = text.split(/\r\n|\n|\r/);
  var skip = 0;
  while (skip < lines.length && /^#/.test(lines[skip])) {
    // "#separator:tab" style settings are read; any other "# comment" line is just skipped
    var dm = /^#([a-z ]+):(.*)$/i.exec(lines[skip]);
    if (dm) directives[dm[1].trim().toLowerCase()] = dm[2].trim();
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
    // A tab on the first non-empty line means a TSV (clinical text is full of commas, so counting them would guess wrong)
    var firstLine = (text.split(/\r\n|\n|\r/).find(function (l) { return l.trim() !== ''; })) || '';
    if (firstLine.indexOf('\t') >= 0) delimiter = '\t';
    else {
      var firstChunk = text.substring(0, Math.min(text.length, 2000));
      var tabCount = 0;
      var commaCount = 0;
      for (var ci = 0; ci < firstChunk.length; ci++) {
        if (firstChunk[ci] === '\t') tabCount++;
        if (firstChunk[ci] === ',') commaCount++;
      }
      delimiter = tabCount >= commaCount ? '\t' : ',';
    }
  }

  var frontCol = typeof options.frontColumn === 'number' ? options.frontColumn : 0;
  var backCol = typeof options.backColumn === 'number' ? options.backColumn : 1;

  // Parse into rows of fields using RFC 4180-style state machine
  var rows = _parseCSVRows(text, delimiter, warnings);

  // Note type names (when the export has them) tell "optional reversed" notes, whose 3rd field is just a "y" flag
  var ntIdx = parseInt(directives['notetype column'], 10) - 1;
  var twoFieldRows = rows.map(function (r) { return ntIdx >= 0 && /optional reversed|type in the answer/i.test(r[ntIdx] || ''); });

  // Anki's own GUID and tags columns: kept per row (they key re-imports and feed the tag filter) before they are dropped
  var guidIdx = parseInt(directives['guid column'], 10) - 1;
  var tagsIdx = parseInt(directives['tags column'], 10) - 1;
  var rowMeta = rows.map(function (r) {
    return { guid: guidIdx >= 0 ? (r[guidIdx] || '').trim() : '', tags: tagsIdx >= 0 ? splitTags(r[tagsIdx]) : [] };
  });

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
  var seenKeys = Object.create(null);
  function push(rec) {
    // the same note twice in one file: the first one wins
    if (rec.key && seenKeys[rec.key]) return;
    if (rec.key) seenKeys[rec.key] = true;
    cards.push(rec);
  }

  for (var ri = startRow; ri < rows.length; ri++) {
    var row = rows[ri];

    // Skip empty rows
    if (row.length === 0) continue;
    if (row.length === 1 && row[0].trim() === '') continue;

    if (row.length < minCols) {
      warnings.push('Row ' + (ri + 1) + ': expected at least ' + minCols + ' columns, got ' + row.length + '. Skipped.');
      continue;
    }
    var meta = rowMeta[ri] || { guid: '', tags: [] };

    // Cloze text ({{c1::answer}}) in a plain export: one card per cloze, like the .apkg importer
    if (/\{\{c\d+::/i.test(row[frontCol] || '')) {
      var nr = noteRecords(row.slice(frontCol), { guid: meta.guid, tags: meta.tags });
      if (nr.records.length) { nr.records.forEach(push); continue; }
    }

    var front = row[frontCol] ? row[frontCol].trim() : '';
    var back = row[backCol] ? row[backCol].trim() : '';
    var extraCols = [];

    // If back column is not specified and there are more columns, join the non-empty ones
    // (empty columns are left out: Anki pads every note out to the note type's field count)
    if (backCol === 1 && row.length > 2 && options.backColumn === undefined) {
      extraCols = row.slice(2).filter(function (c) { return c.trim() !== ''; });
      if (!twoFieldRows[ri]) back = [back].concat(extraCols).filter(function (c) { return c !== ''; }).join(', ').trim();
      else extraCols = [];
    }

    if (stripTags) {
      front = stripHtml(front.replace(/<br\s*\/?>/gi, ' / '));
      back = stripHtml(back.replace(/<br\s*\/?>/gi, ' / '));
    }

    if (front && back && !isMediaOnly(front) && !isMediaOnly(back)) {
      push({
        front: front, back: back, teach: '', tags: meta.tags,
        guid: meta.guid, key: meta.guid || hashKey(front + '\u0001' + back),
        suspended: false, buried: false, hasExtra: extraCols.length > 0
      });
    } else if (front || back) {
      warnings.push('Row ' + (ri + 1) + ': one side is empty or only a picture/sound. Skipped.');
    }
  }

  if (cards.length > MAX_PARSED_CARDS) {
    warnings.push('Only the first ' + MAX_PARSED_CARDS + ' cards were read (found ' + cards.length + ').');
    cards = cards.slice(0, MAX_PARSED_CARDS);
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
 * Parse an .apkg / .colpkg file (Anki deck package) into importable records.
 * Only the collection database inside the ZIP is read (never the media), so the file may be several GB: see apkgzip.js.
 * Reads on the calling thread; the importer screen uses startApkgRead (a Web Worker) so the page stays responsive.
 *
 * @param {File} file - A File object (.apkg)
 * @param {{onProgress?: function(string, number, number): void, isCancelled?: function(): boolean}} [options]
 * @returns {Promise<{ cards: object[], warnings: string[] }>} on failure: no cards and one friendly sentence in warnings
 */
async function parseApkg(file, options) {
  options = options || {};
  if (!file) return { cards: [], warnings: ['No file provided.'] };
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { cards: [], warnings: ['File too large (' + (file.size / 1024 / 1024 / 1024).toFixed(1) + ' GB). Maximum is ' + Math.round(MAX_FILE_SIZE_BYTES / 1024 / 1024 / 1024) + ' GB.'] };
  }
  var cards = [];
  try {
    var stats = await readApkg(file, {
      emit: function (batch) { for (var i = 0; i < batch.length; i++) cards.push(batch[i]); },
      onProgress: options.onProgress,
      isCancelled: options.isCancelled
    });
    return { cards: stats.stub ? [] : cards, warnings: stats.warnings };
  } catch (e) {
    return { cards: [], warnings: [friendlyApkgMessage(e)] };
  }
}

// ===== RAW IMPORT (flashcard-only, no placeholder distractors) =====

/**
 * One parsed card as the input customCards takes: a flashcard-only card (Section 9.4), no distractors, so it is
 * only offered in Flashcard mode. Keeps the Anki tags, a re-import key and the subject the tags point at.
 * @returns {object|null} null when a side is empty
 */
function cardInput(card) {
  var front = (card.front || '').trim();
  var back = (card.back || '').trim();
  if (!front || !back) return null;
  var tags = Array.isArray(card.tags) ? card.tags : [];
  return {
    subject: guessSubject(tags),
    buzzwords: [front],
    answer: back,
    distractors: [],
    teachingPoint: card.teach || back,
    tags: tags,
    key: card.key || hashKey(front + '\u0001' + back),
    enabledModes: ['flashcard']
  };
}


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
  if (!requireGate('anki_import', { used: cards.length })) return { imported: 0, rejected: 0, warnings: ['Importing a deck this size needs Dx Dash Pro.'] };

  var limit = Math.min(cards.length, options.limit || MAX_CARDS_PER_IMPORT);
  var batch = [];

  for (var i = 0; i < limit; i++) {
    var card = cardInput(cards[i]);
    if (!card) {
      rejected++;
      warnings.push('Card ' + (i + 1) + ': empty front or back. Skipped.');
      continue;
    }
    batch.push(card);
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

  if (cards.length > limit) {
    warnings.push('Only the first ' + limit + ' cards were processed.');
  }

  track('anki_import', { outcome: imported > 0 ? 'ok' : 'empty', cards: imported, skipped: rejected, kind: (options && options.kind) || 'file' });
  return { imported: imported, rejected: rejected, warnings: warnings };
}

/**
 * Import the cards the player picked, in chunks (so the page stays responsive on a 30,000 card deck), reporting
 * progress. A card whose Anki guid (or text) was imported before updates that card instead of adding a copy.
 *
 * @param {object[]} cards parsed cards (see parseApkg)
 * @param {{onProgress?: function(number, number), kind?: string}} [options]
 * @returns {Promise<{imported: number, updated: number, unchanged: number, rejected: number, warnings: string[], saved: boolean, limitReached: boolean}>}
 */
async function importSelected(cards, options) {
  options = options || {};
  var empty = { imported: 0, updated: 0, unchanged: 0, rejected: 0, warnings: [], saved: true, limitReached: false, cancelled: false };
  if (!cards || !Array.isArray(cards) || cards.length === 0) return Object.assign(empty, { warnings: ['No cards to import.'] });
  if (!_dependencies || !_dependencies.customCards) return Object.assign(empty, { warnings: ['Custom cards module not available.'] });
  var customCards = _dependencies.customCards;
  if (!requireGate('anki_import', { used: cards.length })) return Object.assign(empty, { warnings: ['Importing a deck this size needs Dx Dash Pro.'] });

  var inputs = [];
  var rejected = 0;
  cards.forEach(function (c) {
    var inp = cardInput(c);
    if (inp) inputs.push(inp); else rejected++;
  });

  var res;
  if (typeof customCards.upsertMany === 'function') {
    res = await customCards.upsertMany(inputs, { onProgress: options.onProgress, isCancelled: options.isCancelled });
  } else {
    var many = customCards.addMany(inputs);
    res = { added: many.added, updated: 0, unchanged: 0, rejected: many.rejected, warnings: many.warnings, saved: true, limitReached: !!many.limitReached, cancelled: false };
  }
  var out = {
    imported: res.added, updated: res.updated, unchanged: res.unchanged, rejected: res.rejected + rejected,
    warnings: res.warnings, saved: res.saved, limitReached: res.limitReached, cancelled: !!res.cancelled
  };
  track('anki_import', { outcome: out.imported + out.updated > 0 ? 'ok' : 'empty', cards: out.imported, skipped: out.rejected, kind: options.kind || 'file' });
  return out;
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
  if (_openDecks) { try { _openDecks.destroy(); } catch (e) { /* already gone */ } _openDecks = null; }

  if (_readJob) { try { _readJob.cancel(); } catch (e) { /* already finished */ } _readJob = null; }
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

  // ----- Open decks: ready-made decks under open licences, one tap, no login (js/opendecksui.js) -----
  var openDecksHost = _el('div', { className: 'open-decks-host' });
  section.appendChild(openDecksHost);

  // ----- Popular decks: where to get them, then pick the tags you want -----
  var popular = _el('div', { className: 'anki-popular', style: { margin: '10px 0 14px' } });
  var popHead = _el('h5', { text: '\uD83D\uDCDA Import a popular deck', style: { margin: '4px 0' } });
  applyProLock(popHead, 'anki_import');
  popular.appendChild(popHead);
  popular.appendChild(_el('p', { text: 'AnKing, Zanki, Lightyear and other decks: get your copy from the official page, then choose exactly which tags to bring in.', style: muted }));
  var deckList = _el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', margin: '8px 0' } });
  POPULAR_DECKS.forEach(function (d) {
    var card = _el('div', { className: 'popular-deck', dataset: { deck: d.id }, style: { border: '1px solid rgba(187,102,255,.25)', borderRadius: '10px', padding: '8px 10px', display: 'flex', gap: '8px', alignItems: 'center' } });
    var info = _el('div', { style: { flex: '1', minWidth: '0' } });
    info.appendChild(_el('div', { text: d.name, style: { fontWeight: '700', fontSize: '13px' } }));
    info.appendChild(_el('div', { text: d.blurb, style: { fontSize: '11px', color: 'var(--text-secondary, #aaa)', lineHeight: '1.4' } }));
    info.appendChild(_el('div', { text: d.tip, style: { fontSize: '11px', color: 'var(--text-muted, #888)', lineHeight: '1.4' } }));
    card.appendChild(info);
    var open = _el('a', { className: 'btn btn-outline btn-sm', text: (d.verified ? 'Open on ' : 'Search on ') + d.site, style: { flex: 'none', textDecoration: 'none', textAlign: 'center' } });
    open.href = d.url;
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    open.setAttribute('aria-label', 'Open the official page for ' + d.name + ' on ' + d.site);
    open.addEventListener('click', function (ev) { ev.preventDefault(); openExternal(d.url); });
    card.appendChild(open);
    deckList.appendChild(card);
  });
  popular.appendChild(deckList);
  var steps = _el('ol', { style: { margin: '6px 0 8px', paddingLeft: '20px', fontSize: '12px', lineHeight: '1.6' } });
  POPULAR_DECK_STEPS.forEach(function (st) { steps.appendChild(_el('li', { text: st })); });
  popular.appendChild(steps);
  var dropZone = _el('label', { className: 'anki-dropzone', style: { display: 'block', border: '2px dashed rgba(187,102,255,.4)', borderRadius: '12px', padding: '14px', textAlign: 'center', fontSize: '12px', cursor: 'pointer', color: 'var(--text-secondary, #aaa)' } });
  dropZone.appendChild(_el('span', { text: 'Drop your .apkg, .colpkg or .txt here, or tap to choose it' }));
  var deckFile = _el('input', { type: 'file', accept: '.apkg,.colpkg,.csv,.tsv,.txt', style: { display: 'block', margin: '8px auto 0', fontSize: '12px', maxWidth: '100%' } });
  deckFile.setAttribute('aria-label', 'Choose an Anki deck export (.apkg, .colpkg, .txt)');
  dropZone.appendChild(deckFile);
  popular.appendChild(dropZone);
  var readBox = _el('div', { className: 'anki-readbox', style: { display: 'none', margin: '8px 0' } });
  var readBar = _el('progress', { style: { width: '100%' } });
  readBar.max = 100; readBar.value = 0;
  readBar.setAttribute('aria-label', 'Reading the deck');
  var readLabel = _el('div', { style: { fontSize: '12px', color: 'var(--text-secondary, #aaa)', margin: '4px 0', lineHeight: '1.5' } });
  readLabel.setAttribute('aria-live', 'polite');
  var readCancel = _el('button', { className: 'btn btn-outline btn-sm btn-block', text: 'Cancel', type: 'button' });
  readBox.appendChild(readBar); readBox.appendChild(readLabel); readBox.appendChild(readCancel);
  popular.appendChild(readBox);
  var whyNot = _el('details', { className: 'import-howto', style: { margin: '8px 0' } });
  whyNot.appendChild(_el('summary', { text: 'Why is there no automatic download?', style: { cursor: 'pointer', fontSize: '12px' } }));
  var whyList = _el('ul', { style: { margin: '6px 0 0', paddingLeft: '18px', fontSize: '11px', lineHeight: '1.5', color: 'var(--text-secondary, #aaa)' } });
  NO_AUTO_DOWNLOAD.forEach(function (t) { whyList.appendChild(_el('li', { text: t })); });
  whyNot.appendChild(whyList);
  popular.appendChild(whyNot);
  var filterHost = _el('div', { className: 'anki-filter-host' });
  popular.appendChild(filterHost);
  section.appendChild(popular);

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
  var ankiHead = _el('h5', { text: 'Or paste cards from Anki or a spreadsheet', style: { margin: '14px 0 4px' } });
  applyProLock(ankiHead, 'anki_import');
  section.appendChild(ankiHead);
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
    return { cards: [], warnings: ['Nothing to import yet. Paste your cards first, or choose a file in the box above.'] };
  }

  async function parseFileInput(file) {
    var name = file.name.toLowerCase();
    if (name.endsWith('.apkg') || name.endsWith('.colpkg')) {
      setStatus('');
      if (file.size > MAX_FILE_SIZE_BYTES) return { cards: [], warnings: ['That file is ' + (file.size / 1073741824).toFixed(1) + ' GB, more than the ' + Math.round(MAX_FILE_SIZE_BYTES / 1073741824) + ' GB this app can open. Export a smaller part of the deck from Anki.'] };
      return await readApkgFile(file);
    }
    if (file.size > MAX_DELIMITED_FILE_BYTES) return { cards: [], warnings: ['That text file is ' + Math.round(file.size / 1048576) + ' MB, more than the ' + Math.round(MAX_DELIMITED_FILE_BYTES / 1048576) + ' MB this app reads as text. Export the deck as an .apkg instead, or a smaller part of it.'] };
    setStatus('Reading ' + file.name + '…');
    await new Promise(function (r) { setTimeout(r, 0); }); // let the message paint before the (synchronous) parse
    return parseDelimitedText(await file.text(), { maxLength: MAX_DELIMITED_FILE_BYTES });
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

  var panel = null;
  function closePanel() { if (panel) { panel.destroy(); panel = null; } }

  function storeInfo() {
    var cc = _dependencies && _dependencies.customCards;
    var all = cc && typeof cc.getAll === 'function' ? cc.getAll() : [];
    var keys = Object.create(null);
    all.forEach(function (c) { if (c.ak) keys[c.ak] = true; });
    // sizes are estimated from a sample (serializing 30,000 cards just to show a number would freeze the page)
    var bytes = 0;
    try {
      var n = Math.min(all.length, 200);
      for (var i = 0; i < n; i++) bytes += JSON.stringify(all[Math.floor(i * all.length / n)]).length;
      bytes = n ? Math.round(bytes / n * all.length) : 0;
    } catch (e) { bytes = 0; }
    return {
      count: all.length, bytes: bytes, keys: keys,
      mode: cc && typeof cc.getMode === 'function' ? cc.getMode() : 'ls',
      estimate: cc && typeof cc.storageEstimate === 'function' ? cc.storageEstimate : null,
      limit: cc && cc.getLimit ? cc.getLimit() : MAX_CARDS_PER_IMPORT,
      hardLimit: cc && cc.getHardLimit ? cc.getHardLimit() : MAX_CARDS_PER_IMPORT,
      setLimit: function (n) { return cc && cc.setLimit ? cc.setLimit(n) : n; }
    };
  }

  if (_dependencies && _dependencies.customCards) {
    _openDecks = renderOpenDecks(openDecksHost, {
      customCards: _dependencies.customCards, toast: _dependencies.toast, openExternal: openExternal, storeInfo: storeInfo,
      scrollToImporter: function () { if (popular.scrollIntoView) popular.scrollIntoView({ block: 'start' }); }
    });
  }

  function showReadProgress(stage, done, total) {
    var pct = total ? Math.min(100, Math.round(done / total * 100)) : 0;
    var mb = function (b) { return (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + ' MB'; };
    var text;
    if (stage === 'open') text = 'Opening the deck…';
    else if (stage === 'unpack') { text = 'Unpacking the notes (' + mb(done) + ' of ' + mb(total) + '). The pictures and sounds are skipped.'; readBar.value = Math.round(pct * 0.3); }
    else if (stage === 'sql') text = 'Opening the notes…';
    else { text = 'Reading notes: ' + done.toLocaleString('en-US') + ' of ' + total.toLocaleString('en-US') + '…'; readBar.value = 30 + Math.round(pct * 0.7); }
    readLabel.textContent = text;
  }

  /** Read an .apkg in the background (a Web Worker where there is one) with progress and a Cancel button. */
  async function readApkgFile(file) {
    var cards = [];
    readBar.value = 0;
    readLabel.textContent = 'Opening the deck…';
    readBox.style.display = '';
    var job = startApkgRead(file, {
      onCards: function (batch) { for (var i = 0; i < batch.length; i++) cards.push(batch[i]); },
      onProgress: function (stage, done, total) { if (_mounted) showReadProgress(stage, done, total); }
    });
    _readJob = job;
    readCancel.onclick = function () { job.cancel(); };
    try {
      var stats = await job.promise;
      return { cards: stats.stub ? [] : cards, warnings: stats.warnings || [] };
    } catch (e) {
      return { cards: [], warnings: [friendlyApkgMessage(e)], cancelled: !!(e && e.code === 'cancelled') };
    } finally {
      if (_readJob === job) _readJob = null;
      readBox.style.display = 'none';
    }
  }

  /** Read a chosen or dropped file and show the tag picker for it. */
  async function openFile(file) {
    closePanel();
    try {
      var result = await parseFileInput(file);
      if (!_mounted) return;
      if (!result.cards.length) { setStatus(result.warnings[0] || 'No cards found in that file.', result.cancelled ? 'var(--accent-gold, #ffd54f)' : RED); return; }
      setStatus('');
      panel = renderFilterPanel(filterHost, {
        records: result.cards, warnings: result.warnings, title: file.name, store: storeInfo(),
        onImport: async function (picked, o) {
          var res = await importSelected(picked, { kind: 'filtered', onProgress: o.onProgress, isCancelled: o.isCancelled });
          if (res.imported + res.updated > 0 && _dependencies && _dependencies.toast) _dependencies.toast('Imported ' + res.imported + ' cards' + (res.updated ? ', refreshed ' + res.updated : '') + '.');
          return res;
        },
        onClose: closePanel
      });
      if (filterHost.scrollIntoView) filterHost.scrollIntoView({ block: 'nearest' });
    } catch (e) {
      setStatus('Could not read that file: ' + (e.message || String(e)), RED);
      if (_dependencies && _dependencies.reportError) _dependencies.reportError(e, { system: 'ankiimport', operation: 'parseFile' });
    }
  }

  deckFile.addEventListener('change', function () { if (deckFile.files && deckFile.files.length) openFile(deckFile.files[0]); });
  ['dragenter', 'dragover'].forEach(function (ev) {
    dropZone.addEventListener(ev, function (e) { e.preventDefault(); dropZone.style.borderColor = 'var(--accent-green, #44ff88)'; });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    dropZone.addEventListener(ev, function (e) { e.preventDefault(); dropZone.style.borderColor = 'rgba(187,102,255,.4)'; });
  });
  dropZone.addEventListener('drop', function (e) {
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) openFile(f);
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
      var result = await importSelected(cardResult.cards, { kind: 'paste' });
      setStatus(
        'Imported ' + result.imported + ' flashcard' + (result.imported === 1 ? '' : 's') + '.' +
        (result.updated ? ' ' + result.updated + ' refreshed.' : '') +
        (result.rejected > 0 ? ' ' + result.rejected + ' skipped.' : '') + ' Find them in Flashcard mode.' +
        (result.saved === false && result.warnings[0] ? ' ' + result.warnings[0] : ''),
        result.imported + result.updated > 0 ? GREEN : RED
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

  function topReason(reasons) {
    var keys = Object.keys(reasons || {}).sort(function (x, y) { return reasons[y] - reasons[x]; });
    return keys.length ? 'most often: ' + keys[0] : '';
  }

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
        (skipped ? ' ' + skipped + ' skipped' + (topReason(parsed.reasons) ? ' (' + topReason(parsed.reasons) + ')' : (firstErr ? ' (' + firstErr.message + ')' : '')) + '.' : '') +
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
  importSelected: importSelected,
  noteRecords: noteRecords,
  parseCloze: parseCloze,
  hashKey: hashKey,
  convertWithBackend: convertWithBackend,
  mount: mount,
  unmount: unmount
};
