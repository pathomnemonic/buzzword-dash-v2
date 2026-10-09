import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { enabledProviders, providerOf, providerLabel, AUTH_PROVIDERS } from '../../js/authproviders.js';

describe('which sign-in options are offered', () => {
  it('defaults to Google and Apple (the App Store wants Apple next to any other)', () => {
    expect(enabledProviders().map((p) => p.id)).toEqual(['google', 'apple']);
  });

  it('follows the setting, in order, ignoring unknown names and repeats', () => {
    expect(enabledProviders('apple, google ,GOOGLE,bogus,,azure').map((p) => p.id)).toEqual(['apple', 'google', 'azure']);
    expect(enabledProviders('')).toEqual([]);
  });

  it('only lists providers that always give an email back (a login with no email would be treated as a guest)', () => {
    expect(Object.keys(AUTH_PROVIDERS)).not.toContain('github');
    expect(Object.keys(AUTH_PROVIDERS)).not.toContain('twitter');
  });

  it('reads the provider off an account', () => {
    expect(providerOf({ email: 'a@b.co', app_metadata: { provider: 'google' } })).toBe('google');
    expect(providerOf({ email: 'a@b.co', app_metadata: {} })).toBe('email');
    expect(providerOf({ email: 'a@b.co', identities: [{ provider: 'apple' }] })).toBe('apple');
    expect(providerOf(null)).toBe('');
    expect(providerLabel('google')).toBe('Google');
    expect(providerLabel('email')).toBe('');
  });
});

let calls;
let user;
let reply;
let native;

vi.mock('../../js/native.js', async (orig) => {
  const real = await orig();
  return { ...real, isNative: () => native, getAuthRedirectUrl: () => (native ? 'com.pathomnemonic.dxdash://auth' : 'https://me.github.io/dx/') };
});
const opened = [];
vi.mock('@capacitor/browser', () => ({ Browser: { open: async (o) => { opened.push(o.url); }, close: async () => {} } }));

function fakeClient() {
  return {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      getSession: async () => ({ data: { session: { user } } }),
      signInWithOAuth: async (a) => { calls.push(['oauth', a]); return reply(); },
      linkIdentity: async (a) => { calls.push(['link', a]); return reply(); },
      signInAnonymously: async () => ({ data: { session: { user: { id: 'anon', is_anonymous: true } } } })
    }
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

describe('Continue with Google / Apple', () => {
  beforeEach(() => {
    calls = []; opened.length = 0; native = false;
    user = { id: 'g1', email: '', is_anonymous: true };
    reply = () => ({ data: { url: 'https://accounts.google.com/o/oauth2/auth?x=1', provider: 'google' }, error: null });
  });
  afterEach(() => { vi.unstubAllEnvs(); delete window.supabase; });

  it('a new player who is a guest upgrades that guest in place, so scores, friends and groups stay', async () => {
    const lb = await boot();
    const res = await lb.signInWithProvider('google', { link: true });
    expect(res).toMatchObject({ success: true, redirected: true });
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('link');
    expect(calls[0][1].provider).toBe('google');
    expect(calls[0][1].options.redirectTo).toBe('https://me.github.io/dx/');
    expect(calls[0][1].options.skipBrowserRedirect).toBe(false);
  });

  it('a returning player signs in to the account that exists', async () => {
    const lb = await boot();
    await lb.signInWithProvider('apple', { link: false });
    expect(calls.map((c) => c[0])).toEqual(['oauth']);
    expect(calls[0][1].provider).toBe('apple');
  });

  it('someone already signed in with a real account is never "linked" as a guest', async () => {
    user = { id: 'u1', email: 'a@b.co', is_anonymous: false };
    const lb = await boot();
    await lb.signInWithProvider('google', { link: true });
    expect(calls.map((c) => c[0])).toEqual(['oauth']);
  });

  it('in the phone app it opens the system browser, not a web view, and comes back by the app link', async () => {
    native = true;
    const lb = await boot();
    const res = await lb.signInWithProvider('google', { link: true });
    expect(res.success).toBe(true);
    expect(calls[0][1].options).toMatchObject({ redirectTo: 'com.pathomnemonic.dxdash://auth', skipBrowserRedirect: true });
    expect(opened).toEqual(['https://accounts.google.com/o/oauth2/auth?x=1']);
  });

  it('never opens anything but a secure address', async () => {
    native = true;
    reply = () => ({ data: { url: 'javascript:alert(1)' }, error: null });
    const lb = await boot();
    const res = await lb.signInWithProvider('google');
    expect(res.success).toBe(false);
    expect(opened).toEqual([]);
  });

  it('says plainly what went wrong', async () => {
    const lb = await boot();
    reply = () => ({ data: null, error: { message: 'Unsupported provider: provider is not enabled' } });
    expect((await lb.signInWithProvider('google')).error).toMatch(/not switched on/i);
    reply = () => ({ data: null, error: { message: 'Manual linking is disabled' } });
    expect((await lb.signInWithProvider('google', { link: true })).error).toMatch(/linking is not switched on/i);
    reply = () => ({ data: null, error: { message: 'Identity is already linked to another user' } });
    expect((await lb.signInWithProvider('google', { link: true })).error).toMatch(/already has an account/i);
    expect((await lb.signInWithProvider('myspace')).success).toBe(false);
    expect(calls.filter((c) => c[1].provider === 'myspace')).toEqual([]);
  });

  it('shows the provider the account signed in with', async () => {
    user = { id: 'u1', email: 'a@b.co', is_anonymous: false, app_metadata: { provider: 'google' } };
    const lb = await boot();
    expect(lb.getStatus().provider).toBe('google');
  });
});

describe('the account panel', () => {
  it('offers the buttons above the email form, and sends "I am new" to link and "I have an account" to sign in', async () => {
    vi.resetModules();
    const { renderAccountPanel } = await import('../../js/accountui.js');
    const sent = [];
    const lb = {
      getStatus: () => ({ configured: true, authenticated: true, anonymous: true, email: '', pendingEmail: '' }),
      signInWithProvider: async (p, o) => { sent.push([p, o]); return { success: true, redirected: true }; }
    };
    const body = document.createElement('div');
    const deps = { leaderboard: lb, toast() {}, rerender() { body.textContent = ''; renderAccountPanel(body, deps); } };
    renderAccountPanel(body, deps);
    const buttons = [...body.querySelectorAll('.auth-provider')];
    expect(buttons.map((b) => b.dataset.provider)).toEqual(['google', 'apple']);
    expect(body.querySelector('form')).toBeTruthy();
    buttons[0].click();
    await Promise.resolve();
    expect(sent[0]).toEqual(['google', { link: true }]);
    // switch to "I have an account": the same buttons now sign in to the existing account
    [...body.querySelectorAll('button')].find((b) => b.textContent === 'I have an account').click();
    body.querySelector('[data-provider="apple"]').click();
    await Promise.resolve();
    expect(sent[1]).toEqual(['apple', { link: false }]);
  });
});
