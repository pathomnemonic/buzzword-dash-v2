/**
 * defib.js — Defibrillator Shock: an electric amusement park, all lightning-yellow and bumper cars.
 *
 * Every 16 units: three smiling Tesla coils, a bumper-car lot, the CLEAR! station with its giant paddles and a charge
 * meter, and a battery bar with bolt-shaped straws. The walls are sunshine yellow with hazard stripes and electric-blue
 * zigzags, the floor a steel arena with cyan lane lines, the ceiling a yellow grid of bulbs. Moving: bumper cars
 * cruising the walls, coils pulsing, static fuzz and little bolts drifting by. Nothing flashes faster than twice a
 * second, and every bolt is decoration well outside the lanes.
 */

import * as THREE from 'three';
import { box, cyl, ball, ring, sign, mat, combine, canvasTex, floorPanel, ceilingPanel, wallPanel, sideCtx } from '../mapkit.js';
import { animated, features, mover, swarm, shimmer, spin, bob } from '../mapfx.js';
import { face, bolt, lightString, sparkleGeo, glowMat, neonSign } from './cartoon.js';

var H = 6.4;
var YEL = 0xffe14a;
var BLUE = 0x2f9bff;
var CYAN = 0x7ff0ff;
var RED = 0xff4d5a;
var PINK = 0xff5fc0;
var LIME = 0xb6f04a;
var STEEL = 0x9fb4c8;
var DARK = 0x20243a;
var NEON = [YEL, BLUE, CYAN, PINK, LIME];

function wallPicture() {
  return canvasTex('defib_wall', 1024, 410, function (ctx, w, h) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#ffec6a'); g.addColorStop(1, '#ffd22a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // blue zigzag lightning running along the wall, and little bolts
    ctx.strokeStyle = '#2f9bff'; ctx.lineWidth = 12; ctx.lineJoin = 'miter'; ctx.beginPath();
    for (var x = 0; x <= w; x += 64) { ctx.lineTo(x, 120 + (x / 64 % 2 ? 40 : -40)); }
    ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.beginPath(); for (var x2 = 0; x2 <= w; x2 += 64) { ctx.lineTo(x2, 120 + (x2 / 64 % 2 ? 40 : -40)); } ctx.stroke();
    for (var i = 0; i < 8; i++) { var bx = 60 + i * 128, by = 250; ctx.fillStyle = 'rgba(47,155,255,0.5)'; ctx.beginPath(); ctx.moveTo(bx + 6, by - 24); ctx.lineTo(bx - 14, by + 2); ctx.lineTo(bx - 1, by + 2); ctx.lineTo(bx - 8, by + 24); ctx.lineTo(bx + 16, by - 6); ctx.lineTo(bx + 3, by - 6); ctx.fill(); }
    // black-and-yellow hazard band along the bottom
    ctx.fillStyle = '#20243a'; ctx.fillRect(0, h - 78, w, 78);
    ctx.fillStyle = '#ffe14a';
    for (var s = -2; s < 36; s++) { ctx.beginPath(); ctx.moveTo(s * 32, h - 78); ctx.lineTo(s * 32 + 20, h - 78); ctx.lineTo(s * 32 - 8, h); ctx.lineTo(s * 32 - 28, h); ctx.fill(); }
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, h - 84, w, 6);
  });
}

