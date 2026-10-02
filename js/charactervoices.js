/**
 * charactervoices.js — every character cheers when you score and groans when you miss, in a voice of their own.
 *
 * These are not speech. A speech engine sounds robotic, so each reaction is a short vocal sound (a "woo-hoo",
 * a "yay", an "aww", an "oh no") built live with the Web Audio API from a buzzing voice source run through
 * vowel filters (formants), the way a real mouth shapes a sound. Each character has a different pitch and
 * vocal size, and a few have their own kind of noise (the robot beeps, the alien chirps, the zombie groans,
 * the skeleton rattles). Nothing is downloaded and nothing needs a license.
 *
 * The profiles and the choosing of a reaction are plain data and functions so they can be tested; only
 * `playReaction` touches the audio context.
 */

/** Vowel formants (Hz) for an adult male voice: the first three resonances of the mouth. */
export var VOWELS = {
  a: [800, 1150, 2900],  // "ah"
  o: [500, 800, 2830],   // "oh"
  e: [530, 1840, 2480],  // "eh"
  i: [270, 2290, 3010],  // "ee"
  u: [300, 870, 2240],   // "oo"
  w: [570, 840, 2410]    // "aw"
};

/**
 * @typedef {{name: string, kit: 'voice'|'robot'|'alien'|'zombie'|'skeleton'|'orc', f0: number, size: number, bright: number}} CharacterSound
 * f0: the voice's pitch in Hz; size: how big the vocal tract is (1 = adult male; smaller is higher and brighter, larger is deeper)
 */

/** @type {Object<string, CharacterSound>} */
export var PROFILES = {
  avatar_intern:       { name: 'Pager Pete',    kit: 'voice',    f0: 125, size: 1.0,  bright: 1.0 },
  avatar_m_nurse:      { name: 'Dr. Dash',      kit: 'voice',    f0: 215, size: 1.17, bright: 1.1 },
  avatar_m_paramedic:  { name: 'Paramedic Pat', kit: 'voice',    f0: 160, size: 1.06, bright: 1.1 },
  avatar_m_intern:     { name: 'Field Medic Finn',      kit: 'voice',    f0: 190, size: 1.12, bright: 1.0 },
  avatar_m_explorer:   { name: 'Rural Rex',        kit: 'voice',    f0: 105, size: 0.95, bright: 0.9 },
  avatar_m_adventurer: { name: 'Locum Lou',    kit: 'voice',    f0: 255, size: 1.22, bright: 1.2 },
  avatar_m_rogue:      { name: 'Dark-Room Dex',  kit: 'voice',    f0: 98,  size: 0.92, bright: 0.8 },
  avatar_m_scout:      { name: 'Stat Sadie',         kit: 'voice',    f0: 270, size: 1.25, bright: 1.25 },
  avatar_m_zombie:     { name: 'Zombie',        kit: 'zombie',   f0: 72,  size: 0.9,  bright: 0.6 },
  avatar_m_ninja:      { name: 'Night-Shift Nico',         kit: 'voice',    f0: 142, size: 1.02, bright: 1.1 },
  avatar_m_skeleton:   { name: 'Femur Fred',         kit: 'skeleton', f0: 235, size: 1.18, bright: 1.3 },
  avatar_m_orc:        { name: 'Gurney Grog',           kit: 'orc',      f0: 62,  size: 0.78, bright: 0.6 },
  avatar_m_wizard:     { name: 'Pharmacist Pip',      kit: 'voice',    f0: 112, size: 0.97, bright: 0.9 },
  avatar_m_alien:      { name: 'Anatomy Abe',         kit: 'alien',    f0: 520, size: 1.3,  bright: 1.4 },
  avatar_m_robot:      { name: 'MRI Mo',     kit: 'robot',    f0: 330, size: 1.0,  bright: 1.0 },
  avatar_m_king:       { name: 'Attending Arthur',          kit: 'voice',    f0: 118, size: 0.96, bright: 0.9 }
};

export var DEFAULT_PROFILE = PROFILES.avatar_intern;

/** @returns {CharacterSound} the sound profile for a character id */
export function profileFor(avatarId) {
  return PROFILES[avatarId] || DEFAULT_PROFILE;
}

/**
 * A reaction is a list of syllables. Each: vowels (start, end), pitch multipliers (start, end), length in
 * seconds, and a gap before the next one.
 */
