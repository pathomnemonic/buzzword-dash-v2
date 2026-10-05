/**
 * aquarium.js — Aquarium Imaging Center: a glass tunnel under a sunlit reef, with scanners on the walls.
 *
 * Every 16 units: a round viewing window onto a coral reef, a kelp forest, an imaging ring (like an MRI) with a
 * scan screen, and a bed of shells, starfish and anemones. Light ripples across the sandy floor. Moving: schools of
 * fish, jellyfish, a manta ray, rising bubbles and the dancing caustic light.
 */

import * as THREE from 'three';
import { box, cyl, ball, cone, ring, combine, xform, canvasTex, floorPanel, ceilingPanel, wallPanel, sideCtx, bulb } from '../mapkit.js';
import { flow, swarm, mover, animated } from '../mapfx.js';

var H = 6.4;
var CORAL = [0xff6a5e, 0xff9ac8, 0xffb23f, 0xb08aff, 0x4fe0c0];

function waterWall() {
  // 16 x 6.4 at 64 px: a sunlit blue-green water volume with soft light rays and sand at the foot
  return canvasTex('aqua_wall', 1024, 410, function (ctx, w, h) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#2fd0f0'); g.addColorStop(0.6, '#0a8fc8'); g.addColorStop(1, '#0a5fa0');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    for (var i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(i * 170 + 20, 0); ctx.lineTo(i * 170 + 90, 0); ctx.lineTo(i * 170 + 40, h); ctx.lineTo(i * 170 - 60, h); ctx.fill(); }
    ctx.fillStyle = '#f4e2b8'; ctx.fillRect(0, h - 40, w, 40);
    // distant fish silhouettes and kelp
    ctx.fillStyle = 'rgba(10,80,120,0.35)';
    for (var k = 0; k < 14; k++) { var x = (k * 79) % w, y = 60 + (k * 53) % 200; ctx.beginPath(); ctx.ellipse(x, y, 18, 8, 0, 0, 6.283); ctx.fill(); ctx.beginPath(); ctx.moveTo(x + 14, y); ctx.lineTo(x + 28, y - 8); ctx.lineTo(x + 28, y + 8); ctx.fill(); }
  });
}

function sandFloor() {
  return canvasTex('aqua_floor', 576, 768, function (ctx, w, h) {
    ctx.fillStyle = '#f6e6bf'; ctx.fillRect(0, 0, w, h);
    for (var j = 0; j < 8; j++) for (var i = 0; i < 6; i++) { ctx.fillStyle = (i + j) % 2 ? '#f0dcae' : '#fbeed0'; ctx.fillRect(i * 96 + 2, j * 96 + 2, 92, 92); }
    ctx.fillStyle = 'rgba(31,180,216,0.7)'; [-1.5, 1.5].forEach(function (lx) { ctx.fillRect(w / 2 + lx * 48 - 3, 0, 6, h); });
    ctx.fillStyle = '#1fb4d8'; ctx.fillRect(0, 0, 18, h); ctx.fillRect(w - 18, 0, 18, h);
  });
}

var _caustic = null;
function causticMat() {
  if (_caustic) return _caustic;
  var t = canvasTex('aqua_caustic', 256, 256, function (ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3;
    for (var i = 0; i < 26; i++) {
      var cx = (i * 97) % w, cy = (i * 61) % h, r = 22 + (i % 5) * 7;
      for (var s = -1; s <= 1; s++) for (var u = -1; u <= 1; u++) { ctx.beginPath(); ctx.arc(cx + s * w, cy + u * h, r, 0.3, 2.2); ctx.stroke(); }
    }
  });
  if (t) t.repeat.set(3, 4);
  _caustic = bulb(0xffffff, { map: t, op: 0.32 });
  return _caustic;
}

