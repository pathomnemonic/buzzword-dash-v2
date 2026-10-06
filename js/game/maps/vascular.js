/**
 * vascular.js — Vascular Rush: a splash-park water slide through the bloodstream.
 *
 * Every 16 units: a lifeguard tower manned by a white blood cell, a splash pad of grinning red blood cells, a snack bar
 * that sells clot cones to platelets, and a flow tube with rings to swim through. The walls shimmer with sunlit ripples
 * that slide past, the floor is a coral-pink slide with white flow arrows, and bunting hangs across. Moving: red
 * cells tumbling by, bubbles and platelet sparkles rising, ripples sliding on the walls, and a beach ball bobbing.
 */

import * as THREE from 'three';
import { box, cyl, ball, cone, ring, sign, bunting, combine, xform, canvasTex, floorPanel, ceilingPanel, wallPanel, sideCtx } from '../mapkit.js';
import { animated, features, bob, swarm, flow } from '../mapfx.js';
import { face, drop, sparkleGeo, dotGeo, glowMat } from './cartoon.js';

var H = 6.4;
var RED = 0xff4a5e;
var AQUA = 0x35d6e8;
var WHITE = 0xffffff;
var YEL = 0xffd23f;
var BLUE = 0x3d8bff;
var PINK = 0xff9ecb;
var FLAGS = [RED, WHITE, AQUA, YEL, PINK];

function wallPicture() {
  return canvasTex('vasc_wall', 1024, 410, function (ctx, w, h) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#ff9aa6'); g.addColorStop(0.55, '#ff7d8c'); g.addColorStop(1, '#ff5d73');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // sunlit ripples: light bands that wrap around the picture
    ctx.lineWidth = 5; ctx.lineCap = 'round';
    for (var r = 0; r < 7; r++) {
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.18 + (r % 3) * 0.08) + ')';
      ctx.beginPath();
      for (var x = 0; x <= w; x += 6) {
        var y = 30 + r * 42 + Math.sin((x / w) * Math.PI * 2 * (3 + (r % 3)) + r) * 14;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // faint cell silhouettes and sparkles
    for (var i = 0; i < 16; i++) { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.ellipse((i * 211) % w, 40 + (i * 83) % 230, 26, 17, i, 0, Math.PI * 2); ctx.fill(); }
    // a splash-park tile band at the bottom
    for (var c = 0; c < 32; c++) { ctx.fillStyle = c % 2 ? '#ffffff' : '#35d6e8'; ctx.fillRect(c * 32, h - 56, 32, 28); ctx.fillStyle = c % 2 ? '#35d6e8' : '#ffffff'; ctx.fillRect(c * 32, h - 28, 32, 28); }
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(0, h - 62, w, 6);
  });
}

function floorPicture() {
  return canvasTex('vasc_floor', 576, 768, function (ctx, w, h) {
    var g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#ff6f86'); g.addColorStop(0.5, '#ff9aa8'); g.addColorStop(1, '#ff6f86');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // flow arrows pointing away down each lane
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    [-3, 0, 3].forEach(function (lx) {
      for (var y = 20; y < h; y += 128) {
        var cx = w / 2 + lx * 48;
        ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(cx + 22, y + 34); ctx.lineTo(cx + 8, y + 34); ctx.lineTo(cx + 8, y + 70); ctx.lineTo(cx - 8, y + 70); ctx.lineTo(cx - 8, y + 34); ctx.lineTo(cx - 22, y + 34); ctx.closePath(); ctx.fill();
      }
    });
    // lane lines and aqua rails
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    [-1.5, 1.5].forEach(function (lx) { ctx.fillRect(w / 2 + lx * 48 - 3, 0, 6, h); });
    ctx.fillStyle = '#35d6e8'; ctx.fillRect(0, 0, 14, h); ctx.fillRect(w - 14, 0, 14, h);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(14, 0, 4, h); ctx.fillRect(w - 18, 0, 4, h);
  });
}

function ceilingPicture() {
  return canvasTex('vasc_ceiling', 464, 640, function (ctx, w, h) {
    var g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#ff8aa0'); g.addColorStop(0.5, '#ffb3c0'); g.addColorStop(1, '#ff8aa0');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    for (var s = 0; s < 3; s++) { ctx.beginPath(); for (var y = 0; y <= h; y += 6) { var x = w * (0.25 + s * 0.25) + Math.sin((y / h) * Math.PI * 2 * 3 + s) * 24; if (y === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; for (var i = 0; i < 18; i++) { ctx.beginPath(); ctx.arc((i * 151) % w, (i * 109) % h, 3 + (i % 3), 0, Math.PI * 2); ctx.fill(); }
  });
}

