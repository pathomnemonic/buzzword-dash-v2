import { describe, it, expect, beforeEach } from 'vitest';
import { decideSync, summarize, isFresh, isPoorer, CloudSync } from '../../js/cloudsync.js';

const played = (answered, coins = answered * 2, best = 100) => ({
  schemaVersion: 2,
  progression: { totalEncounters: answered, totalCoinsEarned: coins, bestScore: best, dailyStreak: 1 }
});
const fresh = () => ({ schemaVersion: 2, progression: { totalEncounters: 0, totalCoinsEarned: 100, bestScore: 0 } });
const remote = (data, updatedAt = 't1') => ({ data, updatedAt });

describe('summarize / isFresh', () => {
  it('treats a save with no play as fresh', () => {
    expect(isFresh(fresh())).toBe(true);
    expect(isFresh(played(5))).toBe(false);
    expect(summarize(played(5)).answered).toBe(5);
    expect(isFresh(null)).toBe(true);
  });

  it('counts flashcard and exam study, purchases and own cards as real content', () => {
    // totalCardsStudied grows in flashcard and exam sessions as well as in runs
    const studiedOnly = { schemaVersion: 2, progression: { totalEncounters: 0, totalCoinsEarned: 100, bestScore: 0, totalCardsStudied: 40 } };
    expect(isFresh(studiedOnly)).toBe(false);
    // an item bought beyond the starter set
    const bought = fresh();
    bought.progression.ownedItems = ['avatar_intern', 'hat_none', 'trail_none', 'gear_none', 'cloth_none', 'monster_classic', 'monster_m_ghost', 'pal_none', 'pal_cat', 'trail_pills'];
    expect(isFresh(bought)).toBe(false);
    // a deck of the player's own cards, passed in by the caller
    expect(isFresh(fresh(), 3)).toBe(false);
    expect(isFresh(fresh(), 0)).toBe(true);
  });
});

describe('decideSync', () => {
  const meta = { userId: 'u1', remoteUpdatedAt: 't1' };

  it('pushes first-time progress and does nothing for an empty new account', () => {
    expect(decideSync({ local: played(5), remote: null, meta: null, userId: 'u1', dirty: false })).toBe('push');
    expect(decideSync({ local: fresh(), remote: null, meta: null, userId: 'u1', dirty: false })).toBe('noop');
  });

  it('loads the cloud save on a brand-new device', () => {
    expect(decideSync({ local: fresh(), remote: remote(played(50)), meta: null, userId: 'u1', dirty: false })).toBe('pull');
  });

  it('pushes local changes when nobody else has saved', () => {
    expect(decideSync({ local: played(6), remote: remote(played(5)), meta, userId: 'u1', dirty: true })).toBe('push');
    expect(decideSync({ local: played(5), remote: remote(played(5)), meta, userId: 'u1', dirty: false })).toBe('noop');
  });

  it('pulls when another device saved and this one is unchanged', () => {
    expect(decideSync({ local: played(5), remote: remote(played(9), 't2'), meta, userId: 'u1', dirty: false })).toBe('pull');
  });

  it('asks when both sides changed, or when the two were never linked', () => {
    expect(decideSync({ local: played(6), remote: remote(played(9), 't2'), meta, userId: 'u1', dirty: true })).toBe('conflict');
    expect(decideSync({ local: played(6), remote: remote(played(9)), meta: null, userId: 'u1', dirty: false })).toBe('conflict');
    // A record from a different account never counts as a link.
    expect(decideSync({ local: played(6), remote: remote(played(9)), meta: { userId: 'other', remoteUpdatedAt: 't1' }, userId: 'u1', dirty: false })).toBe('conflict');
  });

  it('never swaps a bigger save for a smaller one, or writes a smaller one over a bigger one, without asking', () => {
    // another device (or a wiped one) put a smaller save in the cloud: do not pull it over a bigger local save
    expect(decideSync({ local: played(50), remote: remote(played(3), 't2'), meta, userId: 'u1', dirty: false })).toBe('conflict');
    // this device is smaller than the cloud though it thinks it is up to date: do not push it
    expect(decideSync({ local: played(3), remote: remote(played(50)), meta, userId: 'u1', dirty: true })).toBe('conflict');
    // growing normally is unaffected
    expect(decideSync({ local: played(51), remote: remote(played(50)), meta, userId: 'u1', dirty: true })).toBe('push');
  });

  it('quietly links identical saves', () => {
    expect(decideSync({ local: played(5), remote: remote(played(5)), meta: null, userId: 'u1', dirty: false })).toBe('adopt');
  });

  it('asks before pulling over an empty save this device deliberately changed (a reset)', () => {
    expect(decideSync({ local: fresh(), remote: remote(played(50)), meta, userId: 'u1', dirty: true })).toBe('conflict');
    // untouched empty save on a linked device still takes the cloud copy
    expect(decideSync({ local: fresh(), remote: remote(played(50)), meta, userId: 'u1', dirty: false })).toBe('pull');
    // a different account's record is not a link, so this is a new device for this account
    expect(decideSync({ local: fresh(), remote: remote(played(50)), meta: { userId: 'other', remoteUpdatedAt: 't1' }, userId: 'u1', dirty: true })).toBe('pull');
  });

  it('does not treat a flashcard-only player as a new device', () => {
    const studiedOnly = { schemaVersion: 2, progression: { totalEncounters: 0, totalCoinsEarned: 100, bestScore: 0, totalCardsStudied: 12 } };
    expect(decideSync({ local: studiedOnly, remote: remote(played(50)), meta: null, userId: 'u1', dirty: false })).toBe('conflict');
    expect(decideSync({ local: fresh(), remote: remote(played(50)), meta: null, userId: 'u1', dirty: false, localCards: 5 })).toBe('conflict');
  });
});

