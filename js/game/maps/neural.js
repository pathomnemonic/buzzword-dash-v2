/**
 * neural.js — Neural Highway: a bubblegum brain-wave speedway, where friendly neurons wave from the walls.
 *
 * Every 16 units: a big smiling neuron with a chain of glowing myelin sausages, a synapse station where two little
 * neurons toss a spark across the gap, a row of brain lobes in four flavours, and a giant lightbulb that shouts IDEA!
 * Moving: signals racing along the axon rails, thought bubbles floating up, twinkling stars, and a pulsing brain in
 * sunglasses that rides past on the wall. The floor is a glossy violet circuit board, the ceiling a night of stars.
 */

import * as THREE from 'three';
import { box, cyl, ball, cone, sign, mat, combine, xform, canvasTex, floorPanel, ceilingPanel, wallPanel, sideCtx } from '../mapkit.js';
import { animated, features, pulse, swarm, shimmer } from '../mapfx.js';
import { face, bolt, capsule, lightString, sparkleGeo, dotGeo, glowMat } from './cartoon.js';

var H = 6.4;
var PINK = 0xff6bd6;
var TEAL = 0x35e0d0;
var YEL = 0xffd84a;
var BLUE = 0x5aa8ff;
var VIO = 0x8a5cf6;
var GREEN = 0x5bea8a;
var POP = [PINK, TEAL, YEL, BLUE, VIO, GREEN];

function wallPicture() {
  return canvasTex('neural_wall', 1024, 410, function (ctx, w, h) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#c9b7ff');
    g.addColorStop(0.6, '#e6c9ff');
    g.addColorStop(1, '#ffc7ef');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // brain folds: fat wavy ribbons (they divide the width, so the picture tiles)
    ctx.lineCap = 'round';
    [[0.3, 7, '#b79cff', 14, 0.0], [0.5, 5, '#ffa6e3', 12, 1.7], [0.7, 6, '#9fe7ff', 10, 3.1]].forEach(function (L) {
      ctx.strokeStyle = L[2];
      ctx.lineWidth = L[3];
      ctx.beginPath();
      for (var x = 0; x <= w; x += 6) {
        var y = h * L[0] + Math.sin((x / w) * Math.PI * 2 * L[1] + L[4]) * 26 + Math.sin((x / w) * Math.PI * 2 * L[1] * 3 + L[4]) * 7;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
    // polka dots and sparkles
    for (var i = 0; i < 40; i++) {
      var px = (i * 197) % w, py = 20 + ((i * 89) % (h - 150));
      ctx.fillStyle = i % 3 === 0 ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)';
      ctx.beginPath(); ctx.arc(px, py, i % 3 === 0 ? 5 : 3, 0, Math.PI * 2); ctx.fill();
    }
    // a candy checker band along the bottom
    for (var c = 0; c < 32; c++) { ctx.fillStyle = c % 2 ? '#35e0d0' : '#ff6bd6'; ctx.fillRect(c * 32, h - 64, 32, 32); ctx.fillStyle = c % 2 ? '#ff6bd6' : '#35e0d0'; ctx.fillRect(c * 32, h - 32, 32, 32); }
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, h - 70, w, 6);
  });
}

function floorPicture() {
  return canvasTex('neural_floor', 576, 768, function (ctx, w, h) {
    var g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#5e44d8'); g.addColorStop(0.5, '#7d63ee'); g.addColorStop(1, '#5e44d8');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // circuit-board traces and nodes
    ctx.strokeStyle = 'rgba(170,240,255,0.5)'; ctx.lineWidth = 3;
    for (var i = 0; i < 12; i++) {
      var x = (i * 71) % w, y = (i * 163) % h;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 60, y); ctx.lineTo(x + 90, y + 30); ctx.lineTo(x + 90, y + 90); ctx.stroke();
      ctx.fillStyle = '#9ff4ff'; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 90, y + 90, 6, 0, Math.PI * 2); ctx.fill();
    }
    // dashes between the lanes and hot-pink rails at the edges
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    [-1.5, 1.5].forEach(function (lx) { for (var y2 = 0; y2 < h; y2 += 64) ctx.fillRect(w / 2 + lx * 48 - 3, y2 + 8, 6, 34); });
    ctx.fillStyle = '#ff6bd6'; ctx.fillRect(0, 0, 14, h); ctx.fillRect(w - 14, 0, 14, h);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(14, 0, 4, h); ctx.fillRect(w - 18, 0, 4, h);
  });
}

