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

/** Which authored clip plays for each logical state. */
var STATE_CLIPS = {
  run: { clip: 'Running', loop: true, scale: 1.0 },
  jump: { clip: 'Jump', loop: false, scale: 1.5, clamp: true },
  slide: { clip: 'Running', loop: true, scale: 1.5 },
  celebrate: { clip: 'ThumbsUp', loop: false, scale: 1.4, clamp: true },
  death: { clip: 'Death', loop: false, scale: 1.0, clamp: true },
  idle: { clip: 'Idle', loop: true, scale: 1.0 },
  wave: { clip: 'Wave', loop: false, scale: 1.0 }
};

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
    clips.forEach(function (clip) { self.actions[clip.name] = self.mixer.clipAction(clip); });
    this.state = null;
    this.current = null;
  }

  setState(state) {
    if (state === this.state) return;
    var def = STATE_CLIPS[state];
    var next = def && this.actions[def.clip];
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
export function buildModelCharacter(url, scale) {
  var entry = _cache[url];
  if (!entry) return null;

  var root = cloneSkinned(entry.scene);
  var k = (TARGET_HEIGHT * (scale || 1)) / entry.height;
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