function window_(g, S, z) {
  ring(g, 1.5, 0.2, 0xdfe8f2, S.in(0.1), 2.5, z, { ry: Math.PI / 2, seg: 20, tube: 5 });
  ring(g, 1.5, 0.06, 0x4fe0c0, S.in(0.04), 2.5, z, { ry: Math.PI / 2, seg: 20, tube: 4 });
  // coral at the foot of the window
  for (var i = 0; i < 5; i++) {
    var cz = z - 1.4 + i * 0.7;
    cyl(g, 0.05, 0.14, 0.5 + (i % 3) * 0.3, CORAL[i % 5], S.in(0.4), 0.3, cz, { seg: 5 });
    ball(g, 0.2, CORAL[(i + 2) % 5], S.in(0.4), 0.7 + (i % 3) * 0.3, cz, { seg: 5 });
  }
  box(g, 0.1, 0.4, 3.2, 0x1fb4d8, S.in(0.06), 0.25, z);
}

function kelp(g, S, z) {
  for (var i = 0; i < 5; i++) {
    var z0 = z - 1.4 + i * 0.7;
    for (var s = 0; s < 5; s++) ball(g, 0.2 - s * 0.02, [0x2fbf6a, 0x3fd47a, 0x58e08a][i % 3], S.in(0.3) + S.side * 0.15 * Math.sin(s + i), 0.4 + s * 0.65, z0, { seg: 5, sy: 1.5 });
  }
  box(g, 0.1, 0.4, 3.4, 0x1fb4d8, S.in(0.06), 0.25, z);
}

function scanner(g, S, z) {
  ring(g, 1.2, 0.35, 0xf4f8ff, S.in(0.7), 1.4, z, { ry: Math.PI / 2, seg: 18, tube: 6 });
  ring(g, 1.0, 0.06, 0x4fe0ff, S.in(0.55), 1.4, z, { ry: Math.PI / 2, seg: 18, tube: 4, bulb: true });
  box(g, 0.3, 0.2, 1.6, 0xc9d3e0, S.in(0.8), 0.25, z);
  box(g, 0.1, 1.3, 1.9, 0x0f3a5a, S.in(0.1), 3.8, z);
  box(g, 0.08, 1.1, 1.7, 0x4fe0ff, S.in(0.15), 3.8, z, { bulb: true, op: 0.8 });
  for (var i = 0; i < 6; i++) box(g, 0.08, 0.1 + (i % 3) * 0.2, 0.1, 0xffffff, S.in(0.2), 3.8, z - 0.7 + i * 0.28, { bulb: true });
}

function shells(g, S, z) {
  for (var i = 0; i < 6; i++) {
    var cz = z - 1.5 + i * 0.6;
    cone(g, 0.2, 0.25, CORAL[i % 5], S.in(0.4 + (i % 2) * 0.3), 0.12, cz, { seg: 6 });
    ball(g, 0.14, 0xfff0e0, S.in(0.35), 0.1, cz + 0.2, { seg: 5, sy: 0.6 });
  }
  ball(g, 0.55, 0xff9ac8, S.in(0.9), 0.5, z + 0.2, { seg: 7, sy: 0.9 });
  box(g, 0.1, 0.4, 3.4, 0x1fb4d8, S.in(0.06), 0.25, z);
}

function bay(g, side, z, k) {
  var S = sideCtx(side);
  wallPanel(g, waterWall(), side, z, H, 0.0, { r: 0.6, env: 0.1 });
  if (k === 0) window_(g, S, z);
  else if (k === 1) kelp(g, S, z);
  else if (k === 2) scanner(g, S, z);
  else shells(g, S, z);
}

