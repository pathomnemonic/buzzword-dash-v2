/**
 * cafeteria.js — Cafeteria Carnival: the hospital canteen on fair day.
 *
 * Every 16 units: a striped-awning snack stall with a giant popcorn bucket, a gleaming kitchen wall (stove, fridge,
 * sink), an ice-cream stand, and a diner corner with giant ketchup and mustard. A dish conveyor runs along both walls
 * the whole way. Moving: the dish belt itself, balloons, steam, falling confetti.
 * With the KayKit restaurant models loaded (high graphics) the stalls are dressed with real food and kitchenware.
 */

import * as THREE from 'three';
import { box, cyl, ball, cone, quad, combine, xform, canvasTex, floorPanel, ceilingPanel, wallPanel, sideCtx, kitAt } from '../mapkit.js';
import { flow, swarm } from '../mapfx.js';

var H = 6.4;
var RED = 0xff4d4d;
var CREAM = 0xfff1d6;
var TEAL = 0x20c4b0;
var ORANGE = 0xff9a1f;
var YELLOW = 0xffd23f;
var PINK = 0xff7ab8;
var BLUE = 0x3d8bff;
var CARNIVAL = [RED, YELLOW, TEAL, PINK, BLUE, ORANGE];

function wallPicture() {
  // 16 long x 6.4 high at 64px/unit: tiled teal lower wall, cream and orange stripes above, bunting painted at the top
  return canvasTex('caf_wall', 1024, 410, function (ctx, w, h) {
    for (var i = 0; i < 32; i++) { ctx.fillStyle = i % 2 ? '#ffe9c2' : '#fff6e2'; ctx.fillRect(i * 32, 0, 32, h); }
    ctx.fillStyle = '#20c4b0';
    ctx.fillRect(0, h - 90, w, 90);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (var x = 0; x < w; x += 32) { ctx.fillRect(x, h - 90, 2, 90); }
    for (var y = h - 90; y < h; y += 30) ctx.fillRect(0, y, w, 2);
    ctx.fillStyle = '#ff9a1f';
    ctx.fillRect(0, h - 98, w, 8);
    // painted bunting
    for (var f = 0; f < 32; f++) {
      ctx.fillStyle = ['#ff4d4d', '#ffd23f', '#20c4b0', '#ff7ab8', '#3d8bff'][f % 5];
      ctx.beginPath(); ctx.moveTo(f * 32 + 3, 16); ctx.lineTo(f * 32 + 29, 16); ctx.lineTo(f * 32 + 16, 46); ctx.fill();
    }
  });
}

function floorPicture() {
  // 12 x 16 at 48 px: red and cream 2-unit check with a soft shine
  return canvasTex('caf_floor', 576, 768, function (ctx) {
    for (var j = 0; j < 8; j++) for (var i = 0; i < 6; i++) {
      ctx.fillStyle = (i + j) % 2 ? '#ff7a6b' : '#fff1de';
      ctx.fillRect(i * 96, j * 96, 96, 96);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(i * 96, j * 96, 96, 6);
    }
  });
}

function ceilingPicture() {
  return canvasTex('caf_ceiling', 464, 640, function (ctx, w, h) {
    ctx.fillStyle = '#fff6e6';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffd9a0';
    for (var i = 0; i < 8; i++) ctx.fillRect(0, i * 80 + 36, w, 8);
  });
}

