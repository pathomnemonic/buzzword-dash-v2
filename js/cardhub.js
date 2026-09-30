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

export var CARDS = [];
export var CARD_BY_ID = new Map();
export var BUILT_IN_CARD_POOL_HASH = '';

var _promise = null;
var _ready = false;

/** @returns {Promise<void>} resolves once every built-in card is loaded (idempotent) */
export function loadCards() {
  if (!_promise) {
    _promise = import('./cards.js').then(function (m) {
      CARDS = m.CARDS;
      CARD_BY_ID = m.CARD_BY_ID;
      BUILT_IN_CARD_POOL_HASH = m.BUILT_IN_CARD_POOL_HASH;
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
