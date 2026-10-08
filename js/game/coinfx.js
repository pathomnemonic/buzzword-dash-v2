/**
 * coinfx.js — the rules behind how coins are laid out and how picking them up feels.
 *
 * Pure functions (no Three.js, no DOM) so they can be tested on their own:
 *   - the rising chime: each coin collected in quick succession plays a higher note, up to two octaves
 *   - which coins can be reached (a coin in the air needs a jump)
 *   - what a coin is worth
 *   - coin patterns tied to obstacles: an arc over a jump, a trail under an overhead one
 *   - a magnet that curves the coin in
 *
 * Distances are in pattern units (the engine multiplies them by VISUAL_SPEED).
 */

import { jumpProfile } from './jumpphysics.js';

/** Seconds after a coin during which the next one continues the chain (and the chime keeps climbing). */
export var CHAIN_WINDOW = 1.1;

/** How far the chime climbs: a sixth of a semitone per coin, and it stops at half a tone, so it only just brightens. */
export var CHIME_STEP_SEMITONES = 1 / 6;
export var CHIME_MAX_SEMITONES = 1;

/** The pitch multiplier for the nth coin of a chain (0 is the first). The top note repeats. */
export function chimeRatio(chain) {
  var n = Math.max(0, Math.floor(Number(chain) || 0));
  var semis = Math.min(CHIME_MAX_SEMITONES, n * CHIME_STEP_SEMITONES);
  return Math.pow(2, semis / 12);
}

/** How long (seconds) the chain survives: the next coin must come within the window. */
export function chainContinues(secondsSinceLast) {
  return secondsSinceLast >= 0 && secondsSinceLast <= CHAIN_WINDOW;
}

/** Height (world units) above which a coin counts as "in the air" and needs a jump. */
export var AIR_COIN_HEIGHT = 1.9;

/**
 * Can a runner whose feet are `playerY` above the ground pick this coin up?
 * Coins at normal height always can; one in the air needs the runner to be off the ground.
 */
export function coinReachable(coinY, playerY, air) {
  if (!air && !(coinY > AIR_COIN_HEIGHT)) return true;
  return (Number(playerY) || 0) >= coinY - 2.1;
}

/** What one coin is worth. An air coin picked up mid-jump pays double; Frenzy pays 5×, Gold Rush 2× on top. */
export function coinWorth(o) {
  o = o || {};
  var base = o.airJump ? 2 : 1;
  return base * (o.frenzy ? 5 : 1) * (o.goldRush ? 2 : 1);
}

/**
 * Coins that go with an obstacle, relative to the obstacle's middle: { dz, y }, dz in pattern units (negative is
 * further up the track). A jump obstacle gets an arc over it, so the jump that clears it collects them;
 * an overhead one gets a low trail along the ground under it, which you slide through.
 * @param {'jump'|'slide'} kind
 */
export function coinsForObstacle(kind, speed) {
  var out = [];
  var i;
  if (kind === 'slide') {
    for (i = -4; i <= 4; i++) out.push({ dz: i * 0.5, y: 0.7, air: false });
    return out;
  }
  // the arc is the jump itself: the runner's height through a jump, laid out along the track at the run's speed
  // (so a faster run stretches the arc), centered on the obstacle
  return jumpArc(speed, arcCoinCount(speed, 9));
}

/** Coin height above the ground when the runner is on it. */
export var COIN_BASE_Y = 1.2;

/**
 * Coins along the path a jump takes: the same curve the runner follows (jumpphysics.js), at the run's current speed.
 * The first coin is where a jump leaves the ground and the last is where it lands, so the arc is the arc the player jumps.
 * @param {number} [speed] the run's speed in pattern units per second (1.875 when not given)
 * @param {number} [count] how many coins
 * @returns {Array<{dz: number, y: number, air: boolean}>} dz is relative to the middle of the jump; larger is nearer the runner
 */
