/**
 * cellular.js — Cellular Matrix: a jelly-bright playground inside a living cell, where every organelle is a ride.
 *
 * Every 16 units: the nucleus bounce castle, the mitochondria power plant with its zigzag cristae, a stack of Golgi
 * pancakes, and an ER rollercoaster of ribosomes. The walls are a glossy membrane with a row of phospholipids, the
 * floor green jelly, the ceiling a bubbly canopy. Moving: vesicles bouncing past, bubbles rising, ribosomes drifting
 * and cytoplasm streaming slowly along the walls.
 */

import * as THREE from 'three';
import { box, cyl, ball, ring, sign, combine, xform, canvasTex, floorPanel, ceilingPanel, wallPanel, sideCtx } from '../mapkit.js';
import { animated, features, swarm, bob, flow, pulse } from '../mapfx.js';
import { face, bolt, lightString, sparkleGeo, dotGeo, glowMat } from './cartoon.js';

var H = 6.4;
var MINT = 0x6ff0b0;
var LIME = 0xb6f04a;
var YEL = 0xffe14a;
var PINK = 0xff7ac8;
var ORANGE = 0xff9a3d;
var PURPLE = 0xa86cf0;
var SKY = 0x5ad0ff;
var POP = [MINT, LIME, YEL, PINK, ORANGE, SKY];

var _wall = null;
function wallPicture() {
  return _wall || (_wall = canvasTex('cell_wall', 1024, 410, function (ctx, w, h) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#9af5cf'); g.addColorStop(0.6, '#b8f7c8'); g.addColorStop(1, '#d4fbb0');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // glossy bubbles and floating organelle outlines
    for (var i = 0; i < 22; i++) {
      var x = (i * 197) % w, y = 30 + (i * 83) % 210, r = 14 + (i % 4) * 9;
      var rg = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 2, x, y, r);
      rg.addColorStop(0, 'rgba(255,255,255,0.9)'); rg.addColorStop(0.5, 'rgba(255,255,255,0.18)'); rg.addColorStop(1, 'rgba(255,255,255,0.4)');
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    // the phospholipid bilayer: round pink heads with two wiggly tails, a row of them along the bottom
    for (var p = 0; p < 32; p++) {
      var px = p * 32 + 16;
      ctx.fillStyle = '#ff7ac8'; ctx.beginPath(); ctx.arc(px, h - 100, 11, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffe14a'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      [-4, 4].forEach(function (d) { ctx.beginPath(); ctx.moveTo(px + d, h - 90); ctx.quadraticCurveTo(px + d + 6, h - 66, px + d, h - 46); ctx.stroke(); });
      ctx.fillStyle = '#ff7ac8'; ctx.beginPath(); ctx.arc(px, h - 14, 11, 0, Math.PI * 2); ctx.fill();
      [-4, 4].forEach(function (d) { ctx.beginPath(); ctx.moveTo(px + d, h - 24); ctx.quadraticCurveTo(px + d - 6, h - 44, px + d, h - 56); ctx.stroke(); });
    }
  }));
}

function floorPicture() {
  return canvasTex('cell_floor', 576, 768, function (ctx, w, h) {
    var g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#46d68a'); g.addColorStop(0.5, '#7af0a8'); g.addColorStop(1, '#46d68a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    for (var i = 0; i < 40; i++) { var x = (i * 151) % w, y = (i * 97) % h, r = 8 + (i % 4) * 6; ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; [-1.5, 1.5].forEach(function (lx) { ctx.fillRect(w / 2 + lx * 48 - 3, 0, 6, h); });
    ctx.fillStyle = '#ff7ac8'; ctx.fillRect(0, 0, 14, h); ctx.fillRect(w - 14, 0, 14, h);
  });
}

function ceilingPicture() {
  return canvasTex('cell_ceiling', 464, 640, function (ctx, w, h) {
    ctx.fillStyle = '#a8f5cf'; ctx.fillRect(0, 0, w, h);
    for (var i = 0; i < 26; i++) { var x = (i * 131) % w, y = (i * 89) % h, r = 12 + (i % 5) * 9; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fill(); }
  });
}

function stripeTexture() {
  return canvasTex('cell_cristae', 128, 64, function (ctx, w, h) {
    ctx.fillStyle = '#ff9a3d'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#ffd08a'; ctx.lineWidth = 5; ctx.beginPath();
    for (var x = 8; x < w; x += 16) { ctx.moveTo(x, 6); ctx.lineTo(x + 6, h - 6); ctx.moveTo(x + 6, h - 6); ctx.lineTo(x + 12, 6); }
    ctx.stroke();
  });
}

