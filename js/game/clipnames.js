/**
 * clipnames.js — matching a model's animation clips to the game's states.
 *
 * Pure (no imports) so the model build tool and the game share it.
 */

/**
 * How each logical state plays. Model packs name their clips differently
 * ("CharacterArmature|Run", "Robot_Running", "Dragon_Flying"...), so each state
 * lists name patterns in priority order and the first clip that matches is used.
 * Patterns run against the clip's base name (armature prefix and the pack's
 * "Robot_"/"Alien_"/"Dragon_" prefix removed). A state with no match falls back
 * to `fallback`, so every model still animates.
 */
export var STATE_CLIPS = {
  run: { match: [/^run$/i, /^running$/i, /^running_a$/i, /^fast_flying$/i, /^walk$/i, /^walking$/i, /^flying$/i, /^flying_idle$/i, /run/i, /walk/i, /fly/i], loop: true, scale: 1.0 },
  jump: { match: [/^jump$/i, /^jump_full_short$/i, /^runningjump$/i, /^walkjump$/i, /^jump_idle$/i, /jump/i, /hop/i, /^roll$/i], loop: false, scale: 1.5, clamp: true, fallback: 'run' }, // (a character with no jump clip tumbles in the air with its roll)
  slide: { match: [/^roll$/i, /^duck$/i, /slide/i, /crouch/i], loop: true, scale: 1.5, fallback: 'run' },
  celebrate: { match: [/^wave$/i, /^dance$/i, /^thumbsup$/i, /^clapping$/i, /^yes$/i, /victory|cheer|emote/i], loop: false, scale: 1.2, clamp: true, fallback: 'idle' },
  death: { match: [/^death$/i, /^death_a$/i, /die|dead|faint/i, /death/i, /^hitreact$/i, /^hitrecieve$/i], loop: false, scale: 1.0, clamp: true, fallback: 'idle' },
  idle: { match: [/^idle$/i, /^standing$/i, /^flying_idle$/i, /^idle_neutral$/i, /idle/i, /stand/i, /hover/i], loop: true, scale: 1.0, fallback: 'run' },
  wave: { match: [/^wave$/i, /^dance$/i, /hello/i], loop: false, scale: 1.0, fallback: 'idle' },
  // Used by monsters: the strike when it lunges at the runner
  attack: { match: [/^attack$/i, /^headbutt$/i, /^punch$/i, /^bite_front$/i, /^dragon_attack$/i, /attack/i, /bite|claw|slash|smash/i], loop: false, scale: 1.3, clamp: false, fallback: 'idle' }
};

var PACK_PREFIX = /^(robot|alien|dragon)_/i;

/** "CharacterArmature|Run" -> "Run"; "RobotArmature|Robot_Running" -> "Running". */
export function baseClipName(name) {
  var base = String(name).split('|').pop();
  var stripped = base.replace(PACK_PREFIX, '');
  return stripped || base;
}

/** Find the clip name that best fits a state, or null. Exported for tests. */
export function findClipName(clipNames, state) {
  var def = STATE_CLIPS[state];
  if (!def) return null;
  for (var p = 0; p < def.match.length; p++) {
    for (var i = 0; i < clipNames.length; i++) {
      if (def.match[p].test(baseClipName(clipNames[i]))) return clipNames[i];
    }
  }
  return null;
}

/** Resolve a state to a clip name, following fallbacks (never loops). */
export function resolveClipName(clipNames, state) {
  var seen = {};
  var s = state;
  while (s && !seen[s]) {
    seen[s] = true;
    var name = findClipName(clipNames, s);
    if (name) return { clip: name, state: s };
    s = STATE_CLIPS[s] && STATE_CLIPS[s].fallback;
  }
  return clipNames.length ? { clip: clipNames[0], state: state } : null;
}

