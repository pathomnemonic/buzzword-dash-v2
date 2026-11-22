/**
 * opendecks.js — "Open decks": ready-made decks the player adds with one tap.
 *
 * Every deck is a same-origin static file under /decks/ (see docs/OPEN-DECKS.md, deck format 1) whose licence allows
 * redistribution, so there is no login, no CORS and no third-party request. Adding a deck goes through the same
 * customCards.upsertMany path as an Anki import: cards keep their id and study history when a deck is updated, and
 * removing a deck removes exactly its cards. Plain functions with injected dependencies, so tests use a fake fetch.
 */

import { OPEN_DECKS_INTRO } from './importguide.js';

export { OPEN_DECKS_INTRO };

var INDEX_URL = 'decks/index.json';
var MAX_DECK_BYTES = 8 * 1024 * 1024;
var VERSION_KEY = 'dx_opendecks_versions';

/** A one-line attribution shown on each card: "Source: OpenStax A&P (1st ed.), CC BY 4.0". */
export function sourceLine(deck) {
  return deck.source + ', ' + (deck.licence && deck.licence.name ? deck.licence.name : 'open licence');
}

function friendly(err, what) {
  var offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (err && err.code === 'cancelled') return 'Cancelled.';
  if (err && err.code === 'http') return 'The server answered ' + err.status + ' for ' + what + '. Try again in a minute.';
  if (err && err.code === 'format') return 'That ' + what + ' file is not in a format this version of the app understands. Update the app and try again.';
  if (offline || (err && /fetch|network|load failed|failed to/i.test(String(err.message || err)))) return 'No connection right now. Open decks need to be downloaded once; connect and try again.';
  return 'Could not get ' + what + ': ' + ((err && err.message) || String(err));
}

function fail(code, message, extra) {
  var e = new Error(message);
  e.code = code;
  if (extra) Object.assign(e, extra);
  return e;
}

async function getJson(fetchFn, url, o) {
  if (o && o.isCancelled && o.isCancelled()) throw fail('cancelled', 'cancelled');
  var res = await fetchFn(url, { cache: 'no-cache', signal: o && o.signal });
  if (!res || !res.ok) throw fail('http', 'HTTP ' + (res && res.status), { status: res && res.status });
  var len = Number(res.headers && res.headers.get && res.headers.get('content-length')) || (o && o.expectedBytes) || 0;
  var text;
  if (res.body && res.body.getReader && o && o.onProgress) {
    // read in pieces so the progress bar moves and Cancel works mid-download
    var reader = res.body.getReader();
    var chunks = [];
    var got = 0;
    for (;;) {
      if (o.isCancelled && o.isCancelled()) { try { await reader.cancel(); } catch (e) { /* closing */ } throw fail('cancelled', 'cancelled'); }
      var step = await reader.read();
      if (step.done) break;
      chunks.push(step.value);
      got += step.value.length;
      if (got > MAX_DECK_BYTES) throw fail('format', 'too large');
      o.onProgress(got, len || got);
    }
    var all = new Uint8Array(got);
    var at = 0;
    chunks.forEach(function (c) { all.set(c, at); at += c.length; });
    text = new TextDecoder('utf-8').decode(all);
  } else {
    text = await res.text();
    if (o && o.onProgress) o.onProgress(text.length, text.length);
  }
  if (text.length > MAX_DECK_BYTES) throw fail('format', 'too large');
  try { return JSON.parse(text); } catch (e) { throw fail('format', 'not JSON'); }
}

/**
 * The list of decks on offer.
 * @returns {Promise<{ok: boolean, decks: object[], error: string}>}
 */
export async function loadIndex(fetchFn, o) {
  try {
    var idx = await getJson(fetchFn, (o && o.base || '') + INDEX_URL, o);
    if (!idx || idx.format !== 1 || !Array.isArray(idx.decks)) throw fail('format', 'index');
    var decks = idx.decks.filter(function (d) { return d && /^[a-z0-9-]{3,40}$/.test(d.id) && d.title && d.count > 0; });
    return { ok: true, decks: decks, error: '' };
  } catch (e) {
    return { ok: false, decks: [], error: friendly(e, 'the list of decks') };
  }
}

/** Validate a downloaded deck and turn it into the inputs customCards.upsertMany takes. */
export function deckToInputs(deck) {
  if (!deck || deck.format !== 1 || !/^[a-z0-9-]{3,40}$/.test(deck.id || '') || !Array.isArray(deck.cards)) throw fail('format', 'deck');
  var attr = sourceLine(deck);
  var inputs = [];
  deck.cards.forEach(function (c) {
    if (!c || !Array.isArray(c.bw) || !c.ans || !Array.isArray(c.d) || c.d.length !== 2 || !c.key) return;
    inputs.push({
      subject: c.subj, buzzwords: c.bw, answer: c.ans, distractors: c.d, teachingPoint: c.tp || '',
      whyWrong1: (c.ww && c.ww[c.d[0]]) || '', whyWrong2: (c.ww && c.ww[c.d[1]]) || '',
      tags: c.tags || [], key: c.key, deck: deck.id, attr: attr, sref: c.source_ref || '', discipline: deck.discipline || ''
    });
  });
  return inputs;
}