function center(g, z) {
  floorPanel(g, sandFloor(), z, 12);
  floorPanel(g, canvasTex('aqua_caustic', 256, 256, function () {}), z, 12, { y: 0.03, color: 0xffffff }).material = causticMat();
  ceilingPanel(g, canvasTex('aqua_surface', 64, 64, function (ctx, w, h) { var gr = ctx.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#9af0ff'); gr.addColorStop(1, '#5fd0f0'); ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h); ctx.fillStyle = 'rgba(255,255,255,0.5)'; for (var i = 0; i < 10; i++) ctx.fillRect(i * 6, 0, 2, h); }), z, 11.6, H);
}

function arch(g, z, i) {
  // glass ribs of the tunnel, with a string of glowing buoys
  for (var f = 0; f < 7; f++) {
    var x = -4.5 + f * 1.5;
    ball(g, 0.16, [0xff9a3f, 0xff6a5e, 0xffe27a][(f + i) % 3], x, H - 0.45, z, { seg: 5, bulb: true });
  }
  cyl(g, 0.03, 0.03, 10.4, 0xdfe8f2, 0, H - 0.2, z, { rz: Math.PI / 2, seg: 4 });
}

function extras() {
  flow(causticMat().map, 0.05, 0.08);
  var fish = combine([
    { geo: new THREE.SphereGeometry(0.2, 7, 5), color: 0xffffff, matrix: xform(0, 0, 0, 0, 0, 0, 0.6, 0.8, 1.4) },
    { geo: new THREE.ConeGeometry(0.16, 0.3, 4), color: 0xffffff, matrix: xform(0, 0, 0.36, Math.PI / 2, 0, 0, 1, 0.3, 1) },
    { geo: new THREE.BoxGeometry(0.02, 0.18, 0.2), color: 0xfff0b0, matrix: xform(0, 0.17, 0) }
  ]);
  [-1, 1].forEach(function (side, i) {
    swarm({ geo: fish, count: 26, seed: 7 + i * 13, colors: [0xffa23f, 0xffd23f, 0x4fe0ff, 0xff6a8a, 0xffffff], area: { x: [side * 6.5, side * 12], y: [0.8, 5.5], z: [-140, 8] }, k: 0.6, vz: [-3, -1], vx: [-0.3, 0.3], face: true, wobble: 0.3, scale: [1.2, 2.2] });
    var jelly = combine([
      { geo: new THREE.SphereGeometry(0.35, 8, 5, 0, 6.283, 0, 1.6), color: 0xffffff },
      { geo: new THREE.CylinderGeometry(0.04, 0.02, 0.7, 4), color: 0xffffff, matrix: xform(-0.1, -0.35, 0) },
      { geo: new THREE.CylinderGeometry(0.04, 0.02, 0.7, 4), color: 0xffffff, matrix: xform(0.1, -0.35, 0.05) }
    ]);
    swarm({ geo: jelly, material: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false }), count: 8, seed: 33 + i, colors: [0xff9ac8, 0xb08aff, 0x9af0ff], area: { x: [side * 6, side * 10], y: [1.5, 5.5], z: [-140, 8] }, k: 1, vy: [0.1, 0.35], wobble: 0.5, scale: [1.5, 2.6] });
    var bub = combine([{ geo: new THREE.SphereGeometry(0.1, 6, 4), color: 0xffffff }]);
    swarm({ geo: bub, material: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false }), count: 22, seed: 60 + i, colors: [0xffffff], area: { x: [side * 4.7, side * 7], y: [0.3, 6], z: [-140, 8] }, k: 1, vy: [0.6, 1.2], wobble: 0.1, scale: [0.6, 1.6] });
  });
  // a manta ray gliding along the glass
  var ray = new THREE.Group();
  ball(ray, 0.6, 0x2a5a9a, 0, 0, 0, { seg: 7, sy: 0.35, sz: 1.3 });
  box(ray, 3.2, 0.1, 1.2, 0x2f6eb8, 0, 0, 0.1, { ry: 0.0 });
  cone(ray, 0.1, 1.6, 0x2a5a9a, 0, 0, 1.4, { rx: Math.PI / 2, seg: 4 });
  ray.position.set(-9, 3.2, -60);
  ray.scale.setScalar(1.6);
  animated(ray);
  mover(ray, { k: 0.5 });
}

export var aquarium = { id: 'aquarium', indoor: true, bay: bay, center: center, arch: arch, extras: extras };