var _wallTex = null;

/** A red blood cell: a fat disc with a dimple and, on the side facing the runner, a face. */
function bloodCell(g, S, x, y, z, s, withFace) {
  cyl(g, 0.55 * s, 0.55 * s, 0.26 * s, RED, x, y, z, { rz: Math.PI / 2, seg: 12 });
  ring(g, 0.5 * s, 0.14 * s, 0xff6a7c, x, y, z, { ry: Math.PI / 2, seg: 10, tube: 4 });
  if (withFace) face(g, x, y, z, 0.55 * s, S.turn, { open: true });
}

function lifeguard(g, S, z) {
  var x = S.in(0.3);
  [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]].forEach(function (p) { cyl(g, 0.06, 0.06, 2.6, WHITE, x + p[0] * 0.5, 1.3, z + p[1], { seg: 5 }); });
  box(g, 0.9, 0.12, 1.0, BLUE, x, 2.6, z);
  box(g, 0.1, 0.9, 1.0, BLUE, x + S.side * 0.42, 3.0, z);
  box(g, 1.2, 0.08, 1.3, RED, x, 3.65, z, { rz: 0.0 });
  // the white blood cell on duty: a pale ball with a whistle, a visor and a sunny face
  ball(g, 0.5, 0xf4f0ff, x, 3.1, z, { seg: 12 });
  face(g, x, 3.1, z, 0.5, S.turn, { open: true });
  cyl(g, 0.2, 0.2, 0.04, YEL, x - S.side * 0.25, 3.5, z, { seg: 10 });
  ring(g, 0.34, 0.08, RED, S.in(0.2), 1.0, z + 1.4, { ry: Math.PI / 2, seg: 12, tube: 5 });
  ring(g, 0.34, 0.03, WHITE, S.in(0.2), 1.0, z + 1.4, { ry: Math.PI / 2, seg: 12, tube: 3 });
  sign(g, 'WBC LIFEGUARD', WHITE, RED, 2.4, 0.6, S.in(0.1), 4.9, z, { ry: S.turn, border: RED });
  // a ladder
  box(g, 0.06, 2.2, 0.06, YEL, x + 0.0, 1.2, z - 0.7, { rx: 0.1 });
}

function splashPad(g, S, z) {
  var x = S.in(0.5);
  [0, 1, 2].forEach(function (i) {
    var cz = z - 1.3 + i * 1.3;
    bloodCell(g, S, S.in(0.0), 0.6 + (i % 2) * 0.05, cz, 1.0 + (i === 1 ? 0.2 : 0), true);
    bloodCell(g, S, S.in(0.0), 1.55 + (i % 2) * 0.12, cz + 0.0, 0.8, false);
  });
  box(g, 0.2, 0.3, 4, AQUA, S.in(0.06), 0.15, z);
  sign(g, 'O₂ EXPRESS', AQUA, WHITE, 2.4, 0.65, S.in(0.1), 4.1, z, { ry: S.turn, border: WHITE });
  drop(g, 0.28, AQUA, x, 4.9, z - 1.2, {});
  drop(g, 0.28, AQUA, x, 4.9, z + 1.2, {});
}

function snackBar(g, S, z) {
  var x = S.in(0.45);
  box(g, 0.8, 1.0, 3.4, WHITE, x, 0.5, z);
  box(g, 0.84, 0.1, 3.5, RED, x, 1.05, z);
  // a striped awning
  for (var i = 0; i < 7; i++) box(g, 0.95, 0.07, 0.5, i % 2 ? WHITE : RED, S.in(0.35), 2.9 - 0.0, z - 1.5 + i * 0.5, { rz: S.side * 0.25 });
  [[-1.55], [1.55]].forEach(function (p) { cyl(g, 0.05, 0.05, 2.0, 0xe8e8f0, x, 1.9, z + p[0], { seg: 5 }); });
  // platelet cones: yellow scoops
  for (var c = 0; c < 4; c++) {
    cone(g, 0.18, 0.4, 0xe9b866, x, 1.3, z - 1.2 + c * 0.8, { seg: 6, rx: Math.PI });
    ball(g, 0.2, c % 2 ? YEL : PINK, x, 1.65, z - 1.2 + c * 0.8, { seg: 7 });
  }
  sign(g, 'CLOT CONES', YEL, RED, 2.6, 0.65, S.in(0.1), 4.4, z, { ry: S.turn, border: RED });
  ball(g, 0.3, 0xffffff, S.in(0.5), 0.3, z + 1.9, { seg: 6 });
}

