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

/** Seconds after a coin during which the next one continues the chain (and the chime keeps climbing). */
export var CHAIN_WINDOW = 1.1;

/** Semitones above the first note, a major pentatonic climb so every note sounds good with the last. */
var LADDER = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

/** The pitch multiplier for the nth coin of a chain (0 is the first). The top note repeats. */
export function chimeRatio(chain) {
  var n = Math.max(0, Math.floor(Number(chain) || 0));
  var semis = LADDER[Math.min(n, LADDER.length - 1)];
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
export function coinsForObstacle(kind) {
  var out = [];
  var i;
  if (kind === 'slide') {
    for (i = -3; i <= 3; i++) out.push({ dz: i * 0.6, y: 0.7, air: false });
    return out;
  }
  // a jump lasts about two pattern units each side of the middle; the arc peaks right over the obstacle
  for (i = -3; i <= 3; i++) {
    var t = (i + 3) / 6; // 0 .. 1
    out.push({ dz: i * 0.55, y: 1.2 + Math.sin(t * Math.PI) * 1.75, air: true });
  }
  return out;
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

/** Spacing between neighbouring coins in a line (pattern units): denser than before, so there is nearly always one to grab. */
export var COIN_GAP = 1.2;

/** The breather between batches (seconds): shorter while a coin power-up is on. */
export function coinBreather(rand, coinPowerUp) {
  var r = typeof rand === 'number' ? rand : Math.random();
  return coinPowerUp ? 0.15 + r * 0.25 : 0.45 + r * 0.8;
}
