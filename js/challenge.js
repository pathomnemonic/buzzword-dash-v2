/**
 * challenge.js — async challenges shared as links.
 *
 * A challenge is a seeded set of cards plus the sender's score. It travels in
 * the URL hash (#c=...), so no server is needed: the friend opens the link,
 * plays the same cards in the same order, and compares scores.
 */

export var CHALLENGE_SIZE = 15;
var MAX_NAME = 30;

function toBase64Url(text) {
  var bytes = new TextEncoder().encode(text);
  var bin = '';
  for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  var b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  var bin = atob(b64);
  var bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** @returns {number} a fresh non-zero seed */
export function newChallengeSeed() {
  return Math.floor(Math.random() * 2147483646) + 1;
}

/**
 * Encode a challenge for sharing.
 * @param {{seed: number, n: number, from: string, score: number, hash: string}} challenge
 * @returns {string} URL-safe token
 */
export function encodeChallenge(challenge) {
  return toBase64Url(JSON.stringify({
    v: 1,
    s: challenge.seed,
    n: challenge.n || CHALLENGE_SIZE,
    f: String(challenge.from || '').slice(0, MAX_NAME),
    c: Math.max(0, Math.floor(challenge.score || 0)),
    h: String(challenge.hash || '')
  }));
}

/**
 * Decode and validate a token. Never trusts its contents: every field is
 * type- and range-checked, and the name is treated as plain text.
 * @param {string} token
 * @returns {{seed: number, n: number, from: string, score: number, hash: string}|null}
 */
export function decodeChallenge(token) {
  try {
    var o = JSON.parse(fromBase64Url(String(token)));
    if (!o || o.v !== 1) return null;
    if (!Number.isInteger(o.s) || o.s < 1 || o.s > 2147483646) return null;
    if (!Number.isInteger(o.n) || o.n < 5 || o.n > 40) return null;
    if (!Number.isInteger(o.c) || o.c < 0 || o.c > 10000000) return null;
    return {
      seed: o.s,
      n: o.n,
      from: typeof o.f === 'string' ? o.f.slice(0, MAX_NAME) : '',
      score: o.c,
      hash: typeof o.h === 'string' ? o.h.slice(0, 16) : ''
    };
  } catch (e) {
    return null;
  }
}

/** Build the full shareable URL. */
export function buildChallengeUrl(base, challenge) {
  return base.split('#')[0] + '#c=' + encodeChallenge(challenge);
}

/** Read a challenge from a location hash like "#c=abc". */
export function parseChallengeHash(hash) {
  var m = /^#c=([A-Za-z0-9_-]+)$/.exec(hash || '');
  return m ? decodeChallenge(m[1]) : null;
}

// ===== Weekly Gauntlet (the mode id is still 'tournament') =====

export var TOURNAMENT_SIZE = 30;

/**
 * ISO week key in UTC, e.g. "2026-W40". Matches the server's season key.
 * @param {Date} [date]
 * @returns {string}
 */
export function isoWeekKey(date) {
  var now = date || new Date();
  var d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  var day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  var week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return d.getUTCFullYear() + '-W' + (week < 10 ? '0' : '') + week;
}

/**
 * Deterministic seed for a week's tournament: everyone gets the same cards.
 * @param {string} weekKey
 * @returns {number} integer in [1, 2147483646]
 */
export function tournamentSeed(weekKey) {
  var text = 'buzzword-tournament-' + weekKey;
  var h = 2166136261;
  for (var i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 2147483646) + 1;
}
