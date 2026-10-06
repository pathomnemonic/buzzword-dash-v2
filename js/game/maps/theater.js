/**
 * theater.js — Surgical Theater: an old-time playhouse where the operation is the show.
 *
 * Every 16 units: red velvet curtains with gold tassels under a chasing marquee, a balcony box full of applauding
 * scrubs, a rig of stage lights, and the snack bar with a popcorn machine and the Golden Scalpel trophy. The floor is a
 * red carpet with gold stars, the ceiling a painted dome. Moving: spotlight beams sweeping the walls, confetti and
 * rose petals falling, curtains swaying, and a marquee that chases its bulbs.
 */

import * as THREE from 'three';
import { box, cyl, ball, cone, ring, quad, sign, bulb, extrude, starShape, combine, canvasTex, floorPanel, ceilingPanel, wallPanel, sideCtx } from '../mapkit.js';
import { features, swarm, shimmer, sway } from '../mapfx.js';
import { face, lightString, sparkleGeo, glowMat } from './cartoon.js';

var H = 6.4;
var VELVET = 0xc4163a;
var DEEP = 0x8f0e2c;
var GOLD = 0xffc83d;
var CREAM = 0xfff1d6;
var TEAL = 0x2fd1c4;
var PINK = 0xff7aa8;
var SCRUB = 0x2fc4b8;

function wallPicture() {
  return canvasTex('thr_wall', 1024, 410, function (ctx, w, h) {
    ctx.fillStyle = '#7d0c26'; ctx.fillRect(0, 0, w, h);
    // velvet folds: 16 soft vertical bands, brighter in the middle of each
    for (var i = 0; i < 16; i++) {
      var x0 = i * 64;
      var g = ctx.createLinearGradient(x0, 0, x0 + 64, 0);
      g.addColorStop(0, '#6e0a22'); g.addColorStop(0.5, '#e0264d'); g.addColorStop(1, '#6e0a22');
      ctx.fillStyle = g; ctx.fillRect(x0, 0, 64, h);
    }
    // gold fringe and a swag along the top
    ctx.fillStyle = '#ffc83d'; ctx.fillRect(0, 0, w, 14);
    for (var t = 0; t < 64; t++) { ctx.fillRect(t * 16 + 3, 14, 3, 20); }
    ctx.fillStyle = 'rgba(255,200,61,0.9)';
    for (var s = 0; s < 4; s++) { ctx.beginPath(); ctx.moveTo(s * 256, 38); ctx.quadraticCurveTo(s * 256 + 128, 108, s * 256 + 256, 38); ctx.lineTo(s * 256 + 256, 48); ctx.quadraticCurveTo(s * 256 + 128, 118, s * 256, 48); ctx.fill(); }
    // wood panelling and a gold rail at the bottom
    ctx.fillStyle = '#5b2a1a'; ctx.fillRect(0, h - 96, w, 96);
    ctx.fillStyle = '#7a3a22'; for (var p = 0; p < 16; p++) ctx.fillRect(p * 64 + 6, h - 86, 52, 70);
    ctx.fillStyle = '#ffc83d'; ctx.fillRect(0, h - 100, w, 8);
  });
}

function floorPicture() {
  return canvasTex('thr_floor', 576, 768, function (ctx, w, h) {
    ctx.fillStyle = '#b3122f'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; for (var y = 0; y < h; y += 8) ctx.fillRect(0, y, w, 2);
    // gold stars down each lane
    ctx.fillStyle = 'rgba(255,200,61,0.85)';
    [-3, 0, 3].forEach(function (lx) {
      for (var y2 = 40; y2 < h; y2 += 192) {
        var cx = w / 2 + lx * 48;
        ctx.beginPath();
        for (var k = 0; k < 10; k++) { var rr = k % 2 ? 9 : 22; var a = -Math.PI / 2 + (k * Math.PI) / 5; ctx.lineTo(cx + Math.cos(a) * rr, y2 + Math.sin(a) * rr); }
        ctx.fill();
      }
    });
    ctx.fillStyle = '#ffc83d'; ctx.fillRect(0, 0, 16, h); ctx.fillRect(w - 16, 0, 16, h);
    ctx.fillStyle = '#fff1d6'; [-1.5, 1.5].forEach(function (lx) { ctx.fillRect(w / 2 + lx * 48 - 2, 0, 4, h); });
  });
}

