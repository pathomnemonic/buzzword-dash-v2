/**
 * rules.js — personal rule changes for single-player runs, and what they mean
 * for the leaderboard.
 *
 * Players can turn off individual power-ups, map hazards and the exam monster
 * in single-player modes. To keep rankings fair, any run played with a rule
 * changed is a "custom" run: it still counts for the player's own progress,
 * but is never submitted to a leaderboard. Modes that compare players
 * (daily, challenges, the Gauntlet, multiplayer) always use the standard rules.
 *
 * Cosmetic choices (avatar, colors, monster look, trail, favorite map) do not
 * change the game, so they never affect ranking.
 */

export var POWERUP_OPTIONS = [
  { id: 'shield', icon: '🛡️', label: 'Shield', desc: 'Absorbs one mistake' },
  { id: 'magnet', icon: '🧲', label: 'Magnet', desc: 'Pulls in nearby coins' },
  { id: 'double', icon: '✖️', label: '2× Score', desc: 'Doubles points for a while' },
  { id: 'autoPilot', icon: '🤖', label: 'Auto-pilot', desc: 'Answers one gate for you' },
  { id: 'scoreFrenzy', icon: '🔥', label: 'Frenzy', desc: 'Bigger coins and bonuses' }
];

/** Modes where the player's own rules apply. Everything else is standard. */
export var CUSTOMIZABLE_MODES = ['endless', 'study', 'weakness', 'timed_practice'];

export function isCustomizableMode(mode) {
  return CUSTOMIZABLE_MODES.indexOf(mode) >= 0;
}

/**
 * @param {string} mode game mode
 * @param {{disabledPowerups?: string[], hazardsOff?: boolean, monsterOff?: boolean}} prefs
 * @returns {{disabledPowerups: string[], hazardsOff: boolean, monsterOff: boolean, custom: boolean}}
 */
export function getRunRules(mode, prefs) {
  var none = { disabledPowerups: [], hazardsOff: false, monsterOff: false, custom: false };
  if (!isCustomizableMode(mode) || !prefs) return none;
  var known = POWERUP_OPTIONS.map(function (p) { return p.id; });
  var disabled = (Array.isArray(prefs.disabledPowerups) ? prefs.disabledPowerups : [])
    .filter(function (id) { return known.indexOf(id) >= 0; });
  var rules = {
    disabledPowerups: disabled,
    hazardsOff: !!prefs.hazardsOff,
    monsterOff: !!prefs.monsterOff,
    custom: false
  };
  rules.custom = disabled.length > 0 || rules.hazardsOff || rules.monsterOff;
  return rules;
}

/** Whether a finished run may appear on leaderboards. */
export function isRankedRun(summary) {
  return !(summary && summary.custom);
}

/** One line describing the changed rules, for the results screen. */
export function describeRules(rules) {
  if (!rules || !rules.custom) return '';
  var parts = [];
  if (rules.disabledPowerups.length) {
    var names = rules.disabledPowerups.map(function (id) {
      var o = POWERUP_OPTIONS.filter(function (p) { return p.id === id; })[0];
      return o ? o.label : id;
    });
    parts.push('no ' + names.join(', '));
  }
  if (rules.hazardsOff) parts.push('no map hazards');
  if (rules.monsterOff) parts.push('no exam monster');
  return parts.join(' · ');
}