export function jumpArc(speed, count) {
  var sp = speed > 0 ? speed : 1.875;
  var n = count > 1 ? count : 9;
  var prof = jumpProfile();
  var out = [];
  for (var i = 0; i < n; i++) {
    var t = (i / (n - 1)) * prof.airTime;
    var y = COIN_BASE_Y + prof.heightAt(t);
    out.push({ dz: (prof.airTime / 2 - t) * sp, y: y, air: y > AIR_COIN_HEIGHT });
  }
  return out;
}

/**
 * How many coins an arc gets at this speed: enough to read as a curve, but not a pile when the run is slow and the
 * arc is short (a slow run barely moves forward during a jump, so the arc is mostly straight up).
 * @param {number} speed
 * @param {number} max
 */
export function arcCoinCount(speed, max) {
  var worldLength = jumpArcLength(speed) * 2.2; // (2.2 = VISUAL_SPEED, world units per pattern unit)
  return Math.max(5, Math.min(max, Math.round(worldLength / 0.7)));
}

/** How long (pattern units) a jump's arc is at this speed. */
export function jumpArcLength(speed) {
  return jumpProfile().airTime * (speed > 0 ? speed : 1.875);
}

/**
 * Where the magnet pulls a coin this frame: a curve toward the runner, quickest as the coin gets close.
 * @param {number} coinX
 * @param {number} playerX
 * @param {number} coinZ world z of the coin (negative is ahead of the runner)
 * @param {number} dt seconds
 * @returns {number} the coin's new x
 */
export function magnetX(coinX, playerX, coinZ, dt) {
  var closeness = Math.max(0, Math.min(1, 1 - Math.abs(coinZ) / 14)); // 0 far away .. 1 at the runner
  var rate = 3 + closeness * 9;
  var k = Math.min(1, dt * rate);
  return coinX + (playerX - coinX) * k;
}

/** Spacing between neighbouring coins in a line (pattern units): two coin-widths apart, so a line is a stream you run along but each coin is its own. */
export var COIN_GAP = 0.7;

/** How far ahead (pattern units) coins are kept laid out. Everything nearer than this always has coins in it. */
export var COIN_HORIZON = 48;

/** Where the first coins of a run start (pattern units ahead of the runner), so the first moments already have some. */
export var COIN_FIRST = 12;

/**
 * The empty stretch (pattern units) left between one batch and the next. It is short on purpose: batches are laid
 * end to end up to the horizon, so there is a coin in some lane almost all of the time. Shorter still while a coin
 * power-up is on.
 */
export function coinGap(rand, coinPowerUp) {
  var r = typeof rand === 'number' ? rand : Math.random();
  return coinPowerUp ? r * 0.3 : 0.4 + r * 1.4;
}

/**
 * Lay batches end to end up to the horizon.
 * @param {number} tail z of the farthest coin laid out so far (pattern units; more negative is farther)
 * @param {function(number): number} lay puts a batch down starting at that z and returns its length
 * @param {function(): number} nextGap gives the empty stretch to leave before the next batch
 * @returns {number} the new tail
 */
export function fillCoins(tail, lay, nextGap) {
  var guard = 0;
  while (tail > -COIN_HORIZON && guard++ < 6) {
    var start = tail - nextGap();
    tail = start - lay(start);
  }
  return tail;
}

/** A coin is picked up only where the runner actually is: within this far sideways (world units)... */
export var COIN_REACH_X = 1.0;
/** ...and within this far along the track. Narrow on purpose, so two coins side by side cannot both be taken by flicking between lanes. */
export var COIN_REACH_Z = 1.1;

/**
 * Does the runner, at this offset from a coin, pick it up?
 * @param {number} dx coin x minus the runner's actual x (not the lane they have asked for)
 * @param {number} dz coin z (the runner is at 0)
 */
export function coinTouches(dx, dz) {
  return Math.abs(dx) < COIN_REACH_X && Math.abs(dz) < COIN_REACH_Z;
}