function flowTube(g, S, z) {
  for (var i = 0; i < 3; i++) {
    var rz = z - 1.3 + i * 1.3;
    ring(g, 1.05, 0.2, i % 2 ? WHITE : AQUA, S.in(0.0), 1.2, rz, { ry: Math.PI / 2, seg: 16, tube: 6 });
  }
  box(g, 0.2, 0.3, 4, YEL, S.in(0.06), 0.15, z);
  sign(g, 'FLOW TUBE', BLUE, WHITE, 2.4, 0.65, S.in(0.1), 4.1, z, { ry: S.turn, border: WHITE });
  cone(g, 0.3, 0.7, YEL, S.in(0.35), 0.35, z - 1.7, { seg: 6 });
  cone(g, 0.3, 0.7, YEL, S.in(0.35), 0.35, z + 1.7, { seg: 6 });
}

function bay(g, side, z, k) {
  var S = sideCtx(side);
  if (!_wallTex) _wallTex = wallPicture();
  wallPanel(g, _wallTex, side, z, H, 0.0, { r: 0.7 });
  if (k === 0) lifeguard(g, S, z);
  else if (k === 1) splashPad(g, S, z);
  else if (k === 2) snackBar(g, S, z);
  else flowTube(g, S, z);
}

function center(g, z) {
  floorPanel(g, floorPicture(), z, 12);
  ceilingPanel(g, ceilingPicture(), z, 11.6, H);
}

function arch(g, z, i) {
  var b = bunting(10.4, FLAGS.slice(i % 2), 0.55, H - 0.6, z, 0.55);
  g.add(b);
  [-1, 1].forEach(function (s) { bloodCell(g, { turn: s < 0 ? Math.PI / 2 : -Math.PI / 2 }, s * 4.7, H - 1.7, z, 0.5, false); });
}

function beachBall() {
  var m = new THREE.Group();
  var stripes = canvasTex('vasc_beachball', 128, 64, function (ctx, w, h) {
    for (var s = 0; s < 8; s++) { ctx.fillStyle = ['#ff4a5e', '#ffffff', '#35d6e8', '#ffffff', '#ffd23f', '#ffffff', '#3d8bff', '#ffffff'][s]; ctx.fillRect(s * 16, 0, 16, h); }
  });
  var b = ball(m, 0.6, 0xffffff, 0, 1.0, 0, { map: stripes, r: 0.35, seg: 12 });
  if (!stripes) b.material = new THREE.MeshStandardMaterial({ color: RED });
  animated(m);
  bob(m, 0.18, 1.8, 0);
  return m;
}

function extras() {
  // red cells tumbling through on both sides: one instanced disc, tumbling about the way they are going
  var disc = combine([
    { geo: new THREE.CylinderGeometry(0.3, 0.3, 0.14, 12), color: 0xffffff, matrix: xform(0, 0, 0, 0, 0, Math.PI / 2) },
    { geo: new THREE.TorusGeometry(0.27, 0.07, 5, 12), color: 0xffffff, matrix: xform(0, 0, 0, 0, Math.PI / 2, 0) }
  ]);
  var cellMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, emissive: 0x551018, emissiveIntensity: 0.4 });
  [-1, 1].forEach(function (side, i) {
    swarm({ geo: disc, material: cellMat, count: 12, seed: 8 + i, colors: [RED, 0xff6a7c, 0xff3d52], area: { x: [side * 4.6, side * 5.2], y: [0.9, 5.6], z: [-140, 8] }, k: 1, vz: [-5, -2.5], turn: 1.4, wobble: 0.22, scale: [0.8, 1.5] });
    swarm({ geo: dotGeo(0.26), material: glowMat(0.4), count: 12, seed: 40 + i, colors: [0xffffff, 0xcff7ff, 0xffd6dd], area: { x: [side * 4.7, side * 5.2], y: [0.8, 5.6], z: [-140, 8] }, k: 1, vy: [0.4, 1.0], wobble: 0.2, scale: [0.6, 1.4] });
    swarm({ geo: sparkleGeo(0.2), material: glowMat(0.9), count: 8, seed: 70 + i, colors: [0xffe98a, 0xffffff, 0xffd0dc], area: { x: [side * 4.5, side * 5.2], y: [1.0, 5.6], z: [-140, 8] }, k: 1, turn: 1.5, wobble: 0.1, scale: [0.7, 1.3] });
  });
  features(beachBall, { x: -4.9, spacing: 56, count: 3, z0: -26 });
  features(beachBall, { x: 4.9, spacing: 56, count: 3, z0: -54 });
  // sunlit ripples slide along both walls
  if (_wallTex) flow(_wallTex, 0.02, 0);
}

export var vascular = { id: 'vascular', indoor: true, bay: bay, center: center, arch: arch, extras: extras };
