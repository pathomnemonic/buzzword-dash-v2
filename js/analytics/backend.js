/**
 * backend.js — where analytics events are sent: this app's own Supabase project (the same one the leaderboard uses).
 * With no project configured (a local build) analytics keeps its events on the device only and sends nothing.
 */

var PLACEHOLDER_URL = 'YOUR_SUPABASE_URL';
var PLACEHOLDER_KEY = 'YOUR_SUPABASE_ANON_KEY';

/** @returns {{url: string, key: string}|null} */
export function analyticsEndpoint(env) {
  env = env || ((typeof import.meta !== 'undefined' && import.meta.env) || {});
  var url = String(env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  var key = String(env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!url || !key || url === PLACEHOLDER_URL || key === PLACEHOLDER_KEY) return null;
  if (!/^https:\/\//i.test(url)) return null;
  return { url: url, key: key };
}

/** The app version and build, as they should appear in reports. */
export function appVersion() {
  return {
    version: (typeof __APP_SEMVER__ !== 'undefined' && __APP_SEMVER__) ? String(__APP_SEMVER__) : '',
    build: (typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__) ? String(__APP_VERSION__) : ''
  };
}
