// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import {
  describeStoreProduct, tokenKey, googleConfigured, appleStoreConfigured, googleAssertion, googleUrl, parseGoogleSubscription, parseGoogleProduct,
  appleStoreJwt, appleTransactionUrls, decodeJwsPayload, parseAppleTransaction, grantFor
} from '../../supabase/functions/_shared/storeverify.js';

const b64 = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const jws = (payload) => 'x.' + Buffer.from(JSON.stringify(payload)).toString('base64url') + '.y';
const NOW = 1_800_000_000;

describe('understanding the product ids the app sells', () => {
  it('knows plans, the lifetime purchase, premium items and the old library, and nothing else', () => {
    expect(describeStoreProduct('dxdash_pro_monthly')).toEqual({ kind: 'subscription', plan: 'monthly' });
    expect(describeStoreProduct('dxdash_pro_yearly')).toEqual({ kind: 'subscription', plan: 'yearly' });
    expect(describeStoreProduct('dxdash_pro_lifetime')).toEqual({ kind: 'lifetime', plan: 'lifetime' });
    expect(describeStoreProduct('dxdash_library')).toEqual({ kind: 'library', plan: 'library' });
    expect(describeStoreProduct('dxdash_item_trail_fire')).toEqual({ kind: 'item', item: 'trail_fire' });
    expect(describeStoreProduct('dxdash_item_avatar_intern')).toBeNull();   // (not a premium item)
    expect(describeStoreProduct('dxdash_item_../../etc')).toBeNull();
    expect(describeStoreProduct('free_pro_for_all')).toBeNull();
    expect(describeStoreProduct('')).toBeNull();
  });

  it('keeps only a hash of a purchase token', async () => {
    const a = await tokenKey('long-private-token-1');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(await tokenKey('long-private-token-1'));
    expect(a).not.toBe(await tokenKey('long-private-token-2'));
    expect(a).not.toContain('long-private');
  });
});

describe('Google Play', () => {
  it('needs its three settings', () => {
    const env = { GOOGLE_SA_EMAIL: 'a@b.iam.gserviceaccount.com', GOOGLE_SA_PRIVATE_KEY: 'k', GOOGLE_PLAY_PACKAGE: 'com.x' };
    expect(googleConfigured(env)).toBe(true);
    expect(googleConfigured({ ...env, GOOGLE_SA_EMAIL: '' })).toBe(false);
  });

  it('signs its request with the service account key (RS256) and the right claims', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const env = { GOOGLE_SA_EMAIL: 'sa@p.iam.gserviceaccount.com', GOOGLE_SA_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }), GOOGLE_PLAY_PACKAGE: 'com.x' };
    const jwt = await googleAssertion(env, NOW);
    const [h, c, sig] = jwt.split('.');
    expect(JSON.parse(b64(h).toString())).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(JSON.parse(b64(c).toString())).toMatchObject({ iss: env.GOOGLE_SA_EMAIL, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: NOW });
    expect(createVerify('RSA-SHA256').update(h + '.' + c).verify(publicKey, b64(sig))).toBe(true);
  });

  it('asks about a subscription and a one-time product in the right places, with the token escaped', () => {
    expect(googleUrl('subscription', 'com.x', 'dxdash_pro_monthly', 'tok/en')).toBe('https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.x/purchases/subscriptionsv2/tokens/tok%2Fen');
    expect(googleUrl('product', 'com.x', 'dxdash_item_trail_fire', 'tok')).toBe('https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.x/purchases/products/dxdash_item_trail_fire/tokens/tok');
  });

  it('reads a subscription: active, in grace and cancelled-but-paid count; expired, on hold and pending do not', () => {
    const sub = (state, endOffset) => ({ subscriptionState: state, lineItems: [{ productId: 'p', expiryTime: new Date((NOW + endOffset) * 1000).toISOString() }] });
    expect(parseGoogleSubscription(sub('SUBSCRIPTION_STATE_ACTIVE', 86400), NOW)).toMatchObject({ valid: true, expiresAt: NOW + 86400 });
    expect(parseGoogleSubscription(sub('SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 86400), NOW).valid).toBe(true);
    expect(parseGoogleSubscription(sub('SUBSCRIPTION_STATE_CANCELED', 86400), NOW).valid).toBe(true);     // (cancelled, but paid until then)
    expect(parseGoogleSubscription(sub('SUBSCRIPTION_STATE_CANCELED', -86400), NOW).valid).toBe(false);
    expect(parseGoogleSubscription(sub('SUBSCRIPTION_STATE_EXPIRED', 86400), NOW).valid).toBe(false);
    expect(parseGoogleSubscription(sub('SUBSCRIPTION_STATE_ON_HOLD', 86400), NOW).valid).toBe(false);
    expect(parseGoogleSubscription(sub('SUBSCRIPTION_STATE_PENDING', 86400), NOW)).toMatchObject({ valid: false, pending: true });
    expect(parseGoogleSubscription({}, NOW).valid).toBe(false);
  });

  it('reads a one-time product: purchased, cancelled or refunded, pending', () => {
    expect(parseGoogleProduct({ purchaseState: 0 })).toMatchObject({ valid: true, revoked: false });
    expect(parseGoogleProduct({ purchaseState: 1 })).toMatchObject({ valid: false, revoked: true });
    expect(parseGoogleProduct({ purchaseState: 2 })).toMatchObject({ valid: false, pending: true });
    expect(parseGoogleProduct({})).toMatchObject({ valid: false, revoked: false });
  });
});

describe('the App Store', () => {
  it('needs its four settings', () => {
    const env = { APPLE_IAP_ISSUER_ID: 'i', APPLE_IAP_KEY_ID: 'k', APPLE_IAP_PRIVATE_KEY: 'p', APPLE_BUNDLE_ID: 'b' };
    expect(appleStoreConfigured(env)).toBe(true);
    expect(appleStoreConfigured({ ...env, APPLE_BUNDLE_ID: '' })).toBe(false);
  });

  it('signs its request with the In-App Purchase key (ES256) for the App Store Server API', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const env = { APPLE_IAP_ISSUER_ID: 'issuer-1', APPLE_IAP_KEY_ID: 'KEYID12345', APPLE_IAP_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }), APPLE_BUNDLE_ID: 'com.x' };
    const jwt = await appleStoreJwt(env, NOW);
    const [h, c, sig] = jwt.split('.');
    expect(JSON.parse(b64(h).toString())).toEqual({ alg: 'ES256', kid: 'KEYID12345', typ: 'JWT' });
    expect(JSON.parse(b64(c).toString())).toEqual({ iss: 'issuer-1', iat: NOW, exp: NOW + 300, aud: 'appstoreconnect-v1', bid: 'com.x' });
    expect(createVerify('SHA256').update(h + '.' + c).verify({ key: publicKey, dsaEncoding: 'ieee-p1363' }, b64(sig))).toBe(true);
  });

  it('asks production first, then the sandbox', () => {
    const [prod, sandbox] = appleTransactionUrls('2000000123');
    expect(prod).toBe('https://api.storekit.itunes.apple.com/inApps/v1/transactions/2000000123');
    expect(sandbox).toBe('https://api.storekit-sandbox.itunes.apple.com/inApps/v1/transactions/2000000123');
  });

  it('reads a signed transaction, and tolerates garbage', () => {
    expect(decodeJwsPayload(jws({ a: 1 }))).toEqual({ a: 1 });
    expect(decodeJwsPayload('nonsense')).toBeNull();
    expect(decodeJwsPayload('a.!!!.c')).toBeNull();
  });

  it('a live subscription is valid until it ends; a refunded one is revoked; the wrong app is refused', () => {
    const sub = { bundleId: 'com.x', productId: 'dxdash_pro_monthly', type: 'Auto-Renewable Subscription', expiresDate: (NOW + 86400) * 1000, originalTransactionId: '777' };
    expect(parseAppleTransaction(sub, 'com.x', NOW)).toMatchObject({ valid: true, expiresAt: NOW + 86400, key: '777', productId: 'dxdash_pro_monthly' });
    expect(parseAppleTransaction({ ...sub, expiresDate: (NOW - 1) * 1000 }, 'com.x', NOW).valid).toBe(false);
    expect(parseAppleTransaction({ ...sub, revocationDate: (NOW - 5) * 1000 }, 'com.x', NOW)).toMatchObject({ valid: false, revoked: true });
    expect(parseAppleTransaction(sub, 'com.other', NOW)).toBeNull();
    expect(parseAppleTransaction(null, 'com.x', NOW)).toBeNull();
    const item = { bundleId: 'com.x', productId: 'dxdash_item_trail_fire', type: 'Non-Consumable', originalTransactionId: '888' };
    expect(parseAppleTransaction(item, 'com.x', NOW)).toMatchObject({ valid: true, expiresAt: 0, key: '888' });
  });
});

