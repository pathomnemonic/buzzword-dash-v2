/**
 * tips.js — the optional "support the developer" link on the website.
 *
 * The app is free and tips are purely voluntary. The link is one constant (tipconfig.js). It appears only as a quiet
 * entry in Settings > About: never a popup, never after a run, and it never gates anything. It is separate from Pro.
 * With no link configured, nothing is shown.
 */

import { openExternal } from './platform.js';
import { isNative } from './native.js';
import { TIP_PAYMENT_URL } from './tipconfig.js';

/** The PathoMnemonic Ko-fi page belongs to a different app's non-profit tips; Dx Dash must never send tips there. */
export function isReservedTipUrl(url) {
  try {
    var u = new URL(url);
    return /(^|\.)ko-fi\.com$/i.test(u.hostname);
  } catch (e) {
    return false;
  }
}

/** Only https links are accepted. @returns {boolean} */
export function isValidTipUrl(url) {
  if (typeof url !== 'string') return false;
  try {
    var u = new URL(url);
    return u.protocol === 'https:' && u.hostname.indexOf('.') > 0 && !isReservedTipUrl(url);
  } catch (e) {
    return false;
  }
}

/** @returns {string} the configured tip URL, or '' if none/invalid/reserved or inside the store apps */
export function getTipUrl() {
  // Apple and Google restrict external payment links inside apps: the apps use the in-app tip jar instead (tipjar.js)
  if (isNative()) return '';
  var url = String(TIP_PAYMENT_URL || '').trim();
  // a link pasted without its https:// still works
  if (url && !/^[a-z][a-z0-9+.-]*:/i.test(url)) url = 'https://' + url;
  return isValidTipUrl(url) ? url : '';
}

/** Open the tip page in a new tab without leaking the referrer. */
export function openTipPage() {
  var url = getTipUrl();
  if (!url) return false;
  openExternal(url);
  return true;
}
