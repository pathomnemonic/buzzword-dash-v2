/**
 * authproviders.js — the "Continue with ..." sign-in options.
 *
 * Which ones are offered is a build setting, VITE_AUTH_PROVIDERS (a comma-separated list, default "google,apple,azure,discord,github"), and a
 * provider must also be switched on in Supabase (Authentication → Sign In / Providers); one that is not switched on is
 * simply not shown (see onlyAvailable). Only providers that always hand over a verified email are listed: a sign-in with no email is treated as a
 * guest everywhere (no purchases, no codes, no trial), so an option that can come back without one would be a trap.
 *
 * Apple is on by default because the App Store requires "Sign in with Apple" next to any other third-party sign-in.
 */

/** Every provider the app knows how to show. `id` is the name Supabase uses. */
export var AUTH_PROVIDERS = {
  google: { id: 'google', label: 'Google', icon: 'G', mark: [
    { d: 'M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z', fill: '#4285F4' },
    { d: 'M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z', fill: '#34A853' },
    { d: 'M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z', fill: '#FBBC05' },
    { d: 'M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z', fill: '#EA4335' }
  ] },
  apple: { id: 'apple', label: 'Apple', icon: '', mark: [
    { d: 'M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701', fill: 'currentColor' }
  ] },
  azure: { id: 'azure', label: 'Microsoft', icon: '⊞', scopes: 'email', mark: [
    { d: 'M1 1h10v10H1z', fill: '#F25022' }, { d: 'M13 1h10v10H13z', fill: '#7FBA00' }, { d: 'M1 13h10v10H1z', fill: '#00A4EF' }, { d: 'M13 13h10v10H13z', fill: '#FFB900' }
  ] },
  github: { id: 'github', label: 'GitHub', icon: '\U0001F419', mark: [
    { d: 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12', fill: 'currentColor' }
  ] },
  discord: { id: 'discord', label: 'Discord', icon: '💬', scopes: 'identify email' },
  facebook: { id: 'facebook', label: 'Facebook', icon: 'f', scopes: 'email' }
};

var DEFAULT_LIST = 'google,apple,azure,discord,github';

/** The providers to offer, in the order listed in the setting. Unknown names are ignored. */
export function enabledProviders(setting) {
  /** @type {Record<string, any>} */
  var env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
  // (a build variable that is set but empty, as an unset GitHub variable arrives, means "the default"; write "none" for no buttons)
  var raw = setting !== undefined ? setting : (env.VITE_AUTH_PROVIDERS || DEFAULT_LIST);
  if (String(raw).trim().toLowerCase() === 'none') raw = '';
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
