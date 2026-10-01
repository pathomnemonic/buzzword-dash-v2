/**
 * cinematics.js — how a run starts and how it ends.
 *
 * Pure functions (no THREE) that return a pose for the runner, and for the
 * camera during the intro, so the moves can be tested and picked at random.
 * The engine applies the pose each frame.
 *
 * Every pose: { x, y, z, rotX, rotY, rotZ, scale, squash }
 *   x/y/z    offsets added to the runner's normal position
 *   rotX..Z  rotation of the whole runner (radians)
 *   scale    uniform scale; squash multiplies height only (cartoon impact)
 */

function clamp01(v) { return Math.min(1, Math.max(0, v)); }
function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
function easeIn(t) { return t * t; }
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

function neutral() {
  return { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scale: 1, squash: 1 };
}

// ===== START ANIMATIONS =====

export var START_STYLES = ['drop_in', 'slide_in', 'warp_in', 'turn_around', 'sprinter', 'hop_in'];

/** Seconds the intro lasts; after that the runner is at rest in the start position. */
export var INTRO_DURATION = 2.6;

/**
 * @param {string} style one of START_STYLES
 * @param {number} t seconds since the intro began
 * @returns {{pose: object, anim: string, impact: (string|null)}} `anim` is the model
 *   animation to play; `impact` names a one-off effect the engine should trigger
 *   ('dust' when landing, 'sparkle' when appearing) at the moment it happens.
 */
export function getStartPose(style, t) {
  var p = neutral();
  var u = clamp01(t / INTRO_DURATION);
  var anim = 'idle';
  var impact = null;

  switch (style) {
    case 'drop_in': {
      // Falls from the sky, lands with a squash, springs upright
      var fall = clamp01(t / 0.9);
      p.y = 9 * (1 - easeIn(fall));
      if (t >= 0.9 && t < 1.25) {
        p.squash = 1 - 0.35 * Math.sin(((t - 0.9) / 0.35) * Math.PI);
        impact = t < 0.95 ? 'dust' : null;
      } else if (t >= 1.25 && t < 1.7) {
        p.squash = 1 + 0.12 * Math.sin(((t - 1.25) / 0.45) * Math.PI);
      }
      p.rotY = t < 0.9 ? (1 - fall) * 0.6 : 0;
      break;
    }
    case 'slide_in': {
      // Skids in from the side, leaning into the stop
      var k = clamp01(t / 1.1);
      p.x = -7 * (1 - easeOut(k));
      p.rotZ = (1 - easeOut(k)) * -0.35;
      p.rotY = (1 - easeOut(k)) * 0.5;
      anim = k < 1 ? 'run' : 'idle';
      if (t > 1.1 && t < 1.3) impact = 'dust';
      break;
    }
    case 'warp_in': {
      // Materialises with a spin and a flash
      var w = clamp01(t / 0.9);
      p.scale = Math.max(0.001, easeOut(w));
      p.rotY = (1 - easeOut(w)) * Math.PI * 4;
      p.y = (1 - easeOut(w)) * 1.2;
      impact = t < 0.05 ? 'sparkle' : (t > 0.85 && t < 0.9 ? 'sparkle' : null);
      break;
    }
    case 'turn_around': {
      // Starts facing the camera, waves, then spins to face down the track
      anim = t < 1.2 ? 'wave' : 'idle';
      if (t < 1.2) {
        p.rotY = Math.PI;
      } else {
        var q = clamp01((t - 1.2) / 0.5);
        p.rotY = Math.PI * (1 - easeInOut(q));
        p.y = 0.35 * Math.sin(q * Math.PI); // a little hop as they turn
      }
      break;
    }
    case 'sprinter': {
      // Crouches in a sprinter's stance, then explodes upright
      var c = clamp01(t / 1.6);
      if (t < 1.9) {
        p.rotX = 0.55 * easeInOut(Math.min(1, c * 1.4));
        p.y = -0.12 * easeInOut(Math.min(1, c * 1.4));
      } else {
        var g = clamp01((t - 1.9) / 0.5);
        p.rotX = 0.55 * (1 - easeOut(g));
        p.y = 0.25 * Math.sin(g * Math.PI);
        anim = 'run';
      }
      break;
    }
    case 'hop_in': {
      // Bounces in from behind the camera in three shrinking hops
      var h = clamp01(t / 1.4);
      p.z = 6 * (1 - easeOut(h));
      p.y = Math.abs(Math.sin(h * Math.PI * 3)) * 1.1 * (1 - h);
      anim = h < 1 ? 'jump' : 'idle';
      break;
    }
    default:
      break;
  }

  if (u >= 1) {
    p = neutral();
    if (style === 'sprinter') anim = 'run';
  }
  return { pose: p, anim: anim, impact: impact };
}

