/**
 * sunset.js — Prescription Sunset: a beachfront boardwalk at golden hour, where the drugstore sells sunshine.
 *
 * Every 16 units along the boardwalk: a pill-bottle lighthouse with a sweeping lamp, a lounge of striped umbrellas and a
 * palm, the Rx Surf Shack with its surfboards and tiki torches, and a cart selling capsule-shaped ice pops. The sun sits
 * low over a glittering sea, the sky runs from violet to orange, and the sand is warm underfoot. This map keeps its
 * sunset: it does not pick a random time of day or weather like the other open-air maps.
 * Moving: gulls gliding, sailboats crossing the bay, kites bobbing, glitter on the waves, a lighthouse beam sweeping.
 */

import * as THREE from 'three';
import { box, cyl, ball, cone, sign, extrude, starShape, combine, xform, canvasTex, mat, floorPanel, sideCtx, slab } from '../mapkit.js';
import { animated, features, mover, swarm, bob, sway, shimmer, flow, cloudBank } from '../mapfx.js';
import { face, lightString, sparkleGeo, glowMat } from './cartoon.js';
import { birdGeo } from '../mapprops.js';

var ORANGE = 0xff8a3d;
var CORAL = 0xff6a7a;
var TEAL = 0x22c9d6;
var SUN = 0xffd23f;
var PINK = 0xff9ecb;
var VIOLET = 0x9a62f0;
var WOOD = 0xc98a52;
var POP = [ORANGE, CORAL, TEAL, SUN, PINK, VIOLET];

