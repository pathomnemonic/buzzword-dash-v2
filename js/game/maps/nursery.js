/**
 * nursery.js — Neonatal Cloud Nursery: a pastel sky-top nursery floating on clouds.
 *
 * Every 16 units: a fluffy cloud bank with a crib, a rainbow arch, a toy-block tower with a teddy, and a cloud with a
 * hanging mobile. The path is a soft cloud walkway. Moving: storks carrying bundles, twinkling stars, bubbles and
 * drifting clouds.
 */

import * as THREE from 'three';
import { box, cyl, ball, ring, extrude, starShape, heartShape, combine, canvasTex, floorPanel, sideCtx, slab } from '../mapkit.js';
import { swarm, cloudBank } from '../mapfx.js';
import { birdGeo } from '../mapprops.js';

var PINK = 0xff8fb8;
var BLUE = 0x7ec0ff;
var MINT = 0x8fe8c0;
var LILAC = 0xb89aff;
var BUTTER = 0xffd96a;
var PASTEL = [PINK, BLUE, MINT, LILAC, BUTTER];
var BANDS = [0xff7a8a, 0xffb36b, 0xffe07a, 0x8fe3a0, 0x7ab8ff, 0xb08aff];

function cloudPath() {
  // 12 x 16 at 48 px: a soft white and pink walkway with puffy edging
  return canvasTex('nursery_path', 576, 768, function (ctx, w, h) {
    ctx.fillStyle = '#d6ecff';
    ctx.fillRect(0, 0, w, h);
    var g = ctx.createLinearGradient(24, 0, w - 24, 0);
    g.addColorStop(0, '#fff'); g.addColorStop(0.5, '#fff0f6'); g.addColorStop(1, '#fff');
    ctx.fillStyle = g;
    ctx.fillRect(24, 0, w - 48, h);
    ctx.fillStyle = '#ffffff';
    for (var y = 0; y < h; y += 48) { ctx.beginPath(); ctx.arc(24, y + 24, 30, 0, 6.283); ctx.arc(w - 24, y + 24, 30, 0, 6.283); ctx.fill(); }
    for (var j = 0; j < 8; j++) for (var i = 0; i < 6; i++) { ctx.fillStyle = (i + j) % 2 ? 'rgba(255,150,195,0.75)' : 'rgba(140,200,255,0.65)'; ctx.fillRect(30 + i * 86, j * 96 + 6, 82, 84); }
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    [-1.5, 1.5].forEach(function (lx) { ctx.fillRect(w / 2 + lx * 48 - 2, 0, 4, h); });
  });
}

function cloudBlob(g, x, y, z, s, color) {
  var c = color || 0xffffff;
  ball(g, 0.9 * s, c, x, y, z, { seg: 6, sy: 0.8 });
  ball(g, 0.7 * s, c, x, y - 0.05, z + 0.9 * s, { seg: 5, sy: 0.8 });
  ball(g, 0.7 * s, c, x, y - 0.05, z - 0.9 * s, { seg: 5, sy: 0.8 });
}

function crib(g, S, z) {
  var x = S.in(0.8);
  box(g, 0.9, 0.08, 1.8, 0xfff6e8, x, 0.6, z);
  box(g, 0.8, 0.14, 1.7, PINK, x, 0.72, z);
  [-0.45, 0.45].forEach(function (dx) { for (var i = 0; i < 8; i++) cyl(g, 0.02, 0.02, 0.6, 0xffffff, x + dx, 1.0, z - 0.8 + i * 0.23, { seg: 4 }); box(g, 0.05, 0.05, 1.8, 0xffffff, x + dx, 1.3, z); });
  [-0.9, 0.9].forEach(function (dz) { box(g, 0.9, 0.9, 0.06, 0xffffff, x, 0.95, z + dz); cyl(g, 0.04, 0.04, 0.6, 0xffffff, x - 0.45, 0.3, z + dz, { seg: 4 }); cyl(g, 0.04, 0.04, 0.6, 0xffffff, x + 0.45, 0.3, z + dz, { seg: 4 }); });
  ball(g, 0.22, 0xffd6b0, x, 0.95, z - 0.3, { seg: 7 });
  cloudBlob(g, S.out(0.8), 0.2, z, 1.4);
}

function rainbow(g, S, z) {
  BANDS.forEach(function (c, i) { ring(g, 1.9 - i * 0.14, 0.08, c, S.in(0.35), 0.3, z, { arc: Math.PI, ry: Math.PI / 2, tube: 4, seg: 18 }); });
  cloudBlob(g, S.in(0.35), 0.3, z - 1.9, 0.7);
  cloudBlob(g, S.in(0.35), 0.3, z + 1.9, 0.7);
  cloudBlob(g, S.out(1.0), 0.0, z, 1.8);
}

