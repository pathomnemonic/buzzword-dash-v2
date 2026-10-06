/**
 * attribution.js — where an install came from, for marketing.
 *
 * The first time the app opens, the link it was opened with (campaign tags, the page that sent the visitor, a
 * share link from another player) is kept as the install's first touch. Later opens from a new source update the
 * last touch. Only the campaign tags, the sending site's host name and whether an ad click id was present are kept:
 * never the full link, never the click id itself.
 *
 * Share links the app makes carry a short referral code (a one-way hash of the sharer's install id), so a new
 * install can be traced back to the player whose share brought it.
 */

var KEY_FIRST = 'dx_an_first';
var KEY_LAST = 'dx_an_last';

var CLICK_IDS = ['gclid', 'gbraid', 'wbraid', 'fbclid', 'ttclid', 'msclkid', 'twclid', 'dclid', 'li_fat_id', 'epik', 'rdt_cid', 'scid'];
var SOCIAL = /(^|\.)(facebook|instagram|twitter|x|t|reddit|tiktok|youtube|youtu|linkedin|lnkd|discord|pinterest|snapchat|whatsapp|wa|telegram|t\.me|threads|tumblr|mastodon|bsky)\.(com|co|be|me|ee|in|app|social)$/i;
var SEARCH = /(^|\.)(google|bing|duckduckgo|ecosia|yahoo|baidu|yandex|brave|startpage|qwant|kagi)\./i;
var PAID_MEDIUM = /^(cpc|ppc|paid|paidsocial|paid_social|paidsearch|display|cpm|cpv|retargeting|banner|affiliate)$/i;

function clean(v, max) {
  return String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9._\-~ %+:/]/g, '').slice(0, max);
}

/** The host name of a referrer link, without www, or '' for none. */
export function hostOf(url) {
  var m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#:]+)/i.exec(String(url || ''));
  return m ? m[1].toLowerCase().replace(/^www\./, '').slice(0, 60) : '';
}

/** How the visit is grouped for marketing reports. */
export function channelOf(t) {
  if (t.share_ref || t.utm_source === 'dxdash_share') return 'share';
  if (t.utm_medium && PAID_MEDIUM.test(t.utm_medium)) return 'paid';
  if (t.has_click_id) return 'paid';
  if (t.utm_medium === 'email' || t.utm_medium === 'newsletter' || t.utm_source === 'email') return 'email';
  if (t.utm_medium === 'social' || t.utm_medium === 'organic_social') return 'social';
  if (t.utm_medium === 'organic' || t.utm_medium === 'search') return 'search';
  if (t.utm_source || t.utm_medium || t.utm_campaign) return 'campaign';
  if (t.referrer_host) {
    if (SOCIAL.test(t.referrer_host)) return 'social';
    if (SEARCH.test(t.referrer_host)) return 'search';
    return 'referral';
  }
  return 'direct';
}

/**
 * Read a touch from the link the app was opened with.
 * @param {string} search the query string, e.g. "?utm_source=reddit&utm_campaign=launch"
 * @param {string} referrer document.referrer
 * @param {{path?: string, ownHost?: string, platform?: string}} [opts]
 * @returns {object} { utm_*, referrer_host, has_click_id, share_ref, landing, channel }
 */
export function parseTouch(search, referrer, opts) {
  opts = opts || {};
  var params = {};
  String(search || '').replace(/^\?/, '').split('&').forEach(function (pair) {
    if (!pair) return;
    var i = pair.indexOf('=');
    var k = decodeURIComponent((i < 0 ? pair : pair.slice(0, i)).replace(/\+/g, ' ')).toLowerCase();
    var v = i < 0 ? '' : pair.slice(i + 1).replace(/\+/g, ' ');
    try { v = decodeURIComponent(v); } catch (e) { /* keep it raw */ }
    if (!(k in params)) params[k] = v;
  });
  var host = hostOf(referrer);
  if (host && opts.ownHost && host === String(opts.ownHost).toLowerCase().replace(/^www\./, '')) host = ''; // our own site is not a source
  var touch = {
    utm_source: clean(params.utm_source || params.src || '', 40),
    utm_medium: clean(params.utm_medium, 40),
    utm_campaign: clean(params.utm_campaign, 60),
    utm_content: clean(params.utm_content, 60),
    utm_term: clean(params.utm_term, 60),
    referrer_host: host,
    has_click_id: CLICK_IDS.some(function (id) { return params[id] !== undefined; }),
    share_ref: clean(params.r || params.ref || '', 16).replace(/[^a-z0-9]/g, ''),
    landing: String(opts.path || '').slice(0, 40)
  };
  if (opts.platform === 'android' || opts.platform === 'ios') { touch.utm_source = touch.utm_source || 'store'; }
  touch.channel = channelOf(touch);
  return touch;
}

function read(store, key) {
  try { var raw = store.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}
function write(store, key, value) {
  try { store.setItem(key, JSON.stringify(value)); } catch (e) { /* storage full: the touch is still used this session */ }
}

/** True when the touch carries any marketing information. */
export function isMarketingTouch(t) {
  return !!(t && (t.utm_source || t.utm_medium || t.utm_campaign || t.referrer_host || t.share_ref || t.has_click_id));
}

/**
 * Record this visit's touch. The first one is kept for ever as the first touch; a visit that has a source of its own
 * becomes the last touch.
 * @returns {{first: object, last: object, isFirst: boolean}}
 */
export function recordTouch(store, touch, now) {
  var first = read(store, KEY_FIRST);
  var isFirst = false;
  if (!first) { first = Object.assign({ at: now }, touch); write(store, KEY_FIRST, first); isFirst = true; }
  var last = read(store, KEY_LAST) || first;
  if (isFirst || isMarketingTouch(touch)) { last = Object.assign({ at: now }, touch); write(store, KEY_LAST, last); }
  return { first: first, last: last, isFirst: isFirst };
}

export function firstTouch(store) { return read(store, KEY_FIRST); }
export function lastTouch(store) { return read(store, KEY_LAST); }

/** The code other players' links carry for this install: 10 hex characters of a one-way hash. */
export function refCodeFor(installId) {
  // FNV-1a twice with different seeds: not a security measure, just a stable short code that does not reveal the id
  function fnv(str, seed) {
    var h = seed >>> 0;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return ('00000000' + h.toString(16)).slice(-8);
  }
  var id = String(installId || '');
  return (fnv(id, 2166136261) + fnv(id + '#', 374761393)).slice(0, 10);
}

/**
 * Add the campaign tags and referral code to a link the app is about to share.
 * @param {string} url
 * @param {{kind?: string, refCode?: string}} [o]
 */
export function decorateShareUrl(url, o) {
  o = o || {};
  var base = String(url || '');
  var hashAt = base.indexOf('#');
  var hash = hashAt >= 0 ? base.slice(hashAt) : '';
  if (hashAt >= 0) base = base.slice(0, hashAt);
  var params = ['utm_source=dxdash_share', 'utm_medium=' + encodeURIComponent(String(o.kind || 'share').replace(/[^a-z0-9_]/gi, '')), 'utm_campaign=viral'];
  if (o.refCode) params.push('r=' + encodeURIComponent(o.refCode));
  var joiner = base.indexOf('?') >= 0 ? (/[?&]$/.test(base) ? '' : '&') : '?';
  return base + joiner + params.join('&') + hash;
}
