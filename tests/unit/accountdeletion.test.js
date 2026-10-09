import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Deleting an account must never leave a subscription billing, and must never block a guest or a project without web payments.

let calls;
let fnReply;      // what the pro-checkout function answers to delete_account
let rpcReply;     // what the database answers to delete_my_account
let user;

function fakeClient() {
  return {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      getSession: async () => ({ data: { session: { user } } }),
      signOut: async () => { calls.push('signOut'); return {}; },
      signInAnonymously: async () => { calls.push('signInAnonymously'); return { data: { session: { user: { id: 'anon', is_anonymous: true } } } }; }
    },
    functions: { invoke: async (name, o) => { calls.push('fn:' + o.body.action); return fnReply(); } },
    rpc: async (name) => { calls.push('rpc:' + name); return rpcReply(); }
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

beforeEach(() => {
  calls = [];
  user = { id: 'u1', email: 'a@example.com', is_anonymous: false };
  fnReply = () => ({ data: { ok: true }, error: null });
  rpcReply = () => ({ error: null });
});
afterEach(() => { vi.unstubAllEnvs(); delete window.supabase; });

describe('deleting an account', () => {
  it('goes through the payment function first, which cancels any subscription and deletes the account', async () => {
    const lb = await boot();
    const res = await lb.deleteAccount();
    expect(calls.filter((c) => c.startsWith('fn:') || c.startsWith('rpc:'))).toEqual(['fn:delete_account']);
    expect(res.success).toBe(true);
    expect(calls).toContain('signInAnonymously');
  });

  it('does not delete when the function says the subscription could not be cancelled', async () => {
    fnReply = () => ({ data: null, error: { message: 'edge fn failed', context: { json: async () => ({ error: 'Could not cancel your subscription, so nothing was deleted. Please try again.' }) } } });
    const lb = await boot();
    const res = await lb.deleteAccount();
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/nothing was deleted/i);
    expect(calls.some((c) => c.startsWith('rpc:'))).toBe(false); // (the database is not asked to go round it)
    expect(calls).not.toContain('signOut');
  });

  it('falls back to the database when web payments are not set up on the project, which itself refuses while a subscription bills', async () => {
    fnReply = () => ({ data: null, error: { message: 'Requested function was not found' } });
    let lb = await boot();
    expect((await lb.deleteAccount()).success).toBe(true);
    expect(calls).toContain('rpc:delete_my_account');

    calls = [];
    rpcReply = () => ({ error: { message: 'You have a subscription that is still billing. Cancel it first.' } });
    lb = await boot();
    const refused = await lb.deleteAccount();
    expect(refused.success).toBe(false);
    expect(refused.error).toMatch(/still billing/i);
    expect(calls).not.toContain('signOut');
  });

  it('a guest, who has bought nothing, is deleted by the database directly', async () => {
    user = { id: 'g1', email: '', is_anonymous: true };
    const lb = await boot();
    expect((await lb.deleteAccount()).success).toBe(true);
    expect(calls.filter((c) => c.startsWith('fn:'))).toEqual([]);
    expect(calls).toContain('rpc:delete_my_account');
  });
});
