/**
 * publicurl.js — the web address to put in anything a player sends to a friend.
 *
 * Inside the phone app the page is served from https://localhost, and a link to that means nothing on a friend's
 * phone. So links use the real website unless the page is already served from a public address. A build can
 * override it with VITE_SHARE_URL.
 */

export var DEFAULT_PUBLIC_URL = 'https://pathomnemonic.github.io/buzzword-dash-v2/';

/** Is this host somewhere a friend cannot reach (this device, a home network, or a file)? */
export function isPrivateHost(hostname) {
  var h = String(hostname || '').toLowerCase();
  if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  if (/^127\./.test(h) || h === '[::1]' || h === '::1' || h === '0.0.0.0') return true;
  if (/^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return false;
}

/**
 * @param {{protocol?: string, hostname?: string, origin?: string, pathname?: string}} [loc] the page address
 * @param {string} [override] a build-time link
 * @returns {string} an https address with a trailing path (no hash)
 */
export function publicUrl(loc, override) {
  if (/^https:\/\//.test(override || '')) return override.split('#')[0];
  loc = loc || (typeof window !== 'undefined' ? window.location : {});
  if (/^https?:$/.test(loc.protocol || '') && !isPrivateHost(loc.hostname)) return (loc.origin || '') + (loc.pathname || '/');
  return DEFAULT_PUBLIC_URL;
}

/** For the running app: reads the build-time override. */
export function appPublicUrl() {
  /** @type {Record<string, any>} */
  var env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
  return publicUrl(undefined, env.VITE_SHARE_URL || '');
}
