/**
 * scenery.js — real 3D models for obstacles and scenery.
 *
 * Small CC0 models (Quaternius, Kenney, CreativeTrio; see README Credits)
 * replace the primitive-built obstacles and floating props on the "high"
 * graphics tier. They are tiny (about 250 KB in total), so all of them are
 * preloaded once. Until a model is ready, or on the low tier, the built-in
 * procedural versions are used instead.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneModel } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { isLowQuality } from './quality.js';

export var SCENERY_FILES = {
  // Obstacles
  bed: 'obstacles/bed.glb',
  cone: 'obstacles/cone.glb',
  boxes: 'obstacles/boxes.glb',
  barrier: 'obstacles/barrier.glb',
  bin: 'obstacles/bin.glb',
  // Floating scenery
  streetlight: 'props/streetlight.glb',
  monitor: 'props/monitor.glb',
  aircon: 'props/aircon.glb',
  sign: 'props/sign.glb',
  telescope: 'props/telescope.glb'
};

/** Keys used as floating props beside the track. */
export var PROP_KEYS = ['streetlight', 'monitor', 'aircon', 'sign', 'telescope'];

var _cache = {}; // key -> { scene, box: Box3 }
var _preload = null;

function baseUrl() {
  return (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
}

/** Load every scenery model once. Resolves when all have finished (failures are skipped). */
export function preloadScenery() {
  if (isLowQuality()) return Promise.resolve();
  if (_preload) return _preload;
  var loader = new GLTFLoader();
  _preload = Promise.all(Object.keys(SCENERY_FILES).map(function (key) {
    return new Promise(function (resolve) {
      loader.load(baseUrl() + 'models/' + SCENERY_FILES[key], function (gltf) {
        gltf.scene.updateMatrixWorld(true);
        _cache[key] = { scene: gltf.scene, box: new THREE.Box3().setFromObject(gltf.scene, true) };
        resolve();
      }, undefined, function () { resolve(); });
    });
  }));
  return _preload;
}

/** Register a model from bytes already in memory (used by tests). */
export function registerSceneryModel(key, buffer) {
  return new Promise(function (resolve, reject) {
    new GLTFLoader().parse(buffer, '', function (gltf) {
      gltf.scene.updateMatrixWorld(true);
      _cache[key] = { scene: gltf.scene, box: new THREE.Box3().setFromObject(gltf.scene, true) };
      resolve();
    }, reject);
  });
}

export function isSceneryReady(key) {
  return !!_cache[key];
}

/**
 * Build a group from a model, scaled to fit inside a box and sitting on y = 0.
 * @param {string} key
 * @param {{width?: number, height?: number, depth?: number}} fit
 *   The largest size on each axis; unspecified axes are unconstrained.
 * @param {boolean} [alignLong] turn the model so its longest horizontal side
 *   runs along x when `fit.width` is larger than `fit.depth`.
 * @returns {THREE.Group|null} null if the model is not loaded
 */
export function buildScenery(key, fit, alignLong) {
  var entry = _cache[key];
  if (!entry) return null;
  var root = cloneModel(entry.scene);
  var size = entry.box.getSize(new THREE.Vector3());
  var rotated = false;
  if (alignLong && fit.width && fit.depth && fit.width > fit.depth && size.z > size.x) rotated = true;
  var sx = rotated ? size.z : size.x;
  var sz = rotated ? size.x : size.z;

  var k = Infinity;
  if (fit.width) k = Math.min(k, fit.width / Math.max(sx, 1e-4));
  if (fit.height) k = Math.min(k, fit.height / Math.max(size.y, 1e-4));
  if (fit.depth) k = Math.min(k, fit.depth / Math.max(sz, 1e-4));
  if (!isFinite(k)) k = 1;

  var center = entry.box.getCenter(new THREE.Vector3());
  var holder = new THREE.Group();
  root.position.set(-center.x, -entry.box.min.y, -center.z);
  holder.add(root);
  holder.scale.setScalar(k);
  if (rotated) holder.rotation.y = Math.PI / 2;

  var group = new THREE.Group();
  group.add(holder);
  group.userData.isSceneryModel = true;
  return group;
}

/** A random floating prop, or null if none are ready (or on the low tier). */
export function randomSceneryProp(rand) {
  if (isLowQuality()) return null;
  var ready = PROP_KEYS.filter(isSceneryReady);
  if (!ready.length) return null;
  var key = ready[Math.floor((rand || Math.random)() * ready.length)];
  return buildScenery(key, { height: 3.2, width: 3.2, depth: 3.2 });
}
