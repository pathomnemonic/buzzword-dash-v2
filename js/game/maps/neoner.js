/**
 * neoner.js — Neon ER: a retro-diner emergency room that never closes, all pink and teal neon.
 *
 * Every 16 units: a triage counter with stools and a spinning ER sign, a parked gurney with a beeping heart monitor, a
 * wall of vending machines and a jukebox, and an ambulance nose with a flashing light bar. Moving: a gurney bed race
 * speeding along each wall, balloons and hearts floating, confetti and a green heartbeat line running along the wall.
 * The floor is a black-and-white checker with hot-pink lane lines.
 */

import * as THREE from 'three';
import { box, cyl, ball, cone, ring, quad, sign, mat, bulb, extrude, heartShape, canvasTex, floorPanel, ceilingPanel, wallPanel, sideCtx } from '../mapkit.js';
import { animated, mover, swarm, shimmer, flow } from '../mapfx.js';
import { face, bolt, lightString, dotGeo, sparkleGeo, glowMat, neonSign } from './cartoon.js';

var H = 6.4;
var PINK = 0xff3d9a;
var TEAL = 0x22e6d8;
var YEL = 0xffe14a;
var RED = 0xff4d5a;
var BLUE = 0x3d8bff;
var CREAM = 0xfff4e0;
var POP = [PINK, TEAL, YEL, BLUE, RED];

