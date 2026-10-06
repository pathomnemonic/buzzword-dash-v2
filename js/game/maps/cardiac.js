/**
 * cardiac.js — Cardiac Pulse: a valentine carnival inside a very happy heart.
 *
 * Every 16 units: a heart-shaped photo wall with rose bushes, the swinging valve doors, an ECG arcade game that says
 * BEAT IT, and a pair of flowing red-and-blue vessel slides. The walls are pink brocade with hearts, the floor a heart
 * checker with a lub-dub line down the middle, the ceiling a sky of clouds. Moving: heart balloons rising, big hearts
 * thumping along the walls, a heartbeat line scrolling across the monitors and petals drifting.
 */

import * as THREE from 'three';
import { box, cyl, ball, cone, sign, extrude, heartShape, combine, xform, canvasTex, floorPanel, ceilingPanel, wallPanel, sideCtx, quad, bulb } from '../mapkit.js';
import { animated, features, swarm, pulse, flow } from '../mapfx.js';
import { face, bolt, lightString, sparkleGeo, glowMat, neonSign } from './cartoon.js';

var H = 6.4;
var RED = 0xff3d5e;
var PINK = 0xff8fb8;
var BLUSH = 0xffd0e0;
var ROSE = 0xe0245e;
var WHITE = 0xffffff;
var BLUE = 0x4f8cff;
var GOLD = 0xffd23f;
var HEARTS = [RED, PINK, ROSE, 0xff6a8a, WHITE];

function wallPicture() {
  return canvasTex('card_wall', 1024, 410, function (ctx, w, h) {
    ctx.fillStyle = '#ffc2d6'; ctx.fillRect(0, 0, w, h);
    // brocade: rows of hearts, offset every other row
    for (var r = 0; r < 5; r++) for (var c = 0; c < 16; c++) {
      var x = c * 64 + (r % 2 ? 32 : 0), y = 34 + r * 52;
      ctx.fillStyle = (r + c) % 2 ? 'rgba(255,255,255,0.55)' : 'rgba(255,61,94,0.35)';
      ctx.beginPath(); ctx.moveTo(x, y + 12); ctx.bezierCurveTo(x - 22, y - 6, x - 10, y - 22, x, y - 8); ctx.bezierCurveTo(x + 10, y - 22, x + 22, y - 6, x, y + 12); ctx.fill();
    }
    // a heartbeat line across the picture
    ctx.strokeStyle = '#ff3d5e'; ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.beginPath();
    ctx.moveTo(0, 250);
    for (var k = 0; k < 4; k++) { var x0 = k * 256; ctx.lineTo(x0 + 70, 250); ctx.lineTo(x0 + 90, 232); ctx.lineTo(x0 + 110, 250); ctx.lineTo(x0 + 140, 250); ctx.lineTo(x0 + 152, 290); ctx.lineTo(x0 + 168, 190); ctx.lineTo(x0 + 184, 300); ctx.lineTo(x0 + 198, 250); ctx.lineTo(x0 + 256, 250); }
    ctx.stroke();
    // red velvet wainscot with a gold rail
    ctx.fillStyle = '#c4163a'; ctx.fillRect(0, h - 92, w, 92);
    ctx.fillStyle = '#e0264d'; for (var p = 0; p < 16; p++) ctx.fillRect(p * 64 + 6, h - 82, 52, 66);
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(0, h - 98, w, 8);
  });
}

