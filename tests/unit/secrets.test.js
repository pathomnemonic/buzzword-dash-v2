import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SKINS } from '../../js/game/skins.js';
import { SECRETS, secretFor, buildSecret, planSecretTime, isTapOnSecret, secretReward, SECRET_COINS, SECRET_FIRST_COINS } from '../../js/game/secrets.js';
import { masteryTier, masteryProgress, cleanMapAnswers, MASTERY } from '../../js/game/mapmastery.js';

describe('map secrets', () => {
  it('every map has one, with its own name', () => {
    SKINS.forEach((s) => expect(secretFor(s.name), s.name).toBeTruthy());
    expect(Object.keys(SECRETS).length).toBe(SKINS.length);
  });

  it('every kind builds a small, cheap, animated model', () => {
    new Set(Object.values(SECRETS).map((s) => s.kind)).forEach((kind) => {
      const g = buildSecret(kind);
      g.userData.baseY = 1;
      g.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(g);
      expect(box.getSize(new THREE.Vector3()).y, kind).toBeLessThan(3);
      let tris = 0;
      g.traverse((o) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
      expect(tris, kind).toBeLessThan(900);
      for (let t = 0; t < 5; t += 0.25) g.userData.tick(t);
      expect(Number.isFinite(g.position.y)).toBe(true);
    });
  });

  it('shows up partway through a run, pays more the first time, and takes a generous tap', () => {
    expect(planSecretTime(() => 0)).toBeGreaterThanOrEqual(20);
    expect(planSecretTime(() => 0.999)).toBeLessThan(75);
    expect(secretReward(true)).toBe(SECRET_FIRST_COINS);
    expect(secretReward(false)).toBe(SECRET_COINS);
    expect(SECRET_FIRST_COINS).toBeGreaterThan(SECRET_COINS);
    expect(isTapOnSecret(100, 100, 130, 120)).toBe(true);
    expect(isTapOnSecret(100, 100, 300, 300)).toBe(false);
  });
});

describe('map mastery', () => {
  it('goes silver then gold as questions are answered', () => {
    expect([0, 99, 100, 249, 250, 9999].map(masteryTier)).toEqual(['none', 'none', 'silver', 'silver', 'gold', 'gold']);
    expect(masteryProgress(50)).toMatchObject({ tier: 'none', goal: MASTERY.silver, left: 50 });
    expect(masteryProgress(120)).toMatchObject({ tier: 'silver', goal: MASTERY.gold });
    expect(masteryProgress(400)).toMatchObject({ tier: 'gold', fraction: 1, left: 0 });
  });

  it('cleans what the engine reports', () => {
    expect(cleanMapAnswers({ 'Candy Lab': 12, bad: -3, '': 4, Nan: 'x', Big: 9e9 })).toEqual({ 'Candy Lab': 12 });
    expect(cleanMapAnswers(null)).toEqual({});
    expect(cleanMapAnswers([1, 2])).toEqual({});
  });
});

describe('map mastery in the save', () => {
  it('counts answers per map, and pays a gold map once', async () => {
    localStorage.clear();
    const { storage } = await import('../../js/storage.js');
    storage.load();
    const run = (id, n) => ({ runId: id, mode: 'endless', endReason: 'out_of_lives', completed: true, startedAt: 1, endedAt: 2, durationMs: 1000, score: 10, coinsEarned: 0, coinsCollected: 0, encountersCompleted: n, correct: n, wrong: 0, bestStreak: 1, fastestDecisionMs: 900, continued: false, continuesUsed: 0, subjectsSeen: [], rushesUsed: 0, powerupsCollected: 0, obstaclesJumped: 0, obstaclesSlid: 0, dailyCompleted: false, encounters: [], mapAnswers: { 'Candy Lab': n }, multiplayer: { matchId: null, result: 'none' } });
    const coins0 = storage.get('coins');
    let r = storage.finalizeRun(run('m1', 200));
    expect(r.newMapMasteries).toEqual([]);
    expect(storage.mapAnswered('Candy Lab')).toBe(200);
    r = storage.finalizeRun(run('m2', 60));
    expect(r.newMapMasteries).toEqual(['Candy Lab']);
    expect(storage.get('coins')).toBe(coins0 + 500);
    r = storage.finalizeRun(run('m3', 60));
    expect(r.newMapMasteries).toEqual([]);
    expect(storage.mapAnswered('Candy Lab')).toBe(320);
    expect(storage.markSecretFound('Candy Lab')).toBe(true);
    expect(storage.markSecretFound('Candy Lab')).toBe(false);
    expect(storage.secretFound('Candy Lab')).toBe(true);
  });
});
