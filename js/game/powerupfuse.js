/**
 * powerupfuse.js — two power-ups collected close together fuse into something bigger.
 *
 * Pick up two DIFFERENT power-ups within FUSE_WINDOW seconds and the pair becomes a named fusion, so which pickups to
 * chase is a small decision. Fusions only ever pay out coins and score (never an easier answer), and they do not happen
 * in seeded, competitive runs. This file is the table and the rule; the engine applies the effect.
 */

export var FUSE_WINDOW = 6;

/** Unordered pair -> the fusion. `timers` are seconds added to the run's power-up timers (the biggest wins), `fortress` gives a heart when the shield breaks. */
var FUSIONS = {
  'double+magnet': { id: 'goldRush', label: '🏆 GOLD RUSH!', detail: 'Magnet + 2×: coins worth double', timers: { goldRush: 14, magnet: 14, double: 14 } },
  'magnet+scoreFrenzy': { id: 'coinStorm', label: '🌪️ COIN STORM!', detail: 'Magnet + Frenzy, much longer', timers: { magnet: 16, scoreFrenzy: 16 } },
  'double+scoreFrenzy': { id: 'jackpot', label: '🎰 JACKPOT!', detail: 'Frenzy + 2×: score triples', timers: { jackpot: 12, double: 12, scoreFrenzy: 12 } },
  'magnet+shield': { id: 'ironMagnet', label: '🧲 IRON MAGNET!', detail: 'Shield + Magnet: the magnet lasts twice as long', timers: { magnet: 20 } },
  'double+shield': { id: 'fortress', label: '🏰 FORTRESS!', detail: 'Shield + 2×: when the shield breaks you get a heart back', timers: { double: 18 }, fortress: true },
  'scoreFrenzy+shield': { id: 'shieldedFrenzy', label: '💎 SHIELDED FRENZY!', detail: 'Shield + Frenzy: the frenzy lasts longer', timers: { scoreFrenzy: 18 } }
};

export var FUSIBLE = ['shield', 'magnet', 'double', 'scoreFrenzy'];

export function fusionKey(a, b) { return [a, b].sort().join('+'); }

/** All the fusions (for the help text and tests). */
export function listFusions() { return Object.keys(FUSIONS).map(function (k) { return Object.assign({ pair: k }, FUSIONS[k]); }); }

/**
 * @param {{type: string, at: number}|null} previous the last power-up picked up and when (seconds of run time)
 * @param {string} type what was just picked up
 * @param {number} now run time in seconds
 * @returns {object|null} the fusion, or null
 */
export function fuseWith(previous, type, now) {
  if (!previous || previous.type === type) return null;
  if (FUSIBLE.indexOf(type) < 0 || FUSIBLE.indexOf(previous.type) < 0) return null;
  if (now - previous.at > FUSE_WINDOW || now < previous.at) return null;
  return FUSIONS[fusionKey(previous.type, type)] || null;
}
