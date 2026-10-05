/**
 * farm.js — Vet and Farm Clinic: a country clinic where the patients are cows, pigs, sheep and chickens.
 *
 * Every 16 units: a big red barn front, a stack of hay bales with crates of fresh vegetables, an animal pen, and the
 * clinic tent with a green cross. Moving: a windmill, a tractor rolling past, birds, butterflies and drifting clouds.
 */

import * as THREE from 'three';
import { box, cyl, ball, cone, canvasTex, floorPanel, sideCtx, slab, kitAt } from '../mapkit.js';
import { animated, features, mover, spin, swarm, cloudBank } from '../mapfx.js';
import { tree, flowers, picket, butterflyGeo, birdGeo } from '../mapprops.js';

var BARN = 0xd9382f;
var HAY = 0xf0c24a;
var WHITE = 0xffffff;
var PINK = 0xffa8c0;

function dirtPath() {
  return canvasTex('farm_path', 576, 768, function (ctx, w, h) {
    ctx.fillStyle = '#6fcf5a'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#e0b878'; ctx.fillRect(24, 0, w - 48, h);
    for (var i = 0; i < 90; i++) { ctx.fillStyle = ['#d0a463', '#ecc98d', '#c89a58'][i % 3]; ctx.beginPath(); ctx.ellipse(40 + (i * 79) % (w - 80), (i * 131) % h, 14, 6, 0, 0, 6.283); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; [-1.5, 1.5].forEach(function (lx) { ctx.fillRect(w / 2 + lx * 48 - 3, 0, 6, h); });
    for (var t = 0; t < 40; t++) { ctx.fillStyle = '#4fb842'; ctx.fillRect((t * 37) % 22, (t * 71) % h, 3, 9); ctx.fillRect(w - 22 + (t * 37) % 22, (t * 53) % h, 3, 9); }
  });
}

function cow(g, x, z, ry) {
  var o = { ry: ry };
  var c = Math.cos(ry), s = Math.sin(ry);
  function at(dx, dz) { return [x + dx * c + dz * s, z - dx * s + dz * c]; }
  var b = at(0, 0); box(g, 0.6, 0.6, 1.1, WHITE, b[0], 0.75, b[1], o);
  var p1 = at(0.0, 0.1); box(g, 0.62, 0.3, 0.4, 0x2a2a2a, p1[0], 0.85, p1[1], o);
  var h = at(0, 0.7); box(g, 0.4, 0.4, 0.4, WHITE, h[0], 1.05, h[1], o);
  var n = at(0, 0.92); box(g, 0.3, 0.2, 0.1, PINK, n[0], 0.98, n[1], o);
  [[-0.2, -0.4], [0.2, -0.4], [-0.2, 0.4], [0.2, 0.4]].forEach(function (l) { var p = at(l[0], l[1]); box(g, 0.12, 0.5, 0.12, WHITE, p[0], 0.25, p[1], o); });
}

function pig(g, x, z, ry) {
  var o = { ry: ry };
  var c = Math.cos(ry), s = Math.sin(ry);
  function at(dx, dz) { return [x + dx * c + dz * s, z - dx * s + dz * c]; }
  var b = at(0, 0); ball(g, 0.4, PINK, b[0], 0.5, b[1], { seg: 7, sz: 1.3, sy: 0.9 });
  var h = at(0, 0.5); ball(g, 0.25, PINK, h[0], 0.6, h[1], { seg: 6 });
  var n = at(0, 0.72); cyl(g, 0.1, 0.1, 0.1, 0xff8aa8, n[0], 0.58, n[1], { seg: 6, rx: Math.PI / 2 });
  [[-0.2, -0.3], [0.2, -0.3], [-0.2, 0.3], [0.2, 0.3]].forEach(function (l) { var p = at(l[0], l[1]); box(g, 0.1, 0.25, 0.1, 0xff8aa8, p[0], 0.12, p[1], o); });
}

function sheep(g, x, z, ry) {
  var c = Math.cos(ry), s = Math.sin(ry);
  function at(dx, dz) { return [x + dx * c + dz * s, z - dx * s + dz * c]; }
  var b = at(0, 0); ball(g, 0.42, 0xf4f4ee, b[0], 0.6, b[1], { seg: 6, sz: 1.2 });
  ball(g, 0.3, 0xf4f4ee, b[0] + 0.1, 0.78, b[1] - 0.1, { seg: 5 });
  var h = at(0, 0.55); ball(g, 0.18, 0x3a3a3a, h[0], 0.7, h[1], { seg: 5 });
  [[-0.15, -0.25], [0.15, -0.25], [-0.15, 0.25], [0.15, 0.25]].forEach(function (l) { var p = at(l[0], l[1]); box(g, 0.08, 0.3, 0.08, 0x3a3a3a, p[0], 0.15, p[1]); });
}

function chicken(g, x, z) {
  ball(g, 0.18, WHITE, x, 0.25, z, { seg: 6, sz: 1.2 });
  ball(g, 0.1, WHITE, x, 0.45, z + 0.15, { seg: 5 });
  cone(g, 0.04, 0.1, 0xffa020, x, 0.43, z + 0.28, { seg: 4, rx: Math.PI / 2 });
  box(g, 0.03, 0.08, 0.06, 0xff3a3a, x, 0.56, z + 0.15);
}

function barn(g, S, z) {
  var x = S.in(0.9);
  box(g, 1.6, 2.6, 3.6, BARN, x, 1.3, z);
  box(g, 0.05, 2.0, 1.6, WHITE, S.in(0.08), 1.1, z);
  box(g, 0.06, 0.12, 1.7, WHITE, S.in(0.06), 1.1, z, { rz: 0 });
  box(g, 0.06, 2.1, 0.12, WHITE, S.in(0.06), 1.1, z);
  box(g, 1.7, 0.2, 3.8, 0x8a3a2a, x, 2.95, z, { rz: S.side * 0.5 });
  box(g, 1.7, 0.2, 3.8, 0x8a3a2a, x - S.side * 0.8, 3.4, z, { rz: -S.side * 0.5 });
  ball(g, 0.3, HAY, S.in(0.1), 3.1, z, { seg: 5 });
}

function hay(g, S, z) {
  for (var i = 0; i < 3; i++) cyl(g, 0.5, 0.5, 0.8, HAY, S.in(0.8), 0.5, z - 1.2 + i * 1.1, { rx: Math.PI / 2 * 0, seg: 9, rz: Math.PI / 2 });
  cyl(g, 0.5, 0.5, 0.8, HAY, S.in(0.8), 1.3, z - 0.65, { seg: 9, rz: Math.PI / 2 });
  // crates of vegetables
  var names = ['rest/crate_carrots', 'rest/crate_lettuce', 'rest/crate_tomatoes'];
  [0, 1, 2].forEach(function (i) {
    var cz = z + 0.6 + i * 0.5;
    if (!kitAt(g, names[i % 3], { width: 0.8, height: 0.5, depth: 0.6 }, S.side, 0.5, 0, z + 0.2 + i * 0.1, 0)) box(g, 0.5, 0.3, 0.6, 0x9a6a3a, S.in(0.5), 0.15, cz);
  });
  // scarecrow
  box(g, 0.06, 1.6, 0.06, 0x8a5a33, S.in(1.5), 0.8, z + 1.6);
  box(g, 1.1, 0.06, 0.06, 0x8a5a33, S.in(1.5), 1.25, z + 1.6);
  ball(g, 0.2, HAY, S.in(1.5), 1.7, z + 1.6, { seg: 6 });
  cone(g, 0.3, 0.3, 0x6a4a2a, S.in(1.5), 1.95, z + 1.6, { seg: 6 });
}

function pen(g, S, z) {
  picket(g, S.in(0.15), z, 4, 0.9, 0x9a6a3a);
  var ry = S.turn;
  cow(g, S.in(1.0), z - 0.7, ry + 1.2);
  pig(g, S.in(0.9), z + 1.0, ry - 0.5);
  sheep(g, S.in(1.6), z + 0.3, ry + 0.4);
  chicken(g, S.in(1.5), z - 1.4);
}

function clinic(g, S, z) {
  box(g, 1.4, 0.1, 3.2, WHITE, S.in(0.8), 2.6, z);
  [-1.5, 1.5].forEach(function (dz) { cyl(g, 0.06, 0.06, 2.6, 0xdcdcdc, S.in(0.35), 1.3, z + dz, { seg: 4 }); });
  box(g, 0.1, 0.8, 2.6, 0x3fbf5a, S.in(0.2), 3.2, z);
  box(g, 0.08, 0.12, 0.5, WHITE, S.in(0.27), 3.2, z); box(g, 0.08, 0.5, 0.12, WHITE, S.in(0.27), 3.2, z);
  box(g, 0.9, 0.5, 1.8, WHITE, S.in(0.8), 0.25, z); // an exam table
  cow(g, S.in(1.5), z + 0.2, S.turn + 2.4);
  chicken(g, S.in(1.2), z - 1.3);
}

function bay(g, side, z, k) {
  var S = sideCtx(side);
  picket(g, S.in(0.0) + side * 0.12, z, 4, 0.8, 0xffffff);
  if (k % 2 === 0) tree(g, S.out(3.6), z, 2.2, [0x3fbf5a, 0x57cf6a][k / 2]);
  if (k === 0) barn(g, S, z);
  else if (k === 1) hay(g, S, z);
  else if (k === 2) pen(g, S, z);
  else clinic(g, S, z);
  flowers(g, S.in(0.4), z + 1.6, [0xffd23f, 0xffffff, 0xff7ab8], 4, 0.2);
}

function center(g, z) { floorPanel(g, dirtPath(), z, 12); }

function arch(g, z, i) {
  for (var f = 0; f < 11; f++) {
    var t = f / 10;
    cone(g, 0.14, 0.3, [0xd9382f, 0xffd23f, 0xffffff, 0x3fbf5a][(f + i) % 4], -5 + t * 10, 6.4 - Math.sin(t * Math.PI) * 0.4 - 0.15, z, { seg: 3, rz: Math.PI, sz: 0.2, bulb: true });
  }
}

function ground(g) {
  slab(g, 400, 400, 0x6fcf5a, 0, -0.02, -190, { r: 1 });
}

function windmill() {
  var m = new THREE.Group();
  cone(m, 1.6, 5.5, 0xf4e8d0, 0, 2.75, 0, { seg: 8 });
  cone(m, 1.8, 1.3, BARN, 0, 5.9, 0, { seg: 8 });
  var rotor = new THREE.Group();
  for (var b = 0; b < 4; b++) { var bl = new THREE.Group(); box(bl, 0.8, 3.4, 0.06, WHITE, 0, 1.9, 0); bl.rotation.z = b * Math.PI / 2; rotor.add(bl); }
  rotor.position.set(0, 5.2, 1.8);
  m.add(rotor);
  animated(rotor);
  spin(rotor, 'z', 0.8, 0);
  return m;
}

function tractor() {
  var t = new THREE.Group();
  box(t, 1.2, 0.8, 2.0, 0x3fbf5a, 0, 0.9, 0);
  box(t, 1.1, 1.1, 0.9, 0x2a9a4a, 0, 1.7, 0.4);
  cyl(t, 0.7, 0.7, 0.35, 0x2a2d3a, -0.7, 0.7, -0.5, { rz: Math.PI / 2, seg: 10 });
  cyl(t, 0.7, 0.7, 0.35, 0x2a2d3a, 0.7, 0.7, -0.5, { rz: Math.PI / 2, seg: 10 });
  cyl(t, 0.4, 0.4, 0.3, 0x2a2d3a, -0.65, 0.4, 0.8, { rz: Math.PI / 2, seg: 8 });
  cyl(t, 0.4, 0.4, 0.3, 0x2a2d3a, 0.65, 0.4, 0.8, { rz: Math.PI / 2, seg: 8 });
  cyl(t, 0.06, 0.06, 0.6, 0x333333, 0.3, 1.5, -0.8, { seg: 4 });
  return t;
}

function extras() {
  cloudBank(10, { seed: 6 });
  features(windmill, { x: 18, spacing: 70, count: 3, z0: -40 });
  [-1, 1].forEach(function (side, i) {
    var tr = tractor();
    tr.position.set(side * 12, 0, -60 - i * 50);
    tr.rotation.y = Math.PI;
    animated(tr);
    mover(tr, { k: 0.55 });
    swarm({ geo: butterflyGeo(), count: 7, seed: 2 + i, colors: [0xffd23f, 0xff9a3f, 0xffffff], area: { x: [side * 5, side * 9], y: [1, 2.8], z: [-140, 8] }, k: 1, vx: [-0.3, 0.3], vz: [-0.5, 0.5], wobble: 0.5, flap: 0.9, scale: [1, 1.5], flat: true });
  });
  swarm({ geo: birdGeo(), count: 8, seed: 41, colors: [0x2a2a3a, 0x4a4a5a], area: { x: [-24, 24], y: [8, 14], z: [-140, 8] }, k: 0.3, vz: [-4, -2.5], face: true, flap: 0.5, scale: [1.2, 2] });
}

export var farm = { id: 'farm', indoor: false, bay: bay, center: center, arch: arch, ground: ground, extras: extras };