function nucleus(g, S, z) {
  var x = S.in(0.0);
  ball(g, 1.15, 0xc9fff0, x, 1.2, z, { seg: 10, op: 0.45, sy: 0.95 });
  ball(g, 0.75, PURPLE, x, 1.2, z, { seg: 8 });
  ball(g, 0.28, PINK, S.in(0.0) + (S.side < 0 ? 0.35 : -0.35), 1.65, z + 0.25, { seg: 7 });
  face(g, x, 1.2, z, 0.75, S.turn, { open: true, lash: true });
  // nuclear pores: little rings around the shell
  for (var p = 0; p < 5; p++) { var a = p * 1.26; ring(g, 0.12, 0.03, YEL, x + (S.side < 0 ? 1 : -1) * Math.cos(a) * 0.9, 1.2 + Math.sin(a) * 0.75, z + (p % 2 ? 0.5 : -0.5), { ry: Math.PI / 2, seg: 8, tube: 3 }); }
  sign(g, 'NUCLEUS HQ', PURPLE, 0xffffff, 2.5, 0.65, S.in(0.1), 3.4, z, { ry: S.turn, border: 0xffffff });
  [-1.4, 1.4].forEach(function (dz, i) { ball(g, 0.3, POP[i + 3], S.in(0.5), 0.3, z + dz, { seg: 7, sy: 0.7 }); });
  bolt(g, 0.7, YEL, S.in(0.12), 4.6, z, { ry: S.turn });
}

function mitochondria(g, S, z) {
  var tex = stripeTexture();
  [-1, 1].forEach(function (d, i) {
    var m = ball(g, 0.6, 0xffffff, S.in(0.2), 1.0 + i * 0.5, z + d * 1.1, { seg: 9, sx: 0.8, sy: 0.9, sz: 1.5, map: tex, r: 0.4 });
    if (!tex) m.material = new THREE.MeshStandardMaterial({ color: ORANGE });
  });
  face(g, S.in(0.2), 1.0, z - 1.1, 0.6, S.turn, { open: true });
  face(g, S.in(0.2), 1.5, z + 1.1, 0.6, S.turn, { shades: true });
  bolt(g, 1.2, YEL, S.in(0.12), 3.2, z, { ry: S.turn });
  sign(g, 'POWER PLANT', ORANGE, 0xffffff, 2.8, 0.65, S.in(0.1), 4.3, z, { ry: S.turn, border: YEL });
  box(g, 0.14, 0.3, 4, MINT, S.in(0.06), 0.15, z);
}

function golgi(g, S, z) {
  var x = S.in(0.35);
  for (var i = 0; i < 5; i++) {
    var c = POP[i % 6];
    cyl(g, 0.95 - i * 0.04, 0.95 - i * 0.04, 0.2, c, x, 0.35 + i * 0.38, z, { seg: 10, sz: 1.4 });
    ball(g, 0.12, c, x, 0.35 + i * 0.38, z + 1.2 + (i % 2) * 0.1, { seg: 5 });
  }
  face(g, x, 1.4, z, 0.9, S.turn, { open: true });
  [-1.7, 1.7].forEach(function (dz, i) { ball(g, 0.22, i ? PINK : SKY, S.in(0.5), 0.7 + i * 0.3, z + dz, { seg: 7, op: 0.85 }); ball(g, 0.1, 0xffffff, S.in(0.5), 0.7 + i * 0.3, z + dz, { seg: 5 }); });
  sign(g, 'GOLGI GRILL', LIME, 0x1a6a40, 2.6, 0.65, S.in(0.1), 3.7, z, { ry: S.turn, border: 0xffffff });
}