var CHEERS = [
  { id: 'woohoo', syl: [{ v: 'uo', p: [1.0, 1.22], len: 0.26, gap: 0.05 }, { v: 'uo', p: [1.18, 1.5], len: 0.34, gap: 0 }] },
  { id: 'yay', syl: [{ v: 'ei', p: [1.0, 1.35], len: 0.5, gap: 0 }] },
  { id: 'hey', syl: [{ v: 'ee', p: [1.1, 1.3], len: 0.22, gap: 0.04 }, { v: 'ei', p: [1.3, 1.1], len: 0.2, gap: 0 }] },
  { id: 'haha', syl: [{ v: 'aa', p: [1.2, 1.2], len: 0.12, gap: 0.07 }, { v: 'aa', p: [1.28, 1.28], len: 0.12, gap: 0.07 }, { v: 'aa', p: [1.36, 1.3], len: 0.2, gap: 0 }] },
  { id: 'whoop', syl: [{ v: 'uo', p: [0.9, 1.7], len: 0.45, gap: 0 }] }
];
var GROANS = [
  { id: 'aww', syl: [{ v: 'wo', p: [1.1, 0.78], len: 0.75, gap: 0 }] },
  { id: 'ohno', syl: [{ v: 'oo', p: [1.1, 0.95], len: 0.28, gap: 0.06 }, { v: 'ou', p: [0.95, 0.7], len: 0.5, gap: 0 }] },
  { id: 'uhoh', syl: [{ v: 'aa', p: [1.1, 1.1], len: 0.16, gap: 0.08 }, { v: 'oo', p: [0.88, 0.8], len: 0.4, gap: 0 }] },
  { id: 'ugh', syl: [{ v: 'aw', p: [1.0, 0.7], len: 0.55, gap: 0 }] }
];

/**
 * Which reaction to play, never the same one twice in a row.
 * @param {'cheer'|'sad'} kind
 * @param {{rand?: function(): number, last?: string}} [options]
 * @returns {{id: string, syl: object[]}}
 */
export function pickReaction(kind, options) {
  options = options || {};
  var rand = options.rand || Math.random;
  var pool = kind === 'sad' ? GROANS : CHEERS;
  var choices = pool.filter(function (r) { return r.id !== options.last; });
  return choices[Math.floor(rand() * choices.length) % choices.length];
}

/** How long a reaction lasts, in seconds. */
export function reactionLength(reaction) {
  return reaction.syl.reduce(function (t, s) { return t + s.len + s.gap; }, 0);
}

// ─────────────────────────────────────────────────────────────
// Sound making (needs an AudioContext)
// ─────────────────────────────────────────────────────────────

var noiseBuffer = null;
function getNoise(ctx) {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  var len = Math.floor(ctx.sampleRate * 0.6);
  noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
  var d = noiseBuffer.getChannelData(0);
  for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuffer;
}

/** One vowel-shaped syllable from a buzzing source through three formant filters. */
function syllable(ctx, dest, t, prof, s, opts) {
  var v0 = VOWELS[s.v[0]] || VOWELS.a;
  var v1 = VOWELS[s.v[s.v.length - 1]] || v0;
  var f0a = prof.f0 * s.p[0] * (opts.pitchMul || 1);
  var f0b = prof.f0 * s.p[1] * (opts.pitchMul || 1);
  var end = t + s.len;

  var src = ctx.createOscillator();
  src.type = 'sawtooth';
  src.frequency.setValueAtTime(f0a, t);
  src.frequency.linearRampToValueAtTime(f0b, end);
  // A little vibrato, and a hint of drift, so it is a voice and not a tone
  var lfo = ctx.createOscillator();
  var lfoGain = ctx.createGain();
  lfo.frequency.value = opts.vibRate || 5.6;
  lfoGain.gain.value = f0a * (opts.vib === undefined ? 0.018 : opts.vib);
  lfo.connect(lfoGain); lfoGain.connect(src.frequency);

  var out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(opts.level || 0.5, t + Math.min(0.04, s.len * 0.25));
  out.gain.setValueAtTime(opts.level || 0.5, Math.max(t + 0.05, end - s.len * 0.35));
  out.gain.exponentialRampToValueAtTime(0.0001, end + 0.05);
  var soften = ctx.createBiquadFilter();
  soften.type = 'lowpass';
  soften.frequency.value = 3200 * prof.bright;
  out.connect(soften); soften.connect(dest);

  var weights = [1, 0.7, 0.35];
  var qs = [9, 12, 14];
  for (var k = 0; k < 3; k++) {
    var f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = qs[k];
    f.frequency.setValueAtTime(v0[k] * prof.size, t);
    f.frequency.linearRampToValueAtTime(v1[k] * prof.size, end);
    var g = ctx.createGain();
    g.gain.value = weights[k] * (k === 0 ? 1.6 : 2.2);
    src.connect(f); f.connect(g); g.connect(out);
  }
  // Breath: a touch of filtered noise at the start of each syllable
  var n = ctx.createBufferSource();
  n.buffer = getNoise(ctx);
  var nf = ctx.createBiquadFilter();
  nf.type = 'bandpass'; nf.frequency.value = v0[1] * prof.size; nf.Q.value = 1.5;
  var ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(opts.breath === undefined ? 0.12 : opts.breath, t + 0.02);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(0.25, s.len));
  n.connect(nf); nf.connect(ng); ng.connect(out);

  src.start(t); lfo.start(t); n.start(t);
  src.stop(end + 0.08); lfo.stop(end + 0.08); n.stop(Math.min(end + 0.08, t + 0.6));
}