function floorPicture() {
  return canvasTex('card_floor', 576, 768, function (ctx, w, h) {
    for (var j = 0; j < 16; j++) for (var i = 0; i < 12; i++) { ctx.fillStyle = (i + j) % 2 ? '#fff0f5' : '#ffc2d6'; ctx.fillRect(i * 48, j * 48, 48, 48); }
    // a heart in the middle of each light tile on the lanes
    ctx.fillStyle = 'rgba(255,61,94,0.55)';
    for (var q = 0; q < 16; q += 2) for (var p = 1; p < 12; p += 4) { var x = p * 48 + 24, y = q * 48 + 26; ctx.beginPath(); ctx.moveTo(x, y + 10); ctx.bezierCurveTo(x - 16, y - 4, x - 8, y - 16, x, y - 6); ctx.bezierCurveTo(x + 8, y - 16, x + 16, y - 4, x, y + 10); ctx.fill(); }
    ctx.fillStyle = '#ff3d5e'; [-1.5, 1.5].forEach(function (lx) { ctx.fillRect(w / 2 + lx * 48 - 4, 0, 8, h); });
    ctx.fillStyle = '#c4163a'; ctx.fillRect(0, 0, 14, h); ctx.fillRect(w - 14, 0, 14, h);
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(14, 0, 4, h); ctx.fillRect(w - 18, 0, 4, h);
  });
}

function ceilingPicture() {
  return canvasTex('card_ceiling', 464, 640, function (ctx, w, h) {
    ctx.fillStyle = '#ffd6e4'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    [[0.25, 0.18], [0.72, 0.42], [0.3, 0.7], [0.8, 0.9]].forEach(function (p) { [[0, 0, 26], [28, 6, 20], [-28, 8, 18], [12, -12, 17]].forEach(function (b) { ctx.beginPath(); ctx.arc(p[0] * w + b[0], p[1] * h + b[1], b[2], 0, Math.PI * 2); ctx.fill(); }); });
    ctx.fillStyle = 'rgba(255,61,94,0.6)';
    for (var i = 0; i < 9; i++) { var x = (i * 151) % w, y = (i * 107) % h; ctx.beginPath(); ctx.moveTo(x, y + 9); ctx.bezierCurveTo(x - 14, y - 4, x - 7, y - 14, x, y - 5); ctx.bezierCurveTo(x + 7, y - 14, x + 14, y - 4, x, y + 9); ctx.fill(); }
  });
}

function ekgTex() {
  return canvasTex('card_ekg', 256, 64, function (ctx, w, h) {
    ctx.fillStyle = '#26102a'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#ff7aa8'; ctx.lineWidth = 3; ctx.shadowColor = '#ff7aa8'; ctx.shadowBlur = 6; ctx.beginPath();
    ctx.moveTo(0, 38); ctx.lineTo(52, 38); ctx.lineTo(64, 28); ctx.lineTo(76, 38); ctx.lineTo(96, 38); ctx.lineTo(104, 52); ctx.lineTo(114, 6); ctx.lineTo(124, 58); ctx.lineTo(134, 38); ctx.lineTo(256, 38); ctx.stroke();
  });
}

function heart(g, S, x, y, z, k, c, withFace) {
  var m = extrude(g, heartShape(k), 0.5 * k, c, x, y, z, { ry: S.turn, bevel: true, curve: 5 });
  if (withFace) face(g, x + (S.side < 0 ? 0.3 * k : -0.3 * k), y + 0.05 * k, z, 0.38 * k, S.turn, { open: true });
  return m;
}

function bush(g, S, z, n) {
  ball(g, 0.5, 0x3fbf5a, S.in(0.5), 0.45, z, { seg: 7, sy: 0.8 });
  for (var i = 0; i < n; i++) { var a = i * 2.2; ball(g, 0.13, i % 2 ? RED : PINK, S.in(0.5) + Math.cos(a) * 0.3 * (S.side < 0 ? 1 : -1), 0.7 + (i % 3) * 0.1, z + Math.sin(a) * 0.35, { seg: 5 }); }
}

function photoWall(g, S, z) {
  heart(g, S, S.in(0.1), 2.7, z, 3.0, PINK, false);
  heart(g, S, S.in(0.2), 2.7, z, 2.2, WHITE, false);
  heart(g, S, S.in(0.3), 2.7, z, 1.4, RED, true);
  bush(g, S, z - 1.4, 5); bush(g, S, z + 1.4, 5);
  box(g, 0.14, 0.3, 4, ROSE, S.in(0.06), 0.15, z);
  sign(g, 'LUB-DUB LOVE', RED, WHITE, 2.8, 0.65, S.in(0.1), 4.9, z, { ry: S.turn, border: WHITE });
}