function floorPicture() {
  return canvasTex('defib_floor', 576, 768, function (ctx, w, h) {
    var g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#8fb0d0'); g.addColorStop(0.5, '#bcd6ee'); g.addColorStop(1, '#8fb0d0');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; for (var y = 0; y < h; y += 96) ctx.fillRect(0, y, w, 4);
    ctx.fillStyle = 'rgba(32,36,58,0.25)'; for (var d = 0; d < 20; d++) { ctx.beginPath(); ctx.arc(30 + (d * 151) % (w - 60), 20 + (d * 97) % h, 4, 0, 7); ctx.fill(); }
    // little bolts painted down the lanes
    ctx.fillStyle = 'rgba(255,225,74,0.9)';
    [-3, 0, 3].forEach(function (lx) { for (var q = 0; q < 6; q++) { var bx = w / 2 + lx * 48, by = 70 + q * 128; ctx.beginPath(); ctx.moveTo(bx + 6, by - 22); ctx.lineTo(bx - 12, by + 2); ctx.lineTo(bx - 1, by + 2); ctx.lineTo(bx - 7, by + 22); ctx.lineTo(bx + 14, by - 6); ctx.lineTo(bx + 3, by - 6); ctx.fill(); } });
    ctx.fillStyle = '#2f9bff'; [-1.5, 1.5].forEach(function (lx) { ctx.fillRect(w / 2 + lx * 48 - 4, 0, 8, h); });
    // hazard stripes along both edges
    [0, w - 22].forEach(function (x0) { for (var y3 = -30; y3 < h + 30; y3 += 44) { ctx.fillStyle = '#20243a'; ctx.fillRect(x0, y3, 22, 22); ctx.fillStyle = '#ffe14a'; ctx.fillRect(x0, y3 + 22, 22, 22); } });
  });
}

function ceilingPicture() {
  return canvasTex('defib_ceiling', 464, 640, function (ctx, w, h) {
    ctx.fillStyle = '#ffe96a'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(32,36,58,0.7)'; ctx.lineWidth = 5;
    for (var x = 0; x <= w; x += 116) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (var y = 0; y <= h; y += 128) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    for (var i = 0; i < 20; i++) { ctx.fillStyle = i % 2 ? '#ffffff' : '#7ff0ff'; ctx.beginPath(); ctx.arc((i % 4) * 116 + 58, Math.floor(i / 4) * 128 + 64, 9, 0, 7); ctx.fill(); }
  });
}

var _glow = null;
function glowMaterial() { return _glow || (_glow = mat(0xcff8ff, { e: 0x7ff0ff, ei: 0.8, r: 0.3 })); }

function coil(g, x, z, h, c, turn) {
  cyl(g, 0.4, 0.5, 0.3, DARK, x, 0.15, z, { seg: 6 });
  cyl(g, 0.22, 0.34, h, STEEL, x, 0.3 + h / 2, z, { seg: 6, m: 0.4, r: 0.3 });
  for (var i = 0; i < 3; i++) ring(g, 0.34 - i * 0.05, 0.05, i % 2 ? c : YEL, x, 0.6 + (i * h) / 3.4, z, { rx: Math.PI / 2, seg: 8, tube: 3 });
  ball(g, 0.4, 0xffffff, x, 0.4 + h, z, { mat: glowMaterial(), seg: 7 });
  face(g, x, 0.4 + h, z, 0.4, turn, { open: true });
}

function tesla(g, S, z) {
  coil(g, S.in(0.3), z - 1.3, 2.0, BLUE, S.turn);
  coil(g, S.in(0.3), z, 2.6, PINK, S.turn);
  coil(g, S.in(0.3), z + 1.3, 2.0, LIME, S.turn);
  // zigzag arcs between the tops, drawn as thin bolts
  [[-0.65, 2.5, 0.6], [0.65, 2.7, 0.6]].forEach(function (a) { bolt(g, a[2], CYAN, S.in(0.3), a[1], z + a[0], { ry: S.turn, rz: a[0] > 0 ? 1.57 : -1.57 }); });
  box(g, 0.14, 0.3, 4, YEL, S.in(0.06), 0.15, z);
  neonSign(g, 'TESLA TIME', CYAN, DARK, 2.6, 0.7, S.in(0.1), 4.5, z, { ry: S.turn });
}

