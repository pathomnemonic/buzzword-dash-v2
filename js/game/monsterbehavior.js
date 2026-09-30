/**
 * monsterbehavior.js — how the exam monster moves.
 *
 * Pure functions (no THREE) so the behavior can be tested. The engine feeds in
 * the player's lane position, how close the monster is to catching them
 * ("distance": 3 = caught, 30 = far away) and their streak, and gets back a
 * pose to apply.
 *
 * What it does:
 *  - stalks the player across lanes, lagging a little behind and weaving
 *  - leans toward the player and looms lower/larger as it closes in
 *  - lunges: on every wrong answer, and now and then when it is near
 *  - recoils when the player answers correctly
 *  - fades from view as the player rebuilds a streak or pulls away
 */

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

export function createMonsterBehavior(rand) {
  var r = rand || Math.random;
  return {
    x: 0,
    fade: 0.6,
    lunge: 0,
    recoil: 0,
    cooldown: 3 + r() * 2,
    phase: r() * 6.28,
    rand: r
  };
}

/** The player answered: wrong answers make it lunge, right ones push it back. */
export function monsterOnAnswer(state, correct) {
  if (correct) state.recoil = 1;
  else state.lunge = 1;
}

/** Target visibility: strong when close and the streak is low, gone when far or on a streak. */
export function monsterVisibility(dist, streak) {
  var byDistance = clamp((28 - dist) / 8, 0, 1);
  var byStreak = clamp(1 - streak * 0.09, 0, 1);
  return byDistance * byStreak;
}

/**
 * Advance the behavior.
 * @param {object} st - state from createMonsterBehavior
 * @param {{playerX:number, dist:number, streak:number, dying:boolean, time:number}} inp
 * @param {number} dt
 * @returns {{x:number,y:number,z:number,scale:number,rotX:number,rotY:number,rotZ:number,opacity:number,lunging:boolean,hop:number,lunged:boolean}}
 */
export function stepMonsterBehavior(st, inp, dt) {
  var near = clamp((30 - inp.dist) / 27, 0, 1);
  var t = inp.time;

  // Follow the player across lanes, a step behind, weaving as it goes.
  var weave = Math.sin(t * 1.3 + st.phase) * 0.6 * (1 - 0.5 * near);
  var target = inp.dying ? inp.playerX : inp.playerX * 0.85 + weave;
  st.x += (target - st.x) * Math.min(1, dt * (1.2 + 2.5 * near));

  // Lunges decay quickly; near monsters lunge on their own every few seconds.
  st.lunge = Math.max(0, st.lunge - dt * 1.6);
  st.recoil = Math.max(0, st.recoil - dt * 2);
  var lunged = false;
  if (!inp.dying) {
    st.cooldown -= dt * (0.5 + near);
    if (st.cooldown <= 0 && near > 0.35) {
      st.lunge = 1;
      st.cooldown = 3.5 + st.rand() * 3;
      lunged = true;
    } else if (st.cooldown <= 0) {
      st.cooldown = 1;
    }
  }
  var e = st.lunge * st.lunge * (3 - 2 * st.lunge);
  var back = st.recoil * st.recoil * (3 - 2 * st.recoil);

  // Fade as the streak is rebuilt; always fully visible when it makes the catch.
  var goal = inp.dying ? 1 : monsterVisibility(inp.dist, inp.streak);
  st.fade += (goal - st.fade) * Math.min(1, dt * (inp.dying ? 6 : 2.5));

  var lag = inp.playerX - st.x;
  return {
    x: st.x,
    y: 3.4 + Math.sin(t * 1.7 + st.phase) * 0.18 - near * 0.5 - e * 0.6 + back * 0.5,
    z: 3.5 - near - e * 1.6 + back * 1.0,
    scale: 1 + e * 0.35 - back * 0.15,
    rotX: -(0.15 + 0.35 * near + 0.5 * e),
    rotY: Math.sin(t * 0.9 + st.phase) * 0.25,
    rotZ: clamp(-lag * 0.15, -0.4, 0.4),
    opacity: clamp(st.fade, 0, 1),
    lunging: st.lunge > 0.15,
    hop: back,
    lunged: lunged
  };
}
