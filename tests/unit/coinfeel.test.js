import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  chimeRatio, chainContinues, CHAIN_WINDOW, coinReachable, coinWorth, coinsForObstacle, magnetX, coinBreather,
  COIN_GAP, NEAR_MISS_COINS, NEAR_MISS_Z, AIR_COIN_HEIGHT
} from '../../js/game/coinfx.js';
import { enableCoinInstancing, disableCoinInstancing, spawnCoinBatch, spawnCoinsForObstacle } from '../../js/game/obstacles.js';
import { VISUAL_SPEED } from '../../js/game/enginedefs.js';

describe('the rising chime', () => {
  it('starts on the base note and climbs with every coin in a chain, up to two octaves', () => {
    expect(chimeRatio(0)).toBe(1);
    let prev = 1;
    for (let n = 1; n <= 10; n++) { expect(chimeRatio(n)).toBeGreaterThan(prev); prev = chimeRatio(n); }
    expect(chimeRatio(5)).toBeCloseTo(2, 5); // an octave up on the sixth coin
    expect(chimeRatio(10)).toBeCloseTo(4, 5);
    expect(chimeRatio(40)).toBe(chimeRatio(10)); // the top note holds
    expect(chimeRatio(-3)).toBe(1);
    expect(chimeRatio(NaN)).toBe(1);
  });

  it('a chain survives a short pause and breaks after a long one', () => {
    expect(chainContinues(0.3)).toBe(true);
    expect(chainContinues(CHAIN_WINDOW)).toBe(true);
    expect(chainContinues(CHAIN_WINDOW + 0.2)).toBe(false);
    expect(chainContinues(-1)).toBe(false);
  });
});

describe('which coins can be reached, and what they are worth', () => {
  it('ground coins can always be taken; a coin in the air takes a jump', () => {
    expect(coinReachable(1.2, 0, false)).toBe(true);
    expect(coinReachable(AIR_COIN_HEIGHT - 0.1, 0, false)).toBe(true);
    expect(coinReachable(2.9, 0, true)).toBe(false);
    expect(coinReachable(2.9, 1.5, true)).toBe(true);
    expect(coinReachable(2.9, 3.2, true)).toBe(true); // the top of a jump gets the top of an arc
    expect(coinReachable(2.9, 0, false)).toBe(false); // anything high up counts as in the air
  });

  it('is worth one, double for an air coin taken mid-jump, and Frenzy and Gold Rush multiply it', () => {
    expect(coinWorth({})).toBe(1);
    expect(coinWorth({ airJump: true })).toBe(2);
    expect(coinWorth({ frenzy: true })).toBe(5);
    expect(coinWorth({ goldRush: true })).toBe(2);
    expect(coinWorth({ airJump: true, frenzy: true, goldRush: true })).toBe(20);
    expect(coinWorth()).toBe(1);
  });

  it('a close call pays a small, fixed burst', () => {
    expect(NEAR_MISS_COINS).toBeGreaterThan(1);
    expect(NEAR_MISS_COINS).toBeLessThan(10);
    expect(NEAR_MISS_Z).toBeGreaterThan(0);
  });
});

