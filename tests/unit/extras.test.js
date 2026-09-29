import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { HazardManager, HAZARDS, HAZARD_BY_SKIN } from '../../js/game/hazards.js';
import { listDecks, getDeck, saveDeck, removeDeck } from '../../js/deckcache.js';
import { topSubjects } from '../../js/sharecard.js';
import { isoWeekKey, tournamentSeed } from '../../js/challenge.js';
import { SKINS } from '../../js/game/skins.js';

beforeEach(() => {
  localStorage.clear();
});

describe('map hazards', () => {
  it('has a hazard for every track and defined effects for each hazard', () => {
    SKINS.forEach((skin) => {
      const kind = HAZARD_BY_SKIN[skin.name];
      expect(kind, skin.name).toBeTruthy();
      expect(HAZARDS[kind], kind).toBeTruthy();
    });
  });

  it('waits for a few encounters, then runs for its duration and cools down', () => {
    const hz = new HazardManager();
    hz.cooldown = 0;
    expect(hz.maybeStart('Neon ER', 1, () => 0)).toBeNull();      // too early
    expect(hz.maybeStart('Neon ER', 5, () => 0.9)).toBeNull();    // unlucky roll
    expect(hz.maybeStart('Neon ER', 5, () => 0)).toBe('surge');
    expect(hz.maybeStart('Neon ER', 6, () => 0)).toBeNull();      // already active

    const fx = hz.update(0.5);
    expect(fx.type).toBe('surge');
    expect(fx.speedMult).toBeCloseTo(1.25);
    const end = hz.update(HAZARDS.surge.duration);
    expect(end.ended).toBe(true);
    expect(hz.type).toBeNull();
    expect(hz.maybeStart('Neon ER', 9, () => 0)).toBeNull();      // cooling down
  });

  it('only the surge changes speed; others never alter it', () => {
    Object.keys(HAZARDS).forEach((k) => {
      expect(HAZARDS[k].speed).toBe(k === 'surge' ? 1.25 : 1);
    });
  });
});

describe('offline deck cache', () => {
  const cards = [{ id: 'a', ans: 'X' }];

  it('saves, lists, reads and removes decks (codes are case-insensitive)', () => {
    expect(saveDeck('abcd1234', 'Cardio', cards)).toBe(true);
    expect(listDecks()).toHaveLength(1);
    expect(getDeck('ABCD1234').name).toBe('Cardio');
    removeDeck('abcd1234');
    expect(getDeck('ABCD1234')).toBeNull();
  });

  it('rejects empty decks and keeps only the newest ten', () => {
    expect(saveDeck('X', 'Empty', [])).toBe(false);
    for (let i = 0; i < 12; i++) {
      vi.setSystemTime(new Date(2026, 0, 1, 0, 0, i));
      saveDeck('DECK' + i, 'Deck ' + i, cards);
    }
    vi.useRealTimers();
    expect(listDecks()).toHaveLength(10);
    expect(getDeck('DECK0')).toBeNull();
    expect(getDeck('DECK11')).not.toBeNull();
  });
});

describe('share card and tournament helpers', () => {
  it('ranks the most-played subjects', () => {
    const runCards = [
      { card: { subj: 'A' }, ok: true }, { card: { subj: 'A' }, ok: false }, { card: { subj: 'A' }, ok: true },
      { card: { subj: 'B' }, ok: true }, { card: { subj: 'B' }, ok: true },
      { card: { subj: 'C' }, ok: false }, { card: { subj: 'D' }, ok: true }, {}
    ];
    const top = topSubjects(runCards);
    expect(top.map((t) => t.subject)).toEqual(['A', 'B', 'C']);
    expect(top[0]).toEqual({ subject: 'A', n: 3, ok: 2 });
  });

  it('uses ISO weeks and gives the whole week one seed', () => {
    expect(isoWeekKey(new Date(Date.UTC(2026, 8, 29)))).toBe('2026-W40');
    expect(isoWeekKey(new Date(Date.UTC(2027, 0, 1)))).toBe('2026-W53');
    const seed = tournamentSeed('2026-W40');
    expect(seed).toBe(tournamentSeed('2026-W40'));
    expect(seed).not.toBe(tournamentSeed('2026-W41'));
    expect(seed).toBeGreaterThan(0);
    expect(seed).toBeLessThan(2147483647);
  });
});

describe('purchasable monsters', () => {
  it('lists the four monsters and builds each with the parts the engine animates', async () => {
    // jsdom has no 2D canvas; the labels only need a drawing stub.
    const ctxStub = new Proxy({}, { get: () => () => {}, set: () => true });
    HTMLCanvasElement.prototype.getContext = () => ctxStub;
    const { buildMonster, MONSTER_IDS } = await import('../../js/game/monsters.js');
    const { SHOP_ITEMS } = await import('../../js/game/shopdata.js');
    expect(MONSTER_IDS).toHaveLength(4);
    MONSTER_IDS.forEach((id) => {
      expect(SHOP_ITEMS.some((i) => i.id === id && i.type === 'monster'), id + ' in shop').toBe(true);
      const group = buildMonster(id);
      const parts = group.userData.monsterParts;
      ['eyes', 'tentacles', 'questionMarks', 'ridge'].forEach((k) => expect(Array.isArray(parts[k]), id + '.' + k).toBe(true));
      expect(parts.body, id + ' body').toBeTruthy();
      expect(parts.aura, id + ' aura').toBeTruthy();
    });
    // Unknown ids fall back to the classic design
    expect(buildMonster('nonsense').userData.monsterParts.body).toBeTruthy();
  });
});