describe('what the database is told', () => {
  const sub = { kind: 'subscription', plan: 'monthly' };
  it('a live subscription runs to its end plus the grace', () => {
    const a = grantFor(sub, { valid: true, revoked: false, expiresAt: NOW + 1000 }, 'u1', 'k', NOW);
    expect(a.rpc).toBe('pro_grant_until');
    expect(a.args).toMatchObject({ p_user: 'u1', p_plan: 'monthly', p_source: 'store', p_trial: false });
    expect(new Date(a.args.p_until).getTime() / 1000).toBe(NOW + 1000 + 2 * 86400);
  });
  it('a lifetime purchase is granted for ten years, an item with its purchase as the reference', () => {
    const l = grantFor({ kind: 'lifetime', plan: 'lifetime' }, { valid: true, revoked: false, expiresAt: 0 }, 'u1', 'k', NOW);
    expect(new Date(l.args.p_until).getTime() / 1000).toBe(NOW + 3650 * 86400 - 86400);
    expect(grantFor({ kind: 'item', item: 'trail_fire' }, { valid: true, revoked: false }, 'u1', 'KEY', NOW)).toEqual({ rpc: 'pro_grant_item', args: { p_user: 'u1', p_item: 'trail_fire', p_source: 'store', p_ref: 'store:KEY' } });
  });
  it('a refund takes back only what that purchase gave', () => {
    expect(grantFor({ kind: 'item', item: 'trail_fire' }, { valid: false, revoked: true }, 'u1', 'KEY', NOW)).toEqual({ rpc: 'pro_revoke_item', args: { p_user: 'u1', p_item: 'trail_fire', p_ref: 'store:KEY' } });
    expect(grantFor({ kind: 'lifetime', plan: 'lifetime' }, { valid: false, revoked: true }, 'u1', 'k', NOW)).toEqual({ rpc: 'pro_revoke_plan', args: { p_user: 'u1', p_plan: 'lifetime' } });
  });
  it('an expired or pending purchase changes nothing', () => {
    expect(grantFor(sub, { valid: false, revoked: false, expiresAt: NOW - 1 }, 'u1', 'k', NOW)).toBeNull();
    expect(grantFor(null, { valid: true }, 'u1', 'k', NOW)).toBeNull();
  });
});