describe('coins that go with an obstacle', () => {
  it('a jump obstacle gets an arc that peaks right over it and needs the jump to collect', () => {
    const arc = coinsForObstacle('jump');
    expect(arc.length).toBeGreaterThanOrEqual(5);
    const peak = arc.reduce((a, c) => (c.y > a.y ? c : a));
    expect(Math.abs(peak.dz)).toBeLessThan(0.01);
    expect(peak.air).toBe(true);
    expect(coinReachable(peak.y, 0, true)).toBe(false); // standing on the ground, the top of the arc is out of reach
    expect(coinReachable(peak.y, 3.0, true)).toBe(true);  // a full jump gets all of it
    const dzs = arc.map((c) => c.dz);
    expect(Math.min(...dzs)).toBeCloseTo(-Math.max(...dzs), 5); // balanced around the obstacle
  });

  it('an overhead obstacle gets a low trail along the ground, no jump needed', () => {
    const trail = coinsForObstacle('slide');
    expect(trail.length).toBeGreaterThanOrEqual(5);
    trail.forEach((c) => { expect(c.y).toBeLessThan(1); expect(c.air).toBe(false); });
  });

  it('are spawned in the obstacle\'s own lane, around its position', () => {
    disableCoinInstancing();
    const scene = new THREE.Scene();
    const coins = [];
    const n = spawnCoinsForObstacle(scene, coins, { type: 'jump', lane: 2 }, -120);
    expect(n).toBe(coins.length);
    coins.forEach((c) => expect(c.userData.lane).toBe(2));
    const zs = coins.map((c) => c.position.z);
    expect(Math.min(...zs)).toBeLessThan(-120);
    expect(Math.max(...zs)).toBeGreaterThan(-120);
    expect(coins.some((c) => c.userData.air)).toBe(true);
    expect(spawnCoinsForObstacle(scene, coins, null, -100)).toBe(0);
  });
});

describe('the magnet', () => {
  it('curves a coin toward the runner without overshooting, and quicker once it is close', () => {
    const far = magnetX(3, 0, -30, 0.016);
    const near = magnetX(3, 0, -2, 0.016);
    expect(far).toBeLessThan(3);
    expect(near).toBeLessThan(far);
    expect(magnetX(3, 0, -2, 5)).toBeGreaterThanOrEqual(0); // a long frame lands on the runner, not past them
    expect(magnetX(-3, 0, -2, 5)).toBeLessThanOrEqual(0);
  });
});

describe('how coins are laid out', () => {
  beforeEach(() => disableCoinInstancing());

  it('are closer together than before, and the breather between batches is shorter', () => {
    expect(COIN_GAP).toBeLessThan(2);
    expect(coinBreather(1, false)).toBeLessThan(1.5);
    expect(coinBreather(1, true)).toBeLessThan(coinBreather(0, false));
    expect(coinBreather(0, false)).toBeGreaterThan(0);
  });

  it('every pattern has plenty of coins, never fills all three lanes at one spot, and has no stray values', () => {
    for (let trial = 0; trial < 60; trial++) {
      const scene = new THREE.Scene();
      const coins = [];
      const length = spawnCoinBatch(scene, coins, -60);
      expect(length).toBeGreaterThan(5);
      expect(coins.length).toBeGreaterThanOrEqual(6);
      const byZ = {};
      coins.forEach((c) => {
        expect(Number.isFinite(c.position.x + c.position.y + c.position.z)).toBe(true);
        const key = Math.round(c.position.z * 100);
        (byZ[key] = byZ[key] || new Set()).add(c.userData.lane);
      });
      Object.keys(byZ).forEach((k) => expect(byZ[k].size).toBeLessThan(3));
      // arcs reach the air; everything else stays on the ground
      coins.forEach((c) => { if (c.userData.air) expect(c.position.y).toBeGreaterThan(AIR_COIN_HEIGHT - 0.2); });
    }
  });

  it('a batch is long enough to run along for a while (a run of coins you can chase)', () => {
    let total = 0;
    for (let i = 0; i < 40; i++) total += spawnCoinBatch(new THREE.Scene(), [], -60);
    expect(total / 40).toBeGreaterThan(8);
    expect(VISUAL_SPEED).toBeGreaterThan(0);
  });

  it('works with the bulk-drawn coins too', () => {
    const scene = new THREE.Scene();
    enableCoinInstancing(scene);
    const coins = [];
    spawnCoinsForObstacle(scene, coins, { type: 'slide', lane: 0 }, -100);
    expect(coins.length).toBeGreaterThan(4);
    coins.forEach((c) => expect(c.children.length).toBe(0));
  });
});