function car(g, x, z, c, turn) {
  box(g, 0.8, 0.28, 1.3, c, x, 0.35, z);
  cyl(g, 0.42, 0.42, 0.1, DARK, x, 0.24, z, { seg: 7 });
  ball(g, 0.4, c, x, 0.62, z - 0.2, { seg: 7, sy: 0.7 });
  ball(g, 0.2, 0xffd5b8, x, 0.95, z - 0.2, { seg: 7 });
  face(g, x, 0.95, z - 0.2, 0.2, turn, { open: true });
  ball(g, 0.1, 0xffffff, x, 0.4, z + 0.68, { seg: 5, bulb: true });
  cyl(g, 0.02, 0.02, 2.1, DARK, x, 1.5, z + 0.3, { seg: 3 });
  ball(g, 0.07, YEL, x, 2.55, z + 0.3, { seg: 4, bulb: true });
}

function bumpers(g, S, z) {
  car(g, S.in(0.5), z - 1.4, RED, S.turn);
  car(g, S.in(0.4), z, BLUE, S.turn);
  car(g, S.in(0.5), z + 1.4, PINK, S.turn);
  // tyres as bumpers
  [-1.9, 1.9].forEach(function (dz) { ring(g, 0.26, 0.12, DARK, S.in(0.85), 0.2, z + dz, { rx: Math.PI / 2, seg: 7, tube: 3 }); });
  sign(g, 'BUMPER CARS', YEL, DARK, 2.6, 0.65, S.in(0.1), 3.9, z, { ry: S.turn, border: 0xffffff });
  bolt(g, 0.8, BLUE, S.in(0.12), 4.9, z, { ry: S.turn });
}

function paddle(g, x, z, turn, c) {
  cyl(g, 0.09, 0.09, 1.5, DARK, x, 0.75, z, { seg: 6 });
  cyl(g, 0.5, 0.5, 0.18, STEEL, x, 1.7, z, { rz: Math.PI / 2, seg: 10, m: 0.3, r: 0.35 });
  cyl(g, 0.36, 0.36, 0.2, c, x, 1.7, z, { rz: Math.PI / 2, seg: 8 });
  bolt(g, 0.5, 0xffffff, x + (turn > 0 ? -0.12 : 0.12), 1.7, z, { ry: turn });
}

function clearStation(g, S, z) {
  paddle(g, S.in(0.4), z - 1.2, S.turn, RED);
  paddle(g, S.in(0.4), z + 1.2, S.turn, BLUE);
  // the charge meter: a column of lit bars that climbs from green to red
  [LIME, LIME, YEL, YEL, 0xff9a2a, RED].forEach(function (c, i) { box(g, 0.2, 0.22, 0.8, c, S.in(0.15), 1.4 + i * 0.28, z, { }); });
  box(g, 0.24, 2.0, 0.9, DARK, S.in(0.08), 2.0, z);
  neonSign(g, 'CLEAR!', RED, 0x20243a, 2.2, 0.8, S.in(0.1), 4.5, z, { ry: S.turn });
  sign(g, '200 J', 0xffffff, DARK, 1.0, 0.4, S.in(0.1), 3.5, z, { ry: S.turn });
}

function battery(g, x, z, c, turn) {
  cyl(g, 0.4, 0.4, 1.5, c, x, 0.75, z, { seg: 7 });
  cyl(g, 0.4, 0.4, 0.4, 0xdfe6ee, x, 1.7, z, { seg: 7 });
  cyl(g, 0.14, 0.14, 0.16, 0xdfe6ee, x, 2.0, z, { seg: 5 });
  face(g, x, 0.9, z, 0.4, turn, { open: true });
}

function batteryBar(g, S, z) {
  [[-1.3, LIME], [0, YEL], [1.3, PINK]].forEach(function (b) { battery(g, S.in(0.35), z + b[0], b[1], S.turn); });
  [-0.65, 0.65].forEach(function (dz) { bolt(g, 0.4, YEL, S.in(0.8), 0.6, z + dz, { ry: S.turn }); });
  sign(g, 'RECHARGE BAR', LIME, DARK, 2.8, 0.62, S.in(0.1), 3.8, z, { ry: S.turn, border: 0xffffff });
  box(g, 0.14, 0.3, 4, BLUE, S.in(0.06), 0.15, z);
}

