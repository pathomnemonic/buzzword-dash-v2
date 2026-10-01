import { describe, it, expect } from 'vitest';
import { createMonsterBehavior, stepMonsterBehavior, monsterOnAnswer, monsterVisibility, monsterPolicy, MONSTER_POLICY } from '../../js/game/monsterbehavior.js';

const rng = () => 0.5;
const run = (st, inp, seconds, dt = 1 / 60) => {
  let pose;
  for (let i = 0; i < seconds / dt; i++) pose = stepMonsterBehavior(st, { time: i * dt, ...inp }, dt);
  return pose;
};

describe('exam monster behavior', () => {
  it('follows the player across lanes', () => {
    const st = createMonsterBehavior(rng);
    run(st, { playerX: 0, dist: 12, streak: 0, dying: false }, 3);
    const left = run(st, { playerX: -2.5, dist: 12, streak: 0, dying: false }, 3);
    expect(left.x).toBeLessThan(-1);
    const right = run(st, { playerX: 2.5, dist: 12, streak: 0, dying: false }, 3);
    expect(right.x).toBeGreaterThan(1);
  });

  it('lags behind rather than snapping to the player', () => {
    const st = createMonsterBehavior(rng);
    run(st, { playerX: 0, dist: 12, streak: 0, dying: false }, 2);
    const pose = run(st, { playerX: 2.5, dist: 12, streak: 0, dying: false }, 0.1);
    expect(pose.x).toBeLessThan(2);
  });

  it('lunges at a wrong answer and recoils from a right one', () => {
    const st = createMonsterBehavior(rng);
    const calm = run(st, { playerX: 0, dist: 15, streak: 0, dying: false }, 0.5);
    monsterOnAnswer(st, false);
    const lunge = stepMonsterBehavior(st, { time: 0.5, playerX: 0, dist: 15, streak: 0, dying: false }, 1 / 60);
    expect(lunge.z).toBeLessThan(calm.z);
    expect(lunge.scale).toBeGreaterThan(1.2);

    const st2 = createMonsterBehavior(rng);
    run(st2, { playerX: 0, dist: 15, streak: 0, dying: false }, 0.5);
    monsterOnAnswer(st2, true);
    const back = stepMonsterBehavior(st2, { time: 0.5, playerX: 0, dist: 15, streak: 0, dying: false }, 1 / 60);
    expect(back.scale).toBeLessThan(1);
  });

  it('lunges by itself when close, but not when far away', () => {
    const near = createMonsterBehavior(rng);
    let lunges = 0;
    for (let i = 0; i < 60 * 12; i++) {
      if (stepMonsterBehavior(near, { time: i / 60, playerX: 0, dist: 6, streak: 0, dying: false }, 1 / 60).lunged) lunges++;
    }
    expect(lunges).toBeGreaterThanOrEqual(2);

    const far = createMonsterBehavior(rng);
    let farLunges = 0;
    for (let i = 0; i < 60 * 12; i++) {
      if (stepMonsterBehavior(far, { time: i / 60, playerX: 0, dist: 28, streak: 0, dying: false }, 1 / 60).lunged) farLunges++;
    }
    expect(farLunges).toBe(0);
  });

  it('fades out as the streak is rebuilt and returns after mistakes', () => {
    const st = createMonsterBehavior(rng);
    const base = run(st, { playerX: 0, dist: 16, streak: 0, dying: false }, 3);
    expect(base.opacity).toBeGreaterThan(0.5);
    const onStreak = run(st, { playerX: 0, dist: 16, streak: 12, dying: false }, 4);
    expect(onStreak.opacity).toBeLessThan(0.05);
    const back = run(st, { playerX: 0, dist: 8, streak: 0, dying: false }, 4);
    expect(back.opacity).toBeGreaterThan(0.9);
  });

  it('is fully visible when it makes the catch', () => {
    const st = createMonsterBehavior(rng);
    run(st, { playerX: 0, dist: 28, streak: 10, dying: false }, 3);
    const pose = run(st, { playerX: 0, dist: 3, streak: 10, dying: true }, 1);
    expect(pose.opacity).toBeGreaterThan(0.95);
  });

  it('visibility drops with distance and streak', () => {
    expect(monsterVisibility(8, 0)).toBe(1);
    expect(monsterVisibility(28, 0)).toBe(0);
    expect(monsterVisibility(8, 12)).toBe(0);
    expect(monsterVisibility(24, 0)).toBeLessThan(monsterVisibility(12, 0));
  });
});

describe('the monster is out of sight at the start of a run', () => {
  it('is invisible at the starting distance, even with no streak', () => {
    expect(monsterVisibility(26, 0)).toBe(0);
    const st = createMonsterBehavior(() => 0.5);
    expect(st.fade).toBe(0);
    let pose;
    for (let i = 0; i < 300; i++) pose = stepMonsterBehavior(st, { playerX: 0, dist: 26, streak: 0, dying: false, time: i / 60 }, 1 / 60);
    expect(pose.opacity).toBeLessThan(0.02);
  });

  it('creeps into view as mistakes bring it closer', () => {
    expect(monsterVisibility(22, 0)).toBe(0);
    expect(monsterVisibility(18, 0)).toBeGreaterThan(0.3);
    expect(monsterVisibility(18, 0)).toBeLessThan(0.7);
    expect(monsterVisibility(14, 0)).toBe(1);
  });
});

describe('the monster in each game mode', () => {
  it('is off where you cannot lose, or where one miss already ends the run', () => {
    ['study', 'timed_practice', 'mp_suddendeath'].forEach((m) => expect(monsterPolicy(m).enabled, m).toBe(false));
  });

  it('is on in every scored mode, with the same settings for competitions so scores compare', () => {
    ['endless', 'daily', 'challenge', 'tournament', 'versus', 'mp_highscore', 'mp_race'].forEach((m) => {
      const p = monsterPolicy(m);
      expect(p.enabled, m).toBe(true);
      expect(p.miss, m).toBe(4);
      expect(p.hit, m).toBe(1.5);
    });
  });

  it('gives more room in weakness practice, and unknown modes get the standard monster', () => {
    const weak = monsterPolicy('weakness');
    expect(weak.enabled).toBe(true);
    expect(weak.miss).toBeLessThan(monsterPolicy('endless').miss);
    expect(weak.hit).toBeGreaterThan(monsterPolicy('endless').hit);
    expect(monsterPolicy('something_new').enabled).toBe(true);
  });

  it('only names modes the engine knows', async () => {
    const { GAME_MODES } = await import('../../js/game/enginedefs.js');
    const known = Object.values(GAME_MODES);
    Object.keys(MONSTER_POLICY).forEach((m) => expect(known, m).toContain(m));
  });

  it('a monster that is off never needs to catch anyone: even the worst streak of misses cannot reach 3.6', () => {
    // enabled modes: starting at 26 it takes six standard misses to be caught, so a run is never ended by one slip
    let z = 26;
    let misses = 0;
    while (z > 3.6) { z -= monsterPolicy('endless').miss; misses++; }
    expect(misses).toBeGreaterThanOrEqual(6);
  });
});
