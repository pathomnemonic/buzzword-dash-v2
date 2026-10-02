/**
 * csp.mjs — the Content-Security-Policy that the production build puts in index.html.
 *
 * A CSP tells the browser what the page may load and connect to, so a script slipped in through some bug (or a
 * hostile display name that was shown as markup) still cannot run or send data anywhere. GitHub Pages cannot set
 * response headers, so the policy goes in a <meta> tag (frame-ancestors is the one thing a meta tag cannot do).
 *
 * What the game really needs:
 *   - its own scripts (and the one small inline boot-splash script, allowed by its hash), WebAssembly for the Anki importer
 *   - styles, with inline allowed (the interface sets many styles directly)
 *   - images, audio and 3D models from itself, plus data: and blob: (generated textures, model textures)
 *   - connections to itself, to the Supabase project (REST and realtime), and to the PeerJS signaling server
 */

import { createHash } from 'node:crypto';

export var PEER_HOSTS = ['0.peerjs.com'];

/** sha256 of an inline script's exact text, in CSP form. */
export function scriptHash(text) {
  return "'sha256-" + createHash('sha256').update(text, 'utf8').digest('base64') + "'";
}

/** The inline <script> bodies of a page. */
export function inlineScripts(html) {
  var out = [];
  var re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  var m;
  while ((m = re.exec(html))) if (m[1].trim()) out.push(m[1]);
  return out;
}

/**
 * @param {{supabaseUrl?: string, html?: string}} [opts]
 * @returns {string} the policy text
 */
export function buildCsp(opts) {
  opts = opts || {};
  var connect = ["'self'", 'blob:', 'data:'];
  if (opts.supabaseUrl) {
    try {
      var u = new URL(opts.supabaseUrl);
      connect.push('https://' + u.host, 'wss://' + u.host);
    } catch (e) { /* a malformed URL just means no Supabase host is allowed */ }
  }
  PEER_HOSTS.forEach(function (h) { connect.push('https://' + h, 'wss://' + h); });
  var scripts = ["'self'", "'wasm-unsafe-eval'"].concat(inlineScripts(opts.html || '').map(scriptHash));
  return [
    "default-src 'self'",
    'script-src ' + scripts.join(' '),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    'connect-src ' + connect.join(' '),
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ');
}