function stripeTexture() {
  return canvasTex('caf_awning', 128, 64, function (ctx, w, h) {
    for (var i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#ffffff' : '#ff4d4d'; ctx.fillRect(i * 16, 0, 16, h); }
  });
}

function beltTexture() {
  // 4 units long (one bay), 0.7 wide: a dark belt carrying plates of food that slide along
  return canvasTex('caf_belt', 56, 320, function (ctx, w, h) {
    ctx.fillStyle = '#4a4f5e';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#3a3f4c';
    for (var y = 0; y < h; y += 16) ctx.fillRect(0, y, w, 3);
    var foods = ['#ffd23f', '#ff4d4d', '#8ee05a', '#ff9a1f', '#ff7ab8'];
    for (var i = 0; i < 5; i++) {
      var cy = 32 + i * 64;
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(w / 2, cy, 22, 0, 6.283); ctx.fill();
      ctx.fillStyle = foods[i]; ctx.beginPath(); ctx.arc(w / 2, cy, 14, 0, 6.283); ctx.fill();
    }
  });
}

function awning(g, S, z, x, y, w, depth) {
  // a slanted striped roof with a scalloped edge, facing the track
  var tex = stripeTexture();
  var m = box(g, depth, 0.1, w, 0xffffff, x, y, z, { map: tex, rz: S.side * -0.35 });
  if (!tex) m.material = new THREE.MeshStandardMaterial({ color: RED });
  for (var i = 0; i < Math.round(w / 0.4); i++) ball(g, 0.2, i % 2 ? 0xffffff : RED, x + S.side * -depth * 0.46, y - 0.2, z - w / 2 + 0.2 + i * 0.4, { seg: 5, sx: 0.6 });
}

function stall(g, S, z) {
  box(g, 0.9, 1.0, 3.4, CREAM, S.in(0.55), 0.5, z);
  box(g, 1.0, 0.1, 3.5, ORANGE, S.in(0.55), 1.05, z);
  box(g, 0.08, 2.0, 0.1, 0xffffff, S.in(0.15), 2.0, z - 1.65);
  box(g, 0.08, 2.0, 0.1, 0xffffff, S.in(0.15), 2.0, z + 1.65);
  awning(g, S, z, S.in(0.55), 2.9, 3.5, 1.0);
  // giant popcorn bucket on the counter
  var bx = S.in(0.5);
  cyl(g, 0.5, 0.36, 0.9, RED, bx, 1.6, z + 0.9, { seg: 10 });
  for (var j = 0; j < 7; j++) ball(g, 0.2, j % 2 ? 0xfff4c8 : 0xffe9a0, bx + Math.cos(j * 1.1) * 0.25, 2.2 + (j % 3) * 0.08, z + 0.9 + Math.sin(j * 1.1) * 0.25, { seg: 5 });
  if (!kitAt(g, 'rest/food_burger', { width: 0.6, height: 0.7, depth: 0.6 }, S.side, 0.55, 1.1, z - 0.8, 0)) {
    ball(g, 0.3, 0xe0903a, S.in(0.55), 1.35, z - 0.8, { sy: 0.7, seg: 8 });
    box(g, 0.5, 0.08, 0.5, 0x6a3a1a, S.in(0.55), 1.3, z - 0.8);
  }
}

function kitchenWall(g, S, z) {
  if (!kitAt(g, 'rest/fridge_A', { width: 1.0, height: 2.4, depth: 1.0 }, S.side, 0.6, 0, z - 1.2, 0)) box(g, 0.9, 2.2, 1.0, TEAL, S.in(0.5), 1.1, z - 1.2);
  if (!kitAt(g, 'rest/stove_multi', { width: 1.0, height: 1.2, depth: 1.2 }, S.side, 0.6, 0, z + 0.3, 0)) { box(g, 0.9, 1.0, 1.2, 0xc9d0d8, S.in(0.5), 0.5, z + 0.3); box(g, 0.9, 0.05, 1.2, RED, S.in(0.5), 1.0, z + 0.3); }
  if (!kitAt(g, 'rest/kitchencounter_sink', { width: 1.0, height: 1.1, depth: 1.2 }, S.side, 0.6, 0, z + 1.5, 0)) box(g, 0.9, 1.0, 1.2, ORANGE, S.in(0.5), 0.5, z + 1.5);
  kitAt(g, 'rest/pot_A_stew', { width: 0.6, height: 0.5, depth: 0.6 }, S.side, 0.5, 1.2, z + 0.3, 0);
  // hanging pans on a rail
  box(g, 0.05, 0.05, 3.2, 0x9aa4b4, S.in(0.1), 3.4, z);
  for (var i = 0; i < 4; i++) { cyl(g, 0.22, 0.22, 0.05, i % 2 ? 0xc9d0d8 : 0x4a4f5e, S.in(0.12), 3.0, z - 1.2 + i * 0.8, { rz: Math.PI / 2, seg: 8 }); }
  box(g, 0.1, 0.7, 2.6, YELLOW, S.in(0.08), 4.5, z, {});
}

function iceCream(g, S, z) {
  box(g, 0.8, 0.9, 1.6, PINK, S.in(0.5), 0.45, z - 0.6);
  box(g, 0.9, 0.08, 1.7, 0xffffff, S.in(0.5), 0.95, z - 0.6);
  // giant cone sign
  var x = S.in(0.5);
  cone(g, 0.5, 1.5, 0xe0a14a, x, 2.2, z + 1.2, { seg: 8, rz: Math.PI });
  ball(g, 0.55, PINK, x, 3.1, z + 1.2, { seg: 8 });
  ball(g, 0.45, 0xfff1d6, x, 3.6, z + 1.2, { seg: 8 });
  ball(g, 0.1, RED, x, 4.1, z + 1.2, { seg: 5 });
  box(g, 0.1, 2.0, 0.1, 0x9aa4b4, x, 1.0, z + 1.2);
  // cotton candy on sticks
  for (var i = 0; i < 3; i++) {
    cyl(g, 0.015, 0.015, 0.7, 0xffffff, S.in(0.5), 1.35, z - 1.1 + i * 0.5, { seg: 3 });
    ball(g, 0.2, [PINK, 0x9fdcff, 0xc2a6ff][i], S.in(0.5), 1.8, z - 1.1 + i * 0.5, { seg: 6 });
  }
}

function diner(g, S, z) {
  for (var i = 0; i < 2; i++) {
    var tz = z - 1.0 + i * 2.0;
    cyl(g, 0.45, 0.45, 0.07, RED, S.in(0.7), 0.85, tz, { seg: 10 });
    cyl(g, 0.06, 0.06, 0.85, 0x9aa4b4, S.in(0.7), 0.42, tz, { seg: 5 });
    cyl(g, 0.3, 0.3, 0.05, 0x9aa4b4, S.in(0.7), 0.03, tz, { seg: 8 });
  }
  if (!kitAt(g, 'rest/ketchup', { width: 0.5, height: 1.6, depth: 0.5 }, S.side, 0.5, 0, z + 1.6, 0)) { cyl(g, 0.22, 0.26, 1.0, RED, S.in(0.5), 0.5, z + 1.6, { seg: 8 }); cone(g, 0.12, 0.3, RED, S.in(0.5), 1.15, z + 1.6, { seg: 6 }); }
  if (!kitAt(g, 'rest/mustard', { width: 0.5, height: 1.6, depth: 0.5 }, S.side, 0.5, 0, z - 1.6, 0)) { cyl(g, 0.22, 0.26, 1.0, YELLOW, S.in(0.5), 0.5, z - 1.6, { seg: 8 }); cone(g, 0.12, 0.3, YELLOW, S.in(0.5), 1.15, z - 1.6, { seg: 6 }); }
  box(g, 0.08, 1.1, 1.6, 0x2a2f3a, S.in(0.1), 3.3, z, {});
  box(g, 0.06, 0.9, 1.4, 0x3fbf5a, S.in(0.15), 3.3, z, {});
}

function bay(g, side, z, k) {
  var S = sideCtx(side);
  wallPanel(g, wallPicture(), side, z, H, 0.0, { r: 0.85 });
  // the dish belt: a dark strip at counter height that runs the full length
  quad(g, 0.7, 4, 0xffffff, S.in(0.45), 1.12, z, { rx: -Math.PI / 2, mat: beltMaterial() });
  box(g, 0.08, 0.1, 4, 0xc9d0d8, S.in(0.1), 1.08, z);
  box(g, 0.08, 0.1, 4, 0xc9d0d8, S.in(0.8), 1.08, z);
  [0, 2].forEach(function (n) { box(g, 0.3, 1.05, 0.1, 0xc9d0d8, S.in(0.45), 0.52, z - 1.8 + n * 1.8); });
  if (k === 0) stall(g, S, z);
  else if (k === 1) kitchenWall(g, S, z);
  else if (k === 2) iceCream(g, S, z);
  else diner(g, S, z);
}

var _belt = null;
function beltMaterial() {
  if (_belt) return _belt;
  var t = beltTexture();
  _belt = t ? new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }) : new THREE.MeshStandardMaterial({ color: 0x4a4f5e });
  return _belt;
}