export var CAMERA_STYLES = ['sweep', 'orbit', 'rise'];

/**
 * The look-back opening used when the exam monster is on: the camera starts in front of the runner,
 * looking back so the monster is seen lurking behind them, then swings around over the runner's shoulder
 * into the normal chase view, which leaves the monster behind the camera and out of sight. Not in the
 * random pool above; the engine picks it.
 */
export var LOOKBACK_STYLE = 'lookback';
/** Seconds the camera holds on the monster before it starts to swing around. */
export var LOOKBACK_HOLD = 1.0;
var LOOKBACK_END = 2.5;

/**
 * Camera moves for the intro. Returns a position and the point to look at.
 * @param {string} style one of CAMERA_STYLES
 * @param {number} t seconds since the intro began
 * @param {{x:number,y:number,z:number}} base the normal chase-camera position
 */
export function getIntroCamera(style, t, base) {
  if (style === LOOKBACK_STYLE) {
    // Swing from in front of the runner (angle PI) around the side to behind them (angle 0)
    var k = easeInOut(clamp01((t - LOOKBACK_HOLD) / (LOOKBACK_END - LOOKBACK_HOLD)));
    if (t >= LOOKBACK_END) return { position: { x: base.x, y: base.y, z: base.z }, lookAt: { x: 0, y: 1, z: -20 } };
    var swing = Math.PI * (1 - k);
    var r = 7 + (base.z - 7) * k;
    return {
      position: { x: Math.sin(swing) * r * 0.4, y: 3.2 + (base.y - 3.2) * k, z: Math.cos(swing) * r },
      lookAt: { x: 0, y: 1.4 - 0.4 * k, z: 3 * (1 - k) + -20 * k }
    };
  }
  var u = clamp01(t / 2.4);
  var e = easeOut(u);
  var rest = 1 - e;
  var pos;
  var look = { x: 0, y: 1, z: -20 + rest * 12 };

  if (style === 'orbit') {
    // Circle the runner, ending behind them
    var angle = rest * Math.PI * 1.6;
    var radius = 8 * rest;
    pos = { x: Math.sin(angle) * radius, y: base.y - 1.5 * rest, z: Math.cos(angle) * radius * 0.6 + base.z * e };
    look = { x: 0, y: 1.1, z: -4 * e };
  } else if (style === 'rise') {
    // Starts at floor level looking up at the runner, then rises to the chase view
    pos = { x: 0, y: 0.35 + (base.y - 0.35) * e, z: base.z - 2 + 2 * e };
    look = { x: 0, y: 0.9 + 0.1 * e, z: -4 - 16 * e };
  } else {
    pos = { x: base.x + rest * 5 * Math.sin(t * 0.8), y: base.y + rest * 7, z: base.z + rest * 14 };
  }
  if (u >= 1) pos = { x: base.x, y: base.y, z: base.z };
  return { position: pos, lookAt: look };
}

// ===== DEATH ANIMATIONS =====

export var DEATH_STYLES = ['faceplant', 'tumble', 'spin_out', 'launch', 'collapse', 'dizzy', 'poof', 'flatten'];

/**
 * Which deaths suit what happened. The runner is hit by something on the
 * ground, something overhead, or is caught by the exam monster.
 */
var DEATH_BY_CAUSE = {
  ground: ['faceplant', 'tumble', 'launch', 'flatten'],
  overhead: ['collapse', 'dizzy', 'flatten', 'spin_out'],
  monster: ['launch', 'spin_out', 'poof', 'tumble'],
  other: ['faceplant', 'dizzy', 'collapse', 'spin_out', 'poof']
};

/**
 * Pick a death style for a cause, avoiding an immediate repeat.
 * @param {string} cause 'ground' | 'overhead' | 'monster' | 'other'
 * @param {string} [previous] the last style used
 * @param {function(): number} [rand]
 */