function valves(g, S, z) {
  var x = S.in(0.3);
  box(g, 0.4, 3.0, 0.2, GOLD, x, 1.5, z - 1.4);
  box(g, 0.4, 3.0, 0.2, GOLD, x, 1.5, z + 1.4);
  box(g, 0.4, 0.3, 3.0, GOLD, x, 3.1, z);
  // two saloon doors, ajar, each with a heart on it
  [-1, 1].forEach(function (d) {
    box(g, 0.1, 1.5, 1.2, d < 0 ? RED : PINK, x, 1.2, z + d * 0.62, { ry: d * 0.35, r: 0.4 });
    heart(g, { turn: S.turn, side: S.side }, x + (S.side < 0 ? 0.08 : -0.08), 1.3, z + d * 0.62, 0.5, WHITE, false);
  });
  sign(g, 'MITRAL VALVE', GOLD, ROSE, 2.7, 0.62, S.in(0.1), 4.3, z, { ry: S.turn, border: WHITE });
  cone(g, 0.3, 0.7, BLUSH, S.in(0.5), 0.35, z - 1.9, { seg: 6 });
  cone(g, 0.3, 0.7, BLUSH, S.in(0.5), 0.35, z + 1.9, { seg: 6 });
}

function arcade(g, S, z) {
  var x = S.in(0.4);
  box(g, 0.9, 2.6, 1.5, 0x3a1530, x, 1.3, z);
  var ekg = ekgTex();
  if (ekg) quad(g, 1.1, 0.8, 0xffffff, S.in(0.0) + (S.side < 0 ? 0.88 : -0.88), 1.9, z, { ry: S.turn, mat: bulb(0xffffff, { map: ekg }) });
  box(g, 0.5, 0.1, 1.3, ROSE, x + (S.side < 0 ? 0.35 : -0.35), 1.1, z);
  ball(g, 0.1, GOLD, x + (S.side < 0 ? 0.4 : -0.4), 1.25, z - 0.3, { seg: 5 });
  [0.15, 0.4, 0.65].forEach(function (dz, i) { ball(g, 0.08, [RED, GOLD, BLUE][i], x + (S.side < 0 ? 0.4 : -0.4), 1.17, z + dz, { seg: 5 }); });
  neonSign(g, 'BEAT IT!', PINK, 0x3a1530, 2.2, 0.7, S.in(0.1), 3.8, z, { ry: S.turn });
  bolt(g, 0.7, GOLD, S.in(0.12), 4.8, z, { ry: S.turn });
  [-1.7, 1.7].forEach(function (dz, i) { ball(g, 0.3, i ? RED : PINK, S.in(0.5), 0.3, z + dz, { seg: 7, sy: 0.75 }); });
}

function vessels(g, S, z) {
  [[-0.9, BLUE, 'O2 POOR'], [0.9, RED, 'O2 RICH']].forEach(function (p, i) {
    var x = S.in(0.4);
    cyl(g, 0.38, 0.38, 3.2, p[1], x, 1.6, z + p[0], { seg: 10, op: 0.8, e: p[1], ei: 0.25 });
    cyl(g, 0.42, 0.42, 0.14, WHITE, x, 0.1, z + p[0], { seg: 10 });
    cyl(g, 0.42, 0.42, 0.14, WHITE, x, 3.2, z + p[0], { seg: 10 });
    for (var a = 0; a < 3; a++) cone(g, 0.18, 0.4, WHITE, x + (S.side < 0 ? 0.36 : -0.36), 0.9 + a * 0.9, z + p[0], { seg: 3, rz: 0, ry: S.turn });
  });
  face(g, S.in(0.4), 1.9, z - 0.9, 0.38, S.turn, { open: true });
  face(g, S.in(0.4), 1.9, z + 0.9, 0.38, S.turn, {});
  sign(g, 'VESSEL SLIDES', RED, WHITE, 2.8, 0.62, S.in(0.1), 4.6, z, { ry: S.turn, border: WHITE });
  box(g, 0.14, 0.3, 4, ROSE, S.in(0.06), 0.15, z);
}

