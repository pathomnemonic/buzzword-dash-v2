/**
 * secrets.js — one tiny hidden thing on every map.
 *
 * Once in a while during a solo run something small and friendly shows up beside the track (a waving cow, a squeaky
 * pill bottle, a rubber duck). Tap it before it passes and it pays a few coins; the first time on each map pays more.
 * It rewards noticing the scenery, appears at most once per run, never in competitive runs, sits well outside the lanes
 * and is only a tap away, never something to dodge. This file has the list, the little models and the rules.
 */

import * as THREE from 'three';
import { box, cyl, ball, cone } from './mapkit.js';

export var SECRET_COINS = 5;
export var SECRET_FIRST_COINS = 25;
/** How big a tap target is, in screen pixels around the thing (fingers are not precise). */
export var TAP_RADIUS_PX = 58;

/** map name -> { kind, name } */
export var SECRETS = {
  'Hospital Hallway': { kind: 'heart', name: 'a bashful heart' },
  'Operating Room': { kind: 'star', name: 'a surgical star' },
  'Research Lab': { kind: 'flask', name: 'a bubbly beaker' },
  'Ambulance Bay': { kind: 'duck', name: 'a rubber duck on night shift' },
  'Neural Highway': { kind: 'spark', name: 'a cheeky neuron' },
  'Vascular Rush': { kind: 'cell', name: 'a waving red cell' },
  'Skeletal Corridor': { kind: 'bone', name: 'a dancing bone' },
  'Cellular Matrix': { kind: 'cell', name: 'a shy cell' },
  'Neon ER': { kind: 'bottle', name: 'a squeaky pill bottle' },
  'DNA Helix Tunnel': { kind: 'spark', name: 'a spinning base pair' },
  'Prescription Sunset': { kind: 'bottle', name: 'a squeaky pill bottle' },
  'Cardiac Pulse': { kind: 'heart', name: 'a happy heart' },
  'Surgical Theater': { kind: 'star', name: 'a surgical star' },
  'Candy Lab': { kind: 'jelly', name: 'a jelly blob' },
  'X-Ray Vision': { kind: 'bone', name: 'a bone with a secret' },
  'Defibrillator Shock': { kind: 'spark', name: 'a static spark' },
  'Pediatric Playland': { kind: 'duck', name: 'a squeaky rubber duck' },
  'Sunshine Rehab Garden': { kind: 'bunny', name: 'a garden bunny' },
  'Cafeteria Carnival': { kind: 'bottle', name: 'a giggling ketchup bottle' },
  'Neonatal Cloud Nursery': { kind: 'cloud', name: 'a sleepy little cloud' },
  'Anatomy Amusement Park': { kind: 'balloon', name: 'a runaway balloon' },
  'Pharmacy Pop Factory': { kind: 'bottle', name: 'a squeaky pill bottle' },
  'Aquarium Imaging Center': { kind: 'fish', name: 'a shy clownfish' },
  'Rooftop Helipad Resort': { kind: 'duck', name: 'a pool duck' },
  'Vet and Farm Clinic': { kind: 'cow', name: 'a waving cow' },
  'Holiday Wards': { kind: 'pumpkin', name: 'a grinning pumpkin' }
};

export function secretFor(mapName) { return SECRETS[mapName] || null; }

/** When in the run (seconds) the secret shows up: not at the very start, not so late it is never seen. */
export function planSecretTime(rand) {
  return 25 + (rand || Math.random)() * 45;
}

/** Is a tap at (x, y) close enough to the thing at (sx, sy), all in screen pixels? */
export function isTapOnSecret(x, y, sx, sy, radius) {
  var dx = x - sx;
  var dy = y - sy;
  return dx * dx + dy * dy <= Math.pow(radius || TAP_RADIUS_PX, 2);
}

/** What a find pays. */
export function secretReward(firstTime) { return firstTime ? SECRET_FIRST_COINS : SECRET_COINS; }

// ---------- the little models (each is about 20 triangles per piece, 6 pieces at most) ----------