function center(g, z) {
  floorPanel(g, floorPicture(), z, 12);
  ceilingPanel(g, ceilingPicture(), z, 11.6, H);
}

function arch(g, z, i) {
  var y = H - 0.5;
  for (var f = 0; f < 12; f++) {
    var t = f / 11;
    var x = -5.2 + t * 10.4;
    var yy = y - Math.sin(t * Math.PI) * 0.5;
    cone(g, 0.15, 0.32, CARNIVAL[(f + i) % 6], x, yy - 0.16, z, { seg: 3, rz: Math.PI, sz: 0.2, bulb: true });
  }
  [-1, 1].forEach(function (s, n) {
    cyl(g, 0.012, 0.012, 0.6, 0x777788, s * 4.4, y - 0.2, z, { seg: 3 });
    ball(g, 0.35, CARNIVAL[(i + n * 2) % 6], s * 4.4, y - 0.95, z, { seg: 7, sy: 1.2 });
  });
}

function extras() {
  flow(beltMaterial().map, 0, 0.1);
  var balloon = combine([
    { geo: new THREE.SphereGeometry(0.3, 8, 6), color: 0xffffff, matrix: xform(0, 0, 0, 0, 0, 0, 1, 1.18, 1) },
    { geo: new THREE.CylinderGeometry(0.008, 0.008, 1.1, 3), color: 0xcccccc, matrix: xform(0, -0.95, 0) }
  ]);
  [-1, 1].forEach(function (side, i) {
    swarm({ geo: balloon, count: 7, seed: 21 + i * 6, colors: CARNIVAL, area: { x: [side * 4.4, side * 5.1], y: [3.6, 5.4], z: [-140, 8] }, k: 1, wobble: 0.15, scale: [0.9, 1.2] });
    var puff = combine([{ geo: new THREE.SphereGeometry(0.2, 6, 4), color: 0xffffff }]);
    swarm({ geo: puff, material: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.35, depthWrite: false }), count: 12, seed: 40 + i, area: { x: [side * 4.7, side * 5.1], y: [1.4, 3.2], z: [-140, 8] }, k: 1, vy: [0.4, 0.8], wobble: 0.08, scale: [0.6, 1.4] });
    var conf = combine([{ geo: new THREE.PlaneGeometry(0.12, 0.08), color: 0xffffff }]);
    swarm({ geo: conf, material: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }), count: 30, seed: 60 + i, colors: CARNIVAL, area: { x: [side * 3.9, side * 5.2], y: [0.5, 6.0], z: [-90, 6] }, k: 1, vy: [-0.9, -0.5], wobble: 0.3, turn: 3, scale: [1, 1.6] });
  });
}

export var cafeteria = { id: 'cafeteria', indoor: true, bay: bay, center: center, arch: arch, extras: extras };
