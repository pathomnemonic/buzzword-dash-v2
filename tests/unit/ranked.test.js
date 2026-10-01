import { describe, it, expect, vi, beforeEach } from 'vitest';

let rpcImpl;
let signedIn = true;
let hasClient = true;

vi.mock('../../js/leaderboard.js', () => ({
  leaderboard: {
    getClient: () => (hasClient ? { rpc: (name, args) => rpcImpl(name, args) } : null),
    isAuthenticated: () => signedIn
  }
}));

const { ranked, getCachedTrophies } = await import('../../js/ranked.js');

beforeEach(() => {
  localStorage.clear();
  signedIn = true;
  hasClient = true;
  rpcImpl = async () => ({ data: null, error: null });
});

describe('ranked client', () => {
  it('explains itself when offline or signed out, without throwing', async () => {
    hasClient = false;
    expect((await ranked.myStats()).ok).toBe(false);
    expect(ranked.isAvailable()).toBe(false);
    hasClient = true;
    signedIn = false;
    const r = await ranked.findMatch('ABCDE');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Sign in/);
  });

  it('turns database answers into plain objects and remembers the trophies', async () => {
    rpcImpl = async (name) => {
      if (name === 'ranked_my_stats') return { data: { trophies: 340, best_trophies: 360, wins: 5, losses: 3, draws: 0 }, error: null };
      return { data: null, error: null };
    };
    const s = await ranked.myStats();
    expect(s).toMatchObject({ ok: true, trophies: 340, best: 360, wins: 5, losses: 3 });
    expect(getCachedTrophies()).toBe(340);
  });

  it('finds a match as host or guest', async () => {
    rpcImpl = async (name, args) => {
      expect(name).toBe('ranked_find_match');
      expect(args).toEqual({ p_room_code: 'ABCDE' });
      return { data: { role: 'guest', match_id: 'm1', room_code: 'ZZZZ9', own_trophies: 10, opponent_trophies: 50 }, error: null };
    };
    expect(await ranked.findMatch('ABCDE')).toMatchObject({ ok: true, role: 'guest', matchId: 'm1', roomCode: 'ZZZZ9', opponentTrophies: 50 });
    rpcImpl = async () => ({ data: { role: 'host', own_trophies: 10 }, error: null });
    expect(await ranked.findMatch('ABCDE')).toMatchObject({ ok: true, role: 'host', matchId: null, roomCode: 'ABCDE' });
  });

  it('polls and reports', async () => {
    rpcImpl = async () => ({ data: { matched: false, waiting: true }, error: null });
    expect(await ranked.pollMatch()).toEqual({ ok: true, matched: false });
    rpcImpl = async () => ({ data: { matched: true, match_id: 'm2', room_code: 'ABCDE', own_trophies: 5, opponent_trophies: 9 }, error: null });
    expect(await ranked.pollMatch()).toMatchObject({ matched: true, matchId: 'm2' });
    rpcImpl = async () => ({ data: { settled: true, delta: 21, trophies: 321 }, error: null });
    expect(await ranked.report('m2', 'win')).toEqual({ ok: true, settled: true, delta: 21, trophies: 321 });
    expect(getCachedTrophies()).toBe(321);
  });

  it('turns server and network errors into messages', async () => {
    rpcImpl = async () => ({ data: null, error: { message: 'Not your match' } });
    expect(await ranked.report('x', 'win')).toEqual({ ok: false, error: 'Not your match' });
    rpcImpl = async () => { throw new Error('offline'); };
    expect(await ranked.top()).toEqual({ ok: false, error: 'offline' });
  });

  it('maps the top players list', async () => {
    rpcImpl = async () => ({ data: [{ user_id: 'u', player_name: 'Ada', avatar: 'a', trophies: 900, wins: 10, losses: 2 }], error: null });
    const t = await ranked.top(10);
    expect(t.players[0]).toMatchObject({ name: 'Ada', trophies: 900 });
  });
});