function readVersions() {
  try { return JSON.parse(localStorage.getItem(VERSION_KEY) || '{}') || {}; } catch (e) { return {}; }
}
function writeVersion(id, version) {
  try {
    var v = readVersions();
    if (version) v[id] = version; else delete v[id];
    localStorage.setItem(VERSION_KEY, JSON.stringify(v));
  } catch (e) { /* private window: the list still works from the cards themselves */ }
}

/** What is in My Cards from each deck: {id: {count, version}}. */
export function installed(customCards) {
  var out = {};
  var vers = readVersions();
  customCards.getAll().forEach(function (c) {
    if (!c.deck) return;
    var e = out[c.deck] || (out[c.deck] = { count: 0, version: vers[c.deck] || '' });
    e.count++;
  });
  return out;
}

/** Download one deck file (it is not added until addDeck). */
export async function fetchDeck(entry, o) {
  var progress = o.onProgress || function () {};
  var deck = await getJson(o.fetchFn, (o.base || '') + 'decks/' + entry.file, {
    isCancelled: o.isCancelled, expectedBytes: entry.size,
    onProgress: function (d, n) { progress('download', d, n); }
  });
  if (deck.id !== entry.id) throw fail('format', 'deck id');
  return deck;
}

/** fetchDeck that never throws: {deck, error, cancelled}. */
export async function getDeck(entry, o) {
  try { return { deck: await fetchDeck(entry, o), error: '', cancelled: false }; } catch (e) {
    return { deck: null, cancelled: !!(e && e.code === 'cancelled'), error: e && e.code === 'cancelled' ? 'Cancelled.' : friendly(e, 'this deck') };
  }
}

/** Records the tag-filter panel (ankifilterui) shows for a deck: {front, back, teach, tags, key}. */
export function deckRecords(deck) {
  return deck.cards.map(function (c) { return { front: c.bw.join(' \u2022 '), back: c.ans, teach: c.tp || '', tags: c.tags || [], key: c.key }; });
}

/**
 * Download one deck and add it to My Cards (or update it in place).
 * @param {object} entry its row of index.json
 * @param {{deck?: object, only?: Set<string>, customCards: object, fetchFn: function, base?: string, onProgress?: function(string, number, number), isCancelled?: function(): boolean}} o
 * @returns {Promise<{ok: boolean, cancelled: boolean, error: string, imported: number, updated: number, unchanged: number, removed: number, rejected: number, warnings: string[]}>}
 */
export async function addDeck(entry, o) {
  var res = { ok: false, cancelled: false, error: '', imported: 0, updated: 0, unchanged: 0, removed: 0, rejected: 0, warnings: [] };
  var progress = o.onProgress || function () {};
  try {
    var deck = o.deck || await fetchDeck(entry, o);
    var inputs = deckToInputs(deck);
    if (!inputs.length) throw fail('format', 'deck');
    if (o.only) inputs = inputs.filter(function (i) { return o.only.has(i.key); }); // (a chosen part of the deck: nothing else is touched)
    if (!inputs.length) throw fail('format', 'deck');
    var up = await o.customCards.upsertMany(inputs, {
      isCancelled: o.isCancelled,
      onProgress: function (d, n, phase) { progress(phase === 'save' ? 'save' : 'prepare', d, n); }
    });
    if (up.cancelled) { res.cancelled = true; res.error = 'Cancelled. Nothing was added.'; return res; }
    if (!up.saved) { res.error = (up.warnings && up.warnings[0]) || 'Your browser could not save the cards, so nothing was added.'; res.warnings = up.warnings; return res; }
    // cards of an earlier version that this version no longer has
    var keep = new Set(inputs.map(function (i) { return i.key; }));
    res.removed = o.only ? 0 : o.customCards.removeWhere(function (c) { return c.deck === deck.id && !keep.has(c.ak); });
    res.imported = up.added; res.updated = up.updated; res.unchanged = up.unchanged; res.rejected = up.rejected; res.warnings = up.warnings || [];
    res.ok = up.added + up.updated + up.unchanged > 0;
    if (res.ok) writeVersion(deck.id, deck.version);
    if (!res.ok) res.error = res.warnings[0] || 'No cards could be added.';
    return res;
  } catch (e) {
    if (e && e.code === 'cancelled') { res.cancelled = true; res.error = 'Cancelled. Nothing was added.'; return res; }
    res.error = friendly(e, 'this deck');
    return res;
  }
}

/** Remove a deck: exactly its cards go, nothing else. @returns {number} how many cards were removed */
export function removeDeck(id, customCards) {
  var n = customCards.removeWhere(function (c) { return c.deck === id; });
  writeVersion(id, '');
  return n;
}

/** Credits for every deck on offer (CC BY needs these to be visible): [{title, source, licence, attribution, url}] */
export function credits(decks) {
  return decks.map(function (d) {
    return { title: d.title, source: d.source, licence: d.licence, attribution: d.attribution, url: d.url, author: d.author || '' };
  });
}

/** Human size: "249 KB". */
export function fmtSize(bytes) {
  return bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB';
}
