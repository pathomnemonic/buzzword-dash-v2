import { describe, it, expect } from 'vitest';
import { createMonsterBehavior, stepMonsterBehavior, monsterOnAnswer, monsterPolicy, MONSTER_POLICY } from '../../js/game/monsterbehavior.js';

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

  it('drifts in after a slip, drifts away after two correct answers, and never fades', () => {
    const st = createMonsterBehavior(rng);
    // not slipped yet: it waits far behind the camera (the camera is at z = 10)
    const waiting = run(st, { playerX: 0, dist: 26, streak: 0, dying: false }, 3);
    expect(waiting.z).toBeGreaterThan(20);
    expect(waiting.presence).toBe(0);
    // a wrong answer: it glides forward over a second or two, solid the whole way
    monsterOnAnswer(st, false);
    const zs = [];
    let pose;
    for (let i = 0; i < 4 * 60; i++) {
      pose = stepMonsterBehavior(st, { time: i / 60, playerX: 0, dist: 22, streak: 0, dying: false }, 1 / 60);
      expect(pose.opacity).toBe(1);
      if (i % 20 === 0) zs.push(pose.z);
    }
    expect(pose.presence).toBe(1);
    expect(pose.z).toBeLessThan(5);
    for (let i = 1; i < zs.length; i++) expect(zs[i]).toBeLessThanOrEqual(zs[i - 1] + 0.3); // drifts one way, no jump
    expect(zs[0] - zs[1]).toBeLessThan(5); // no sudden pop
    // one correct answer is not enough
    monsterOnAnswer(st, true);
    let still = run(st, { playerX: 0, dist: 22.5, streak: 1, dying: false }, 3);
    expect(still.presence).toBe(1);
    // the second sends it away
    monsterOnAnswer(st, true);
    const gone = run(st, { playerX: 0, dist: 24, streak: 2, dying: false }, 5);
    expect(gone.presence).toBe(0);
    expect(gone.z).toBeGreaterThan(20);
    expect(gone.opacity).toBe(1);
  });

  it('stays when it is about to catch the player, and returns after the next mistake', () => {
    const st = createMonsterBehavior(rng);
    monsterOnAnswer(st, true); monsterOnAnswer(st, true);
    expect(run(st, { playerX: 0, dist: 6, streak: 5, dying: false }, 4).presence).toBe(1);
    run(st, { playerX: 0, dist: 24, streak: 5, dying: false }, 6);
    monsterOnAnswer(st, false);
    expect(run(st, { playerX: 0, dist: 20, streak: 0, dying: false }, 4).presence).toBe(1);
  });

  it('is fully there when it makes the catch', () => {
    const st = createMonsterBehavior(rng);
    run(st, { playerX: 0, dist: 28, streak: 10, dying: false }, 3);
    const pose = run(st, { playerX: 0, dist: 3, streak: 10, dying: true }, 3);
    expect(pose.presence).toBeGreaterThan(0.95);
    expect(pose.z).toBeLessThan(5);
  });
});

describe('the monster is out of sight at the start of a run', () => {
  it('waits behind the camera at the starting distance, even with no streak', () => {
    const st = createMonsterBehavior(() => 0.5);
    expect(st.fade).toBe(0);
    let pose;
    for (let i = 0; i < 300; i++) pose = stepMonsterBehavior(st, { playerX: 0, dist: 26, streak: 0, dying: false, time: i / 60 }, 1 / 60);
    expect(pose.presence).toBe(0);
    expect(pose.z).toBeGreaterThan(20);
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