function blocks(g, S, z) {
  var letters = [PINK, BLUE, MINT, LILAC, BUTTER, 0xffb36b];
  [[-0.9, 0.35], [0, 0.35], [0.9, 0.35], [-0.45, 1.05], [0.45, 1.05], [0, 1.75]].forEach(function (p, i) { box(g, 0.7, 0.7, 0.7, letters[i], S.in(0.6), p[1], z + p[0], { ry: (i - 2) * 0.1 }); });
  var tx = S.in(0.6);
  ball(g, 0.2, 0xe0b890, tx, 2.2, z, { seg: 7 }); ball(g, 0.14, 0xe0b890, tx, 2.5, z, { seg: 6 });
  cloudBlob(g, S.out(0.8), 0.0, z, 1.5);
}

function mobile(g, S, z) {
  cloudBlob(g, S.out(0.6), 0.0, z, 1.7);
  var x = S.in(0.9);
  cyl(g, 0.03, 0.03, 3.4, 0xffffff, x, 1.7, z, { seg: 4 });
  box(g, 0.06, 0.06, 1.6, 0xffffff, x, 3.45, z);
  [-0.7, 0, 0.7].forEach(function (dz, i) {
    cyl(g, 0.01, 0.01, 0.6, 0xaaaaaa, x, 3.1, z + dz, { seg: 3 });
    if (i === 1) extrude(g, heartShape(0.5), 0.06, PINK, x, 2.7, z + dz, { ry: Math.PI / 2, curve: 3 });
    else extrude(g, starShape(0.22, 0.1, 5), 0.06, i ? BUTTER : LILAC, x, 2.75, z + dz, { ry: Math.PI / 2 });
  });
}

function bay(g, side, z, k) {
  var S = sideCtx(side);
  // a soft cloud rail along the path
  for (var i = 0; i < 2; i++) ball(g, 0.6, 0xffffff, S.in(0.0) + side * 0.1, 0.35, z - 1 + i * 2, { seg: 6, sy: 0.8, sz: 1.8 });
  if (k % 2 === 0) cloudBlob(g, S.out(2.6), -0.4, z, 2.2, 0xf4f8ff);
  if (k === 0) crib(g, S, z);
  else if (k === 1) rainbow(g, S, z);
  else if (k === 2) blocks(g, S, z);
  else mobile(g, S, z);
}

function center(g, z) { floorPanel(g, cloudPath(), z, 12); }

function arch(g, z, i) {
  // strings of paper stars and moons high across the sky
  for (var f = 0; f < 9; f++) {
    var t = f / 8;
    var x = -5 + t * 10;
    var y = 6.5 - Math.sin(t * Math.PI) * 0.4;
    if (f % 2) extrude(g, starShape(0.18, 0.08, 5), 0.04, PASTEL[(f + i) % 5], x, y - 0.3, z, { bulb: true });
    else ball(g, 0.1, PASTEL[(f + i) % 5], x, y, z, { seg: 4, bulb: true });
  }
}

function ground(g) {
  slab(g, 400, 400, 0xeaf4ff, 0, -0.02, -190, { r: 1 });
}

function extras() {
  cloudBank(16, { seed: 11, area: { x: [-60, 60], y: [4, 20], z: [-150, 10] }, k: 0.5, scale: [3, 6] });
  swarm({ geo: birdGeo(), count: 6, seed: 5, colors: [0xffffff, 0xfff0f6], area: { x: [-20, 20], y: [7, 11], z: [-140, 8] }, k: 0.4, vz: [-4.5, -3], face: true, flap: 0.5, scale: [1.8, 2.6] });
  var star = combine([{ geo: new THREE.OctahedronGeometry(0.2, 0), color: 0xffffff }]);
  swarm({ geo: star, material: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }), count: 40, seed: 17, colors: [0xfff0a0, 0xffd6ec, 0xc8e4ff], area: { x: [-40, 40], y: [6, 22], z: [-140, 8] }, k: 0.2, wobble: 0.4, turn: 1.2, scale: [0.6, 1.4] });
  var bubble = combine([{ geo: new THREE.SphereGeometry(0.2, 8, 6), color: 0xffffff }]);
  [-1, 1].forEach(function (side, i) {
    swarm({ geo: bubble, material: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }), count: 12, seed: 80 + i, colors: [0xd0e8ff, 0xffd6ec], area: { x: [side * 4.6, side * 7], y: [0.8, 5.5], z: [-130, 8] }, k: 1, vy: [0.3, 0.7], wobble: 0.2, scale: [0.6, 1.4] });
  });
}

export var nursery = { id: 'nursery', indoor: false, bay: bay, center: center, arch: arch, ground: ground, extras: extras };
