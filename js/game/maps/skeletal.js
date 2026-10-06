/**
 * skeletal.js — Skeletal Corridor: the spooky-fun skeleton dance party, under a giant ribcage.
 *
 * Every 16 units: a DJ booth run by a skull in sunglasses, a patch of glowing jack-o'-lanterns and candy, a coffin photo
 * booth, and a rainbow rib xylophone. Giant rib arches span the hall (they are what the corridor is named for), strung
 * with lights and bats. The floor is a purple-and-black checker with orange lane lines, the ceiling a night sky with a
 * big grinning moon. Moving: skeletons dancing along the walls, bats and friendly ghosts floating by, glowing sparkles.
 */

import * as THREE from 'three';
import { box, cyl, ball, cone, ring, sign, extrude, starShape, combine, xform, canvasTex, floorPanel, ceilingPanel, wallPanel, sideCtx, kitAt } from '../mapkit.js';
import { animated, features, swarm, sway, bob } from '../mapfx.js';
import { face, lightString, sparkleGeo, glowMat, neonSign } from './cartoon.js';

var H = 6.4;
var BONE = 0xf7f0dc;
var DEEP = 0x3a1a7a;
var ORANGE = 0xff8a1f;
var LIME = 0x8dea3a;
var PINK = 0xff5fc0;
var TEAL = 0x2fe0cf;
var NEON = [ORANGE, LIME, PINK, TEAL, 0xffe14a];

function wallPicture() {
  return canvasTex('skel_wall', 1024, 410, function (ctx, w, h) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#4a2490'); g.addColorStop(0.7, '#7a3fd0'); g.addColorStop(1, '#9a5ae8');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // a big friendly moon, stars, and bat silhouettes
    ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.arc(w * 0.62, 110, 62, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,200,80,0.45)'; ctx.beginPath(); ctx.arc(w * 0.62 + 18, 96, 14, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(w * 0.62 - 22, 128, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; for (var s = 0; s < 30; s++) { ctx.fillRect((s * 233) % w, 20 + (s * 71) % 200, 3, 3); }
    ctx.fillStyle = '#2a1060';
    [[0.15, 80], [0.38, 150], [0.82, 60], [0.93, 170]].forEach(function (b) {
      var x = b[0] * w, y = b[1]; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - 24, y - 20, x - 46, y + 4); ctx.quadraticCurveTo(x - 28, y + 2, x - 14, y + 14); ctx.lineTo(x, y + 6); ctx.lineTo(x + 14, y + 14); ctx.quadraticCurveTo(x + 28, y + 2, x + 46, y + 4); ctx.quadraticCurveTo(x + 24, y - 20, x, y); ctx.fill();
    });
    // cobweb in the top corners of the picture (it tiles, so there is one every 16 units)
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
    for (var r = 1; r <= 4; r++) { ctx.beginPath(); ctx.arc(0, 0, r * 28, 0, Math.PI / 2); ctx.stroke(); ctx.beginPath(); ctx.arc(w, 0, r * 28, Math.PI / 2, Math.PI); ctx.stroke(); }
    for (var a = 0; a <= 4; a++) { var an = (a / 4) * (Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(an) * 120, Math.sin(an) * 120); ctx.stroke(); ctx.beginPath(); ctx.moveTo(w, 0); ctx.lineTo(w - Math.cos(an) * 120, Math.sin(an) * 120); ctx.stroke(); }
    // orange and purple bunting band along the bottom
    for (var c = 0; c < 32; c++) { ctx.fillStyle = c % 2 ? '#ff8a1f' : '#2a1060'; ctx.fillRect(c * 32, h - 60, 32, 30); ctx.fillStyle = c % 2 ? '#2a1060' : '#ff8a1f'; ctx.fillRect(c * 32, h - 30, 32, 30); }
    ctx.fillStyle = '#8dea3a'; ctx.fillRect(0, h - 66, w, 6);
  });
}