function makeDeps({ local, cloud, anonymous = false, choice = 'cloud', cards = null }) {
  const calls = { push: [], force: [], applied: null, pulled: 0, asked: null };
  const store = { data: local, onChange: null, applyRemoteData(d) { calls.applied = d; this.data = d; return { ok: true }; } };
  const state = { cloud };
  const leaderboard = {
    getStatus: () => ({ authenticated: true, anonymous }),
    getUserId: () => 'u1',
    onAuthEvent: () => () => {},
    pullSave: async () => ({ success: true, save: state.cloud, error: null }),
    pushSave: async (data, runs, base) => {
      calls.push.push({ data, runs, base });
      state.cloud = { data, updatedAt: 't-new' };
      return { success: true, updatedAt: 't-new', error: null };
    },
    forceSave: async (data) => {
      calls.force.push(data);
      state.cloud = { data, updatedAt: 't-forced' };
      return { success: true, updatedAt: 't-forced', error: null };
    }
  };
  const sync = new CloudSync({
    storage: store,
    leaderboard,
    toast: () => {},
    askConflict: async (l, c) => { calls.asked = [l, c]; return choice; },
    onPulled: () => { calls.pulled++; },
    customCards: cards
  });
  return { sync, store, calls, state };
}

describe('CloudSync', () => {
  beforeEach(() => localStorage.clear());

  it('never syncs a guest', async () => {
    const { sync, calls } = makeDeps({ local: played(5), cloud: null, anonymous: true });
    expect(sync.enabled).toBe(false);
    expect(await sync.sync()).toBe('off');
    expect(calls.push).toHaveLength(0);
  });

  it('uploads existing progress the first time', async () => {
    const { sync, calls } = makeDeps({ local: played(5), cloud: null });
    expect(await sync.sync()).toBe('pushed');
    expect(calls.push[0].base).toBeNull();
    expect(calls.push[0].runs).toBe(5);
    expect(sync.getStatus().state).toBe('idle');
  });

  it('downloads the cloud save on a fresh device and tells the app to reload', async () => {
    const { sync, calls, store } = makeDeps({ local: fresh(), cloud: remote(played(50)) });
    expect(await sync.sync()).toBe('pulled');
    expect(calls.pulled).toBe(1);
    expect(summarize(store.data).answered).toBe(50);
  });

  it('sends the last-synced timestamp so a stale device cannot overwrite', async () => {
    const { sync, calls } = makeDeps({ local: played(5), cloud: null });
    await sync.sync(); // first push records t-new
    sync.dirty = true;
    await sync.sync();
    expect(calls.push[1].base).toBe('t-new');
  });

  it('lets the player pick the cloud or this device when both have progress', async () => {
    const a = makeDeps({ local: played(6), cloud: remote(played(9)), choice: 'cloud' });
    expect(await a.sync.sync()).toBe('pulled');
    expect(a.calls.asked[0].answered).toBe(6);
    expect(a.calls.asked[1].answered).toBe(9);

    localStorage.clear();
    const b = makeDeps({ local: played(6), cloud: remote(played(9)), choice: 'local' });
    expect(await b.sync.sync()).toBe('pushed');
    expect(b.calls.force).toHaveLength(1);
    expect(b.calls.pulled).toBe(0);

    localStorage.clear();
    const c = makeDeps({ local: played(6), cloud: remote(played(9)), choice: null });
    expect(await c.sync.sync()).toBe('deferred');
    expect(c.calls.force).toHaveLength(0);
  });
});


