/**
 * materials.js — shared look for everything that is not a character.
 *
 * The animated characters are lit, reflective, physically-based models. The
 * scenery used to be flat unlit "basic" materials on box primitives, which
 * looked a tier below. This module brings the world up to the same standard:
 *
 *  - setupEnvironment: a soft studio reflection map so metals and glossy
 *    surfaces have something to reflect (used by the runner and the previews)
 *  - upgradeMaterials: swaps flat opaque materials for lit ones, leaving
 *    bright neon and see-through parts alone so they still glow
 *  - roundedBox: a box with softened edges instead of a razor-sharp cube
 */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { isLowQuality } from './quality.js';

var _envCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

/**
 * Give a scene a reflection environment and cinematic tone mapping.
 * The environment texture is built once per renderer. Both tiers use it:
 * it is cheap, and metals look black without something to reflect.
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 */
export function setupEnvironment(renderer, scene) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  var tex = _envCache && _envCache.get(renderer);
  if (!tex) {
    var pmrem = new THREE.PMREMGenerator(renderer);
    tex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    if (_envCache) _envCache.set(renderer, tex);
  }
  scene.environment = tex;
}

/** A box with rounded edges. Radius scales with the thinnest side. */
export function roundedBox(w, h, d) {
  if (isLowQuality()) return new THREE.BoxGeometry(w, h, d);
  var r = Math.max(0.004, Math.min(w, h, d) * 0.22);
  return new RoundedBoxGeometry(w, h, d, 2, Math.min(r, Math.min(w, h, d) / 2 - 0.0005));
}

var _dot = null;

/** A soft round white gradient (transparent at the edge), for shadows and glows. */
export function softDotTexture() {
  if (_dot || typeof document === 'undefined') return _dot;
  var canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  var ctx = canvas.getContext('2d');
  if (!ctx) return null;
  var g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  _dot = new THREE.CanvasTexture(canvas);
  return _dot;
}

var FLAT_GEOMETRIES = { PlaneGeometry: 1, CircleGeometry: 1, RingGeometry: 1, ShapeGeometry: 1 };

/**
 * Replace flat materials with lit ones.
 * @param {THREE.Object3D} root
 * @param {object} [opts]
 * @param {number} [opts.glowAbove] colors brighter than this (0..1 luminance)
 *   keep their unlit glow so neon still pops. Default 2 = convert everything.
 * @param {number} [opts.envIntensity] reflection strength (default 0.9)
 */
export function upgradeMaterials(root, opts) {
  if (isLowQuality()) return;
  opts = opts || {};
  var glowAbove = opts.glowAbove === undefined ? 2 : opts.glowAbove;
  var envIntensity = opts.envIntensity === undefined ? 0.9 : opts.envIntensity;
  var cache = {};
  var hsl = { h: 0, s: 0, l: 0 };

  root.traverse(function (o) {
    if (!o.isMesh || !o.material || Array.isArray(o.material)) return;
    var m = o.material;
    var type = o.geometry && o.geometry.type;

    if (m.isMeshStandardMaterial) {
      m.envMapIntensity = envIntensity;
      return;
    }
    if (!m.isMeshBasicMaterial || m.transparent || m.opacity < 1 || m.wireframe) return;
    if (FLAT_GEOMETRIES[type]) return;

    m.color.getHSL(hsl);
    if (hsl.l > glowAbove) return;

    var lit = cache[m.uuid];
    if (!lit) {
      // Grey-blue mid tones read as metal (frames, legs, rails); the rest is painted or plastic.
      var metal = hsl.s < 0.25 && hsl.l > 0.25 && hsl.l < 0.75;
      lit = new THREE.MeshStandardMaterial({
        color: m.color.clone(),
        roughness: metal ? 0.35 : 0.55,
        metalness: metal ? 0.7 : 0.1,
        envMapIntensity: envIntensity
      });
      cache[m.uuid] = lit;
    }
    o.material = lit;
  });
}
