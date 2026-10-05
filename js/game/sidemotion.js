/**
 * sidemotion.js — something gentle moving beside the track on the original maps.
 *
 * The bright worlds build their own moving scenery. Every other map gets a themed drift here: a few dozen small things
 * (dust, bubbles, cells, sparks, capsules, hearts) drawn as one or two instanced meshes, so it costs a draw call or two
 * and almost no triangles, on every graphics tier. They stay outside the walls (or hug them, in the hospital rooms),
 * never in the lanes, and the glowing kinds are soft so they never compete with the gates.
 */

import * as THREE from 'three';
import { combine, xform } from './mapkit.js';
import { swarm } from './mapfx.js';

var SHAPES = {
  orb: function () { return combine([{ geo: new THREE.SphereGeometry(0.14, 6, 4), color: 0xffffff }]); },
  disc: function () { return combine([{ geo: new THREE.CylinderGeometry(0.2, 0.2, 0.06, 8), color: 0xffffff, matrix: xform(0, 0, 0, 0.5, 0, 0) }]); },
  spark: function () { return combine([{ geo: new THREE.OctahedronGeometry(0.16, 0), color: 0xffffff }]); },
  capsule: function () {
    return combine([
      { geo: new THREE.CylinderGeometry(0.1, 0.1, 0.26, 7), color: 0xffffff },
      { geo: new THREE.SphereGeometry(0.1, 7, 4), color: 0xffffff, matrix: xform(0, 0.13, 0) },
      { geo: new THREE.SphereGeometry(0.1, 7, 4), color: 0xffffff, matrix: xform(0, -0.13, 0) }
    ]);
  },
  plus: function () {
    return combine([
      { geo: new THREE.BoxGeometry(0.34, 0.1, 0.1), color: 0xffffff },
      { geo: new THREE.BoxGeometry(0.1, 0.34, 0.1), color: 0xffffff }
    ]);
  },
  heart: function () {
    var s = new THREE.Shape();
    s.moveTo(0, -0.2); s.bezierCurveTo(-0.38, 0.05, -0.2, 0.3, 0, 0.14); s.bezierCurveTo(0.2, 0.3, 0.38, 0.05, 0, -0.2);
    return combine([{ geo: new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: false, curveSegments: 4 }), color: 0xffffff }]);
  }
};

/**
 * For each map: what drifts, in which colours, how many on each side, and where. `hug` keeps it just inside the wall
 * (the hospital rooms have a ceiling); the rest drift out beyond the walls, in the open space around the track.
 */
export var SIDE_MOTION = {
  'Hospital Hallway': { shape: 'heart', colors: [0xff6f8f, 0x5ff0ff, 0xffffff], hug: true, rise: true },
  'Operating Room': { shape: 'orb', colors: [0xbffff4, 0xffffff], hug: true, rise: true },
  'Research Lab': { shape: 'orb', colors: [0x7fe3ff, 0xff9f6b, 0xb27fff, 0x7fffa8], hug: true, rise: true },
  'Ambulance Bay': { shape: 'spark', colors: [0xffb347, 0xffffff], hug: true },
  'Neural Highway': { shape: 'spark', colors: [0xcc88ff, 0xaa66ff, 0xffffff], glow: true },
  'Vascular Rush': { shape: 'disc', colors: [0xff5566, 0xcc2233], glow: false },
  'Skeletal Corridor': { shape: 'orb', colors: [0xffeedd, 0xddccbb], glow: true },
  'Cellular Matrix': { shape: 'orb', colors: [0x66ffaa, 0x88ffcc], glow: true, rise: true },
  'Neon ER': { shape: 'plus', colors: [0x4488ff, 0x88bbff, 0xffffff], glow: true },
  'DNA Helix Tunnel': { shape: 'orb', colors: [0x66aaff, 0xff88cc], glow: true },
  'Prescription Sunset': { shape: 'capsule', colors: [0xffaa44, 0xffffff, 0x44ccff], glow: false },
  'Cardiac Pulse': { shape: 'disc', colors: [0xff5588, 0xff99bb], glow: true },
  'Surgical Theater': { shape: 'spark', colors: [0x44eedd, 0x88ffdd], glow: true },
  'Candy Lab': { shape: 'orb', colors: [0xff99ff, 0xffccff, 0x44ffaa], glow: true, rise: true },
  'X-Ray Vision': { shape: 'spark', colors: [0x44eeff, 0xffffff], glow: true },
  'Defibrillator Shock': { shape: 'spark', colors: [0xffee66, 0xffffff], glow: true }
};

/** Add the drift for a classic map (does nothing for maps without an entry). Must be called while a build context is open. */
export function addSideMotion(skin) {
  var cfg = SIDE_MOTION[skin.name];
  if (!cfg) return;
  var geo = SHAPES[cfg.shape]();
  var material = cfg.glow
    ? new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending })
    : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0, envMapIntensity: 0.5, flatShading: true });
  [-1, 1].forEach(function (side, i) {
    var x = cfg.hug ? [side * 4.6, side * 5.2] : [side * 5.8, side * 13];
    var y = cfg.hug ? [0.8, 5.2] : [0.6, 8];
    swarm({
      geo: geo, material: material, count: cfg.hug ? 16 : 22, seed: 101 + i * 17, colors: cfg.colors,
      area: { x: x, y: y, z: [-140, 8] }, k: 1,
      vy: cfg.rise ? [0.25, 0.7] : null, vx: cfg.hug ? null : [-0.2, 0.2], vz: cfg.hug ? null : [-1.2, 1.2],
      wobble: cfg.hug ? 0.12 : 0.4, turn: cfg.shape === 'disc' || cfg.shape === 'plus' ? 1.2 : 0, scale: cfg.hug ? [1.3, 2.3] : [0.7, 1.5]
    });
  });
}