function rollercoaster(g, S, z) {
  // the rough ER: a wavy ribbon of tube dotted with ribosomes
  var prev = null;
  for (var i = 0; i <= 12; i++) {
    var t = i / 12;
    var pz = z - 1.9 + t * 3.8;
    var py = 1.6 + Math.sin(t * Math.PI * 2) * 0.55;
    ball(g, 0.14, MINT, S.in(0.3), py, pz, { seg: 6, sy: 1 });
    if (i % 2 === 0) { ball(g, 0.12, ORANGE, S.in(0.3), py + 0.2, pz, { seg: 5 }); ball(g, 0.09, YEL, S.in(0.3), py + 0.34, pz, { seg: 5 }); }
    if (prev) { var d = Math.hypot(pz - prev[0], py - prev[1]); cyl(g, 0.1, 0.1, d + 0.02, MINT, S.in(0.3), (py + prev[1]) / 2, (pz + prev[0]) / 2, { rx: Math.atan2(pz - prev[0], py - prev[1]), seg: 5 }); }
    prev = [pz, py];
  }
  [-1.7, 1.7].forEach(function (dz) { cyl(g, 0.05, 0.05, 1.6, 0xe9fff4, S.in(0.3), 0.8, z + dz, { seg: 4 }); });
  face(g, S.in(0.2), 3.2, z, 0.5, S.turn, {});
  ball(g, 0.5, SKY, S.in(0.2), 3.2, z, { seg: 8 });
  sign(g, 'ER COASTER', PINK, 0xffffff, 2.5, 0.65, S.in(0.1), 4.4, z, { ry: S.turn, border: 0xffffff });
  box(g, 0.14, 0.3, 4, PINK, S.in(0.06), 0.15, z);
}

function bay(g, side, z, k) {
  var S = sideCtx(side);
  wallPanel(g, wallPicture(), side, z, H, 0.0, { r: 0.55 });
  if (k === 0) nucleus(g, S, z);
  else if (k === 1) mitochondria(g, S, z);
  else if (k === 2) golgi(g, S, z);
  else rollercoaster(g, S, z);
}

function center(g, z) {
  floorPanel(g, floorPicture(), z, 12);
  ceilingPanel(g, ceilingPicture(), z, 11.6, H);
}

function arch(g, z, i) {
  // a chain of glossy vesicles across the cell, with a few joined by a thread
  lightString(g, POP, H - 0.8, z, { n: 11, sag: 0.5, phase: i, r: 0.2 });
  [-1, 1].forEach(function (s, n) { ball(g, 0.34, POP[(i + n * 3) % 6], s * 4.6, H - 1.5, z, { seg: 8, op: 0.8 }); ball(g, 0.14, 0xffffff, s * 4.6, H - 1.5, z, { seg: 5 }); });
}

function organelle() {
  var m = new THREE.Group();
  ball(m, 0.6, PINK, 0, 1.4, 0, { seg: 10, sy: 0.95 });
  face(m, 0, 1.4, 0, 0.6, 0, { open: true });
  animated(m);
  bob(m, 0.2, 2.4, 0);
  pulse(m, 0.04, 3.0, 0);
  return m;
}

function extras() {
  var vesicle = combine([{ geo: new THREE.SphereGeometry(0.3, 9, 6), color: 0xffffff }, { geo: new THREE.SphereGeometry(0.12, 6, 4), color: 0xffffff, matrix: xform(0, 0, 0) }]);
  [-1, 1].forEach(function (side, i) {
    swarm({ geo: vesicle, material: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, transparent: true, opacity: 0.85 }), count: 14, seed: 6 + i, colors: POP, area: { x: [side * 4.5, side * 5.2], y: [0.6, 5.6], z: [-140, 8] }, k: 1, vz: [-3, -1], vy: [-0.3, 0.3], wobble: 0.3, scale: [0.7, 1.4] });
    swarm({ geo: dotGeo(0.25), material: glowMat(0.4), count: 14, seed: 40 + i, colors: [0xffffff, 0xd8fff0, 0xfff0d8], area: { x: [side * 4.7, side * 5.2], y: [0.8, 5.6], z: [-140, 8] }, k: 1, vy: [0.4, 1.0], wobble: 0.2, scale: [0.6, 1.4] });
    swarm({ geo: sparkleGeo(0.2), material: glowMat(0.9), count: 8, seed: 70 + i, colors: [0xffffff, 0xffe14a, 0xff7ac8], area: { x: [side * 4.4, side * 5.2], y: [1.0, 5.8], z: [-140, 8] }, k: 1, turn: 1.5, wobble: 0.1, scale: [0.7, 1.3] });
  });
  features(function () { return organelle(); }, { x: -5.0, spacing: 56, count: 3, z0: -24, yaw: Math.PI / 2 });
  features(function () { return organelle(); }, { x: 5.0, spacing: 56, count: 3, z0: -52, yaw: -Math.PI / 2 });
  // cytoplasm streams slowly along the walls
  var w = wallPicture();
  if (w) flow(w, 0.012, 0);
}

export var cellular = { id: 'cellular', indoor: true, bay: bay, center: center, arch: arch, extras: extras };
