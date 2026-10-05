/**
 * garden.js — Sunshine Rehab Garden: the walking path of a rehabilitation centre's garden on a perfect day.
 *
 * Every 16 units: a vine-covered pergola, a flower bed with a bench, a big shady tree, and the physio corner with
 * parallel bars and a fountain. Low hedges line the path; beyond them are lawns, taller trees and the sky.
 * Moving: butterflies and birds, pinwheel flowers, drifting clouds and a slow garden windmill.
 */

import * as THREE from 'three';
import { box, cyl, ball, cone, slab, canvasTex, css, floorPanel, sideCtx } from '../mapkit.js';
import { animated, features, spin, swarm, cloudBank } from '../mapfx.js';
import { tree, hedge, flowers, bench, butterflyGeo, birdGeo } from '../mapprops.js';

var PETALS = [0xff5a7a, 0xffd23f, 0xffffff, 0xff9a3f, 0xb67cff, 0xff7ab8];

function pathPicture() {
  // 12 across, 16 along, 48 px per unit: warm pavers on the path, grass at the very edges
  return canvasTex('garden_path', 576, 768, function (ctx, w, h) {
    ctx.fillStyle = '#5fcf6a';
    ctx.fillRect(0, 0, w, h);
    var x0 = 0.5 * 48;
    var x1 = w - 0.5 * 48;
    ctx.fillStyle = '#e9d3ac';
    ctx.fillRect(x0, 0, x1 - x0, h);
    var n = 0;
    for (var row = 0; row < 16; row++) {
      var off = row % 2 ? 24 : 0;
      for (var x = x0 - off; x < x1; x += 48) {
        var cx = Math.max(x, x0);
        var cw = Math.min(x + 48, x1) - cx;
        if (cw <= 2) continue;
        var tone = [0xf2dcb4, 0xe6cda3, 0xeed6ad, 0xe0c79a][(row * 3 + n++) % 4];
        ctx.fillStyle = css(tone);
        ctx.fillRect(cx + 1.5, row * 48 + 1.5, cw - 3, 45);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(cx + 1.5, row * 48 + 1.5, cw - 3, 4);
      }
    }
    // lane edging
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    [-1.5, 1.5].forEach(function (lx) { ctx.fillRect(w / 2 + lx * 48 - 1.5, 0, 3, h); });
    // grass tufts
    ctx.fillStyle = '#44b856';
    for (var i = 0; i < 70; i++) { var gx = (i * 53) % 24; var gy = (i * 97) % h; ctx.fillRect(gx, gy, 3, 8); ctx.fillRect(w - 24 + gx, (gy + 31) % h, 3, 8); }
  });
}

function pergola(g, S, z) {
  // posts on the wall side, beams reaching over toward the path, vines and blossoms
  [-1.6, 1.6].forEach(function (dz) {
    cyl(g, 0.1, 0.1, 3.4, 0xf4ede0, S.in(0.35), 1.7, z + dz, { seg: 6 });
  });
  for (var i = 0; i < 6; i++) box(g, 1.0, 0.08, 0.14, 0xf4ede0, S.in(0.5), 3.45, z - 1.7 + i * 0.68);
  box(g, 0.1, 0.14, 3.6, 0xe6dcc8, S.in(0.35), 3.35, z);
  box(g, 0.1, 0.14, 3.6, 0xe6dcc8, S.in(0.95), 3.35, z);
  // leaves on top and flowers hanging
  for (var j = 0; j < 7; j++) {
    ball(g, 0.26, 0x3fbf5a, S.in(0.5 + (j % 2) * 0.3), 3.65, z - 1.6 + j * 0.53, { seg: 5 });
    ball(g, 0.08, PETALS[(j + 2) % 6], S.in(0.6 + (j % 3) * 0.2), 3.3 - (j % 2) * 0.15, z - 1.5 + j * 0.5, { seg: 4 });
  }
  flowers(g, S.in(0.5), z - 1.2, PETALS, 3, 0.3);
}

function flowerBed(g, S, z) {
  box(g, 1.2, 0.3, 3.2, 0xc98a52, S.in(0.62), 0.15, z);
  box(g, 1.0, 0.06, 3.0, 0x6a4a2a, S.in(0.62), 0.31, z);
  flowers(g, S.in(0.62), z, PETALS, 16, 0.45);
  bench(g, S.in(0.5), z + 0.0, S.side < 0 ? Math.PI : 0, 0xc9783a);
}

function bigTree(g, S, z) {
  tree(g, S.out(0.9), z - 0.4, 2.0, 0x3fbf5a);
  hedge(g, S.in(0.4), 0, z, 3.8, 0.7, 0.9, 0x2fae58);
  flowers(g, S.in(0.7), z + 1.4, PETALS, 8, 0.25);
}

