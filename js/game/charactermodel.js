/**
 * charactermodel.js — animated glTF characters.
 *
 * Loads a .glb once, then hands out skeleton-correct clones with an
 * AnimationMixer and a small state machine (run / jump / slide / celebrate /
 * death / idle) that cross-fades between the model's authored clips.
 *
 * Loading is asynchronous. Until a model is ready the game shows the avatar's
 * procedural stand-in, then swaps to the model and fires
 * "buzzword:model-ready" so the UI can rebuild.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

var TARGET_HEIGHT = 2.05; // matches the procedural humanoids
var FADE = 0.2;

var _cache = {};    // url -> { scene, clips, height, minY }
var _loading = {};  // url -> Promise

/**
 * How each logical state plays. Model packs name their clips differently
 * ("CharacterArmature|Run", "Robot_Running", "Dragon_Flying"...), so each state
 * lists name patterns in priority order and the first clip that matches is used.
 * Patterns run against the clip's base name (armature prefix and the pack's
 * "Robot_"/"Alien_"/"Dragon_" prefix removed). A state with no match falls back
 * to `fallback`, so every model still animates.
 */
var STATE_CLIPS = {
  run: { match: [/^run$/i, /^running$/i, /^fast_flying$/i, /^walk$/i, /^walking$/i, /^flying$/i, /^flying_idle$/i, /run/i, /walk/i, /fly/i], loop: true, scale: 1.0 },
  jump: { match: [/^jump$/i, /^runningjump$/i, /^walkjump$/i, /^jump_idle$/i, /jump/i, /hop/i], loop: false, scale: 1.5, clamp: true, fallback: 'run' },
  slide: { match: [/^roll$/i, /^duck$/i, /slide/i, /crouch/i], loop: true, scale: 1.5, fallback: 'run' },
  celebrate: { match: [/^wave$/i, /^dance$/i, /^thumbsup$/i, /^clapping$/i, /^yes$/i, /victory|cheer|emote/i], loop: false, scale: 1.2, clamp: true, fallback: 'idle' },
  death: { match: [/^death$/i, /die|dead|faint/i, /^hitreact$/i, /^hitrecieve$/i], loop: false, scale: 1.0, clamp: true, fallback: 'idle' },
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

export function isModelReady(url) {
  return !!_cache[url];
}

function store(url, gltf) {
  // Skinned meshes measure wrongly until their bones' world matrices are
  // current, so update first and use the precise (posed-vertex) bounds.
  gltf.scene.updateMatrixWorld(true);
  var box = new THREE.Box3().setFromObject(gltf.scene, true);
  _cache[url] = {
    scene: gltf.scene,
    clips: gltf.animations || [],
    height: Math.max(0.01, box.max.y - box.min.y),
    minY: box.min.y
  };
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('buzzword:model-ready', { detail: { url: url } }));
}

/**
 * Start loading a model (idempotent).
 * @param {string} url
 * @returns {Promise<void>}
 */
export function loadCharacterModel(url) {
  if (_cache[url]) return Promise.resolve();
  if (_loading[url]) return _loading[url];
  _loading[url] = new Promise(function (resolve, reject) {
    new GLTFLoader().load(url, function (gltf) {
      store(url, gltf);
      delete _loading[url];
      resolve();
    }, undefined, function (err) {
      delete _loading[url];
      reject(err);
    });
  });
  return _loading[url];
}

/**
 * Register a model from bytes already in memory (used by tests and tooling).
 * @param {string} url
 * @param {ArrayBuffer} buffer
 */
export function parseCharacterModel(url, buffer) {
  return new Promise(function (resolve, reject) {
    new GLTFLoader().parse(buffer, '', function (gltf) { store(url, gltf); resolve(); }, reject);
  });
}

class ModelAnimator {
  constructor(root, clips) {
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = {};
    var self = this;
    this.clipNames = clips.map(function (c) { return c.name; });
    clips.forEach(function (clip) { self.actions[clip.name] = self.mixer.clipAction(clip); });
    this.state = null;
    this.current = null;
  }

  setState(state) {
    if (state === this.state) return;
    var resolved = resolveClipName(this.clipNames, state);
    var def = STATE_CLIPS[resolved ? resolved.state : state];
    var next = resolved && this.actions[resolved.clip];
    if (!next) return;
    var prev = this.current;
    next.reset();
    next.setLoop(def.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    next.clampWhenFinished = !!def.clamp;
    next.timeScale = def.scale || 1;
    next.enabled = true;
    next.fadeIn(FADE).play();
    if (prev && prev !== next) prev.fadeOut(FADE);
    this.current = next;
    this.state = state;
  }

  update(dt) {
    this.mixer.update(dt);
  }
}

/**
 * Build a character from a loaded model.
 * @param {string} url
 * @param {number} [scale] avatar scale multiplier
 * @returns {THREE.Group|null} null if the model is not loaded yet
 */
export function buildModelCharacter(url, scale, height) {
  var entry = _cache[url];
  if (!entry) return null;

  var root = cloneSkinned(entry.scene);
  var k = ((height || TARGET_HEIGHT) * (scale || 1)) / entry.height;
  root.scale.setScalar(k);
  root.position.y = -entry.minY * k;
  root.rotation.y = Math.PI; // the model faces +Z; gameplay faces -Z

  var pg = new THREE.Group();
  pg.add(root);
  pg.userData.isModel = true;
  pg.userData.animator = new ModelAnimator(root, entry.clips);
  pg.userData.animator.setState('run');
  return pg;
}

/**
 * Build a monster from a loaded model. Unlike a character, every material is
 * copied (the whole monster fades in and out) and it faces the camera.
 * @param {string} url
 * @param {number} [height] world height before the engine scales it
 * @returns {THREE.Group|null} null if the model is not loaded yet
 */
export function buildModelMonster(url, height) {
  var pg = buildModelCharacter(url, 1, height || 5.5);
  if (!pg) return null;
  var root = pg.children[0];
  root.rotation.y = 0; // monsters face the camera
  root.traverse(function (o) {
    if (!o.isMesh || !o.material) return;
    o.material = Array.isArray(o.material)
      ? o.material.map(function (m) { return m.clone(); })
      : o.material.clone();
    o.frustumCulled = false; // skinned bounds are unreliable once animated/scaled
  });
  pg.userData.isModelMonster = true;
  pg.userData.animator.setState('idle');
  return pg;
}

/**
 * Advance a model character's animation.
 * @param {THREE.Object3D} pg
 * @param {number} dt seconds
 * @param {string} [state] run | jump | slide | celebrate | death | idle | wave
 * @returns {boolean} true if pg is a model character
 */
export function updateModelAnimation(pg, dt, state) {
  var animator = pg && pg.userData && pg.userData.animator;
  if (!animator) return false;
  if (state) animator.setState(state);
  animator.update(dt);
  return true;
}

/** Names of the clips the model actually provides (for tests and tooling). */
export function getModelClipNames(url) {
  var entry = _cache[url];
  return entry ? entry.clips.map(function (c) { return c.name; }) : [];
}
