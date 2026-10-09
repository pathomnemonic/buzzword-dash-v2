/* global btoa, atob */
/**
 * applesignin.js — revoking a Sign in with Apple login when the account is deleted (an App Store rule), with no network
 * in it so it can be tested. The Edge Function (pro-checkout) calls Apple's revoke endpoint with the result.
 *
 * Apple wants a "client secret": a short-lived ES256-signed token made from your Apple developer key. Settings (secrets):
 *   APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY (the .p8 file's text), APPLE_CLIENT_ID (the Services ID that Supabase uses).
 */

function b64url(bytes) {
  var s = '';
  var arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (var i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToDer(pem) {
  var body = String(pem || '').replace(/-----BEGIN [A-Z ]+-----/g, '').replace(/-----END [A-Z ]+-----/g, '').replace(/\\n/g, '').replace(/\s+/g, '');
  var bin = atob(body);
  var out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Are all four Apple settings present? */
export function appleConfigured(env) {
  return !!(env && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY && env.APPLE_CLIENT_ID);
}

/** The client secret Apple asks for (valid for five minutes). */
export async function appleClientSecret(env, nowSec) {
  if (!appleConfigured(env)) throw new Error('Apple sign-in revocation is not set up.');
  var header = { alg: 'ES256', kid: env.APPLE_KEY_ID, typ: 'JWT' };
  var claims = { iss: env.APPLE_TEAM_ID, iat: nowSec, exp: nowSec + 300, aud: 'https://appleid.apple.com', sub: env.APPLE_CLIENT_ID };
  var enc = new TextEncoder();
  var input = b64url(enc.encode(JSON.stringify(header))) + '.' + b64url(enc.encode(JSON.stringify(claims)));
  var key = await crypto.subtle.importKey('pkcs8', pemToDer(env.APPLE_PRIVATE_KEY), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  var sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(input));
  return input + '.' + b64url(sig);
}

/** The form to POST to https://appleid.apple.com/auth/revoke. */
export async function appleRevokeForm(env, refreshToken, nowSec) {
  return {
    client_id: env.APPLE_CLIENT_ID,
    client_secret: await appleClientSecret(env, nowSec),
    token: refreshToken,
    token_type_hint: 'refresh_token'
  };
}

/**
 * Did Apple accept the revoke? A token Apple no longer knows (already revoked) counts: the login is gone either way.
 * @param {{status: number, body?: string}} res
 */
export function revokeSucceeded(res) {
  if (!res) return false;
  if (res.status >= 200 && res.status < 300) return true;
  return res.status === 400 && /invalid_grant|invalid_token/i.test(String(res.body || ''));
}

/** Does this Supabase user have a Sign in with Apple login? */
export function hasAppleLogin(user) {
  if (!user) return false;
  var ids = user.identities || [];
  for (var i = 0; i < ids.length; i++) if (ids[i] && ids[i].provider === 'apple') return true;
  return !!(user.app_metadata && (user.app_metadata.provider === 'apple' || (user.app_metadata.providers || []).indexOf('apple') >= 0));
}
