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
import { createGLTFLoader } from './gltfloader.js';
import { clone as cloneModel } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useSceneryModels } from './quality.js';
import { markShared, mergeStatic } from './materials.js';

/** The KayKit pack the bright maps use: one file, one shared material, one node per model ('rest__food_burger'). */
export var KIT_FILE = 'kaykit/kaykit.glb';

export var SCENERY_FILES = {
  // Obstacles
  bed: 'obstacles/bed.glb',
  cone: 'obstacles/cone.glb',
  boxes: 'obstacles/boxes.glb',
  barrier: 'obstacles/barrier.glb',
  bin: 'obstacles/bin.glb',
  crate: 'obstacles/crate.glb',
  trafficlight: 'obstacles/trafficlight.glb',
  chandelier: 'obstacles/chandelier.glb',
  spotlight: 'obstacles/spotlight.glb',
  hangsign: 'obstacles/sign.glb',
  // Floating scenery
  streetlight: 'props/streetlight.glb',
  monitor: 'props/monitor.glb',
  aircon: 'props/aircon.glb',
  sign: 'props/sign.glb',
  telescope: 'props/telescope.glb',
  heart: 'props/heart.glb',
  firstaid: 'props/firstaid.glb',
  potion: 'props/potion.glb',
  skull: 'props/skull.glb',
  bone: 'props/bone.glb',
  tree: 'props/tree.glb',
  // Rooms (hospital hallway, operating room, lab, ambulance bay)
  med_wheelchair: 'medical/wheelchair.glb',
  med_ivstand: 'medical/ivstand.glb',
  med_doctor: 'medical/doctor.glb',
  med_wetfloor: 'medical/wetfloor.glb',
  med_microscope: 'medical/microscope.glb',
  med_tuberack: 'medical/tuberack.glb',
  med_labdesk: 'medical/labdesk.glb',
  med_ambulance: 'medical/ambulance.glb',
  med_ambulance2: 'medical/ambulance2.glb',
  med_extinguisher: 'medical/extinguisher.glb'
};

/** Keys used as floating props beside the track. */
export var PROP_KEYS = ['streetlight', 'monitor', 'aircon', 'sign', 'telescope', 'heart', 'firstaid', 'potion', 'skull', 'bone'];

var _cache = {}; // key -> { scene, box: Box3 }
var _preload = null;

