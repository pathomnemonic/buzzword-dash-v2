import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let calls;
let user;
let nativeApple;
let sheet;
vi.mock('../../js/native.js', async (orig) => ({ ...(await orig()), isNative: () => true, getAuthRedirectUrl: () => 'com.pathomnemonic.dxdash://auth' }));
vi.mock('../../js/applenative.js', async (orig) => ({
  ...(await orig()),
  nativeAppleAvailable: () => nativeApple,
  authorizeWithApple: () => sheet()
}));
vi.mock('@capacitor/browser', () => ({ Browser: { open: async (o) => { calls.push(['browser', o.url]); }, close: async () => {} } }));

function fakeClient() {
  return {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      getSession: async () => ({ data: { session: { user } } }),
      signInWithIdToken: async (a) => { calls.push(['idtoken', a]); return { data: {}, error: null }; },
      signInWithOAuth: async (a) => { calls.push(['oauth', a]); return { data: { url: 'https://appleid.apple.com/auth' }, error: null }; },
      linkIdentity: async (a) => { calls.push(['link', a]); return { data: { url: 'https://appleid.apple.com/auth' }, error: null }; },
      signInAnonymously: async () => ({ data: { session: { user: { id: 'anon', is_anonymous: true } } } })
    },
    functions: { invoke: async (name, o) => { calls.push(['fn', name, o.body]); return { data: { ok: true }, error: null }; } }
  };
}

async function boot() {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
  window.supabase = { createClient: () => fakeClient() };
  const { leaderboard } = await import('../../js/leaderboard.js');
  await leaderboard.init();
  return leaderboard;
}

describe('native Sign in with Apple (iPhone and iPad)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    calls = []; nativeApple = true;
    user = { id: 'u1', email: 'a@b.co', is_anonymous: false };
    sheet = async () => ({ identityToken: 'tok', nonce: 'raw', authorizationCode: 'code-1234567890' });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); delete window.supabase; });

  it('signs in with the token and the raw nonce, then keeps a revocable token server side', async () => {
    const lb = await boot();
    const res = await lb.signInWithProvider('apple', { link: false });
    expect(res).toMatchObject({ success: true, redirected: false });
    expect(calls[0]).toEqual(['idtoken', { provider: 'apple', token: 'tok', nonce: 'raw' }]);
    await vi.advanceTimersByTimeAsync(600);
    expect(calls.find((c) => c[0] === 'fn')).toEqual(['fn', 'pro-checkout', { action: 'apple_code', code: 'code-1234567890' }]);
    expect(calls.find((c) => c[0] === 'browser')).toBeUndefined();
  });

  it('closing the Apple sheet is not an error', async () => {
    sheet = async () => { throw { code: '1001', message: 'The operation couldn’t be completed. (com.apple.AuthenticationServices.AuthorizationError error 1001.)' }; };
    const lb = await boot();
    expect(await lb.signInWithProvider('apple')).toEqual({ success: false, cancelled: true, error: null });
  });

  it('says so, and points to email, when the plugin is missing or Apple fails', async () => {
    sheet = async () => { throw new Error('"SignInWithApple" plugin is not implemented on ios'); };
    const lb = await boot();
    const res = await lb.signInWithProvider('apple');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/email/i);
  });

  it('a guest upgrading in place still uses the web sign-in, which can link the login to the guest', async () => {
    user = { id: 'g1', email: '', is_anonymous: true };
    const lb = await boot();
    const res = await lb.signInWithProvider('apple', { link: true });
    expect(res.redirected).toBe(true);
    expect(calls.map((c) => c[0])).toEqual(['link', 'browser']);
  });

  it('Google is never routed to the Apple sheet, and Android (no native Apple) uses the web sign-in', async () => {
    const lb = await boot();
    await lb.signInWithProvider('google');
    expect(calls.map((c) => c[0])).toEqual(['oauth', 'browser']);
    calls = []; nativeApple = false;
    await lb.signInWithProvider('apple');
    expect(calls.map((c) => c[0])).toEqual(['oauth', 'browser']);
  });
});