var BUILDERS = {
  duck: function (g) { ball(g, 0.5, 0xffd23f, 0, 0.5, 0, { seg: 8, sy: 0.85 }); ball(g, 0.3, 0xffd23f, 0.3, 1.0, 0, { seg: 8 }); cone(g, 0.1, 0.25, 0xff8a1f, 0.62, 0.95, 0, { seg: 4, rz: -Math.PI / 2 }); ball(g, 0.05, 0x222222, 0.42, 1.08, 0.14, { seg: 4 }); ball(g, 0.05, 0x222222, 0.42, 1.08, -0.14, { seg: 4 }); },
  cow: function (g) { box(g, 1.0, 0.7, 0.6, 0xffffff, 0, 0.7, 0); box(g, 0.4, 0.3, 0.62, 0x2a2a2a, 0.1, 0.8, 0); box(g, 0.4, 0.4, 0.4, 0xffffff, 0.65, 1.05, 0); box(g, 0.14, 0.14, 0.42, 0xffa8c0, 0.88, 0.95, 0); [[-0.35, -0.2], [0.35, -0.2], [-0.35, 0.2], [0.35, 0.2]].forEach(function (p) { box(g, 0.12, 0.4, 0.12, 0xffffff, p[0], 0.2, p[1]); }); var arm = new THREE.Group(); box(arm, 0.12, 0.45, 0.12, 0xffffff, 0, 0.22, 0); arm.position.set(0.35, 0.9, 0.38); g.add(arm); g.userData.wave = arm; },
  bottle: function (g) { cyl(g, 0.28, 0.28, 0.9, 0xffa23f, 0, 0.55, 0, { seg: 8, op: 0.92 }); cyl(g, 0.3, 0.3, 0.2, 0xffffff, 0, 1.08, 0, { seg: 8 }); box(g, 0.4, 0.3, 0.02, 0xffffff, 0, 0.55, 0.28); ball(g, 0.05, 0x222222, -0.08, 0.7, 0.29, { seg: 4 }); ball(g, 0.05, 0x222222, 0.08, 0.7, 0.29, { seg: 4 }); },
  fish: function (g) { ball(g, 0.4, 0xff8a1f, 0, 0.5, 0, { seg: 8, sx: 1.4, sy: 0.9, sz: 0.6 }); cone(g, 0.3, 0.4, 0xff8a1f, -0.7, 0.5, 0, { seg: 4, rz: Math.PI / 2 }); box(g, 0.12, 0.6, 0.62, 0xffffff, 0.15, 0.5, 0); ball(g, 0.06, 0x222222, 0.4, 0.58, 0.18, { seg: 4 }); },
  star: function (g) { cone(g, 0.5, 0.9, 0xffd23f, 0, 0.7, 0, { seg: 5 }); cone(g, 0.5, 0.9, 0xffd23f, 0, 0.7, 0, { seg: 5, rx: Math.PI }); ball(g, 0.05, 0x222222, -0.1, 0.72, 0.25, { seg: 4 }); ball(g, 0.05, 0x222222, 0.1, 0.72, 0.25, { seg: 4 }); },
  pumpkin: function (g) { ball(g, 0.55, 0xff8a1f, 0, 0.55, 0, { seg: 8, sy: 0.85 }); box(g, 0.12, 0.2, 0.12, 0x4a6a2a, 0, 1.05, 0); box(g, 0.1, 0.1, 0.02, 0x2a1a0a, -0.2, 0.62, 0.5); box(g, 0.1, 0.1, 0.02, 0x2a1a0a, 0.2, 0.62, 0.5); box(g, 0.34, 0.08, 0.02, 0x2a1a0a, 0, 0.38, 0.5); },
  heart: function (g) { ball(g, 0.3, 0xff4d6a, -0.2, 0.9, 0, { seg: 8 }); ball(g, 0.3, 0xff4d6a, 0.2, 0.9, 0, { seg: 8 }); cone(g, 0.5, 0.7, 0xff4d6a, 0, 0.4, 0, { seg: 8, rx: Math.PI }); ball(g, 0.05, 0x222222, -0.12, 0.8, 0.3, { seg: 4 }); ball(g, 0.05, 0x222222, 0.12, 0.8, 0.3, { seg: 4 }); },
  bunny: function (g) { ball(g, 0.4, 0xffffff, 0, 0.45, 0, { seg: 8, sy: 0.9 }); ball(g, 0.26, 0xffffff, 0.2, 0.95, 0, { seg: 8 }); box(g, 0.1, 0.5, 0.1, 0xffffff, 0.15, 1.35, 0.06, { rz: 0.1 }); box(g, 0.1, 0.5, 0.1, 0xffffff, 0.27, 1.35, -0.06, { rz: -0.1 }); ball(g, 0.1, 0xffa8c0, -0.4, 0.4, 0, { seg: 5 }); },
  balloon: function (g) { ball(g, 0.5, 0xff4d6a, 0, 1.0, 0, { seg: 8, sy: 1.15 }); cone(g, 0.08, 0.14, 0xcc2a48, 0, 0.45, 0, { seg: 4, rx: Math.PI }); cyl(g, 0.012, 0.012, 0.8, 0xdddddd, 0, 0.0, 0, { seg: 3 }); },
  cell: function (g) { ball(g, 0.5, 0xff5566, 0, 0.6, 0, { seg: 8, sy: 0.55 }); ball(g, 0.05, 0x222222, -0.12, 0.7, 0.2, { seg: 4 }); ball(g, 0.05, 0x222222, 0.12, 0.7, 0.2, { seg: 4 }); },
  bone: function (g) { cyl(g, 0.1, 0.1, 0.9, 0xf4ead8, 0, 0.6, 0, { seg: 6, rz: Math.PI / 2 }); [[-0.45, 0.1], [-0.45, -0.1], [0.45, 0.1], [0.45, -0.1]].forEach(function (p) { ball(g, 0.14, 0xf4ead8, p[0], 0.6 + p[1], 0, { seg: 5 }); }); },
  spark: function (g) { cone(g, 0.35, 0.8, 0xcc88ff, 0, 0.8, 0, { seg: 4 }); cone(g, 0.35, 0.8, 0xcc88ff, 0, 0.8, 0, { seg: 4, rx: Math.PI }); ball(g, 0.1, 0xffffff, 0, 0.8, 0, { seg: 5 }); },
  cloud: function (g) { ball(g, 0.35, 0xffffff, 0, 0.6, 0, { seg: 7 }); ball(g, 0.28, 0xffffff, 0.35, 0.55, 0, { seg: 6 }); ball(g, 0.28, 0xffffff, -0.35, 0.55, 0, { seg: 6 }); ball(g, 0.04, 0x444466, -0.1, 0.62, 0.3, { seg: 4 }); ball(g, 0.04, 0x444466, 0.1, 0.62, 0.3, { seg: 4 }); },
  jelly: function (g) { ball(g, 0.5, 0xff7ab8, 0, 0.5, 0, { seg: 8, sy: 0.75, op: 0.9 }); ball(g, 0.05, 0x222222, -0.14, 0.6, 0.4, { seg: 4 }); ball(g, 0.05, 0x222222, 0.14, 0.6, 0.4, { seg: 4 }); },
  flask: function (g) { cone(g, 0.5, 0.8, 0x7fe3ff, 0, 0.45, 0, { seg: 8, op: 0.85 }); cyl(g, 0.14, 0.14, 0.5, 0x7fe3ff, 0, 1.0, 0, { seg: 6, op: 0.85 }); ball(g, 0.12, 0xb27fff, 0.12, 0.45, 0.1, { seg: 4 }); ball(g, 0.1, 0xb27fff, -0.1, 0.65, 0.1, { seg: 4 }); }
};

/**
 * Build the little model for a map's secret, facing +z, standing on y = 0, about 1.3 units tall.
 * `userData.tick(t)` makes it bob and wave; `userData.glow` is a soft halo that makes it easy to spot.
 */
export function buildSecret(kind) {
  var g = new THREE.Group();
  (BUILDERS[kind] || BUILDERS.star)(g);
  var halo = new THREE.Mesh(new THREE.SphereGeometry(0.95, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.position.y = 0.7;
  g.add(halo);
  g.userData.glow = halo;
  g.userData.tick = function (t) {
    g.position.y = g.userData.baseY + Math.sin(t * 2.4) * 0.12;
    g.rotation.y = Math.sin(t * 1.3) * 0.35;
    halo.material.opacity = 0.14 + 0.08 * (0.5 + 0.5 * Math.sin(t * 2.2)); // a slow glow, well under 3 pulses a second
    if (g.userData.wave) g.userData.wave.rotation.z = Math.sin(t * 6) * 0.7;
  };
  return g;
}