function ceilingPicture() {
  return canvasTex('neural_ceiling', 464, 640, function (ctx, w, h) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#4a2fb5'); g.addColorStop(1, '#6f3fd0');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    for (var i = 0; i < 46; i++) { ctx.fillStyle = 'rgba(255,255,255,' + (0.3 + (i % 4) * 0.2) + ')'; ctx.beginPath(); ctx.arc((i * 131) % w, (i * 97) % h, 1.5 + (i % 3), 0, Math.PI * 2); ctx.fill(); }
    // an EEG trace running the whole length, glowing
    ctx.shadowColor = '#35e0d0'; ctx.shadowBlur = 14; ctx.strokeStyle = '#a8fff3'; ctx.lineWidth = 5;
    ctx.beginPath();
    for (var y = 0; y <= h; y += 4) { var x = w / 2 + Math.sin((y / h) * Math.PI * 2 * 4) * 70 + (y % 160 < 24 ? Math.sin((y % 160) / 24 * Math.PI) * 60 : 0); if (y === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.stroke();
  });
}

var _myelin = null;
function myelinMat() { return _myelin || (_myelin = mat(YEL, { e: YEL, ei: 0.35, r: 0.4 })); }
var _spark = null;
function sparkMat() { return _spark || (_spark = mat(0xffffff, { e: 0xfff2a0, ei: 0.9, r: 0.3 })); }

// ---------- bays ----------

function neuron(g, S, z) {
  var cz = z - 0.9;
  // dendrites: pink branches that reach up and out along the wall, each ending in a bud
  [[-0.9, 0.55, 0.7], [0.1, 0.9, 1.0], [1.0, 0.45, 0.6], [-0.4, -0.6, 0.55]].forEach(function (d, i) {
    var len = 1.5 * d[2] + 0.5;
    cyl(g, 0.07, 0.12, len, PINK, S.in(0.15), 1.7 + d[1] * 0.9, cz + d[0], { rx: d[0] * 0.55, rz: d[1] * 0.3, seg: 6 });
    ball(g, 0.15, POP[(i + 1) % 6], S.in(0.15), 1.7 + d[1] * 0.9 + len * 0.45, cz + d[0] + d[0] * 0.4, { seg: 6 });
  });
  ball(g, 1.0, PINK, S.in(0.0), 1.55, cz, { seg: 10, sy: 0.95 });
  face(g, S.in(0.0), 1.55, cz, 1.0, S.turn, { open: true, lash: true });
  // the axon runs from the body along the wall to the next one: a chain of lit myelin sausages
  for (var i = 0; i < 4; i++) {
    var sz = z - 1.5 + i * 1.0 + 0.0;
    capsule(g, 0.24, 0.5, YEL, S.in(0.12), 3.4, sz + 0.0, { mat: myelinMat() });
  }
  cyl(g, 0.05, 0.05, 4, PINK, S.in(0.12), 3.4, z, { rx: Math.PI / 2, seg: 5 });
  sign(g, 'HI!', PINK, 0xffffff, 1.7, 0.7, S.in(0.1), 4.7, z, { ry: S.turn, border: 0xffffff });
}

function synapse(g, S, z) {
  [-1, 1].forEach(function (d) {
    var nz = z + d * 1.45;
    ball(g, 0.55, d < 0 ? BLUE : VIO, S.in(0.1), 1.2, nz, { seg: 10 });
    face(g, S.in(0.1), 1.2, nz, 0.55, S.turn, {});
    cone(g, 0.28, 0.9, d < 0 ? BLUE : VIO, S.in(0.1), 1.2, nz - d * 0.75, { seg: 8, rx: d * Math.PI / 2 });
  });
  ball(g, 0.14, 0xffffff, S.in(0.1), 1.2, z, { mat: sparkMat(), seg: 7 });
  [-0.5, 0.5].forEach(function (dz, i) { ball(g, 0.09, POP[i + 2], S.in(0.1), 0.85 + i * 0.5, z + dz, { seg: 5, bulb: true }); });
  box(g, 0.14, 0.5, 4.2, TEAL, S.in(0.06), 0.25, z);
  sign(g, 'SYNAPSE', TEAL, 0x24127a, 2.6, 0.8, S.in(0.1), 3.6, z, { ry: S.turn, border: 0xffffff });
  bolt(g, 0.8, YEL, S.in(0.1), 4.9, z - 1.4, { ry: S.turn });
  bolt(g, 0.8, YEL, S.in(0.1), 4.9, z + 1.4, { ry: S.turn });
}

function lobes(g, S, z) {
  var spec = [['F', BLUE], ['P', YEL], ['O', GREEN], ['T', PINK]];
  spec.forEach(function (s, i) {
    var lz = z - 1.5 + i * 1.0;
    ball(g, 0.52, s[1], S.in(0.4), 0.6, lz, { seg: 10, sy: 0.85 });
    ball(g, 0.36, s[1], S.in(0.4), 1.15, lz, { seg: 8, sy: 0.9 });
    sign(g, s[0], 0xffffff, 0x24127a, 0.55, 0.55, S.in(0.1), 2.0, lz, { ry: S.turn, border: s[1] });
  });
  box(g, 0.1, 0.1, 4, 0xffffff, S.in(0.08), 2.4, z);
  sign(g, 'LOBE LOUNGE', PINK, 0xffffff, 3.0, 0.8, S.in(0.1), 3.5, z, { ry: S.turn, border: 0xffffff });
  // a sunglasses-wearing scoop of brain on top, because why not
  ball(g, 0.5, PINK, S.in(0.12), 4.5, z, { seg: 10 });
  face(g, S.in(0.12), 4.5, z, 0.5, S.turn, { shades: true });
}

function idea(g, S, z) {
  var x = S.in(0.15);
  cyl(g, 0.35, 0.35, 0.5, 0x9aa0b8, x, 1.7, z, { seg: 8, m: 0.6, r: 0.3 });
  ball(g, 0.95, 0xfff2a0, x, 2.9, z, { mat: sparkMat(), seg: 10 });
  for (var i = 0; i < 8; i++) {
    var a = (i / 8) * Math.PI * 2;
    cyl(g, 0.04, 0.04, 0.5, YEL, x, 2.9 + Math.sin(a) * 1.5, z + Math.cos(a) * 1.5, { rx: -a, seg: 3, bulb: true });
  }
  sign(g, 'IDEA!', YEL, 0x24127a, 1.9, 0.75, x, 4.7, z, { ry: S.turn, border: 0xffffff });
  box(g, 0.14, 0.4, 4.2, YEL, S.in(0.06), 0.2, z);
  ball(g, 0.24, PINK, S.in(0.5), 0.3, z - 1.4, { seg: 6 });
  ball(g, 0.24, TEAL, S.in(0.5), 0.3, z + 1.4, { seg: 6 });
}

function bay(g, side, z, k) {
  var S = sideCtx(side);
  wallPanel(g, wallPicture(), side, z, H, 0.0, { r: 0.85 });
  if (k === 0) neuron(g, S, z);
  else if (k === 1) synapse(g, S, z);
  else if (k === 2) lobes(g, S, z);
  else idea(g, S, z);
}

function center(g, z) {
  floorPanel(g, floorPicture(), z, 12);
  ceilingPanel(g, ceilingPicture(), z, 11.6, H);
}

function arch(g, z, i) {
  lightString(g, POP, H - 0.7, z, { n: 13, sag: 0.55, phase: i });
  // a hanging EEG wave of beads across the hall, and a bolt at each side
  for (var b = 0; b < 17; b++) {
    var t = b / 16;
    ball(g, 0.07, POP[(b + i) % 6], -4.8 + t * 9.6, H - 1.9 + Math.sin(t * Math.PI * 4 + i) * 0.35, z, { seg: 4, bulb: true });
  }
  [-1, 1].forEach(function (s) { bolt(g, 0.7, i % 2 ? PINK : TEAL, s * 4.7, H - 1.2, z, {}); });
}

// ---------- the things that move ----------

function brainRider() {
  var m = new THREE.Group();
  ball(m, 0.85, PINK, 0, 1.5, 0, { seg: 12, sx: 1.15 });
  [[-0.5, 0.1], [0.5, 0.1], [0, 0.55]].forEach(function (p, i) { ball(m, 0.4, i === 2 ? 0xff9ee8 : 0xff8fe0, p[0], 1.5 + p[1] + 0.7, 0, { seg: 8 }); });
  face(m, 0, 1.45, 0.0, 0.8, 0, { shades: true, open: true });
  cyl(m, 0.14, 0.2, 0.7, 0x9aa0b8, 0, 0.35, 0, { seg: 8 });
  animated(m);
  pulse(m, 0.05, 3.2, 0);
  return m;
}

function extras() {
  // signals racing along the axon rails on both walls
  var sig = combine([{ geo: new THREE.CapsuleGeometry(0.1, 0.45, 3, 6), color: 0xffffff, matrix: xform(0, 0, 0, Math.PI / 2, 0, 0) }]);
  [-1, 1].forEach(function (side, i) {
    swarm({ geo: sig, material: glowMat(0.95), count: 12, seed: 4 + i, colors: [0xffffff, 0xa8fff3, 0xffb6ee, 0xffe98a], area: { x: [side * 5.3, side * 5.3], y: [3.4, 3.4], z: [-140, 8] }, k: 1, vz: [-9, -5], scale: [0.9, 1.4] });
    swarm({ geo: dotGeo(0.3), material: glowMat(0.38), count: 12, seed: 40 + i, colors: [0xffffff, 0xffd6f6, 0xcfe8ff], area: { x: [side * 4.7, side * 5.2], y: [0.8, 5.6], z: [-140, 8] }, k: 1, vy: [0.35, 0.9], wobble: 0.2, scale: [0.6, 1.5] });
    swarm({ geo: sparkleGeo(0.22), material: glowMat(0.9), count: 10, seed: 70 + i, colors: [0xffffff, 0xffe98a, 0x9ff4ff, 0xffb6ee], area: { x: [side * 4.4, side * 5.2], y: [1.0, 5.8], z: [-140, 8] }, k: 1, turn: 1.6, wobble: 0.1, scale: [0.7, 1.4] });
  });
  features(brainRider, { x: -5.15, spacing: 64, count: 3, z0: -34, yaw: Math.PI / 2 });
  features(brainRider, { x: 5.15, spacing: 64, count: 3, z0: -66, yaw: -Math.PI / 2 });
  shimmer(myelinMat(), 0.35, 0.28, 2.6, 0);
  shimmer(sparkMat(), 0.85, 0.15, 3.0, 0);
}

export var neural = { id: 'neural', indoor: true, bay: bay, center: center, arch: arch, extras: extras };
