/**
 * authproviders.js — the "Continue with ..." sign-in options.
 *
 * Which ones are offered is a build setting, VITE_AUTH_PROVIDERS (a comma-separated list, default "google,apple,azure"), and a
 * provider must also be switched on in Supabase (Authentication → Sign In / Providers); one that is not switched on is
 * simply not shown (see onlyAvailable). Only providers that always hand over a verified email are listed: a sign-in with no email is treated as a
 * guest everywhere (no purchases, no codes, no trial), so an option that can come back without one would be a trap.
 *
 * Apple is on by default because the App Store requires "Sign in with Apple" next to any other third-party sign-in.
 */

/** Every provider the app knows how to show. `id` is the name Supabase uses. */
export var AUTH_PROVIDERS = {
  google: { id: 'google', label: 'Google', icon: 'G' },
  apple: { id: 'apple', label: 'Apple', icon: '' },
  azure: { id: 'azure', label: 'Microsoft', icon: '⊞', scopes: 'email' },
  discord: { id: 'discord', label: 'Discord', icon: '💬', scopes: 'identify email' },
  facebook: { id: 'facebook', label: 'Facebook', icon: 'f', scopes: 'email' }
};

var DEFAULT_LIST = 'google,apple,azure';

/** The providers to offer, in the order listed in the setting. Unknown names are ignored. */
export function enabledProviders(setting) {
  var env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
  var raw = setting !== undefined ? setting : (env.VITE_AUTH_PROVIDERS !== undefined ? env.VITE_AUTH_PROVIDERS : DEFAULT_LIST);
  var seen = {};
  return String(raw || '').split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(function (id) {
    if (!id || seen[id] || !AUTH_PROVIDERS[id]) return false;
    seen[id] = true;
    return true;
  }).map(function (id) { return AUTH_PROVIDERS[id]; });
}

/**
 * Keep only the providers that are actually switched on in Supabase, so a player is never shown a button that cannot
 * work. `external` is the "external" object of Supabase's public auth settings ({ google: true, apple: false, ... });
 * when it is not known (offline, or the call failed) the list is left as configured and a failed button explains itself.
 */
export function onlyAvailable(list, external) {
  if (!external || typeof external !== 'object') return list;
  return list.filter(function (p) { return external[p.id] === true; });
}

/** The provider an account signed in with, from Supabase's user object ('email' for a password account). */
export function providerOf(user) {
  var meta = (user && user.app_metadata) || {};
  return String(meta.provider || (user && user.identities && user.identities[0] && user.identities[0].provider) || (user && user.email ? 'email' : ''));
}

/** "Google", "Apple", ... for a provider id; '' for email. */
export function providerLabel(id) {
  return AUTH_PROVIDERS[id] ? AUTH_PROVIDERS[id].label : '';
}
