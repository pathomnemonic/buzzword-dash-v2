/**
 * applenative.js — the native "Sign in with Apple" sheet on iPhone and iPad (the system dialog with Face ID), instead of
 * sending the player out to a web page. It is used for signing in to an existing account; a guest upgrading in place, and the
 * website and Android, keep using the web sign-in (Supabase cannot attach an Apple login to a guest from the native sheet).
 *
 * The native side is the community plugin @capacitor-community/apple-sign-in, installed by the iOS build (codemagic.yaml). It is
 * only registered by name here, so nothing is bundled for the website or Android and a missing plugin fails cleanly.
 */

import { registerPlugin } from '@capacitor/core';
import { getNativePlatform } from './native.js';

/** The iOS app's bundle id: Apple issues a native login to it, so Supabase's Apple provider must list it as a Client ID. */
export var APPLE_BUNDLE_ID = 'com.pathomnemonic.dxdash';

/** @type {any} */
var plugin = null;
function getPlugin() {
  if (!plugin) plugin = registerPlugin('SignInWithApple');
  return plugin;
}

/** Is the native Apple sheet available (the iOS app only)? */
export function nativeAppleAvailable() {
  return getNativePlatform() === 'ios';
}

function randomNonce() {
  var bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
}

function sha256Hex(text) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  });
}

/** Did the player just close the Apple sheet? (iOS reports error 1001, "canceled".) */
export function isAppleCancel(e) {
  var text = String((e && (e.code || e.message)) || '');
  return /1001|cancel/i.test(text);
}

/**
 * Show the Apple sheet. Resolves with what Supabase needs: the identity token and the raw nonce (Apple is given its hash), plus
 * the one-time authorization code the server swaps for a token that can be revoked when the account is deleted.
 * Rejects if the player cancels (see isAppleCancel) or the plugin is missing.
 * @returns {Promise<{identityToken: string, nonce: string, authorizationCode: string}>}
 */
export function authorizeWithApple() {
  var raw = randomNonce();
  return sha256Hex(raw).then(function (hashed) {
    return getPlugin().authorize({ clientId: APPLE_BUNDLE_ID, redirectURI: '', scopes: 'email name', nonce: hashed });
  }).then(function (res) {
    var r = (res && res.response) || {};
    if (!r.identityToken) throw new Error('Apple did not return a sign-in.');
    return { identityToken: r.identityToken, nonce: raw, authorizationCode: r.authorizationCode || '' };
  });
}