function ceilingPicture() {
  return canvasTex('thr_ceiling', 464, 640, function (ctx, w, h) {
    ctx.fillStyle = '#fff1d6'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#ffc83d'; ctx.lineWidth = 6;
    for (var i = 0; i < 4; i++) { ctx.strokeRect(24, i * 160 + 20, w - 48, 120); ctx.beginPath(); ctx.arc(w / 2, i * 160 + 80, 38, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = '#c4163a'; ctx.beginPath(); ctx.arc(w / 2, i * 160 + 80, 14, 0, Math.PI * 2); ctx.fill(); }
  });
}

var _strips = {};
function marqueeTex(offset) {
  return canvasTex('thr_bulbs' + offset, 512, 40, function (ctx, w, h) {
    ctx.fillStyle = 'rgba(40,20,20,0.9)'; ctx.fillRect(0, 0, w, h);
    for (var i = 0; i < 16; i++) {
      if (i % 2 !== offset) continue;
      var x = (i + 0.5) * (w / 16);
      var halo = ctx.createRadialGradient(x, h / 2, 1, x, h / 2, 16);
      halo.addColorStop(0, '#ffffff'); halo.addColorStop(0.4, '#ffd24a'); halo.addColorStop(1, 'rgba(255,200,61,0)');
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, h / 2, 16, 0, Math.PI * 2); ctx.fill();
    }
  });
}
function stripMat(n) { var t = marqueeTex(n); return _strips[n] || (_strips[n] = bulb(0xffffff, { map: t, op: 0.99 })); }

function tassel(g, S, x, y, z) {
  cyl(g, 0.02, 0.02, 0.5, GOLD, x, y + 0.2, z, { seg: 3 });
  ball(g, 0.1, GOLD, x, y - 0.08, z, { seg: 6 });
  cone(g, 0.12, 0.4, GOLD, x, y - 0.35, z, { seg: 6, rx: Math.PI });
}

function curtains(g, S, z) {
  // tie-backs and tassels over the painted velvet, and a marquee with chasing bulbs
  [-1.4, 1.4].forEach(function (dz) {
    ring(g, 0.34, 0.07, GOLD, S.in(0.08), 2.3, z + dz, { ry: Math.PI / 2, seg: 10, tube: 4 });
    tassel(g, S, S.in(0.1), 2.0, z + dz);
  });
  box(g, 0.2, 0.9, 3.2, 0x40170d, S.in(0.1), 4.2, z);
  sign(g, 'NOW SHOWING', GOLD, VELVET, 3.0, 0.62, S.in(0.22), 4.4, z, { ry: S.turn, border: CREAM });
  [0, 1].forEach(function (n) { if (stripMat(n).map) quad(g, 3.2, 0.2, 0xffffff, S.in(0.22), 3.9, z, { ry: S.turn, mat: stripMat(n) }); });
  // a footlight row and a velvet rope low on the wall
  for (var i = 0; i < 5; i++) { ball(g, 0.1, 0xfff0a0, S.in(0.22), 0.18, z - 1.6 + i * 0.8, { seg: 5, bulb: true }); cyl(g, 0.04, 0.04, 0.34, GOLD, S.in(0.3), 0.17, z - 1.6 + i * 0.8, { seg: 4 }); }
  extrude(g, starShape(0.36, 0.17, 5), 0.06, GOLD, S.in(0.12), 5.4, z, { ry: S.turn, bulb: true, curve: 2 });
}

function seat(g, x, y, z, c) {
  box(g, 0.5, 0.18, 0.5, c, x, y, z);
  box(g, 0.1, 0.6, 0.5, c, x + 0.2, y + 0.3, z);
}

