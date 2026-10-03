/**
 * lanelock.js — which gate counts when the runner reaches the answer gates.
 *
 * The runner glides sideways to the lane the player asked for, so a few moments after a swipe its body is still
 * partly in the old lane. The answer used to be taken from where the body was when the gates got close, which meant
 * a late switch counted as the lane you had just left. The answer is now the lane the player last asked for (the
 * one the runner is gliding into), decided at the moment the gate is crossed; where the body is only matters if
 * no valid lane was asked for.
 */

/**
 * @param {{targetLane: number, playerX: number, laneX: number[]}} s
 * @returns {number} 0, 1 or 2
 */
export function chooseCommittedLane(s) {
  var lanes = s.laneX;
  if (Number.isInteger(s.targetLane) && s.targetLane >= 0 && s.targetLane < lanes.length) return s.targetLane;
  var best = Math.floor(lanes.length / 2);
  var bestDist = Math.abs(s.playerX - lanes[best]);
  for (var i = 0; i < lanes.length; i++) {
    var d = Math.abs(s.playerX - lanes[i]);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}
