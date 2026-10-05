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
import { createGLTFLoader } from './gltfloader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { markShared } from './materials.js';

var TARGET_HEIGHT = 2.05; // matches the procedural humanoids
var FADE = 0.2;

var _cache = {};    // url -> { scene, clips, height, minY }
var _loading = {};  // url -> Promise

import { STATE_CLIPS, baseClipName, findClipName, resolveClipName, heroKeyFor } from './clipnames.js';
export { baseClipName, findClipName, resolveClipName };

export function isModelReady(url) {
  return !!_cache[url];
}

function store(url, gltf) {
  // Skinned meshes measure wrongly until their bones' world matrices are
  // current, so update first and use the precise (posed-vertex) bounds.
  gltf.scene.updateMatrixWorld(true);
  markShared(gltf.scene);
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
    createGLTFLoader().load(url, function (gltf) {
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
    createGLTFLoader().parse(buffer, '', function (gltf) { store(url, gltf); resolve(); }, reject);
  });
}

class ModelAnimator {
  constructor(root, clips, heroKey) {
    this.heroKey = heroKey || '';
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = {};
    var self = this;
    this.clipNames = clips.map(function (c) { return c.name; });
    clips.forEach(function (clip) { self.actions[clip.name] = self.mixer.clipAction(clip); });
    this.state = null;
    this.current = null;
  }

  /** True when the model has its own clip for this state (not just the run cycle standing in for it). */
  hasClip(state) {
    var resolved = resolveClipName(this.clipNames, state, this.heroKey);
    return !!resolved && resolved.state === state;
  }

  setState(state) {
    if (state === this.state) return;
    var resolved = resolveClipName(this.clipNames, state, this.heroKey);
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
 * Repaint materials on a clone. `tints` is a list of { names, color }: every material whose name is in
 * `names` gets `color`. The shared materials are never touched (each repainted one is a copy).
 */
function applyTint(root, tints) {
  var byName = {};
  tints.forEach(function (t) {
    if (!t || !t.names || !t.color) return;
    var c = new THREE.Color(t.color);
    t.names.forEach(function (n) { byName[n] = c; });
  });
  root.traverse(function (o) {
    if (!o.isMesh || !o.material || Array.isArray(o.material)) return;
    var c = byName[o.material.name];
    if (!c) return;
    var m = o.material.clone();
    m.color.copy(c);
    m.userData.shared = false;
    o.material = m;
  });
}

/**
 * Build a character from a loaded model.
 * @param {string} url
 * @param {number} [scale] avatar scale multiplier
 * @param {number} [height] world height
 * @param {Array<{names: string[], color: number}>|{names: string[], color: number}} [tint] repaint the materials with these names (the character's recolored parts)
 * @returns {THREE.Group|null} null if the model is not loaded yet
 */
export function buildModelCharacter(url, scale, height, tint) {
  var entry = _cache[url];
  if (!entry) return null;

  var root = cloneSkinned(entry.scene);
  var tints = Array.isArray(tint) ? tint : (tint ? [tint] : []);
  if (tints.length) applyTint(root, tints);
  var k = ((height || TARGET_HEIGHT) * (scale || 1)) / entry.height;
  root.scale.setScalar(k);
  root.position.y = -entry.minY * k;
  root.rotation.y = Math.PI; // the model faces +Z; gameplay faces -Z

  var pg = new THREE.Group();
  pg.add(root);
  pg.userData.isModel = true;
  pg.userData.animator = new ModelAnimator(root, entry.clips, heroKeyFor(url));
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
  // Like the runner, monsters face -Z: they chase, so they look at the runner (their back is to the camera)
  root.traverse(function (o) {
    if (!o.isMesh || !o.material) return;
    o.material = Array.isArray(o.material)
      ? o.material.map(function (m) { var c = m.clone(); c.userData.shared = false; return c; })
      : Object.assign(o.material.clone(), {});
    // Each monster owns its materials (it fades them); geometry stays shared
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { m.userData.shared = false; });
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