function balcony(g, S, z) {
  box(g, 0.9, 0.12, 3.6, 0x40170d, S.in(0.45), 1.45, z);
  box(g, 0.1, 0.55, 3.6, GOLD, S.in(0.88), 1.85, z);
  for (var i = 0; i < 6; i++) cyl(g, 0.03, 0.03, 0.55, GOLD, S.in(0.88), 1.85, z - 1.7 + i * 0.68, { seg: 3 });
  box(g, 0.9, 1.4, 3.6, DEEP, S.in(0.45), 0.7, z);
  // the audience: three scrubs, clapping, in the box
  [-1.1, 0, 1.1].forEach(function (dz, i) {
    var x = S.in(0.4);
    seat(g, x, 1.65, z + dz, VELVET);
    box(g, 0.34, 0.5, 0.34, [SCRUB, TEAL, 0x5fc8ff][i], x, 2.05, z + dz);
    ball(g, 0.24, 0xffd5b8, x, 2.5, z + dz, { seg: 8 });
    face(g, x, 2.5, z + dz, 0.24, S.turn, { open: i !== 1 });
    cone(g, 0.22, 0.22, [SCRUB, TEAL, 0x5fc8ff][i], x, 2.76, z + dz, { seg: 6 });
  });
  sign(g, 'BOX SEATS', CREAM, VELVET, 2.2, 0.55, S.in(0.1), 3.8, z, { ry: S.turn, border: GOLD });
  extrude(g, starShape(0.3, 0.14, 5), 0.06, GOLD, S.in(0.12), 4.7, z - 1.2, { ry: S.turn, bulb: true, curve: 2 });
  extrude(g, starShape(0.3, 0.14, 5), 0.06, GOLD, S.in(0.12), 4.7, z + 1.2, { ry: S.turn, bulb: true, curve: 2 });
}

function lights(g, S, z) {
  // a truss with three stage lights, aimed along the wall, and a floor-standing lamp
  box(g, 0.1, 0.1, 3.4, 0x3a3a48, S.in(0.15), 4.6, z);
  [-1.2, 0, 1.2].forEach(function (dz, i) {
    cyl(g, 0.1, 0.2, 0.5, 0x22222c, S.in(0.15), 4.35, z + dz, { seg: 8, rx: 0.3 });
    ball(g, 0.12, [GOLD, PINK, TEAL][i], S.in(0.15), 4.1, z + dz + 0.1, { seg: 5, bulb: true });
    cyl(g, 0.03, 0.03, 0.4, 0x3a3a48, S.in(0.15), 4.85, z + dz, { seg: 3 });
  });
  cyl(g, 0.06, 0.06, 2.4, 0x22222c, S.in(0.5), 1.2, z - 1.5, { seg: 5 });
  cone(g, 0.3, 0.5, GOLD, S.in(0.5), 2.55, z - 1.5, { seg: 8, rz: Math.PI });
  cyl(g, 0.06, 0.06, 2.4, 0x22222c, S.in(0.5), 1.2, z + 1.5, { seg: 5 });
  cone(g, 0.3, 0.5, PINK, S.in(0.5), 2.55, z + 1.5, { seg: 8, rz: Math.PI });
  sign(g, 'ON AIR', VELVET, CREAM, 1.6, 0.55, S.in(0.1), 3.4, z, { ry: S.turn, border: CREAM });
  box(g, 0.14, 0.3, 4, GOLD, S.in(0.06), 0.15, z);
}

function snacks(g, S, z) {
  var x = S.in(0.4);
  // the popcorn machine: a glass cabinet with a striped roof, heaped with popcorn
  box(g, 0.8, 0.9, 1.2, VELVET, x, 0.45, z - 1.1);
  box(g, 0.74, 0.9, 1.1, 0xf4fbff, x, 1.35, z - 1.1, { op: 0.4 });
  for (var p = 0; p < 6; p++) ball(g, 0.14, 0xfff6c8, x - 0.1 + (p % 2) * 0.15, 1.05 + (p % 3) * 0.28, z - 1.4 + (p % 3) * 0.3, { seg: 5 });
  cone(g, 0.62, 0.45, GOLD, x, 2.05, z - 1.1, { seg: 4, ry: Math.PI / 4 });
  // a stack of striped popcorn buckets
  [0.0, 0.5].forEach(function (dy, i) {
    cyl(g, 0.33 - i * 0.04, 0.26 - i * 0.04, 0.5, i ? CREAM : VELVET, x, 0.25 + dy, z + 0.4, { seg: 8 });
    ball(g, 0.22, 0xfff6c8, x, 0.55 + dy, z + 0.4, { seg: 6 });
  });
  // the Golden Scalpel trophy
  cyl(g, 0.3, 0.36, 0.2, 0x40170d, S.in(0.4), 0.1, z + 1.4, { seg: 8 });
  cyl(g, 0.05, 0.1, 0.9, GOLD, S.in(0.4), 0.65, z + 1.4, { seg: 6, m: 0.6, r: 0.3 });
  cone(g, 0.12, 0.5, GOLD, S.in(0.4), 1.35, z + 1.4, { seg: 4, m: 0.6, r: 0.3 });
  sign(g, 'GOLDEN SCALPEL', GOLD, VELVET, 2.8, 0.6, S.in(0.1), 3.6, z, { ry: S.turn, border: CREAM });
}

