// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { appleConfigured, appleClientSecret, appleRevokeForm, revokeSucceeded, hasAppleLogin } from '../../supabase/functions/_shared/applesignin.js';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' });
const ENV = { APPLE_TEAM_ID: 'TEAM123456', APPLE_KEY_ID: 'KEY1234567', APPLE_PRIVATE_KEY: PEM, APPLE_CLIENT_ID: 'com.example.dxdash.web' };
const b64 = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

describe('revoking a Sign in with Apple login', () => {
  it('needs all four settings', () => {
    expect(appleConfigured(ENV)).toBe(true);
    for (const k of Object.keys(ENV)) expect(appleConfigured({ ...ENV, [k]: '' }), k).toBe(false);
    expect(appleConfigured(null)).toBe(false);
  });

  it('builds a client secret Apple will accept: ES256, the right claims, a signature that checks out', async () => {
    const jwt = await appleClientSecret(ENV, 1_800_000_000);
    const [h, c, sig] = jwt.split('.');
    expect(JSON.parse(b64(h).toString())).toEqual({ alg: 'ES256', kid: 'KEY1234567', typ: 'JWT' });
    expect(JSON.parse(b64(c).toString())).toEqual({ iss: 'TEAM123456', iat: 1_800_000_000, exp: 1_800_000_300, aud: 'https://appleid.apple.com', sub: 'com.example.dxdash.web' });
    const ok = createVerify('SHA256').update(h + '.' + c).verify({ key: publicKey, dsaEncoding: 'ieee-p1363' }, b64(sig));
    expect(ok).toBe(true);
  });

  it('also reads a key whose line breaks were typed as \\n in a secret', async () => {
    const flat = PEM.replace(/\n/g, '\\n');
    const jwt = await appleClientSecret({ ...ENV, APPLE_PRIVATE_KEY: flat }, 1);
    expect(jwt.split('.')).toHaveLength(3);
  });

  it('refuses to build one when it is not set up', async () => {
    await expect(appleClientSecret({}, 1)).rejects.toThrow(/not set up/i);
  });

  it('makes the revoke request form', async () => {
    const f = await appleRevokeForm(ENV, 'r_token_123', 5);
    expect(f).toMatchObject({ client_id: 'com.example.dxdash.web', token: 'r_token_123', token_type_hint: 'refresh_token' });
    expect(f.client_secret.split('.')).toHaveLength(3);
  });

  it('counts a revoke as done when Apple accepts it or no longer knows the token', () => {
    expect(revokeSucceeded({ status: 200 })).toBe(true);
    expect(revokeSucceeded({ status: 400, body: '{"error":"invalid_grant"}' })).toBe(true);
    expect(revokeSucceeded({ status: 400, body: '{"error":"invalid_client"}' })).toBe(false);
    expect(revokeSucceeded({ status: 500 })).toBe(false);
    expect(revokeSucceeded(null)).toBe(false);
  });

  it('recognises an Apple login', () => {
    expect(hasAppleLogin({ identities: [{ provider: 'email' }, { provider: 'apple' }] })).toBe(true);
    expect(hasAppleLogin({ app_metadata: { provider: 'apple' } })).toBe(true);
    expect(hasAppleLogin({ app_metadata: { providers: ['google', 'apple'] } })).toBe(true);
    expect(hasAppleLogin({ app_metadata: { provider: 'google' }, identities: [{ provider: 'google' }] })).toBe(false);
    expect(hasAppleLogin(null)).toBe(false);
  });
});