function physio(g, S, z) {
  // parallel bars: two rails on posts, a path of rubber mat
  var x = S.in(0.7);
  [-1.5, 1.5].forEach(function (dz) {
    [-0.3, 0.3].forEach(function (dx) { cyl(g, 0.035, 0.035, 1.0, 0xc8d0dc, x + dx * S.side, 0.5, z + dz, { seg: 5, m: 0.6, r: 0.3 }); });
  });
  [-0.3, 0.3].forEach(function (dx) { cyl(g, 0.04, 0.04, 3.2, 0x3d8bff, x + dx * S.side, 1.0, z, { rx: Math.PI / 2, seg: 6 }); });
  box(g, 1.0, 0.04, 3.4, 0x3fa8ff, x, 0.02, z);
  // a small fountain further back
  var fz = z + 0.0;
  cyl(g, 0.7, 0.8, 0.45, 0xf4f6fa, S.out(1.6), 0.22, fz - 0.2, { seg: 12 });
  cyl(g, 0.6, 0.6, 0.06, 0x6fd4ff, S.out(1.6), 0.46, fz - 0.2, { seg: 12, e: 0x2a9cd4, ei: 0.4 });
  cyl(g, 0.1, 0.12, 1.0, 0xf4f6fa, S.out(1.6), 0.9, fz - 0.2, { seg: 8 });
  ball(g, 0.2, 0xaee8ff, S.out(1.6), 1.5, fz - 0.2, { seg: 6, e: 0x6fd4ff, ei: 0.5 });
}

function bay(g, side, z, k) {
  var S = sideCtx(side);
  // the low hedge that lines the path, with a pale cap
  hedge(g, S.in(0.0) + side * 0.15, 0, z, 4, 0.9, 0.5, 0x2fae58);
  // the lawn side: grass-green back panel low, then taller trees every bay for depth
  if (k % 2 === 0) tree(g, S.out(3.4), z - 0.8, 1.8, [0x3fbf5a, 0x57cf6a][k / 2]);
  if (k === 0) pergola(g, S, z);
  else if (k === 1) flowerBed(g, S, z);
  else if (k === 2) bigTree(g, S, z);
  else physio(g, S, z);
}

function center(g, z) {
  floorPanel(g, pathPicture(), z, 12);
}

function arch(g, z, i) {
  // a garland of blossoms and little flags high across the path
  for (var f = 0; f < 13; f++) {
    var t = f / 12;
    var x = -5.4 + t * 10.8;
    var y = 6.4 - Math.sin(t * Math.PI) * 0.5;
    ball(g, 0.08, PETALS[(f + i) % 6], x, y, z, { seg: 4, bulb: true });
  }
}

function ground(g) {
  slab(g, 400, 400, 0x62d06c, 0, -0.02, -190, { r: 1 });
  // a far line of dark hills
  for (var i = 0; i < 6; i++) ball(g, 16 + (i % 3) * 5, i % 2 ? 0x57c466 : 0x4cb85c, (i - 2.5) * 38, -4, -170, { seg: 8, sy: 0.55 });
}

function windmill() {
  var m = new THREE.Group();
  cone(m, 1.8, 6, 0xffe9c2, 0, 3, 0, { seg: 8 });
  cone(m, 2.0, 1.4, 0xd9533a, 0, 6.4, 0, { seg: 8 });
  box(m, 0.8, 1.2, 0.1, 0x8a5a33, 0, 0.6, 1.7);
  var rotor = new THREE.Group();
  for (var b = 0; b < 4; b++) {
    var blade = new THREE.Group();
    box(blade, 0.9, 3.6, 0.06, 0xffffff, 0, 2.0, 0);
    box(blade, 0.08, 3.6, 0.1, 0x8a5a33, -0.45, 2.0, 0);
    blade.rotation.z = (b * Math.PI) / 2;
    rotor.add(blade);
  }
  rotor.position.set(0, 5.6, 2.0);
  m.add(rotor);
  animated(rotor);
  spin(rotor, 'z', 0.7, 0);
  m.rotation.y = 0;
  return m;
}

function extras() {
  cloudBank(10, { seed: 3 });
  var butter = butterflyGeo();
  [-1, 1].forEach(function (side, i) {
    swarm({ geo: butter, count: 9, seed: 12 + i * 9, colors: [0xff9a3f, 0xffd23f, 0xff7ab8, 0xb67cff, 0x6fd4ff], area: { x: [side * 5.0, side * 9], y: [1.0, 3.2], z: [-140, 8] }, k: 1, vx: [-0.3, 0.3], vz: [-0.5, 0.5], wobble: 0.5, flap: 0.9, scale: [1, 1.5], flat: true });
  });
  swarm({ geo: birdGeo(), count: 8, seed: 77, colors: [0xffffff, 0xffe0e0, 0xe0f0ff], area: { x: [-26, 26], y: [8, 14], z: [-140, 8] }, k: 0.3, vz: [-4, -2.5], vx: [-0.4, 0.4], face: true, flap: 0.5, scale: [1.2, 2] });
  features(windmill, { x: -17, spacing: 70, count: 3, z0: -50 });
}

export var garden = { id: 'garden', indoor: false, bay: bay, center: center, arch: arch, ground: ground, extras: extras };
