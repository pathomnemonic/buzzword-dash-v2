/**
 * deckcache.js — offline copies of shared decks.
 *
 * Every deck fetched by code is kept in localStorage so it can be re-added
 * (or fetched again while offline) without touching the network.
 */

var KEY = 'buzzword_decks_v1';
var MAX_DECKS = 10;

function read() {
  try {
    var parsed = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    // keep only decks that are shaped like decks (a damaged entry must not break the list of the good ones)
    Object.keys(parsed).forEach(function (code) {
      var d = parsed[code];
      if (code === '__proto__' || !d || typeof d !== 'object' || Array.isArray(d) || !Array.isArray(d.cards)) delete parsed[code];
      else if (typeof d.savedAt !== 'number' || !isFinite(d.savedAt)) d.savedAt = 0;
    });
    return parsed;
  } catch (e) {
    return {};
  }
}

function write(all) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
    return true;
  } catch (e) {
    return false; // storage full or unavailable
  }
}

/** @returns {{code: string, name: string, count: number, savedAt: number}[]} newest first */
export function listDecks() {
  var all = read();
  return Object.keys(all).map(function (code) {
    return { code: code, name: all[code].name, count: (all[code].cards || []).length, savedAt: all[code].savedAt || 0 };
  }).sort(function (a, b) { return b.savedAt - a.savedAt; });
}

/** @returns {{name: string, cards: object[]}|null} */
export function getDeck(code) {
  var entry = read()[String(code || '').toUpperCase()];
  return entry && Array.isArray(entry.cards) ? { name: entry.name, cards: entry.cards } : null;
}

/**
 * Save (or refresh) a deck. Keeps the newest MAX_DECKS.
 * @returns {boolean} false if it could not be stored
 */
export function saveDeck(code, name, cards) {
  if (!code || !Array.isArray(cards) || cards.length === 0) return false;
  var all = read();
  all[String(code).toUpperCase()] = { name: String(name || 'Deck').slice(0, 60), cards: cards, savedAt: Date.now() };
  var keys = Object.keys(all).sort(function (a, b) { return all[b].savedAt - all[a].savedAt; });
  keys.slice(MAX_DECKS).forEach(function (k) { delete all[k]; });
  return write(all);
}

export function removeDeck(code) {
  var all = read();
  delete all[String(code || '').toUpperCase()];
  write(all);
}