function bay(g, side, z, k) {
  var S = sideCtx(side);
  wallPanel(g, wallPicture(), side, z, H, 0.0, { r: 0.7 });
  if (k === 0) tesla(g, S, z);
  else if (k === 1) bumpers(g, S, z);
  else if (k === 2) clearStation(g, S, z);
  else batteryBar(g, S, z);
}

function center(g, z) {
  floorPanel(g, floorPicture(), z, 12);
  ceilingPanel(g, ceilingPicture(), z, 11.6, H);
}

function arch(g, z, i) {
  lightString(g, NEON, H - 0.6, z, { n: 13, sag: 0.5, phase: i });
  [-1, 1].forEach(function (s, n) { bolt(g, 1.0, NEON[(i + n) % 5], s * 4.6, H - 1.5, z, {}); });
  bolt(g, 1.0, i % 2 ? CYAN : PINK, 0, H - 1.5, z, {});
}

function cruiser(c) {
  var m = new THREE.Group();
  car(m, 0, 0, c, 0);
  animated(m);
  bob(m, 0.05, 6.0, 0);
  return m;
}

function bigCoil() {
  var m = new THREE.Group();
  cyl(m, 0.5, 0.6, 0.4, DARK, 0, 0.2, 0, { seg: 8 });
  cyl(m, 0.3, 0.45, 3.4, STEEL, 0, 2.0, 0, { seg: 8, m: 0.4, r: 0.3 });
  var rings = new THREE.Group();
  for (var i = 0; i < 3; i++) ring(rings, 0.55 - i * 0.07, 0.07, i % 2 ? BLUE : YEL, 0, 1.2 + i * 0.9, 0, { rx: Math.PI / 2, seg: 12, tube: 4 });
  animated(rings);
  spin(rings, 'y', 1.6, 0);
  m.add(rings);
  ball(m, 0.55, 0xffffff, 0, 4.2, 0, { mat: glowMaterial(), seg: 10 });
  face(m, 0, 4.2, 0, 0.55, 0, { open: true });
  animated(m);
  return m;
}

function extras() {
  [[-1, RED], [1, BLUE]].forEach(function (p, i) {
    var cr = cruiser(p[1]);
    cr.position.set(p[0] * 4.8, 0, -30 - i * 36);
    cr.rotation.y = p[0] < 0 ? Math.PI / 2 : -Math.PI / 2;
    mover(cr, { k: 1, vz: -6 - i * 2 });
  });
  var fuzz = combine([{ geo: new THREE.IcosahedronGeometry(0.2, 0), color: 0xffffff }, { geo: new THREE.IcosahedronGeometry(0.3, 0), color: 0xffffff }]);
  [-1, 1].forEach(function (side, i) {
    swarm({ geo: fuzz, material: glowMat(0.45), count: 12, seed: 5 + i, colors: [0xffffff, 0x7ff0ff, 0xffe14a], area: { x: [side * 4.6, side * 5.2], y: [0.6, 5.6], z: [-140, 8] }, k: 1, vy: [0.2, 0.6], wobble: 0.25, turn: 1.0, scale: [0.6, 1.4] });
    swarm({ geo: sparkleGeo(0.22), material: glowMat(0.9), count: 12, seed: 60 + i, colors: [0xffffff, 0xffe14a, 0x7ff0ff, 0xff5fc0], area: { x: [side * 4.4, side * 5.2], y: [1.0, 5.8], z: [-140, 8] }, k: 1, turn: 1.4, wobble: 0.1, scale: [0.7, 1.4] });
  });
  features(bigCoil, { x: -5.1, spacing: 56, count: 3, z0: -28, yaw: Math.PI / 2 });
  features(bigCoil, { x: 5.1, spacing: 56, count: 3, z0: -56, yaw: -Math.PI / 2 });
  shimmer(glowMaterial(), 0.8, 0.45, 2.8, 0);
}

export var defib = { id: 'defib', indoor: true, bay: bay, center: center, arch: arch, extras: extras };