function bay(g, side, z, k) {
  var S = sideCtx(side);
  wallPanel(g, wallPicture(), side, z, H, 0.0, { r: 0.85 });
  if (k === 0) curtains(g, S, z);
  else if (k === 1) balcony(g, S, z);
  else if (k === 2) lights(g, S, z);
  else snacks(g, S, z);
}

function center(g, z) {
  floorPanel(g, floorPicture(), z, 12);
  ceilingPanel(g, ceilingPicture(), z, 11.6, H);
}

function arch(g, z, i) {
  // a swag of velvet with gold tassels, a chandelier of little bulbs, and a mask at each side
  lightString(g, [GOLD, 0xfff0a0, PINK, TEAL], H - 0.6, z, { n: 13, sag: 0.7, phase: i });
  for (var t = 0; t < 7; t++) { var x = -4.8 + t * 1.6; tassel(g, null, x, H - 0.7 - Math.sin((t / 6) * Math.PI) * 0.7, z); }
  cyl(g, 0.02, 0.02, 1.0, GOLD, 0, H - 0.5, z, { seg: 3 });
  ring(g, 0.5, 0.05, GOLD, 0, H - 1.4, z, { rx: Math.PI / 2, seg: 14, tube: 4 });
  for (var c = 0; c < 6; c++) { var a = (c / 6) * Math.PI * 2; ball(g, 0.07, 0xfff0a0, Math.cos(a) * 0.5, H - 1.3, z + Math.sin(a) * 0.5, { seg: 4, bulb: true }); }
  [-1, 1].forEach(function (s, n) { ball(g, 0.28, n ? CREAM : GOLD, s * 4.6, H - 1.5, z, { seg: 8, sz: 0.4 }); });
}

function beam(color) {
  var m = new THREE.Group();
  var geo = new THREE.ConeGeometry(1.1, 5.2, 12, 1, true);
  var cone3 = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  cone3.position.y = -2.6;
  m.add(cone3);
  m.position.y = H - 0.4;
  keep(m);
  return m;
}
function keep(obj) { obj.traverse(function (o) { o.userData.noMerge = true; }); }

function spotlight(color, side) {
  var holder = new THREE.Group();
  var b = beam(color);
  holder.add(b);
  sway(b, 'x', 0.5, 0.9, side * 1.7);
  return holder;
}

function extras() {
  [-1, 1].forEach(function (side, i) {
    swarm({ geo: confettiGeo(), material: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }), count: 22, seed: 9 + i, colors: [GOLD, PINK, TEAL, 0xffffff, VELVET], area: { x: [side * 4.4, side * 5.3], y: [0.6, 6.0], z: [-140, 8] }, k: 1, vy: [-1.2, -0.6], vx: [-0.2, 0.2], wobble: 0.25, turn: 2.0, scale: [0.7, 1.3] });
    swarm({ geo: sparkleGeo(0.2), material: glowMat(0.9), count: 10, seed: 55 + i, colors: [0xfff0a0, 0xffffff, 0xffc0d8], area: { x: [side * 4.4, side * 5.2], y: [1.0, 5.8], z: [-140, 8] }, k: 1, turn: 1.4, wobble: 0.1, scale: [0.7, 1.3] });
  });
  features(function (n) { return spotlight([GOLD, PINK, TEAL][n % 3], -1); }, { x: -4.9, spacing: 48, count: 4, z0: -24 });
  features(function (n) { return spotlight([TEAL, GOLD, PINK][n % 3], 1); }, { x: 4.9, spacing: 48, count: 4, z0: -48 });
  shimmer(stripMat(0), 0.55, 0.45, 3.0, 0);
  shimmer(stripMat(1), 0.55, 0.45, 3.0, Math.PI);
}

function confettiGeo() {
  var g = combine([{ geo: new THREE.PlaneGeometry(0.2, 0.12), color: 0xffffff }]);
  return g;
}

export var theater = { id: 'theater', indoor: true, bay: bay, center: center, arch: arch, extras: extras };