function floorPicture() {
  return canvasTex('skel_floor', 576, 768, function (ctx, w, h) {
    for (var j = 0; j < 16; j++) for (var i = 0; i < 12; i++) { ctx.fillStyle = (i + j) % 2 ? '#8a52e0' : '#4a2490'; ctx.fillRect(i * 48, j * 48, 48, 48); }
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; for (var k = 0; k < 16; k++) ctx.fillRect(0, k * 48, w, 3);
    ctx.fillStyle = '#ff8a1f'; [-1.5, 1.5].forEach(function (lx) { ctx.fillRect(w / 2 + lx * 48 - 4, 0, 8, h); });
    // little white bones scattered between the tiles
    ctx.fillStyle = 'rgba(247,240,220,0.85)';
    for (var b = 0; b < 14; b++) { ctx.save(); ctx.translate(40 + ((b * 163) % (w - 80)), (b * 127) % h); ctx.rotate(b); ctx.fillRect(-14, -2.5, 28, 5); ctx.beginPath(); ctx.arc(-14, 0, 4.5, 0, Math.PI * 2); ctx.arc(14, 0, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    ctx.fillStyle = '#8dea3a'; ctx.fillRect(0, 0, 12, h); ctx.fillRect(w - 12, 0, 12, h);
  });
}

function ceilingPicture() {
  return canvasTex('skel_ceiling', 464, 640, function (ctx, w, h) {
    ctx.fillStyle = '#2a1466'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; for (var s = 0; s < 40; s++) ctx.fillRect((s * 131) % w, (s * 97) % h, 3, 3);
    ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.arc(w * 0.5, h * 0.3, 52, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2a1466'; ctx.beginPath(); ctx.arc(w * 0.5 - 14, h * 0.3 - 8, 6, 0, Math.PI * 2); ctx.arc(w * 0.5 + 14, h * 0.3 - 8, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2a1466'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(w * 0.5, h * 0.3 + 6, 24, 0.2, Math.PI - 0.2); ctx.stroke();
  });
}

function skull(g, x, y, z, r, turn, shades) {
  ball(g, r, BONE, x, y, z, { seg: 9 });
  box(g, r * 0.8, r * 0.5, r * 0.7, BONE, x, y - r * 0.85, z, { ry: turn });
  face(g, x, y, z, r, turn, { shades: shades, open: false });
}

function booth(g, S, z) {
  var x = S.in(0.4);
  box(g, 0.9, 1.0, 2.6, DEEP, x, 0.5, z);
  box(g, 0.94, 0.08, 2.7, PINK, x, 1.04, z);
  [-0.7, 0.7].forEach(function (dz) { cyl(g, 0.34, 0.34, 0.1, 0x20202e, x + (S.side < 0 ? 0.4 : -0.4), 0.55, z + dz, { rz: Math.PI / 2, seg: 10 }); });
  skull(g, x, 1.8, z, 0.42, S.turn, true);
  ring(g, 0.46, 0.05, ORANGE, x, 1.85, z, { ry: Math.PI / 2, arc: Math.PI, rx: 0, seg: 8, tube: 3 });
  // two speaker stacks
  [-1.6, 1.6].forEach(function (dz, i) {
    box(g, 0.6, 2.2, 0.7, 0x20202e, S.in(0.3), 1.1, z + dz);
    cyl(g, 0.22, 0.22, 0.06, i ? TEAL : LIME, S.in(0.3) + (S.side < 0 ? 0.3 : -0.3), 0.6, z + dz, { rz: Math.PI / 2, seg: 9 });
    cyl(g, 0.16, 0.16, 0.06, 0xdddddd, S.in(0.3) + (S.side < 0 ? 0.3 : -0.3), 1.5, z + dz, { rz: Math.PI / 2, seg: 8 });
  });
  neonSign(g, 'DJ BONES', LIME, 0x2a1060, 2.4, 0.7, S.in(0.1), 4.4, z, { ry: S.turn });
  ball(g, 0.4, 0xffffff, S.in(0.1), 5.4, z, { seg: 8, e: 0xffffff, ei: 0.5 });
}

function pumpkin(g, S, x, y, z, s) {
  if (kitAt(g, 'hall/pumpkin_orange_jackolantern', { width: 0.9 * s, height: 0.8 * s, depth: 0.9 * s }, S.side, x, y, z, 0)) return;
  ball(g, 0.45 * s, ORANGE, S.in(x), y + 0.4 * s, z, { seg: 8, sy: 0.85, e: 0xff6a00, ei: 0.35 });
  cyl(g, 0.06 * s, 0.08 * s, 0.18 * s, LIME, S.in(x), y + 0.82 * s, z, { seg: 5 });
  face(g, S.in(x), y + 0.4 * s, z, 0.45 * s, S.turn, { open: true });
}

function patch(g, S, z) {
  pumpkin(g, S, 0.5, 0, z - 1.2, 1.2);
  pumpkin(g, S, 0.4, 0, z, 1.7);
  pumpkin(g, S, 0.5, 0, z + 1.3, 1.0);
  [-0.6, 0.7, 1.7].forEach(function (dz, i) { if (!kitAt(g, 'hall/candle_triple', { width: 0.4, height: 0.7, depth: 0.4 }, S.side, 0.25, 1.0 + i * 0.0, z + dz - 0.0, 0)) { cyl(g, 0.07, 0.07, 0.35, 0xfff0d0, S.in(0.1), 3.1, z + dz, { seg: 5 }); ball(g, 0.07, 0xffc040, S.in(0.1), 3.4, z + dz, { seg: 4, bulb: true }); } });
  box(g, 0.14, 0.3, 4, ORANGE, S.in(0.06), 0.15, z);
  // a candy bowl and a lantern sign
  cyl(g, 0.3, 0.22, 0.2, PINK, S.in(0.8), 0.6, z - 1.9, { seg: 8 });
  for (var c = 0; c < 4; c++) ball(g, 0.08, NEON[c], S.in(0.8), 0.78, z - 1.9 + (c - 1.5) * 0.08, { seg: 4 });
  sign(g, 'TRICK OR TREAT', ORANGE, DEEP, 3.0, 0.65, S.in(0.1), 4.4, z, { ry: S.turn, border: LIME });
}

function photobooth(g, S, z) {
  var x = S.in(0.4);
  if (!kitAt(g, 'hall/coffin_decorated', { width: 1.0, height: 2.2, depth: 1.0 }, S.side, 0.5, 0, z, 0)) {
    box(g, 0.8, 2.0, 1.1, 0x6a3a22, x, 1.0, z);
    box(g, 0.6, 1.7, 0.08, 0x8a5a38, x + (S.side < 0 ? 0.4 : -0.4), 1.05, z, { rx: 0 });
    cone(g, 0.5, 0.4, 0x6a3a22, x, 2.2, z, { seg: 4 });
  }
  // curtains and a strip of bulbs
  [-1.1, 1.1].forEach(function (dz) { box(g, 0.14, 2.3, 0.9, VIOLET_CURTAIN, S.in(0.12), 1.15, z + dz); });
  for (var i = 0; i < 7; i++) ball(g, 0.09, NEON[i % 5], S.in(0.12), 2.5 + Math.sin(i) * 0.04, z - 1.5 + i * 0.5, { seg: 4, bulb: true });
  neonSign(g, 'SAY CHEESE', PINK, 0x2a1060, 2.5, 0.7, S.in(0.1), 3.9, z, { ry: S.turn });
  skull(g, S.in(0.5), 2.7, z, 0.26, S.turn, false);
  // a stand of bone-white flags
  for (var f = 0; f < 4; f++) cone(g, 0.2, 0.3, f % 2 ? BONE : ORANGE, S.in(0.12), 4.9, z - 1.2 + f * 0.8, { seg: 3, rx: Math.PI });
}

var VIOLET_CURTAIN = 0xb04ae0;

function xylophone(g, S, z) {
  var cols = [0xff4d5a, ORANGE, 0xffe14a, LIME, TEAL, 0x5aa8ff, 0xb04ae0];
  for (var i = 0; i < 7; i++) {
    var len = 1.5 - i * 0.12;
    box(g, 0.2, 0.12, len, cols[i], S.in(0.5) , 0.85 + i * 0.0, z - 1.6 + i * 0.55, { rx: 0 });
    // each bar is a rib: a rounded bone with a ball at each end
    ball(g, 0.1, BONE, S.in(0.5), 0.85, z - 1.6 + i * 0.55 - len / 2, { seg: 5 });
    ball(g, 0.1, BONE, S.in(0.5), 0.85, z - 1.6 + i * 0.55 + len / 2, { seg: 5 });
  }
  [-1.7, 1.7].forEach(function (dz) { box(g, 0.1, 0.8, 0.1, 0x4a2490, S.in(0.5), 0.4, z + dz); });
  cyl(g, 0.02, 0.02, 0.9, 0xdddddd, S.in(0.8), 1.2, z - 1.8, { seg: 3, rx: 0.5 });
  ball(g, 0.1, PINK, S.in(0.8), 1.62, z - 1.99, { seg: 5 });
  if (!kitAt(g, 'hall/ribcage', { width: 1.0, height: 1.6, depth: 1.6 }, S.side, 0.2, 2.0, z, 0)) {
    for (var r = 0; r < 4; r++) ring(g, 0.5 - r * 0.04, 0.05, BONE, S.in(0.1), 2.7 + r * 0.22, z, { ry: Math.PI / 2, arc: Math.PI * 1.5, seg: 8, tube: 3 });
    cyl(g, 0.05, 0.05, 1.0, BONE, S.in(0.1), 2.9, z, { seg: 4 });
  }
  neonSign(g, 'RIB XYLOPHONE', TEAL, 0x2a1060, 3.0, 0.7, S.in(0.1), 4.7, z, { ry: S.turn });
}

function bay(g, side, z, k) {
  var S = sideCtx(side);
  wallPanel(g, wallPicture(), side, z, H, 0.0, { r: 0.85 });
  if (k === 0) booth(g, S, z);
  else if (k === 1) patch(g, S, z);
  else if (k === 2) photobooth(g, S, z);
  else xylophone(g, S, z);
}

function center(g, z) {
  floorPanel(g, floorPicture(), z, 12);
  ceilingPanel(g, ceilingPicture(), z, 11.6, H);
}

function arch(g, z, i) {
  // a giant rib arch spanning the hall, strung with lights, a bat and a pumpkin lantern at the top
  var c = NEON[i % 5];
  ring(g, 4.9, 0.14, BONE, 0, 0.9, z, { arc: Math.PI, seg: 22, tube: 5 });
  ring(g, 4.5, 0.09, c, 0, 0.9, z + 0.05, { arc: Math.PI, seg: 22, tube: 4, bulb: true });
  lightString(g, NEON, H - 1.0, z, { n: 11, sag: 0.4, phase: i, half: 4.4 });
  ball(g, 0.22, ORANGE, 0, 5.3, z, { seg: 7, e: 0xff6a00, ei: 0.5 });
  [-1, 1].forEach(function (s) { extrude(g, starShape(0.26, 0.12, 5), 0.05, c, s * 4.7, 4.7, z, { bulb: true, curve: 2 }); });
}

function dancer(n) {
  var m = new THREE.Group();
  var torso = new THREE.Group();
  cyl(torso, 0.08, 0.08, 0.9, BONE, 0, 1.35, 0, { seg: 5 });
  for (var r = 0; r < 4; r++) box(torso, 0.5 - r * 0.05, 0.07, 0.22, BONE, 0, 1.6 - r * 0.17, 0, {});
  box(torso, 0.5, 0.18, 0.28, BONE, 0, 0.88, 0);
  // the head: a skull with a party hat and sunglasses
  ball(torso, 0.26, BONE, 0, 2.05, 0, { seg: 8 });
  box(torso, 0.34, 0.16, 0.22, BONE, 0, 1.85, 0.0);
  box(torso, 0.4, 0.1, 0.06, 0x16161e, 0, 2.08, 0.22);
  cone(torso, 0.17, 0.4, NEON[n % 5], 0, 2.48, 0, { seg: 5 });
  animated(torso);
  sway(torso, 'z', 0.12, 3.0, n);
  m.add(torso);
  [-1, 1].forEach(function (d, i) {
    var arm = new THREE.Group();
    cyl(arm, 0.045, 0.045, 0.95, BONE, 0, -0.45, 0, { seg: 4 });
    ball(arm, 0.07, BONE, 0, -0.95, 0, { seg: 5 });
    arm.position.set(d * 0.3, 1.65, 0);
    animated(arm);
    sway(arm, 'z', 0.9, 3.0, n + (i ? Math.PI : 0));
    m.add(arm);
    var leg = new THREE.Group();
    cyl(leg, 0.055, 0.055, 0.85, BONE, 0, -0.42, 0, { seg: 4 });
    box(leg, 0.12, 0.07, 0.26, BONE, 0, -0.85, 0.08);
    leg.position.set(d * 0.13, 0.85, 0);
    animated(leg);
    sway(leg, 'x', 0.5, 3.0, n + (i ? Math.PI : 0));
    m.add(leg);
  });
  bob(m, 0.08, 6.0, n);
  return m;
}

function batGeo() {
  var wing = new THREE.Shape(); wing.moveTo(0, 0); wing.lineTo(0.5, 0.2); wing.lineTo(0.4, -0.05); wing.lineTo(0.28, 0.02); wing.lineTo(0.18, -0.12); wing.lineTo(0, -0.08); wing.closePath();
  return combine([
    { geo: new THREE.ShapeGeometry(wing), color: 0x2a1060 },
    { geo: new THREE.ShapeGeometry(wing), color: 0x2a1060, matrix: xform(0, 0, 0, 0, Math.PI, 0) },
    { geo: new THREE.SphereGeometry(0.1, 6, 4), color: 0x2a1060 }
  ]);
}

function ghostGeo() {
  return combine([
    { geo: new THREE.SphereGeometry(0.3, 8, 6), color: 0xffffff, matrix: xform(0, 0.3, 0) },
    { geo: new THREE.CylinderGeometry(0.3, 0.36, 0.5, 8, 1, true), color: 0xffffff, matrix: xform(0, 0.0, 0) },
    { geo: new THREE.SphereGeometry(0.05, 4, 3), color: 0x2a1060, matrix: xform(-0.11, 0.36, 0.26) },
    { geo: new THREE.SphereGeometry(0.05, 4, 3), color: 0x2a1060, matrix: xform(0.11, 0.36, 0.26) }
  ]);
}

function extras() {
  [-1, 1].forEach(function (side, i) {
    swarm({ geo: batGeo(), material: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }), count: 9, seed: 7 + i, colors: [0xffffff], area: { x: [side * 3.8, side * 5.2], y: [3.8, 5.8], z: [-140, 8] }, k: 1, vz: [-3, -1.5], face: true, flap: 0.8, wobble: 0.3, scale: [1.2, 1.8] });
    swarm({ geo: ghostGeo(), material: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, side: THREE.DoubleSide }), count: 6, seed: 25 + i, colors: [0xffffff, 0xe8d8ff], area: { x: [side * 4.7, side * 5.2], y: [1.0, 3.6], z: [-140, 8] }, k: 1, wobble: 0.3, turn: 0.4, scale: [1.0, 1.5] });
    swarm({ geo: sparkleGeo(0.2), material: glowMat(0.9), count: 12, seed: 60 + i, colors: [0xffe14a, 0x8dea3a, 0xff5fc0, 0x2fe0cf], area: { x: [side * 4.4, side * 5.2], y: [1.0, 5.8], z: [-140, 8] }, k: 1, turn: 1.5, wobble: 0.1, scale: [0.7, 1.4] });
  });
  features(dancer, { x: -5.0, spacing: 48, count: 4, z0: -22, yaw: Math.PI / 2 });
  features(function (n) { return dancer(n + 2); }, { x: 5.0, spacing: 48, count: 4, z0: -46, yaw: -Math.PI / 2 });
}

export var skeletal = { id: 'skeletal', indoor: true, bay: bay, center: center, arch: arch, extras: extras };
