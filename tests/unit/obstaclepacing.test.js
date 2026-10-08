import { describe, it, expect } from 'vitest';
import {
  obstacleChances, obstaclesForGate, expectedObstacles, MAX_OBSTACLES_PER_GATE, FIRST_OBSTACLE_MAX, SECOND_MAX, THIRD_MAX
} from '../../js/game/obstaclepacing.js';
import { DISTANCE_POINTS, SCORE_SCALE } from '../../js/game/enginedefs.js';
import { COIN_GAP } from '../../js/game/coinfx.js';
import { QUESTS } from '../../js/game/shopdata.js';

describe('obstacles get more frequent through a run, up to a cap', () => {
  it('start gently and never go past their caps', () => {
    expect(obstacleChances(0)[0]).toBeCloseTo(0.5, 5);
    expect(obstacleChances(0)[1]).toBe(0);
    for (let n = 0; n < 500; n += 7) {
      const c = obstacleChances(n);
      expect(c[0]).toBeLessThanOrEqual(FIRST_OBSTACLE_MAX);
      expect(c[1]).toBeLessThanOrEqual(SECOND_MAX);
      expect(c[2]).toBeLessThanOrEqual(THIRD_MAX);
    }
  });

  it('only ever rise as the run goes on', () => {
    let last = -1;
    for (let n = 0; n < 80; n++) { const e = expectedObstacles(n); expect(e).toBeGreaterThanOrEqual(last); last = e; }
  });

  it('never put more than the cap with one gate, however far in', () => {
    for (let n = 0; n < 200; n += 5) for (let i = 0; i < 50; i++) expect(obstaclesForGate(n)).toBeLessThanOrEqual(MAX_OBSTACLES_PER_GATE);
    expect(obstaclesForGate(500, () => 0)).toBe(MAX_OBSTACLES_PER_GATE); // the luckiest case is still capped
    expect(obstaclesForGate(500, () => 0.999)).toBe(0);
  });

  it('are busier late than early (the same run has more per gate at 30 answers than at 3)', () => {
    expect(expectedObstacles(30)).toBeGreaterThan(expectedObstacles(3) * 1.8);
  });
});

describe('the obstacle quests can be done in a normal run', () => {
  it('ask for no more jumps or slides than about fifteen gates bring', () => {
    let obstacles = 0;
    for (let n = 0; n < 15; n++) obstacles += expectedObstacles(n);
    const perKind = obstacles / 2; // (half jump, half slide)
    QUESTS.filter((q) => q.metric === 'obstaclesJumped' || q.metric === 'obstaclesSlid').forEach((q) => expect(q.target, q.title).toBeLessThanOrEqual(Math.ceil(perKind)));
    const dodge = QUESTS.find((q) => q.metric === 'dodges');
    expect(dodge.target).toBeLessThanOrEqual(Math.ceil(obstacles));
  });
});

describe('the score on screen is ahead of the coins in hand', () => {
  it('earns far more points a second from distance than coins a second from a stream of them', () => {
    const speed = 1.875; // the normal pace, run units a second
    const pointsPerSecond = speed * DISTANCE_POINTS;
    const coinsPerSecondInALine = speed / COIN_GAP; // as many as one lane can give, every coin taken
    expect(pointsPerSecond).toBeGreaterThan(coinsPerSecondInALine * 4);
    expect(SCORE_SCALE).toBeGreaterThan(1);
  });
});