export function pickDeathStyle(cause, previous, rand) {
  var r = rand || Math.random;
  var options = (DEATH_BY_CAUSE[cause] || DEATH_BY_CAUSE.other).filter(function (s) { return s !== previous; });
  return options[Math.floor(r() * options.length) % options.length];
}

/** Seconds a death plays before the continue prompt or results. */
export var DEATH_DURATION = 2.6;

/**
 * @param {string} style one of DEATH_STYLES
 * @param {number} t seconds since the death began
 * @returns {{pose: object, useClip: boolean, camShake: number, impact: (string|null)}}
 *   `useClip`: play the model's own death animation (else the pose does the acting).
 */
export function getDeathPose(style, t) {
  var p = neutral();
  var useClip = true;
  var impact = null;
  var camShake = 0;

  switch (style) {
    case 'tumble': {
      // Thrown forward into flips, landing on the back
      var a = clamp01(t / 1.1);
      p.rotX = a * Math.PI * 3.6;
      p.y = Math.sin(a * Math.PI) * 2.4;
      p.z = -a * 2.2;
      if (t > 1.08 && t < 1.14) { impact = 'dust'; camShake = 0.4; }
      break;
    }
    case 'spin_out': {
      // Spins like a top while sinking
      var s = clamp01(t / 1.4);
      p.rotY = s * Math.PI * 7 * (1 - 0.25 * s);
      p.y = 0.7 * Math.sin(s * Math.PI) * (1 - s);
      p.rotZ = 0.25 * Math.sin(s * 9) * (1 - s);
      p.scale = 1 - 0.35 * easeIn(s);
      useClip = t > 1.4;
      break;
    }
    case 'launch': {
      // Punted high into the air, tumbling backward, and back down
      var l = clamp01(t / 1.4);
      p.y = 5.5 * Math.sin(l * Math.PI);
      p.z = l * 5;
      p.rotX = -l * Math.PI * 2.6;
      p.rotZ = l * Math.PI * 0.7;
      if (t < 0.06) { impact = 'sparkle'; camShake = 0.6; }
      if (t > 1.38 && t < 1.44) { impact = 'dust'; camShake = 0.3; }
      break;
    }
    case 'collapse': {
      // Knees give way: slumps and squashes
      var c = clamp01(t / 0.9);
      p.squash = 1 - 0.55 * easeOut(c);
      p.y = -0.05 * c;
      p.rotZ = 0.5 * easeOut(c);
      p.rotX = 0.25 * easeOut(c);
      useClip = false;
      break;
    }
    case 'dizzy': {
      // Wobbles in a circle, then keels over sideways
      var z = clamp01(t / 1.6);
      var wob = Math.sin(t * 9) * 0.25 * (1 - easeIn(z));
      p.rotZ = wob + (z > 0.7 ? easeIn((z - 0.7) / 0.3) * (Math.PI / 2 - wob) : 0);
      p.rotY = Math.sin(t * 5) * 0.6;
      p.x = Math.cos(t * 6) * 0.25 * (1 - z);
      p.y = z > 0.7 ? -0.35 * easeIn((z - 0.7) / 0.3) : 0;
      useClip = false;
      break;
    }
    case 'poof': {
      // Cartoon vanish: a quick spin and shrink into a puff of sparkles
      var f = clamp01(t / 0.7);
      p.scale = Math.max(0.001, 1 - easeIn(f));
      p.rotY = f * Math.PI * 5;
      p.y = f * 1.0;
      if (t > 0.6 && t < 0.66) { impact = 'sparkle'; camShake = 0.2; }
      useClip = false;
      break;
    }
    case 'flatten': {
      // Squashed like a cartoon pancake, then peels up and flops
      var fl = clamp01(t / 0.35);
      p.squash = 1 - 0.85 * easeOut(fl);
      p.scale = 1 + 0.25 * easeOut(fl);
      if (t > 0.9) p.squash = 0.15 + 0.42 * easeOut(clamp01((t - 0.9) / 0.5));
      if (t > 0.3 && t < 0.36) { impact = 'dust'; camShake = 0.5; }
      useClip = t > 1.3;
      break;
    }
    case 'faceplant':
    default:
      // The classic trip and flop; the model's clip or the old procedural fall does the acting
      break;
  }
  if (style === 'poof' && t >= 0.7) p.scale = 0.001;
  return { pose: p, useClip: useClip, camShake: camShake, impact: impact };
}
