/**
 * cardhub.js — the app's view of the card database, loaded on demand.
 *
 * The built-in cards are about 2.6 MB (740 KB compressed). Loading them at
 * startup delays the first screen, so the app imports them here in the
 * background right after the first paint. Until they arrive, CARDS is empty;
 * anything that needs questions calls loadCards() (or waits for the
 * "buzzword:cards-ready" event).
 *
 * CARDS, CARD_BY_ID and BUILT_IN_CARD_POOL_HASH are live bindings: importing
 * modules see the filled-in values as soon as loadCards() resolves.
 */

export { SUBJECTS, EXAM_FILTERS, QUESTION_TYPES, SOURCE_DISCIPLINES, CONTENT_VERSION } from './cardmeta.js';

import { FREE_CARD_IDS } from './freecards.js';

/**
 * CARDS is the cards this player can play: all of them, or the 300 free ones until the library is unlocked (see pro.js).
 * It is one array that is changed in place, so every module holding it sees the change. CARD_BY_ID always holds every
 * card (so a card seen before, a shared challenge, a review of old answers still resolve).
 */
export var CARDS = [];
export var CARD_BY_ID = new Map();
export var BUILT_IN_CARD_POOL_HASH = '';

var _promise = null;
var _ready = false;
var _all = [];
var _unlocked = true;

function refilter() {
  CARDS.length = 0;
  for (var i = 0; i < _all.length; i++) if (_unlocked || FREE_CARD_IDS.has(_all[i].id)) CARDS.push(_all[i]);
}

/**
 * Open or close the full library. Call with false to limit CARDS to the free set.
 * @param {boolean} unlocked
 */
export function setLibraryUnlocked(unlocked) {
  var next = !!unlocked;
  if (next === _unlocked && _ready) return;
  _unlocked = next;
  refilter();
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('buzzword:cards-ready'));
}

/** The free cards only: what shared games (the daily, challenges, Versus, Gauntlet) are dealt from, so everyone has the same. */
export function seededPool() {
  return _all.filter(function (c) { return FREE_CARD_IDS.has(c.id); });
}

/** How many cards exist, and how many of them are free. */
export function libraryCounts() { return { total: _all.length, free: FREE_CARD_IDS.size, playable: CARDS.length }; }

export function isFreeCard(id) { return FREE_CARD_IDS.has(id); }

/** @returns {Promise<void>} resolves once every built-in card is loaded (idempotent) */
export function loadCards() {
  if (!_promise) {
    _promise = import('./cards.js').then(function (m) {
      _all = m.CARDS;
      CARD_BY_ID = m.CARD_BY_ID;
      BUILT_IN_CARD_POOL_HASH = m.BUILT_IN_CARD_POOL_HASH;
      refilter();
      _ready = true;
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('buzzword:cards-ready'));
    }).catch(function (e) {
      _promise = null; // allow a retry (for example after a network error)
      throw e;
    });
  }
  return _promise;
}

export function areCardsReady() {
  return _ready;
}