describe('animated glTF avatar', () => {
  it('is registered as a purchasable, model-backed avatar', async () => {
    const { AVATARS, SHOP_ITEMS } = await import('../../js/game/shopdata.js');
    const avatar = AVATARS.find((a) => a.id === 'avatar_robopro');
    expect(avatar.isModel).toBe(true);
    expect(avatar.modelUrl).toBe('models/RobotExpressive.glb');
    expect(SHOP_ITEMS.some((i) => i.id === 'avatar_robopro' && i.price > 0)).toBe(true);
  });
});

describe('leaderboard screen: feed and group goals', () => {
  function mockService(extra) {
    return Object.assign({
      getStatus: () => ({ configured: true, ready: true, authenticated: true, anonymous: true, email: '' }),
      getUserId: () => 'me',
      getModeLabel: (m) => m,
      getPendingRequests: () => Promise.resolve([]),
      getFriends: () => Promise.resolve([]),
      getTopScores: () => Promise.resolve([]),
      getFeed: () => Promise.resolve([])
    }, extra);
  }

  const tick = () => new Promise((r) => setTimeout(r, 30));

  it('renders activity as text (never markup) with a challenge button for friends', async () => {
    const { mountLeaderboardScreen } = await import('../../js/leaderboardui.js');
    const root = document.createElement('div');
    const evil = '<img src=x onerror=alert(1)>';
    const started = vi.fn();
    mountLeaderboardScreen(root, {
      leaderboard: mockService({
        getFeed: () => Promise.resolve([
          { id: 1, user_id: 'friend', kind: 'streak', payload: { name: evil, streak: 22 }, created_at: new Date().toISOString() },
          { id: 2, user_id: 'me', kind: 'new_best', payload: { name: 'Me', score: 999 }, created_at: new Date().toISOString() }
        ])
      }),
      storage: { get: () => '' },
      toast() {},
      getRoomCode: () => '',
      startChallenge: started
    });
    [...root.querySelectorAll('[role=tab]')].find((b) => /Feed/.test(b.textContent)).click();
    await tick();
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toContain('22-answer streak');
    const challengeButtons = [...root.querySelectorAll('button')].filter((b) => /Challenge/.test(b.textContent));
    expect(challengeButtons).toHaveLength(1); // not offered for your own events
    challengeButtons[0].click();
    expect(started).toHaveBeenCalled();
  });

  it('shows group goal progress and only lets the owner set it', async () => {
    const { mountLeaderboardScreen } = await import('../../js/leaderboardui.js');
    const goalRows = [
      { goal: 500, user_id: 'a', player_name: 'Ana', cards: 200 },
      { goal: 500, user_id: 'b', player_name: 'Ben', cards: 150 }
    ];
    const build = (isOwner) => {
      const root = document.createElement('div');
      mountLeaderboardScreen(root, {
        leaderboard: mockService({
          getMyGroups: () => Promise.resolve([{ id: 'g1', name: 'Class', code: 'ABC123', member_count: 2, is_owner: isOwner, weekly_goal: 500 }]),
          getGroupGoal: () => Promise.resolve(goalRows),
          getGroupScores: () => Promise.resolve([])
        }),
        storage: { get: () => '' },
        toast() {},
        getRoomCode: () => ''
      });
      [...root.querySelectorAll('[role=tab]')].find((b) => /Groups/.test(b.textContent)).click();
      return root;
    };
    const member = build(false);
    await tick();
    expect(member.textContent).toContain('350 / 500');
    expect(member.querySelector('[role=progressbar]').getAttribute('aria-valuenow')).toBe('350');
    expect(member.querySelector('input[type=number]')).toBeNull();

    const owner = build(true);
    await tick();
    expect(owner.querySelector('input[type=number]')).not.toBeNull();
  });
});

describe('adaptive music', () => {
  async function makeGenerator() {
    const { MusicGenerator } = await import('../../js/audio.js');
    const node = () => ({ connect() {}, gain: { value: 1 }, frequency: { value: 0, setTargetAtTime() {} }, Q: { value: 0 } });
    const ctx = { currentTime: 0, createGain: node, createBiquadFilter: node };
    const gen = new MusicGenerator(ctx, node(), 'Neon ER', () => ({ masterVolume: 1, musicVolume: 1 }));
    const calls = { bass: 0, melody: 0, hat: 0 };
    gen._playDrums = () => {};
    gen._playPad = () => {};
    gen._playBass = () => { calls.bass++; };
    gen._playMelody = () => { calls.melody++; };
    gen._playHiHat = () => { calls.hat++; };
    const playBar = () => { calls.bass = calls.melody = calls.hat = 0; for (let step = 0; step < 16; step++) gen._playStep(step, 0); return { ...calls }; };
    return { gen, playBar };
  }

  it('adds layers as intensity rises', async () => {
    const { gen, playBar } = await makeGenerator();
    gen.setIntensity(0.05, 0);
    expect(playBar()).toEqual({ bass: 0, melody: 0, hat: 0 });     // drums and pad only
    gen.setIntensity(0.2, 0);
    const withBass = playBar();
    expect(withBass.bass).toBeGreaterThan(0);
    expect(withBass.melody).toBe(0);
    gen.setIntensity(0.5, 0);
    expect(playBar().melody).toBeGreaterThan(0);
    gen.setIntensity(0.8, 0);
    expect(playBar().hat).toBe(8);                                   // busy off-beat hats
  });

  it('adds a low tension drone when the monster is close', async () => {
    const { gen, playBar } = await makeGenerator();
    gen.setIntensity(0.2, 0);
    const calm = playBar().bass;
    gen.setIntensity(0.2, 1);
    expect(playBar().bass).toBeGreaterThan(calm);
  });

  it('clamps out-of-range values', async () => {
    const { gen } = await makeGenerator();
    gen.setIntensity(-5, 9);
    expect([gen.intensity, gen.danger]).toEqual([0, 1]);
  });
});
