// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { appleProviderSecret } from '../../tools/apple-client-secret.mjs';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' });
const un64 = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

describe('the Apple sign-in client secret tool', () => {
  it('makes a signed token that lasts just under six months', () => {
    const out = appleProviderSecret({ teamId: 'TEAM123456', keyId: 'KEY1234567', servicesId: 'com.example.web', privateKey: PEM }, 1_800_000_000);
    const [h, c, s] = out.secret.split('.');
    expect(JSON.parse(un64(h).toString())).toEqual({ alg: 'ES256', kid: 'KEY1234567', typ: 'JWT' });
    const claims = JSON.parse(un64(c).toString());
    expect(claims).toMatchObject({ iss: 'TEAM123456', sub: 'com.example.web', aud: 'https://appleid.apple.com', iat: 1_800_000_000 });
    expect(claims.exp - claims.iat).toBeLessThan(180 * 86400);
    expect(claims.exp - claims.iat).toBeGreaterThan(170 * 86400);
    expect(createVerify('SHA256').update(h + '.' + c).verify({ key: publicKey, dsaEncoding: 'ieee-p1363' }, un64(s))).toBe(true);
    expect(out.expires.getTime()).toBe(claims.exp * 1000);
  });
});
