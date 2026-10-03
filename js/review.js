/**
 * review.js — asking for a store rating, in a way that works on both stores and does not depend on any one route.
 *
 * Order of attempts when a player agrees to rate:
 *   1. The store's own rating box inside the app (Google Play's in-app review or the iPhone's rating sheet).
 *      It needs no link and keeps the player in the game, but the store decides whether to show it (it has a quota),
 *      and gives no answer back, so a "didn't see it?" button is always offered afterwards.
 *   2. The app's page in the store app (market:// on Android, itms-apps:// on iPhone).
 *   3. The same page on the web.
 *   4. As a last resort the link is copied so it can be pasted.
 * Where a store cannot be reached at all (a browser with no review link configured) nothing is offered.
 */

import { isNative, getNativePlatform, APP_SCHEME } from './native.js';
import { openUrl, copyText } from './platform.js';

var _testPlugin = null;

/** Tests inject a fake in-app review plugin. Pass null to clear. */
export function setReviewPluginForTest(p) { _testPlugin = p; }

function env() {
  /** @type {Record<string, any>} */
  var e = (typeof import.meta !== 'undefined' && import.meta.env) || {};
  return e;
}

/**
 * Pages to try, best first, for the platform this build runs on.
 * @param {{platform?: string, appId?: string, iosAppId?: string, reviewUrl?: string}} [o] (for tests; defaults come from the build)
 * @returns {string[]}
 */
export function storeLinks(o) {
  o = o || {};
  var platform = o.platform || getNativePlatform();
  var appId = o.appId || APP_SCHEME;
  var iosId = o.iosAppId !== undefined ? o.iosAppId : String(env().VITE_APPSTORE_ID || '');
  var custom = o.reviewUrl !== undefined ? o.reviewUrl : String(env().VITE_REVIEW_URL || '');
  var out = [];
  if (platform === 'android') {
    out.push('market://details?id=' + appId);
    out.push('https://play.google.com/store/apps/details?id=' + appId);
  } else if (platform === 'ios' && /^\d+$/.test(iosId)) {
    out.push('itms-apps://apps.apple.com/app/id' + iosId + '?action=write-review');
    out.push('https://apps.apple.com/app/id' + iosId + '?action=write-review');
  }
  if (/^https:\/\//.test(custom) && out.indexOf(custom) < 0) out.push(custom);
  return out;
}

/** The page to copy when nothing could be opened: the https link, never a store-app-only one. */
export function shareableStoreLink(o) {
  return storeLinks(o).filter(function (u) { return /^https:\/\//.test(u); })[0] || '';
}

/** Is there any way to rate from here? (False in a plain browser with no link set up.) */
export function canRate(o) {
  return isNative() || storeLinks(o).length > 0;
}

function loadReviewPlugin() {
  if (_testPlugin) return Promise.resolve(_testPlugin);
  if (!isNative()) return Promise.resolve(null);
  return import('@capacitor-community/in-app-review').then(function (m) { return m.InAppReview || null; }).catch(function () { return null; });
}

/** Show the store's own rating box. @returns {Promise<boolean>} true when the request went through (the box may still not appear) */
export function requestInAppReview() {
  return loadReviewPlugin().then(function (plugin) {
    if (!plugin) return false;
    return plugin.requestReview().then(function () { return true; }, function () { return false; });
  });
}

/**
 * Open the app's page in the store: each link in turn until one opens, then fall back to copying the link.
 * @returns {Promise<'opened'|'copied'|'failed'>}
 */
export function openStorePage(o) {
  var links = storeLinks(o);
  function next(i) {
    if (i >= links.length) {
      var shareable = shareableStoreLink(o);
      if (!shareable) return Promise.resolve('failed');
      return copyText(shareable).then(function (ok) { return ok ? 'copied' : 'failed'; });
    }
    return openUrl(links[i]).then(function (ok) { return ok ? 'opened' : next(i + 1); });
  }
  return next(0);
}

/**
 * The player agreed to rate. Try the rating box first (inside the app), otherwise the store page.
 * @returns {Promise<{how: 'in-app'|'opened'|'copied'|'failed'}>}
 */
export function rateTheApp(o) {
  return requestInAppReview().then(function (shown) {
    if (shown) return { how: 'in-app' };
    return openStorePage(o).then(function (how) { return { how: how }; });
  });
}