/** A little beeping tune: up for a cheer, down for a groan. */
function beeps(ctx, dest, t, prof, kind, type) {
  var notes = kind === 'sad' ? [1, 0.84, 0.7, 0.5] : [1, 1.25, 1.5, 2];
  notes.forEach(function (m, i) {
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    var at = t + i * 0.1;
    o.type = type;
    o.frequency.setValueAtTime(prof.f0 * m, at);
    if (kind === 'sad') o.frequency.linearRampToValueAtTime(prof.f0 * m * 0.9, at + 0.12);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.28, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.11);
    o.connect(g); g.connect(dest);
    o.start(at); o.stop(at + 0.14);
  });
}

/** A rising or falling chirp with a wobble, like something talking from far away. */
function chirps(ctx, dest, t, prof, kind) {
  for (var i = 0; i < 3; i++) {
    var o = ctx.createOscillator();
    var mod = ctx.createOscillator();
    var mg = ctx.createGain();
    var g = ctx.createGain();
    var at = t + i * 0.13;
    var from = prof.f0 * (kind === 'sad' ? 1.6 - i * 0.25 : 0.8 + i * 0.25);
    o.type = 'sine';
    o.frequency.setValueAtTime(from, at);
    o.frequency.exponentialRampToValueAtTime(from * (kind === 'sad' ? 0.55 : 1.7), at + 0.11);
    mod.frequency.value = 38; mg.gain.value = from * 0.25;
    mod.connect(mg); mg.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.3, at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.13);
    o.connect(g); g.connect(dest);
    o.start(at); mod.start(at); o.stop(at + 0.15); mod.stop(at + 0.15);
  }
}

/** A quick burst of clicking, like bones. */
function rattle(ctx, dest, t, kind) {
  var count = kind === 'sad' ? 5 : 8;
  for (var i = 0; i < count; i++) {
    var n = ctx.createBufferSource();
    n.buffer = getNoise(ctx);
    var f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 2200 + (i % 3) * 700; f.Q.value = 6;
    var g = ctx.createGain();
    var at = t + i * (kind === 'sad' ? 0.07 : 0.045);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.5, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
    n.connect(f); f.connect(g); g.connect(dest);
    n.start(at); n.stop(at + 0.05);
  }
}

/**
 * Play a reaction on an audio context.
 * @param {AudioContext} ctx
 * @param {AudioNode} dest where the sound goes
 * @param {string} avatarId the equipped character
 * @param {'cheer'|'sad'} kind
 * @param {{reaction?: object, delay?: number}} [options]
 * @returns {number} how long it lasts, in seconds
 */
export function playReaction(ctx, dest, avatarId, kind, options) {
  options = options || {};
  var prof = profileFor(avatarId);
  var reaction = options.reaction || pickReaction(kind);
  var t = ctx.currentTime + (options.delay || 0.02);
  var length = reactionLength(reaction);

  if (prof.kit === 'robot') {
    beeps(ctx, dest, t, prof, kind, 'square');
    return 0.5;
  }
  if (prof.kit === 'alien') {
    chirps(ctx, dest, t, prof, kind);
    return 0.45;
  }
  var opts = {};
  if (prof.kit === 'zombie') opts = { vib: 0.05, vibRate: 3.2, breath: 0.35, pitchMul: kind === 'sad' ? 0.9 : 1 };
  if (prof.kit === 'orc') opts = { vib: 0.03, breath: 0.28, level: 0.6 };
  if (prof.kit === 'skeleton') opts = { vib: 0.04, vibRate: 8 };
  // The zombie and the orc drag every sound out
  var stretch = prof.kit === 'zombie' ? 1.5 : (prof.kit === 'orc' ? 1.25 : 1);
  var offset = 0;
  reaction.syl.forEach(function (s) {
    var syl = Object.assign({}, s, { len: s.len * stretch });
    syllable(ctx, dest, t + offset, prof, syl, opts);
    offset += (s.len + s.gap) * stretch;
  });
  if (prof.kit === 'skeleton') rattle(ctx, dest, t + offset * 0.5, kind);
  return length * stretch;
}

var MIN_GAP_MS = 600;
var lastAt = 0;
var lastReaction = { cheer: '', sad: '' };

/**
 * Cheer or groan for the equipped character, unless one just played.
 * @param {{ctx: AudioContext, dest: AudioNode}|null} output the audio output to use (null when there is no audio)
 * @param {string} avatarId
 * @param {'cheer'|'sad'} kind
 * @returns {string|null} the reaction that played, or null
 */
export function say(output, avatarId, kind) {
  if (!output || !output.ctx) return null;
  var now = Date.now();
  if (now - lastAt < MIN_GAP_MS) return null;
  lastAt = now;
  var key = kind === 'sad' ? 'sad' : 'cheer';
  var reaction = pickReaction(key, { last: lastReaction[key] });
  lastReaction[key] = reaction.id;
  try {
    playReaction(output.ctx, output.dest, avatarId, key, { reaction: reaction });
  } catch (_e) { /* a sound that cannot play is not worth a crash */ }
  return reaction.id;
}