function baseUrl() {
  return (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
}

/** Load every scenery model once. Resolves when all have finished (failures are skipped). */
export function preloadScenery() {
  if (!useSceneryModels()) return Promise.resolve();
  if (_preload) return _preload;
  var loader = createGLTFLoader();
  var kitLoaded = new Promise(function (resolve) {
    loader.load(baseUrl() + 'models/' + KIT_FILE, function (gltf) { registerKit(gltf); resolve(); }, undefined, function () { resolve(); });
  });
  _preload = Promise.all([kitLoaded].concat(Object.keys(SCENERY_FILES).map(function (key) {
    return new Promise(function (resolve) {
      loader.load(baseUrl() + 'models/' + SCENERY_FILES[key], function (gltf) {
        gltf.scene.updateMatrixWorld(true);
        mergeStatic(gltf.scene);
        markShared(gltf.scene);
        _cache[key] = { scene: gltf.scene, box: new THREE.Box3().setFromObject(gltf.scene, true) };
        resolve();
      }, undefined, function () { resolve(); });
    });
  })));
  return _preload;
}

/** The pack stores its vertices as 16-bit numbers; merging needs plain floats, so widen them first. */
function widenVertices(root) {
  root.traverse(function (o) {
    if (!o.isMesh || !o.geometry) return;
    ['position', 'normal', 'uv'].forEach(function (name) {
      var a = o.geometry.getAttribute(name);
      if (!a || a.array instanceof Float32Array) return;
      var out = new Float32Array(a.count * a.itemSize);
      for (var i = 0; i < a.count; i++) for (var c = 0; c < a.itemSize; c++) out[i * a.itemSize + c] = a.getComponent(i, c);
      o.geometry.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
    });
  });
}

/** Register every model in a loaded kit file under its 'pack/model' name. */
export function registerKit(gltf) {
  gltf.scene.children.slice().forEach(function (node) {
    var holder = new THREE.Group();
    holder.add(node);
    holder.updateMatrixWorld(true);
    widenVertices(holder);
    mergeStatic(holder);
    markShared(holder);
    _cache[node.name.replace('__', '/')] = { scene: holder, box: new THREE.Box3().setFromObject(holder, true) };
  });
}

/** Register a model from bytes already in memory (used by tests). */
export function registerSceneryModel(key, buffer) {
  return new Promise(function (resolve, reject) {
    createGLTFLoader().parse(buffer, '', function (gltf) {
      gltf.scene.updateMatrixWorld(true);
      mergeStatic(gltf.scene);
      markShared(gltf.scene);
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
export function randomSceneryProp(rand, skinName) {
  if (!useSceneryModels()) return null;
  // Props follow the map's theme when it has one, so nothing feels random
  var themed = skinName ? getSideTheme(skinName).map(function (t) { return t[0]; }) : PROP_KEYS;
  var ready = themed.filter(isSceneryReady);
  if (!ready.length) return null;
  var key = ready[Math.floor((rand || Math.random)() * ready.length)];
  return buildScenery(key, { height: 3.2, width: 3.2, depth: 3.2 });
}

/**
 * An overhead obstacle: a model hung from a cable, its underside at
 * `hang.bottom` (above a sliding runner, below a standing one's head).
 * @param {string} key
 * @param {{bottom: number, fit: object}} hang
 * @returns {THREE.Group|null}
 */
export function buildHanging(key, hang) {
  var model = buildScenery(key, hang.fit);
  if (!model) return null;
  model.position.y = hang.bottom;
  var group = new THREE.Group();
  group.add(model);
  var top = hang.bottom + hang.fit.height;
  var cable = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 8 - top, 6),
    new THREE.MeshStandardMaterial({ color: 0x2a2f3a, metalness: 0.6, roughness: 0.5 })
  );
  cable.position.y = top + (8 - top) / 2;
  group.add(cable);
  group.userData.isSceneryModel = true;
  return group;
}

var SIDE_PERIOD = 28;

/**
 * Only the skeleton maps have giant models drifting beside the track (the skull and bones
 * look right there); every other map uses the classic themed floating props instead. Each entry: [model key, height].
 */
export var SIDE_THEMES = {
  'Skeletal Corridor': [['bone', 7], ['skull', 5.5]],
  'X-Ray Vision': [['skull', 6], ['bone', 7]]
};


/** The scenery models a map uses (for tests and preloading decisions). */
export function getSideTheme(skinName) {
  return SIDE_THEMES[skinName] || null;
}

/**
 * Giant themed objects rising above the walls on both sides, repeating every
 * SIDE_PERIOD units so they scroll seamlessly like the walls do.
 * @param {string} skinName the current map
 * @returns {{group: THREE.Group, spacing: number}|null} null until the models are loaded
 */
export function buildSideScenery(skinName) {
  if (!useSceneryModels()) return null;
  var theme = getSideTheme(skinName);
  if (!theme) return null; // only the bone maps get giant models; the rest keep the classic floating props
  if (!theme.every(function (t) { return isSceneryReady(t[0]); })) return null;
  var group = new THREE.Group();
  group.userData.isSideScenery = true;
  var slots = 4; // positions per period, alternating sides and depth
  var n = 0;
  for (var z = -SIDE_PERIOD * 8; z < SIDE_PERIOD; z += SIDE_PERIOD) {
    for (var i = 0; i < slots; i++) {
      var side = i % 2 === 0 ? -1 : 1;
      var pick = theme[(i + Math.abs(Math.round(z / SIDE_PERIOD))) % theme.length];
      var obj = buildScenery(pick[0], { height: pick[1], width: pick[1] * 0.9, depth: pick[1] * 0.9 });
      // Objects drift in space beside the track: never over the lanes, never on the ground
      var far = i > 1;
      var baseY = 3.5 + ((n * 37) % 100) / 100 * 7 + (far ? 2 : 0);
      obj.position.set(side * (10.5 + (far ? 4.5 : 0)), baseY, z + (i * SIDE_PERIOD) / slots);
      obj.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      obj.userData.baseY = baseY;
      obj.userData.phase = (n * 1.7) % 6.28;
      obj.userData.spin = (n % 2 ? 1 : -1) * (0.12 + ((n * 13) % 10) / 100);
      obj.userData.bob = 0.25 + ((n * 7) % 10) / 40;
      group.add(obj);
      n++;
    }
  }
  return { group: group, spacing: SIDE_PERIOD };
}

/** Slow spin and gentle bobbing so the scenery reads as drifting in space. */
export function animateSideScenery(group, time, dt) {
  if (!group) return;
  for (var i = 0; i < group.children.length; i++) {
    var o = group.children[i];
    var u = o.userData;
    if (u.baseY === undefined) continue;
    o.rotation.y += u.spin * dt;
    o.position.y = u.baseY + Math.sin(time * 0.6 + u.phase) * u.bob;
  }
}

/** Depth layers for floating props: how far out, how fast they pass, how big, how high. */
var PROP_LAYERS = [
  { xMin: 9.5, xMax: 14, yMin: 1.5, yMax: 8, speed: 0.95, scale: 1.0, spin: 0.35 },
  { xMin: 15, xMax: 24, yMin: 3, yMax: 14, speed: 0.75, scale: 1.7, spin: 0.22 },
  { xMin: 26, xMax: 42, yMin: 4, yMax: 22, speed: 0.55, scale: 2.8, spin: 0.14 }
];

/**
 * Place a floating prop in a depth layer. Nearer layers pass faster and are
 * smaller (parallax); nothing is placed over the lanes.
 * @param {THREE.Object3D} prop
 * @param {function(): number} [rand]
 */
export function placeFloatingProp(prop, rand) {
  var r = rand || Math.random;
  var roll = r();
  var layer = roll < 0.5 ? PROP_LAYERS[0] : (roll < 0.85 ? PROP_LAYERS[1] : PROP_LAYERS[2]);
  var side = r() < 0.5 ? -1 : 1;
  var x = side * (layer.xMin + r() * (layer.xMax - layer.xMin));
  var y = layer.yMin + r() * (layer.yMax - layer.yMin);
  prop.position.set(x, y, -95 - r() * 25);
  prop.scale.multiplyScalar(layer.scale * (0.8 + r() * 0.5));
  prop.userData = {
    isEnvProp: true,
    speed: layer.speed,
    spin: (r() < 0.5 ? -1 : 1) * layer.spin * (0.6 + r() * 0.8),
    baseY: y,
    phase: r() * 6.28,
    bob: 0.2 + r() * 0.4
  };
  return prop;
}
