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

/** The standard speed-up: every 20 questions the run gets 0.5 faster (on the 1-10 speed dial). */
export var DEFAULT_SPEED_RAMP = { on: true, every: 20, step: 0.5 };
export var SPEED_RAMP_EVERY_OPTIONS = [5, 10, 20, 30, 50];
export var SPEED_RAMP_STEP_OPTIONS = [0.25, 0.5, 1, 2];

/** Clean up speed-up preferences (anything unknown falls back to the standard). */
export function normalizeSpeedRamp(prefs) {
  var d = DEFAULT_SPEED_RAMP;
  if (!prefs) return { on: d.on, every: d.every, step: d.step };
  var every = Number(prefs.every);
  var step = Number(prefs.step);
  return {
    on: prefs.on !== false,
    every: every >= 1 && every <= 200 ? Math.round(every) : d.every,
    step: step > 0 && step <= 5 ? step : d.step
  };
}

/** How much faster than the starting speed the run is after a number of questions (dial units). */
export function speedBonus(ramp, questionsDone) {
  if (!ramp || !ramp.on) return 0;
  return Math.floor(Math.max(0, questionsDone) / ramp.every) * ramp.step;
}

/** Relaxed pace (an accessibility mode): the whole run moves at this share of the normal speed and never speeds up. */
export var RELAXED_PACE = 0.65;

/** Modes where the player's own rules apply. Everything else is standard. */
export var CUSTOMIZABLE_MODES = ['endless', 'study', 'weakness', 'timed_practice'];

export function isCustomizableMode(mode) {
  return CUSTOMIZABLE_MODES.indexOf(mode) >= 0;
}

/**
 * @param {string} mode game mode
 * @param {{disabledPowerups?: string[], hazardsOff?: boolean, monsterOff?: boolean, relaxedPace?: boolean, speedRamp?: {on: boolean, every: number, step: number}}} prefs
 * @returns {{disabledPowerups: string[], hazardsOff: boolean, monsterOff: boolean, relaxed: boolean, speedRamp: {on: boolean, every: number, step: number}, custom: boolean}}
 */
export function getRunRules(mode, prefs) {
  var none = { disabledPowerups: [], hazardsOff: false, monsterOff: false, relaxed: false, speedRamp: normalizeSpeedRamp(null), custom: false };
  if (!isCustomizableMode(mode) || !prefs) return none;
  var known = POWERUP_OPTIONS.map(function (p) { return p.id; });
  var disabled = (Array.isArray(prefs.disabledPowerups) ? prefs.disabledPowerups : [])
    .filter(function (id) { return known.indexOf(id) >= 0; });
  var rules = {
    disabledPowerups: disabled,
    hazardsOff: !!prefs.hazardsOff,
    monsterOff: !!prefs.monsterOff,
    relaxed: !!prefs.relaxedPace,
    speedRamp: normalizeSpeedRamp(prefs.speedRamp),
    custom: false
  };
  // Relaxed pace holds the speed steady, so the speed-up is off whatever it was set to
  if (rules.relaxed) rules.speedRamp = { on: false, every: DEFAULT_SPEED_RAMP.every, step: DEFAULT_SPEED_RAMP.step };
  var ramp = rules.speedRamp;
  var rampChanged = ramp.on !== DEFAULT_SPEED_RAMP.on || ramp.every !== DEFAULT_SPEED_RAMP.every || ramp.step !== DEFAULT_SPEED_RAMP.step;
  rules.custom = disabled.length > 0 || rules.hazardsOff || rules.monsterOff || rules.relaxed || rampChanged;
  return rules;
}

/** Whether a finished run may appear on leaderboards. */
export function isRankedRun(summary) {
  // (a speed below 1× is a calmer, easier track: practice, not a ranked score)
  return !(summary && (summary.custom || Number(summary.userSpeed) < 1));
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
  if (rules.relaxed) parts.push('relaxed pace');
  var r = rules.speedRamp;
  if (!rules.relaxed && r && (r.on !== DEFAULT_SPEED_RAMP.on || r.every !== DEFAULT_SPEED_RAMP.every || r.step !== DEFAULT_SPEED_RAMP.step)) {
    parts.push(r.on ? 'speed +' + r.step + ' every ' + r.every + ' questions' : 'no speed-up');
  }
  return parts.join(' · ');
}