function deckPicture() {
  return canvasTex('sun_deck', 576, 768, function (ctx, w, h) {
    ctx.fillStyle = '#d99a5c'; ctx.fillRect(0, 0, w, h);
    for (var r = 0; r < 32; r++) {
      ctx.fillStyle = ['#e6aa6a', '#d99a5c', '#efb878', '#dfa062'][r % 4]; ctx.fillRect(0, r * 24 + 1, w, 22);
      ctx.fillStyle = 'rgba(80,40,10,0.16)'; for (var j = 0; j < 5; j++) ctx.fillRect((j * 131 + r * 53) % w, r * 24 + 1, 2, 22);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; [-1.5, 1.5].forEach(function (lx) { ctx.fillRect(w / 2 + lx * 48 - 3, 0, 6, h); });
    // painted shells and starfish along the edges
    ctx.fillStyle = 'rgba(255,106,122,0.7)'; for (var s = 0; s < 8; s++) { ctx.beginPath(); ctx.arc(20, 40 + s * 96, 8, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(w - 20, 90 + s * 96, 8, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 8, h); ctx.fillRect(w - 8, 0, 8, h);
  });
}

function seaTex() {
  return canvasTex('sun_sea', 128, 128, function (ctx, w, h) {
    var g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2fc4d8'); g.addColorStop(1, '#2a9fd0');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,230,190,0.55)'; ctx.lineWidth = 3;
    for (var i = 0; i < 8; i++) { ctx.beginPath(); for (var x = 0; x <= w; x += 8) ctx.lineTo(x, 8 + i * 16 + Math.sin((x / w) * Math.PI * 2 * 2 + i) * 4); ctx.stroke(); }
  }, { repeat: [28, 56] });
}

function rail(g, S, z) {
  // a white boardwalk rail with a post at each end and a rope of shells
  box(g, 0.1, 0.1, 4, 0xffffff, S.in(0.0), 1.05, z);
  box(g, 0.08, 0.08, 4, 0xffffff, S.in(0.0), 0.55, z);
  [-1.9, 0, 1.9].forEach(function (dz) { cyl(g, 0.06, 0.06, 1.1, 0xffffff, S.in(0.0), 0.55, z + dz, { seg: 5 }); });
}

function lighthouse(g, S, z) {
  var x = S.in(0.0);
  cyl(g, 0.7, 0.9, 3.4, 0xffb347, x, 1.7, z, { seg: 12, m: 0.05, r: 0.3 });
  cyl(g, 0.72, 0.72, 0.5, 0xffffff, x, 1.5, z, { seg: 12 });
  cyl(g, 0.75, 0.75, 0.5, 0xffffff, x, 2.6, z, { seg: 12 });
  cyl(g, 0.82, 0.82, 0.14, CORAL, x, 3.45, z, { seg: 12 });
  cyl(g, 0.5, 0.55, 0.7, 0xfff0a0, x, 3.9, z, { seg: 10, e: 0xfff0a0, ei: 0.8 });
  cone(g, 0.62, 0.55, WOOD, x, 4.5, z, { seg: 10 });
  face(g, x, 2.0, z, 0.7, S.turn, { open: true });
  sign(g, 'Rx', 0xffffff, CORAL, 0.8, 0.5, S.in(0.1), 2.9, z - 1.1, { ry: S.turn });
  [-1.3, 1.3].forEach(function (dz, i) { ball(g, 0.34, POP[i], S.in(0.5), 0.3, z + dz, { seg: 7, sy: 0.7 }); });
}

function lounge(g, S, z) {
  [-1.1, 1.1].forEach(function (dz, i) {
    var x = S.in(0.5);
    cyl(g, 0.03, 0.03, 2.3, 0xffffff, x, 1.15, z + dz, { seg: 4 });
    for (var s = 0; s < 6; s++) cone(g, 1.0, 0.5, s % 2 ? 0xffffff : POP[i * 2], x, 2.4, z + dz, { seg: 6, ry: (s * Math.PI) / 3 });
    box(g, 0.6, 0.12, 1.4, 0xffffff, x, 0.35, z + dz + 0.3);
    box(g, 0.64, 0.05, 1.0, POP[i * 2 + 1], x, 0.45, z + dz + 0.5);
  });
  // a palm tree: a curved trunk and a crown of fronds
  var px = S.in(0.15);
  cyl(g, 0.12, 0.2, 2.8, 0xa5703a, px, 1.4, z + 0.0, { seg: 6, rz: S.side * 0.1 });
  for (var f = 0; f < 6; f++) {
    var a = (f / 6) * Math.PI * 2;
    cone(g, 0.18, 1.7, 0x2fb85a, px + Math.cos(a) * 0.5 - S.side * 0.3, 2.95, z + Math.sin(a) * 0.7, { seg: 4, rz: Math.cos(a) * 1.0, rx: -Math.sin(a) * 1.0 });
  }
  ball(g, 0.2, 0x7a4a22, px, 2.75, z, { seg: 5 });
  sign(g, 'SUNSET LOUNGE', SUN, 0x5a2a60, 2.6, 0.6, S.in(0.1), 4.9, z, { ry: S.turn, border: 0xffffff });
}

var _flame = null;
function flameMat() { return _flame || (_flame = mat(0xffb030, { e: 0xff8a20, ei: 0.9, r: 0.4 })); }

function surfShack(g, S, z) {
  var x = S.in(0.35);
  box(g, 0.9, 2.4, 3.4, WOOD, S.in(0.1) + (S.side < 0 ? 0.0 : 0.0), 1.2, z);
  box(g, 1.2, 0.14, 3.7, 0xd96a4a, S.in(0.55), 2.5, z, { rz: S.side * 0.18 });
  box(g, 0.3, 1.0, 3.0, 0x7a4a22, x, 0.5, z);
  // surfboards leaning: long rounded shapes in bright colours
  [[-1.3, PINK], [-0.6, TEAL], [0.1, SUN], [0.8, ORANGE]].forEach(function (b, i) {
    ball(g, 0.3, b[1], S.in(0.5), 1.15, z + b[0], { seg: 8, sx: 0.2, sy: 2.6, sz: 0.85, rz: S.side * 0.12 });
    box(g, 0.02, 1.1, 0.06, 0xffffff, S.in(0.5) - S.side * 0.06, 1.15, z + b[0], { rz: S.side * 0.12 });
  });
  // tiki torches with flames that flicker slowly
  [-1.9, 1.9].forEach(function (dz) {
    cyl(g, 0.05, 0.07, 1.6, 0x7a4a22, S.in(0.7), 0.8, z + dz, { seg: 5 });
    cone(g, 0.16, 0.4, 0xffb030, S.in(0.7), 1.8, z + dz, { seg: 6, mat: flameMat() });
  });
  sign(g, 'Rx SURF SHOP', 0x16a8b8, 0xffffff, 2.8, 0.66, S.in(0.22), 3.2, z, { ry: S.turn, border: SUN });
}

function iceCart(g, S, z) {
  var x = S.in(0.5);
  box(g, 0.8, 0.8, 1.9, 0xffffff, x, 0.7, z);
  box(g, 0.84, 0.18, 1.95, TEAL, x, 1.18, z);
  [-0.7, 0.7].forEach(function (dz) { cyl(g, 0.3, 0.3, 0.1, 0x2a2d3a, x, 0.3, z + dz, { rz: Math.PI / 2, seg: 8 }); });
  cyl(g, 0.03, 0.03, 2.2, 0xffffff, x, 2.0, z, { seg: 4 });
  for (var s = 0; s < 6; s++) cone(g, 1.05, 0.5, s % 2 ? 0xffffff : CORAL, x, 3.05, z, { seg: 6, ry: (s * Math.PI) / 3 });
  // capsule-shaped ice pops standing in the tray
  for (var p = 0; p < 5; p++) {
    var pz = z - 0.7 + p * 0.35;
    cyl(g, 0.09, 0.09, 0.42, POP[p % 6], x, 1.5, pz, { seg: 6 });
    ball(g, 0.09, POP[p % 6], x, 1.72, pz, { seg: 6 });
    ball(g, 0.09, 0xffffff, x, 1.28, pz, { seg: 6 });
  }
  // a seagull on the handle
  ball(g, 0.14, 0xffffff, S.in(0.1), 2.0, z + 1.4, { seg: 6, sy: 0.9 });
  ball(g, 0.09, 0xffffff, S.in(0.1), 2.2, z + 1.4, { seg: 5 });
  cone(g, 0.03, 0.12, 0xffb030, S.in(0.1) + (S.side < 0 ? 0.08 : -0.08), 2.2, z + 1.4, { seg: 3, rz: S.side * 1.6 });
  sign(g, 'CAPSULE CONES', 0xffffff, CORAL, 2.8, 0.62, S.in(0.1), 4.3, z - 0.5, { ry: S.turn, border: CORAL });
  extrude(g, starShape(0.3, 0.14, 5), 0.06, SUN, S.in(0.12), 5.3, z, { ry: S.turn, bulb: true, curve: 2 });
}

function bay(g, side, z, k) {
  var S = sideCtx(side);
  rail(g, S, z);
  if (k === 0) lighthouse(g, S, z);
  else if (k === 1) lounge(g, S, z);
  else if (k === 2) surfShack(g, S, z);
  else iceCart(g, S, z);
}

function center(g, z) { floorPanel(g, deckPicture(), z, 12); }

function arch(g, z, i) {
  // festoon lights and paper lanterns across the boardwalk, glowing warm at golden hour
  lightString(g, [0xffe27a, 0xfff6c0, 0xffb347], 6.4, z, { n: 13, sag: 0.5, phase: i });
  [-1, 1].forEach(function (s, n) { ball(g, 0.3, POP[(i + n * 2) % 6], s * 4.6, 5.8, z, { seg: 6, sy: 1.2, e: POP[(i + n * 2) % 6], ei: 0.5 }); });
  ball(g, 0.3, POP[(i + 1) % 6], 0, 5.9, z, { seg: 6, sy: 1.2, e: POP[(i + 1) % 6], ei: 0.5 });
}

function ground(g) {
  // warm sand to the horizon, then the sea on both sides of the boardwalk
  slab(g, 400, 400, 0xf3d49c, 0, -0.04, -190, { r: 1 });
  var sea = seaTex();
  [-1, 1].forEach(function (s) { slab(g, 200, 440, sea ? 0xffffff : 0x2fc4d8, s * 122, -0.02, -200, { map: sea || undefined, r: 0.35, env: 0.6 }); });
  if (sea) flow(sea, 0.015, 0.03);
}

function sailboat(c) {
  var b = new THREE.Group();
  box(b, 0.8, 0.4, 3.0, 0xffffff, 0, 0.2, 0);
  box(b, 0.84, 0.12, 3.04, c, 0, 0.45, 0);
  cyl(b, 0.05, 0.05, 3.6, 0xdddddd, 0, 2.2, 0.0, { seg: 4 });
  var sail = cone(b, 1.0, 3.0, 0xffffff, 0, 2.2, 0.5, { seg: 3, sz: 0.04 });
  sail.rotation.y = Math.PI / 2;
  animated(b);
  bob(b, 0.15, 1.4, 0);
  return b;
}

function beam(side) {
  var outer = new THREE.Group();
  var m = new THREE.Group();
  var c = new THREE.Mesh(new THREE.ConeGeometry(0.9, 6, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  c.rotation.z = side < 0 ? -Math.PI / 2 : Math.PI / 2;
  c.position.x = -side * 3;
  m.add(c);
  m.position.y = 3.9;
  outer.add(m);
  outer.traverse(function (o) { o.userData.noMerge = true; });
  sway(m, 'y', 0.5, 0.8, side);
  return outer;
}

function kiteGeo() {
  var s = new THREE.Shape(); s.moveTo(0, 0.5); s.lineTo(0.3, 0); s.lineTo(0, -0.5); s.lineTo(-0.3, 0); s.closePath();
  return combine([{ geo: new THREE.ShapeGeometry(s), color: 0xffffff, matrix: xform(0, 0, 0) }, { geo: new THREE.CylinderGeometry(0.01, 0.01, 1.2, 3), color: 0xffffff, matrix: xform(0, -0.9, 0) }]);
}

function extras() {
  cloudBank(10, { seed: 6, colors: [0xffd6b8, 0xffc0cb, 0xffe8d6], area: { x: [-70, 70], y: [14, 30], z: [-150, 10] } });
  swarm({ geo: birdGeo(), count: 10, seed: 21, colors: [0xffffff, 0xfff0e0], area: { x: [-26, 26], y: [5, 12], z: [-140, 8] }, k: 0.3, vz: [-4, -2.5], vx: [-0.4, 0.4], face: true, flap: 0.5, scale: [1.2, 2] });
  swarm({ geo: kiteGeo(), material: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }), count: 8, seed: 33, colors: POP, area: { x: [-9, 9], y: [7, 11], z: [-140, 8] }, k: 1, wobble: 0.5, turn: 0.4, scale: [1.2, 1.8] });
  swarm({ geo: sparkleGeo(0.2), material: glowMat(0.85), count: 24, seed: 44, colors: [0xfff0a0, 0xffd6a0, 0xffffff], area: { x: [-60, 60], y: [0.05, 0.4], z: [-140, 8] }, k: 1, turn: 1.4, wobble: 0.05, scale: [0.6, 1.3] });
  [[-30, -90], [34, -140]].forEach(function (p, i) { var s = sailboat(POP[i * 2]); s.position.set(p[0], 0, p[1]); s.rotation.y = i ? Math.PI : 0; mover(s, { k: 0.9, vz: -1.4 }); });
  features(function () { return beam(-1); }, { x: -5.5, spacing: 64, count: 3, z0: -32 });
  features(function () { return beam(1); }, { x: 5.5, spacing: 64, count: 3, z0: -64 });
  shimmer(flameMat(), 0.7, 0.3, 3.5, 0);
}

export var sunset = { id: 'sunset', indoor: false, bay: bay, center: center, arch: arch, ground: ground, extras: extras };
