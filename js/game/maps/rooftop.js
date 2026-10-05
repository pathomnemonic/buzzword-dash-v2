/**
 * rooftop.js — Rooftop Helipad Resort: a recovery resort on top of the hospital, high over a pastel city.
 *
 * Every 16 units along the sun deck: loungers under striped umbrellas, a palm-lined juice bar, a pool with a diving
 * board, and a helipad corner. A glass rail lines the deck; a skyline stands beyond it (KayKit city buildings when the
 * models are loaded). Moving: helicopters, a hot-air balloon, drifting clouds, birds and the shimmering pool.
 */

import * as THREE from 'three';
import { box, cyl, ball, cone, ring, quad, canvasTex, floorPanel, sideCtx, slab, kit } from '../mapkit.js';
import { animated, flow, mover, spin, swarm, cloudBank } from '../mapfx.js';
import { birdGeo } from '../mapprops.js';

var TEAL = 0x2fd0d8;
var CORAL = 0xff6a5e;
var SUN = 0xffd23f;
var PASTEL = [0xffb3c6, 0xb8e0ff, 0xfff0a8, 0xc8f0c8, 0xe0c8ff, 0xffd6a8];

function deck() {
  return canvasTex('roof_deck', 576, 768, function (ctx, w, h) {
    ctx.fillStyle = '#d9a566'; ctx.fillRect(0, 0, w, h);
    for (var r = 0; r < 32; r++) {
      ctx.fillStyle = ['#e2b073', '#d6a05f', '#e8ba7c', '#dcaa68'][r % 4]; ctx.fillRect(0, r * 24 + 1, w, 22);
      ctx.fillStyle = 'rgba(90,50,10,0.18)';
      for (var j = 0; j < 5; j++) ctx.fillRect((j * 131 + r * 53) % w, r * 24 + 1, 2, 22);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; [-1.5, 1.5].forEach(function (lx) { ctx.fillRect(w / 2 + lx * 48 - 3, 0, 6, h); });
  });
}

var _pool = null;
function poolMat() {
  if (_pool) return _pool;
  var t = canvasTex('roof_pool', 128, 128, function (ctx, w, h) {
    ctx.fillStyle = '#25c8e8'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 3;
    for (var i = 0; i < 9; i++) { ctx.beginPath(); for (var x = 0; x <= w; x += 8) ctx.lineTo(x, 14 + i * 14 + Math.sin(x / w * 6.283 * 2 + i) * 4); ctx.stroke(); }
  });
  _pool = new THREE.MeshStandardMaterial(t ? { map: t, roughness: 0.2, metalness: 0.1 } : { color: 0x25c8e8 });
  return _pool;
}

function umbrella(g, x, z, c) {
  cyl(g, 0.03, 0.03, 2.3, 0xffffff, x, 1.15, z, { seg: 4 });
  cone(g, 1.1, 0.5, c, x, 2.4, z, { seg: 8 });
  ball(g, 0.06, 0xffffff, x, 2.7, z, { seg: 4 });
}

function lounger(g, x, z, c, ry) {
  box(g, 0.7, 0.12, 1.6, 0xffffff, x, 0.4, z, { ry: ry });
  box(g, 0.66, 0.1, 0.6, c, x + Math.sin(ry) * 0.5, 0.65, z + Math.cos(ry) * -0.55, { ry: ry, rx: 0.5 });
  box(g, 0.64, 0.14, 1.0, c, x - Math.sin(ry) * 0.3, 0.5, z + Math.cos(ry) * 0.3, { ry: ry });
}

function palm(g, x, z, s) {
  cyl(g, 0.1 * s, 0.16 * s, 2.6 * s, 0xb98a55, x, 1.3 * s, z, { seg: 5 });
  for (var i = 0; i < 6; i++) {
    var a = (i / 6) * Math.PI * 2;
    box(g, 0.2 * s, 0.05, 0.95 * s, 0x2fbf5a, x + Math.cos(a) * 0.4 * s, 2.7 * s, z + Math.sin(a) * 0.4 * s, { ry: -a + Math.PI / 2, rx: 0.5 });
  }
  ball(g, 0.15 * s, 0x8a5a2a, x, 2.55 * s, z, { seg: 4 });
}

function building(g, name, x, z, w, h, d, c) {
  if (!kit(g, name, { width: w, height: h, depth: d }, x, 0, z, 0)) box(g, w, h, d, c, x, h / 2, z);
}

function bay(g, side, z, k) {
  var S = sideCtx(side);
  // glass rail with chrome posts
  box(g, 0.05, 0.9, 4, 0xcff4ff, S.in(0.0) + side * 0.1, 0.55, z, { op: 0.35, r: 0.1 });
  box(g, 0.08, 0.08, 4, 0xe8eef6, S.in(0.0) + side * 0.1, 1.0, z, { m: 0.6, r: 0.3 });
  for (var p = 0; p < 2; p++) cyl(g, 0.04, 0.04, 1.0, 0xe8eef6, S.in(0.0) + side * 0.1, 0.5, z - 1.8 + p * 3.6, { seg: 5, m: 0.6, r: 0.3 });
  // the skyline: buildings far out, shorter ones nearer
  var bx = S.out(10 + (k % 2) * 4);
  var names = ['city/building_A', 'city/building_C', 'city/building_E', 'city/building_G'];
  building(g, names[k], bx, z, 5, 8 + k * 2, 5, PASTEL[k]);
  building(g, names[(k + 2) % 4], S.out(18), z + 1, 6, 12 + (k % 2) * 4, 6, PASTEL[(k + 3) % 6]);
  if (k === 0) { lounger(g, S.in(0.8), z - 0.8, SUN, 0); lounger(g, S.in(0.8), z + 0.9, CORAL, 0); umbrella(g, S.in(0.6), z, PASTEL[0]); }
  else if (k === 1) { palm(g, S.in(0.7), z - 1.2, 1.2); palm(g, S.in(0.7), z + 1.4, 0.9); box(g, 0.8, 1.0, 1.8, 0xffffff, S.in(0.7), 0.5, z + 0.1); box(g, 0.9, 0.08, 1.9, CORAL, S.in(0.7), 1.04, z + 0.1); umbrella(g, S.in(0.7), z + 0.1, TEAL); }
  else if (k === 2) {
    box(g, 1.5, 0.4, 3.6, 0xf4f8ff, S.in(0.85), 0.2, z);
    quad(g, 1.3, 3.4, 0xffffff, S.in(0.85), 0.42, z, { rx: -Math.PI / 2, mat: poolMat() });
    box(g, 0.3, 0.06, 1.2, 0xffffff, S.in(0.4), 0.9, z - 1.0);
    box(g, 0.1, 0.9, 0.1, 0xffffff, S.in(0.4), 0.45, z - 1.5);
  } else {
    // the helipad sits half behind the rail, so only its inner edge shows (the lanes start 1.2 in from the wall)
    cyl(g, 1.15, 1.15, 0.15, 0x6a7280, S.in(0), 0.08, z, { seg: 18 });
    ring(g, 0.9, 0.06, 0xffffff, S.in(0), 0.17, z, { rx: Math.PI / 2, seg: 20, tube: 3 });
    box(g, 0.12, 0.02, 0.8, 0xffffff, S.in(0.1), 0.17, z - 0.3);
    box(g, 0.12, 0.02, 0.8, 0xffffff, S.in(0.1), 0.17, z + 0.3);
    box(g, 0.5, 0.02, 0.12, SUN, S.in(0.1), 0.18, z);
    umbrella(g, S.in(0.3), z + 1.6, PASTEL[4]);
  }
}

function center(g, z) { floorPanel(g, deck(), z, 12); }

function arch(g, z, i) {
  // a string of bright festoon lights across the deck, with paper lanterns
  for (var f = 0; f < 11; f++) {
    var t = f / 10;
    ball(g, 0.1, [0xffe27a, 0xfff6c0][f % 2], -5.2 + t * 10.4, 6.4 - Math.sin(t * Math.PI) * 0.45, z, { seg: 4, bulb: true });
  }
  [-1, 1].forEach(function (s, n) { ball(g, 0.3, PASTEL[(i + n * 2) % 6], s * 4.6, 5.8, z, { seg: 6, sy: 1.2 }); });
}

function ground(g) {
  // the sky-high drop: a pale haze of city far below
  slab(g, 400, 400, 0xb8d8e8, 0, -3, -190, { r: 1 });
}

function helicopter() {
  var h = new THREE.Group();
  ball(h, 0.9, 0xff6a5e, 0, 0, 0, { seg: 8, sy: 0.8, sz: 1.3 });
  box(h, 0.25, 0.25, 2.2, 0xff6a5e, 0, 0.1, 1.8);
  box(h, 0.08, 0.7, 0.4, 0xffffff, 0, 0.45, 2.8);
  var rotor = new THREE.Group();
  box(rotor, 4.4, 0.05, 0.25, 0x2a2d3a, 0, 0, 0);
  box(rotor, 0.25, 0.05, 4.4, 0x2a2d3a, 0, 0, 0);
  rotor.position.y = 0.95;
  h.add(rotor);
  animated(rotor);
  spin(rotor, 'y', 18, 0);
  box(h, 0.9, 0.05, 0.05, 0xdddddd, 0, -0.9, 0.0, {});
  return h;
}

function balloonRide() {
  var b = new THREE.Group();
  ball(b, 2.2, PASTEL[0], 0, 3.2, 0, { seg: 10, sy: 1.15 });
  ball(b, 2.22, 0xffffff, 0, 3.2, 0, { seg: 10, sy: 1.15, sx: 0.4 });
  box(b, 0.9, 0.7, 0.9, 0xb98a55, 0, 0, 0);
  return b;
}

function extras() {
  cloudBank(12, { seed: 4 });
  [[-18, 12, -70], [20, 9, -130]].forEach(function (p, i) {
    var heli = helicopter();
    heli.position.set(p[0], p[1], p[2]);
    heli.rotation.y = i ? Math.PI : 0;
    mover(heli, { k: 0.2, vz: -2 });
  });
  var bal = balloonRide();
  bal.position.set(-26, 11, -110);
  animated(bal);
  mover(bal, { k: 0.8 });
  swarm({ geo: birdGeo(), count: 8, seed: 14, colors: [0xffffff], area: { x: [-30, 30], y: [8, 14], z: [-140, 8] }, k: 0.3, vz: [-4, -2.5], face: true, flap: 0.5, scale: [1.2, 2] });
  flow(poolMat().map, 0.04, 0.03);
}

export var rooftop = { id: 'rooftop', indoor: false, bay: bay, center: center, arch: arch, ground: ground, extras: extras };
