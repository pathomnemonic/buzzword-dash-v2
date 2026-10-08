/**
 * jumpphysics.js — how a jump moves, in one place, so the engine and the coin arcs agree.
 *
 * The runner leaves the ground at JUMP_SPEED, gravity pulls it back, and gravity is gentler near the top (a "floaty"
 * apex). The coins laid over a jump follow this same curve, scaled by how fast the run is going, so the arc a player
 * jumps is the arc the coins are on.
 */

/** Takeoff speed (world units per second). */
export var JUMP_SPEED = 12;
/** Downward pull (world units per second squared). */
export var JUMP_GRAVITY = 22;
/** Below this vertical speed (near the top of the jump) gravity is only this share as strong. */
export var APEX_SPEED = 3;
export var APEX_GRAVITY_SHARE = 0.6;

/** One step of a jump, exactly as the engine takes it. @returns {{y: number, v: number}} */
export function jumpStep(y, v, dt) {
  var ny = y + v * dt;
  var g = Math.abs(v) < APEX_SPEED ? JUMP_GRAVITY * APEX_GRAVITY_SHARE : JUMP_GRAVITY;
  return { y: ny, v: v - g * dt };
}

var _profile = null;

/**
 * The height of the runner through a whole jump, sampled every 1/120 s.
 * @returns {{airTime: number, heightAt: function(number): number, peak: number}}
 */
export function jumpProfile() {
  if (_profile) return _profile;
  var dt = 1 / 120;
  var ys = [0];
  var y = 0, v = JUMP_SPEED;
  var peak = 0;
  for (var i = 0; i < 1000; i++) {
    var s = jumpStep(y, v, dt);
    y = s.y; v = s.v;
    if (y <= 0) break;
    ys.push(y);
    if (y > peak) peak = y;
  }
  var airTime = ys.length * dt;
  _profile = {
    airTime: airTime,
    peak: peak,
    /** Height (world units) t seconds after takeoff; 0 on the ground. */
    heightAt: function (t) {
      if (t <= 0 || t >= airTime) return 0;
      var f = t / dt, i0 = Math.floor(f);
      var a = ys[Math.min(i0, ys.length - 1)], b = ys[Math.min(i0 + 1, ys.length - 1)];
      return a + (b - a) * (f - i0);
    }
  };
  return _profile;
}

// How an obstacle is cleared (engine.js applies these): from the moment it is within OBSTACLE_CLEAR_AHEAD of the runner
// until its middle passes OBSTACLE_HIT_Z, any moment spent jumping above MIN_JUMP_CLEARANCE, or sliding, counts.

/** World units before the runner where the clearing window opens. */
export var OBSTACLE_CLEAR_AHEAD = 1.5;
/** World units past the runner where the obstacle is judged. */
export var OBSTACLE_HIT_Z = 0.15;
/** How far off the ground a jump must be to count as clearing a low obstacle. */
export var MIN_JUMP_CLEARANCE = 0.3;

/** How long a slide lasts (seconds). */
export var SLIDE_TIME = 1.1;