describe('CloudSync carries the player\'s own cards', () => {
  const fakeCards = (initial) => {
    let list = initial.slice();
    const subs = [];
    return {
      getAll: () => list.slice(),
      replaceAll: (c) => { list = c.slice(); return list.length; },
      subscribe: (fn) => { subs.push(fn); return () => {}; },
      fire: () => subs.forEach((f) => f())
    };
  };
  const card = (n) => ({ id: 'custom_' + n, subj: 'Cardiology', bw: ['clue ' + n], ans: 'answer ' + n });
  beforeEach(() => localStorage.clear());

  it('uploads them with the save, and a new device gets them back', async () => {
    const mine = fakeCards([card(1), card(2)]);
    const a = makeDeps({ local: played(5), cloud: null, cards: mine });
    await a.sync.sync();
    expect(a.calls.push[0].data.customCards.length).toBe(2);

    const theirs = fakeCards([]);
    const b = makeDeps({ local: fresh(), cloud: remote(a.calls.push[0].data), cards: theirs });
    expect(await b.sync.sync()).toBe('pulled');
    expect(theirs.getAll().map((c) => c.ans)).toEqual(['answer 1', 'answer 2']);
    expect(b.store.data.customCards).toBeUndefined(); // the cards are not left inside the progress data
  });

  it('a change to the cards alone marks the save dirty so it syncs', async () => {
    const mine = fakeCards([card(1)]);
    const a = makeDeps({ local: played(5), cloud: null, cards: mine });
    a.sync.start();
    await a.sync.sync();
    a.sync.dirty = false;
    mine.fire();
    expect(a.sync.dirty).toBe(true);
  });

  it('a very large deck stays on the device instead of making every sync heavy', async () => {
    const big = fakeCards(Array.from({ length: 4000 }, (_, i) => ({ ...card(i), tp: 'x'.repeat(200) })));
    const a = makeDeps({ local: played(5), cloud: null, cards: big });
    await a.sync.sync();
    expect(a.calls.push[0].data.customCards).toBeUndefined();
  });
});

describe('isPoorer', () => {
  it('is true only when nothing is ahead and something is behind', () => {
    expect(isPoorer(summarize(played(3)), summarize(played(50)))).toBe(true);
    expect(isPoorer(summarize(played(50)), summarize(played(3)))).toBe(false);
    expect(isPoorer(summarize(played(5)), summarize(played(5)))).toBe(false);
  });
});

describe('CloudSync remembers unsynced changes across a relaunch', () => {
  beforeEach(() => localStorage.clear());

  it('restores the dirty flag from the sync record and writes it back on change', async () => {
    localStorage.setItem('bd_cloud_meta', JSON.stringify({ userId: 'u1', remoteUpdatedAt: 't1', localDirty: true }));
    const a = makeDeps({ local: played(6), cloud: remote(played(6)) });
    expect(a.sync.dirty).toBe(true);

    localStorage.clear();
    const b = makeDeps({ local: played(5), cloud: null });
    expect(b.sync.dirty).toBe(false);
    b.sync.start();
    b.store.onChange();
    expect(JSON.parse(localStorage.getItem('bd_cloud_meta')).localDirty).toBe(true);
  });

  it('asks instead of pulling when a relaunched device holds offline progress another device has since saved over', async () => {
    // device played offline, sync on hide failed, app closed; the other device pushed meanwhile
    localStorage.setItem('bd_cloud_meta', JSON.stringify({ userId: 'u1', remoteUpdatedAt: 't1', localDirty: true }));
    const a = makeDeps({ local: played(6), cloud: remote(played(9), 't2'), choice: null });
    expect(await a.sync.sync()).toBe('deferred');
    expect(a.calls.pulled).toBe(0);
    expect(a.calls.asked).not.toBeNull();
  });

  it('asks instead of pulling the old cloud save back over a reset', async () => {
    localStorage.setItem('bd_cloud_meta', JSON.stringify({ userId: 'u1', remoteUpdatedAt: 't1', localDirty: true }));
    const a = makeDeps({ local: fresh(), cloud: remote(played(50)), choice: null });
    expect(await a.sync.sync()).toBe('deferred');
    expect(a.calls.pulled).toBe(0);
  });
});

describe('CloudSync deck protection', () => {
  const fakeCards = (initial) => {
    let list = initial.slice();
    const subs = [];
    return {
      getAll: () => list.slice(),
      replaceAll: (c) => { list = c.slice(); return list.length; },
      subscribe: (fn) => { subs.push(fn); return () => {}; },
      fire: () => subs.forEach((f) => f())
    };
  };
  const card = (n) => ({ id: 'custom_' + n, subj: 'Cardiology', bw: ['clue ' + n], ans: 'answer ' + n });
  beforeEach(() => localStorage.clear());

  it('propagates deleting every card once the deck has synced before', async () => {
    const mine = fakeCards([card(1)]);
    const a = makeDeps({ local: played(5), cloud: null, cards: mine });
    expect(await a.sync.sync()).toBe('pushed');
    expect(a.calls.push[0].data.customCards).toHaveLength(1);

    mine.replaceAll([]);
    a.sync.dirty = true;
    expect(await a.sync.sync()).toBe('pushed');
    const last = a.calls.push[a.calls.push.length - 1];
    expect(last.data.customCards).toEqual([]);
  });

  it('never replaces a too large local deck with the smaller cloud list; it merges instead', async () => {
    const big = fakeCards(Array.from({ length: 4000 }, (_, i) => ({ ...card(i), tp: 'x'.repeat(200) })));
    const cloudData = played(9);
    cloudData.customCards = [card(9999)];
    const a = makeDeps({ local: played(6), cloud: remote(cloudData), choice: 'cloud', cards: big });
    expect(await a.sync.sync()).toBe('pulled');
    const after = big.getAll();
    expect(after.length).toBe(4001);
    expect(after.some((c) => c.id === 'custom_0')).toBe(true);
    expect(after.some((c) => c.id === 'custom_9999')).toBe(true);
  });
});
