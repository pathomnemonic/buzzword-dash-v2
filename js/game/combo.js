/**
 * combo.js — what a streak does to the world.
 *
 * A streak is felt, not just read. Tier 1 (5 in a row) adds a sparkling arpeggio to the music, tier 2 (10) adds a soft
 * clap and lights the track up, tier 3 (20) doubles the melody an octave up and earns the hero a flourish. A miss takes
 * away ONE tier (not all of them at once), so a long streak fades out instead of vanishing.
 * Everything here is plain numbers, so it is easy to test; audio.js, main.js and the engine do the playing.
 */

export var TIER_AT = [0, 5, 10, 20];

/** 0 to 3: how far up the combo ladder a streak is. */
export function comboTier(streak) {
  var s = Math.max(0, Math.floor(Number(streak) || 0));
  var tier = 0;
  for (var i = 1; i < TIER_AT.length; i++) if (s >= TIER_AT[i]) tier = i;
  return tier;
}

/** Remembers the tier the music is at, and lets a miss strip one layer at a time. */
export class ComboTracker {
  constructor() { this.held = 0; }
  /** Call as the streak changes; the music never drops below what it held until a miss. */
  update(streak) {
    var tier = comboTier(streak);
    if (tier > this.held) this.held = tier;
    return this.held;
  }
  /** A wrong answer: one layer goes. */
  miss() {
    if (this.held > 0) this.held--;
    return this.held;
  }
  reset() { this.held = 0; }
}

/**
 * How the music should sound.
 * @param {{tier: number, speedRatio?: number, lives?: number, ducked?: boolean, danger?: number}} s
 * @returns {{intensity: number, danger: number, tempo: number, duck: number, layers: {sparkle: boolean, clap: boolean, octave: boolean}}}
 */
export function musicMood(s) {
  var tier = Math.max(0, Math.min(3, s.tier || 0));
  var speed = Math.max(1, s.speedRatio || 1);
  var lives = s.lives === undefined ? 3 : s.lives;
  // the more layers, the fuller the mix; one life left darkens it a little, like the monster is closer
  var danger = Math.max(0, Math.min(1, (s.danger || 0) + (lives <= 1 ? 0.25 : 0)));
  return {
    intensity: Math.min(1, 0.3 + tier * 0.22),
    danger: danger,
    tempo: 1 + Math.min(0.1, (speed - 1) * 0.06),
    duck: s.ducked ? 0.45 : 1,
    layers: { sparkle: tier >= 1, clap: tier >= 2, octave: tier >= 3 }
  };
}

/** How lit the track is for a streak: 0 (normal), 0.7 from 10, 1 from 20. */
export function trackGlow(streak) {
  var tier = comboTier(streak);
  return tier >= 3 ? 1 : tier === 2 ? 0.7 : 0;
}

/** Is this streak one the hero celebrates with a flourish (20, 30, 40, ...)? */
export function isFlourish(streak) {
  return streak >= 20 && streak % 10 === 0;
}
