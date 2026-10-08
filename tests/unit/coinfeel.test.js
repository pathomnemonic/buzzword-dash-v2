import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  chimeRatio, chainContinues, CHAIN_WINDOW, coinReachable, coinWorth, coinsForObstacle, magnetX, coinGap, fillCoins, COIN_HORIZON,
  COIN_GAP, AIR_COIN_HEIGHT, coinTouches, COIN_REACH_X, COIN_REACH_Z, arcCoinCount
} from '../../js/game/coinfx.js';
import { enableCoinInstancing, disableCoinInstancing, spawnCoinBatch, spawnCoinsForObstacle } from '../../js/game/obstacles.js';
import { VISUAL_SPEED } from '../../js/game/enginedefs.js';

describe('the rising chime', () => {
  it('starts on the base note and climbs with every coin in a chain, up to one semitone', () => {
    expect(chimeRatio(0)).toBe(1);
    let prev = 1;
    for (let n = 1; n <= 6; n++) { expect(chimeRatio(n)).toBeGreaterThan(prev); prev = chimeRatio(n); }
    expect(chimeRatio(6)).toBeCloseTo(Math.pow(2, 1 / 12), 5); // a single semitone at the most
    expect(chimeRatio(1)).toBeLessThan(1.01); // the first step is barely there
    expect(chimeRatio(40)).toBe(chimeRatio(6)); // the top note holds
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
});

describe('coins that go with an obstacle', () => {
  it('a jump obstacle gets an arc that peaks right over it and needs the jump to collect', () => {
    const arc = coinsForObstacle('jump');
    expect(arc.length).toBeGreaterThanOrEqual(5);
    const peak = arc.reduce((a, c) => (c.y > a.y ? c : a));
    expect(Math.abs(peak.dz)).toBeLessThan(0.3); // (the jump's top is a little past the middle of its time in the air)
    expect(peak.air).toBe(true);
    expect(coinReachable(peak.y, 0, true)).toBe(false); // standing on the ground, the top of the arc is out of reach
    expect(coinReachable(peak.y, 3.0, true)).toBe(true);  // a full jump gets all of it
    const dzs = arc.map((c) => c.dz);
    expect(Math.min(...dzs)).toBeCloseTo(-Math.max(...dzs), 5); // balanced around the obstacle
  });

  it('the arc is the runner\'s own jump: it leaves and lands on the ground, and stretches with the run\'s speed', async () => {
    const { jumpProfile } = await import('../../js/game/jumpphysics.js');
    const { jumpArc, jumpArcLength, COIN_BASE_Y } = await import('../../js/game/coinfx.js');
    const prof = jumpProfile();
    [1.0, 1.875, 3.5].forEach((speed) => {
      const arc = jumpArc(speed, 9);
      const first = arc[0], last = arc[arc.length - 1];
      expect(first.y).toBeCloseTo(COIN_BASE_Y, 1); // takeoff, at ground level
      expect(last.y).toBeCloseTo(COIN_BASE_Y, 1);  // landing
      expect(first.dz - last.dz).toBeCloseTo(prof.airTime * speed, 5); // as long as the jump is, at this speed
      expect(jumpArcLength(speed)).toBeCloseTo(prof.airTime * speed, 5);
      const peak = Math.max(...arc.map((c) => c.y));
      expect(peak - COIN_BASE_Y).toBeGreaterThan(prof.peak * 0.9); // reaches (nearly) the top of the jump
      expect(peak - COIN_BASE_Y).toBeLessThanOrEqual(prof.peak + 0.01);
    });
    // each coin sits where the runner is at that moment of the jump
    const speed = 2.4;
    jumpArc(speed, 9).forEach((c) => {
      const t = prof.airTime / 2 - c.dz / speed;
      expect(c.y).toBeCloseTo(COIN_BASE_Y + prof.heightAt(t), 5);
    });
  });

  it('the jump the coins follow is the same one the engine takes (about a second and a quarter in the air, peaking near 3.4)', async () => {
    const { jumpProfile } = await import('../../js/game/jumpphysics.js');
    const p = jumpProfile();
    expect(p.airTime).toBeGreaterThan(1.1);
    expect(p.airTime).toBeLessThan(1.5);
    expect(p.peak).toBeGreaterThan(3.2);
    expect(p.peak).toBeLessThan(3.7);
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

  it('are closer together than before, and the gap between batches is short', () => {
    expect(COIN_GAP).toBeLessThan(2);
    expect(coinGap(1, false)).toBeLessThan(2);
    expect(coinGap(1, true)).toBeLessThan(coinGap(0, false));
    expect(coinGap(0, false)).toBeGreaterThan(0);
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

describe('coins are laid end to end, so a coin is almost always in view', () => {
  it('fills out to the horizon and stops there', () => {
    const laid = [];
    const tail = fillCoins(-12, (z) => { laid.push(z); return 10; }, () => 1);
    expect(tail).toBeLessThanOrEqual(-COIN_HORIZON);
    expect(laid[0]).toBeCloseTo(-13, 5);           // the first batch starts just past the starting point
    laid.forEach((z, i) => { if (i) expect(laid[i - 1] - z).toBeCloseTo(11, 5); }); // each starts one gap after the last ended
    expect(fillCoins(-60, () => { throw new Error('nothing to lay'); }, () => 1)).toBe(-60); // already filled
  });

  it('never loops for ever, even if a batch comes back empty', () => {
    let calls = 0;
    fillCoins(0, () => { calls++; return 0; }, () => 0);
    expect(calls).toBeLessThanOrEqual(6);
  });

  it('played end to end for two minutes, some lane has a coin within the next 40 units 99% of the time, and a gap never lasts long', () => {
    const scene = new THREE.Scene();
    let coins = [];
    let tail = -12;
    const speed = 1.875; // pattern units per second at 1x
    const dt = 1 / 30;
    let samples = 0; let covered = 0; let run = 0; let worstRun = 0;
    for (let t = 0; t < 120; t += dt) {
      const move = speed * dt;
      coins.forEach((c) => { c.position.z += move * VISUAL_SPEED; });
      coins = coins.filter((c) => c.position.z < 3 * VISUAL_SPEED);
      tail += move;
      tail = fillCoins(tail, (z) => spawnCoinBatch(scene, coins, z), () => coinGap(Math.random(), false));
      if (t > 3) {
        samples++;
        const ahead = coins.some((c) => c.position.z < 0 && c.position.z > -40);
        if (ahead) { covered++; run = 0; } else { run += dt; worstRun = Math.max(worstRun, run); }
      }
    }
    expect(covered / samples).toBeGreaterThanOrEqual(0.99);
    expect(worstRun).toBeLessThan(1);
  });
});

describe('coins cannot be scooped from two lanes by flicking between them', () => {
  beforeEach(() => disableCoinInstancing());

  it('a coin is taken only where the runner is, and only as it passes', () => {
    expect(coinTouches(0, 0)).toBe(true);
    expect(coinTouches(COIN_REACH_X - 0.01, COIN_REACH_Z - 0.01)).toBe(true);
    expect(coinTouches(3, 0)).toBe(false);                 // the next lane over
    expect(coinTouches(1.5, 0)).toBe(false);               // half way between two lanes takes neither
    expect(coinTouches(0, 4)).toBe(false);                 // well ahead or behind
    expect(coinTouches(0, -COIN_REACH_Z)).toBe(false);
    expect(COIN_REACH_X).toBeLessThan(1.5);                // less than half a lane
  });

  it('no pattern puts coins in two lanes at the same spot, or close enough along the track to take both without a lane change', () => {
    const LANE_CHANGE_ALONG = 1.3; // pattern units: about a lane change at normal speed
    for (let trial = 0; trial < 120; trial++) {
      const coins = [];
      spawnCoinBatch(new THREE.Scene(), coins, -60);
      const flat = coins.filter((c) => !c.userData.air);
      for (let a = 0; a < flat.length; a++) {
        for (let b = a + 1; b < flat.length; b++) {
          if (flat[a].userData.lane === flat[b].userData.lane) continue;
          const along = Math.abs(flat[a].position.z - flat[b].position.z) / VISUAL_SPEED;
          expect(along, 'two lanes ' + along.toFixed(2) + ' apart').toBeGreaterThanOrEqual(LANE_CHANGE_ALONG);
        }
      }
    }
  });

  it('even a runner who teleports to the best lane every instant cannot take two coins from the same slot', () => {
    // sweep a runner along a batch, always standing under whichever coin is nearest, and count how many coins are taken
    for (let trial = 0; trial < 60; trial++) {
      const coins = [];
      spawnCoinBatch(new THREE.Scene(), coins, -60);
      const total = coins.length;
      let taken = 0;
      const alive = coins.slice();
      for (let z = -65 * VISUAL_SPEED; z < 5; z += 0.05) {
        alive.forEach((c) => { c.position.z += 0.05; });
        // the best case: stand exactly under the nearest coin that is within reach
        const near = alive.filter((c) => Math.abs(c.position.z) < COIN_REACH_Z).sort((p, q) => Math.abs(p.position.z) - Math.abs(q.position.z))[0];
        if (near) {
          const px = near.position.x;
          for (let k = alive.length - 1; k >= 0; k--) if (coinTouches(alive[k].position.x - px, alive[k].position.z)) { alive.splice(k, 1); taken++; }
        }
      }
      expect(taken).toBeLessThanOrEqual(total);
      expect(taken).toBeGreaterThan(0);
    }
  });
});

describe('jumping and sliding clear obstacles at every speed setting', () => {
  // the speed dial's steps (js/ui.js SPEED_STEPS); the run's speed is 1.875 × the dial, and the road moves 2.2 world units per run unit
  const STEPS = [0.25, 0.5, 0.75, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const worldSpeed = (step) => 1.875 * step * 2.2;

  it('a jump started anywhere in a wide span of moments clears a low obstacle, at the slowest speed and the fastest', async () => {
    const J = await import('../../js/game/jumpphysics.js');
    const dt = 1 / 120;
    STEPS.forEach((step) => {
      const ok = [];
      // `lead` = how long before the obstacle reaches the runner's judging spot the jump starts (negative: after it left)
      for (let lead = -0.2; lead <= 3.2; lead += 0.02) {
        // the obstacle is judged at t = 0; before that it is within the clearing window once t > -(AHEAD + HIT_Z) / worldSpeed
        const windowOpen = -(J.OBSTACLE_CLEAR_AHEAD + J.OBSTACLE_HIT_Z) / worldSpeed(step);
        let y = 0, v = J.JUMP_SPEED, cleared = false;
        for (let t = -lead; t <= 0; t += dt) {
          const s = J.jumpStep(y, v, dt); y = s.y; v = s.v;
          if (y <= 0) break;
          if (t > windowOpen && y > J.MIN_JUMP_CLEARANCE) cleared = true;
        }
        if (cleared) ok.push(lead);
      }
      const span = ok.length ? ok[ok.length - 1] - ok[0] : 0;
      expect(span, `jump at ${step}×`).toBeGreaterThan(1.0); // over a second of "good" moments to start the jump
      // the moment the coin arc is built around (the middle of the jump over the obstacle) is a good one
      const ideal = jumpProfileAirHalf(J);
      expect(ok.some((l) => Math.abs(l - ideal) < 0.05), `ideal jump at ${step}×`).toBe(true);
    });
  });

  it('a slide started anywhere in a wide span of moments clears an overhead obstacle, at every speed', async () => {
    const J = await import('../../js/game/jumpphysics.js');
    STEPS.forEach((step) => {
      const windowDuration = (J.OBSTACLE_CLEAR_AHEAD + J.OBSTACLE_HIT_Z) / worldSpeed(step);
      // a slide started `lead` seconds before the judging moment lasts SLIDE_TIME; it counts if it overlaps the window
      const span = windowDuration + J.SLIDE_TIME;
      expect(span, `slide at ${step}×`).toBeGreaterThan(1.0);
    });
  });

  it('arcs have enough coins to look like a curve at a crawl and are never a pile', () => {
    STEPS.forEach((step) => {
      const n = arcCoinCount(1.875 * step, 11);
      expect(n).toBeGreaterThanOrEqual(5);
      expect(n).toBeLessThanOrEqual(11);
    });
    expect(arcCoinCount(1.875 * 0.25, 11)).toBeLessThan(arcCoinCount(1.875 * 4, 11));
  });
});

function jumpProfileAirHalf(J) {
  return J.jumpProfile().airTime / 2;
}