function bay(g, side, z, k) {
  var S = sideCtx(side);
  wallPanel(g, wallPicture(), side, z, H, 0.0, { r: 0.85 });
  if (k === 0) photoWall(g, S, z);
  else if (k === 1) valves(g, S, z);
  else if (k === 2) arcade(g, S, z);
  else vessels(g, S, z);
}

function center(g, z) {
  floorPanel(g, floorPicture(), z, 12);
  ceilingPanel(g, ceilingPicture(), z, 11.6, H);
}

function arch(g, z, i) {
  lightString(g, HEARTS, H - 0.6, z, { n: 13, sag: 0.55, phase: i });
  [-1, 1].forEach(function (s, n) { extrude(g, heartShape(0.9), 0.1, HEARTS[(i + n) % 4], s * 4.5, H - 1.5, z, { bulb: true, curve: 3 }); });
  extrude(g, heartShape(0.9), 0.1, i % 2 ? RED : PINK, 0, H - 1.4, z, { bulb: true, curve: 3 });
}

function bigHeart(n) {
  var m = new THREE.Group();
  var h = extrude(m, heartShape(2.2), 1.6, n % 2 ? RED : PINK, 0, 2.4, 0, { bevel: true, curve: 6 });
  h.rotation.y = 0;
  face(m, 0, 2.5, 0, 0.86, 0, { open: true, lash: n % 2 === 0 });
  animated(m);
  pulse(m, 0.09, 5.4, n);
  return m;
}

function heartBalloonGeo() {
  var geo = new THREE.ExtrudeGeometry(heartShape(0.7), { depth: 0.2, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1, curveSegments: 4 });
  geo.translate(0, 0, -0.1);
  return combine([{ geo: geo, color: 0xffffff }, { geo: new THREE.CylinderGeometry(0.008, 0.008, 1.0, 3), color: 0xdddddd, matrix: xform(0, -0.85, 0) }]);
}

function extras() {
  [-1, 1].forEach(function (side, i) {
    swarm({ geo: heartBalloonGeo(), count: 9, seed: 5 + i * 9, colors: HEARTS, area: { x: [side * 4.5, side * 5.1], y: [3.0, 5.4], z: [-140, 8] }, k: 1, wobble: 0.18, scale: [0.9, 1.3] });
    swarm({ geo: sparkleGeo(0.2), material: glowMat(0.9), count: 10, seed: 60 + i, colors: [0xffffff, 0xffd0e0, 0xffe98a], area: { x: [side * 4.4, side * 5.2], y: [1.0, 5.8], z: [-140, 8] }, k: 1, turn: 1.5, wobble: 0.1, scale: [0.7, 1.3] });
    var petal = combine([{ geo: new THREE.CircleGeometry(0.1, 5), color: 0xffffff }]);
    swarm({ geo: petal, material: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }), count: 22, seed: 80 + i, colors: [RED, PINK, ROSE, WHITE], area: { x: [side * 4.4, side * 5.3], y: [0.4, 6.0], z: [-140, 8] }, k: 1, vy: [-1.0, -0.5], wobble: 0.25, turn: 2.0, scale: [0.8, 1.5] });
  });
  features(bigHeart, { x: -5.0, spacing: 56, count: 3, z0: -26, yaw: Math.PI / 2 });
  features(function (n) { return bigHeart(n + 1); }, { x: 5.0, spacing: 56, count: 3, z0: -54, yaw: -Math.PI / 2 });
  var e = ekgTex();
  if (e) flow(e, 0.35, 0);
}

export var cardiac = { id: 'cardiac', indoor: true, bay: bay, center: center, arch: arch, extras: extras };