function wallPicture() {
  return canvasTex('ner_wall', 1024, 410, function (ctx, w, h) {
    ctx.fillStyle = '#17c9bd'; ctx.fillRect(0, 0, w, h);
    // diagonal teal and cream stripes, the way a 1950s diner does it (they divide the width so the picture tiles)
    for (var i = -12; i < 40; i++) { ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0)'; ctx.beginPath(); ctx.moveTo(i * 32, 0); ctx.lineTo(i * 32 + 32, 0); ctx.lineTo(i * 32 - 40, h); ctx.lineTo(i * 32 - 72, h); ctx.fill(); }
    // stars and a neon squiggle
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (var s = 0; s < 18; s++) { var sx = (s * 163) % w, sy = 24 + (s * 71) % 180; ctx.fillRect(sx - 1, sy - 8, 3, 17); ctx.fillRect(sx - 8, sy - 1, 17, 3); }
    ctx.strokeStyle = '#ff3d9a'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath();
    for (var x = 0; x <= w; x += 6) { var y = 130 + Math.sin((x / w) * Math.PI * 2 * 4) * 16; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.stroke();
    // a chrome rail and a checker wainscot
    ctx.fillStyle = '#e8eef4'; ctx.fillRect(0, h - 132, w, 8); ctx.fillStyle = '#ff3d9a'; ctx.fillRect(0, h - 124, w, 14);
    for (var c = 0; c < 32; c++) for (var r = 0; r < 3; r++) { ctx.fillStyle = (c + r) % 2 ? '#ffffff' : '#20202e'; ctx.fillRect(c * 32, h - 110 + r * 36, 32, 36); }
  });
}

function floorPicture() {
  return canvasTex('ner_floor', 576, 768, function (ctx, w, h) {
    for (var j = 0; j < 16; j++) for (var i = 0; i < 12; i++) { ctx.fillStyle = (i + j) % 2 ? '#ffffff' : '#262636'; ctx.fillRect(i * 48, j * 48, 48, 48); }
    ctx.fillStyle = 'rgba(255,61,154,0.9)';
    [-1.5, 1.5].forEach(function (lx) { ctx.fillRect(w / 2 + lx * 48 - 5, 0, 10, h); });
    ctx.fillStyle = '#22e6d8'; ctx.fillRect(0, 0, 14, h); ctx.fillRect(w - 14, 0, 14, h);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(0, 0, w, 0);
  });
}

function ceilingPicture() {
  return canvasTex('ner_ceiling', 464, 640, function (ctx, w, h) {
    ctx.fillStyle = '#2a2a48'; ctx.fillRect(0, 0, w, h);
    ctx.shadowBlur = 16;
    for (var i = 0; i < 4; i++) {
      var y = i * 160 + 50;
      ctx.shadowColor = i % 2 ? '#22e6d8' : '#ff3d9a'; ctx.fillStyle = i % 2 ? '#aafff7' : '#ffc0e0';
      ctx.fillRect(50, y, w - 100, 10); ctx.fillRect(50, y + 60, w - 100, 10);
    }
  });
}

/** The two light-bar bulbs on the ambulance take turns (see extras). */
function lampMat(n) { return mat(n ? 0x3d8bff : 0xff4d5a, { e: n ? 0x3d8bff : 0xff4d5a, ei: 0.6, r: 0.4 }); }
function ekgTex() {
  return canvasTex('ner_ekg', 256, 64, function (ctx, w, h) {
    ctx.fillStyle = '#0d1b1a'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#4dffa0'; ctx.lineWidth = 3; ctx.shadowColor = '#4dffa0'; ctx.shadowBlur = 6; ctx.beginPath();
    ctx.moveTo(0, 36); ctx.lineTo(60, 36); ctx.lineTo(70, 28); ctx.lineTo(80, 36); ctx.lineTo(96, 36); ctx.lineTo(104, 50); ctx.lineTo(112, 6); ctx.lineTo(122, 56); ctx.lineTo(132, 36); ctx.lineTo(256, 36); ctx.stroke();
  });
}

function stool(g, x, z, c) {
  cyl(g, 0.05, 0.05, 0.6, 0xdfe6ee, x, 0.3, z, { seg: 5, m: 0.6 });
  cyl(g, 0.22, 0.22, 0.12, c, x, 0.66, z, { seg: 8 });
  cyl(g, 0.16, 0.2, 0.05, 0xdfe6ee, x, 0.03, z, { seg: 6 });
}

function triage(g, S, z) {
  var x = S.in(0.5);
  box(g, 0.8, 1.0, 3.6, PINK, x, 0.5, z);
  box(g, 0.86, 0.1, 3.7, 0xffffff, x, 1.05, z);
  box(g, 0.1, 0.9, 3.6, CREAM, S.in(0.1), 0.5, z);
  stool(g, S.in(0.8), z - 1.2, TEAL); stool(g, S.in(0.8), z, YEL); stool(g, S.in(0.8), z + 1.2, TEAL);
  // a spinning-looking ER sign: a pink neon heart ring with the word inside
  ring(g, 0.8, 0.1, PINK, S.in(0.12), 3.7, z, { ry: Math.PI / 2, seg: 18, tube: 4, bulb: true });
  sign(g, 'ER', 0xffffff, PINK, 1.0, 0.7, S.in(0.1), 3.7, z, { ry: S.turn, border: PINK });
  neonSign(g, 'TRIAGE', TEAL, 0x1a2a4a, 2.4, 0.7, S.in(0.1), 5.1, z, { ry: S.turn });
  ball(g, 0.2, YEL, x, 1.3, z - 0.9, { seg: 6 });
  cyl(g, 0.12, 0.12, 0.3, RED, x, 1.2, z + 0.8, { seg: 6 });
}

function gurney(g, S, z) {
  var x = S.in(0.62);
  box(g, 0.7, 0.1, 2.0, 0xe8eef4, x, 0.95, z);
  box(g, 0.74, 0.12, 1.7, PINK, x, 1.05, z + 0.1);
  ball(g, 0.2, 0xffd5b8, x, 1.28, z - 0.75, { seg: 6 });
  [[-0.3, -0.8], [0.3, -0.8], [-0.3, 0.8], [0.3, 0.8]].forEach(function (p) { cyl(g, 0.12, 0.12, 0.06, 0x2a2d3a, x + p[0], 0.14, z + p[1], { rz: Math.PI / 2, seg: 6 }); cyl(g, 0.03, 0.03, 0.75, 0xc9d3e0, x + p[0], 0.5, z + p[1], { seg: 4 }); });
  // heart monitor on the wall, with a bright blip
  box(g, 0.18, 0.9, 1.3, 0x20202e, S.in(0.1), 2.7, z + 0.2);
  var ekg = ekgTex();
  if (ekg) quad(g, 1.15, 0.7, 0xffffff, S.in(0.2), 2.7, z + 0.2, { ry: S.turn, mat: bulb(0xffffff, { map: ekg }) });
  // IV pole carrying balloons instead of a bag
  cyl(g, 0.03, 0.03, 2.6, 0xc9d3e0, S.in(0.5), 1.3, z - 1.5, { seg: 4 });
  [[0, 2.6, PINK], [0.16, 2.8, TEAL], [-0.16, 2.8, YEL]].forEach(function (b) { ball(g, 0.2, b[2], S.in(0.5) + b[0], b[1], z - 1.5, { seg: 7, sy: 1.15 }); });
  neonSign(g, 'BED RACE', YEL, 0x3a1530, 2.4, 0.7, S.in(0.1), 4.6, z, { ry: S.turn });
  bolt(g, 0.7, TEAL, S.in(0.12), 3.7, z - 1.4, { ry: S.turn });
  bolt(g, 0.7, PINK, S.in(0.12), 3.7, z + 1.4, { ry: S.turn });
}

function vending(g, S, z) {
  var cols = [PINK, TEAL, YEL, BLUE];
  for (var i = 0; i < 3; i++) {
    var vz = z - 1.3 + i * 1.3;
    box(g, 0.7, 2.3, 1.0, cols[(i + 1) % 4], S.in(0.4), 1.15, vz);
    box(g, 0.04, 1.5, 0.78, 0xdff6ff, S.in(0.04) + (S.side < 0 ? 0.36 : -0.36), 1.45, vz, { op: 0.55 });
    for (var r = 0; r < 4; r++) for (var c = 0; c < 2; c++) ball(g, 0.1, POP[(r * 2 + c + i) % 5], S.in(0.5), 0.9 + r * 0.32, vz - 0.2 + c * 0.4, { seg: 5, bulb: true });
  }
  // a jukebox is the star of the wall
  neonSign(g, 'SNACKS', PINK, 0x1a2a4a, 2.2, 0.7, S.in(0.1), 3.4, z, { ry: S.turn });
  box(g, 0.14, 0.3, 4.1, CREAM, S.in(0.06), 0.15, z);
  ball(g, 0.35, YEL, S.in(0.5), 2.75, z - 1.3, { seg: 7, bulb: true });
  cyl(g, 0.4, 0.4, 0.7, TEAL, S.in(0.3), 0.35, z + 1.9, { seg: 8 });
}

function ambulance(g, S, z) {
  var x = S.in(0.2);
  box(g, 0.9, 1.6, 3.0, 0xffffff, x, 1.0, z);
  box(g, 0.92, 0.35, 3.02, RED, x, 0.55, z);
  box(g, 0.5, 0.9, 1.3, 0x9be7ff, x, 1.5, z - 0.9, { op: 0.8 });
  box(g, 0.06, 0.8, 0.8, RED, x + (S.side < 0 ? 0.47 : -0.47), 1.1, z + 0.7, { bulb: true });
  box(g, 0.8, 0.06, 0.2, 0xffffff, x + (S.side < 0 ? 0.47 : -0.47), 1.1, z + 0.7, { bulb: true });
  // the light bar: red and blue lamps, switched by the animation
  box(g, 0.7, 0.14, 1.4, 0x2a2d3a, x, 2.0, z);
  ball(g, 0.22, RED, x, 2.15, z - 0.45, { mat: lampMat(0), seg: 6 });
  ball(g, 0.22, BLUE, x, 2.15, z + 0.45, { mat: lampMat(1), seg: 6 });
  [[-0.8], [0.8]].forEach(function (p) { cyl(g, 0.24, 0.24, 0.16, 0x2a2d3a, x + 0.0, 0.24, z + p[0], { rz: Math.PI / 2, seg: 8 }); });
  neonSign(g, 'DX AMBULANCE', RED, 0x1a2a4a, 2.8, 0.7, S.in(0.1), 3.5, z, { ry: S.turn });
  box(g, 0.14, 0.3, 4.1, PINK, S.in(0.06), 0.15, z + 0.0, { ry: 0 });
}

function bay(g, side, z, k) {
  var S = sideCtx(side);
  wallPanel(g, wallPicture(), side, z, H, 0.0, { r: 0.7 });
  if (k === 0) triage(g, S, z);
  else if (k === 1) gurney(g, S, z);
  else if (k === 2) vending(g, S, z);
  else ambulance(g, S, z);
}

function center(g, z) {
  floorPanel(g, floorPicture(), z, 12);
  ceilingPanel(g, ceilingPicture(), z, 11.6, H);
}

function arch(g, z, i) {
  // a swoop of neon tube across the hall, with a heart in the middle
  lightString(g, POP, H - 0.7, z, { n: 13, sag: 0.6, phase: i });
  extrude(g, heartShape(0.7), 0.06, i % 2 ? PINK : TEAL, 0, H - 1.3, z, { bulb: true, curve: 3 });
  [-1, 1].forEach(function (s) { bolt(g, 0.8, i % 2 ? TEAL : PINK, s * 4.6, H - 1.3, z, {}); });
}

function bedRacer(side) {
  var S = sideCtx(side);
  var t = new THREE.Group();
  box(t, 0.7, 0.12, 1.9, 0xe8eef4, 0, 0.62, 0);
  box(t, 0.74, 0.18, 1.5, PINK, 0, 0.78, 0.15);
  [[-0.3, -0.7], [0.3, -0.7], [-0.3, 0.7], [0.3, 0.7]].forEach(function (p) { cyl(t, 0.16, 0.16, 0.08, 0x2a2d3a, p[0], 0.18, p[1], { rz: Math.PI / 2, seg: 8 }); });
  // the patient: a cheerful pale ball with a racing helmet
  ball(t, 0.3, 0xffd5b8, 0, 1.15, -0.35, { seg: 8 });
  face(t, 0, 1.15, -0.35, 0.3, S.turn, { open: true });
  cone(t, 0.25, 0.28, YEL, 0, 1.45, -0.35, { seg: 6 });
  box(t, 0.05, 0.6, 0.05, 0xc9d3e0, 0, 1.1, 0.75);
  ball(t, 0.16, TEAL, 0, 1.55, 0.75, { seg: 6, sy: 1.15 });
  t.position.set(S.in(0.7), 0, -30);
  t.rotation.y = 0;
  return animated(t);
}

function extras() {
  [-1, 1].forEach(function (side, i) {
    var bed = bedRacer(side);
    bed.position.z = -20 - i * 40;
    mover(bed, { k: 1, vz: -14 - i * 3 });
    swarm({ geo: dotGeo(0.26), material: glowMat(0.5), count: 14, seed: 12 + i, colors: [0xffc0e0, 0xaafff7, 0xffffa0], area: { x: [side * 4.6, side * 5.2], y: [0.8, 5.6], z: [-140, 8] }, k: 1, vy: [0.4, 1.0], wobble: 0.2, scale: [0.6, 1.5] });
    swarm({ geo: sparkleGeo(0.22), material: glowMat(0.9), count: 12, seed: 60 + i, colors: [0xffffff, 0xffe14a, 0x22e6d8, 0xff3d9a], area: { x: [side * 4.4, side * 5.2], y: [1.0, 5.8], z: [-140, 8] }, k: 1, turn: 1.6, wobble: 0.1, scale: [0.7, 1.4] });
  });
  shimmer(lampMat(0), 0.15, 0.55, 3.0, 0);
  shimmer(lampMat(1), 0.15, 0.55, 3.0, Math.PI);
  var e = ekgTex();
  if (e) flow(e, 0.35, 0);
}

export var neoner = { id: 'neoner', indoor: true, bay: bay, center: center, arch: arch, extras: extras };
