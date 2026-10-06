/**
 * xray.js — X-Ray Vision: a glowing radiology disco, where every light box shows a skeleton having a great time.
 *
 * Every 16 units: a gallery of light boxes with cartoon x-rays (a grinning skull, a waving hand, a dancing rib cage), the
 * X-ray disco with its mirror ball and speakers, a CT scanner turned carnival ride, and a lead-apron boutique with a
 * camera that says SMILE. The walls glow white-blue, the floor is a light table with a cyan grid. Moving: mirror balls
 * spinning, skeleton hands waving, coloured beams sweeping the walls, floating bone confetti and sparkles.
 */

import * as THREE from 'three';
import { box, cyl, ball, ring, sign, quad, bulb, mat, combine, xform, canvasTex, floorPanel, ceilingPanel, wallPanel, sideCtx } from '../mapkit.js';
import { animated, features, swarm, sway, spin, shimmer } from '../mapfx.js';
import { face, bolt, lightString, sparkleGeo, glowMat, neonSign } from './cartoon.js';

var H = 6.4;
var CYAN = 0x39e6ff;
var BLUE = 0x2f7bff;
var PINK = 0xff5fc0;
var LIME = 0xb6f04a;
var BONE = 0xf3fbff;
var NAVY = 0x0d2a5a;
var NEON = [CYAN, PINK, LIME, 0xffe14a, BLUE];

function wallPicture() {
  return canvasTex('xray_wall', 1024, 410, function (ctx, w, h) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#b8ecff'); g.addColorStop(0.6, '#dff8ff'); g.addColorStop(1, '#ffffff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(47,123,255,0.18)'; ctx.lineWidth = 2;
    for (var x = 0; x <= w; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (var y = 0; y <= h; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    // big ghost bones in the wall
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 12; ctx.lineCap = 'round';
    for (var i = 0; i < 4; i++) { var cx = 128 + i * 256; ctx.beginPath(); ctx.moveTo(cx - 70, 120); ctx.lineTo(cx + 70, 200); ctx.stroke(); ctx.beginPath(); ctx.arc(cx - 70, 120, 11, 0, 7); ctx.arc(cx + 70, 200, 11, 0, 7); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill(); }
    // a neon cyan band along the bottom, with a row of little plus signs
    ctx.fillStyle = '#2f7bff'; ctx.fillRect(0, h - 70, w, 70);
    ctx.fillStyle = '#39e6ff'; ctx.fillRect(0, h - 76, w, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; for (var p = 0; p < 32; p++) { ctx.fillRect(p * 32 + 12, h - 44, 10, 3); ctx.fillRect(p * 32 + 15.5, h - 47.5, 3, 10); }
  });
}

function floorPicture() {
  return canvasTex('xray_floor', 576, 768, function (ctx, w, h) {
    var g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#cdefff'); g.addColorStop(0.5, '#eefaff'); g.addColorStop(1, '#cdefff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(47,123,255,0.4)'; ctx.lineWidth = 2;
    for (var x = 0; x <= w; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (var y = 0; y <= h; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.fillStyle = '#2f7bff'; [-1.5, 1.5].forEach(function (lx) { ctx.fillRect(w / 2 + lx * 48 - 4, 0, 8, h); });
    ctx.fillStyle = '#39e6ff'; ctx.fillRect(0, 0, 14, h); ctx.fillRect(w - 14, 0, 14, h);
    ctx.fillStyle = '#ff5fc0'; for (var k = 0; k < 8; k++) { ctx.beginPath(); ctx.arc(w / 2 - 72 + (k % 3) * 72, 60 + k * 90, 7, 0, 7); ctx.fill(); }
  });
}

function ceilingPicture() {
  return canvasTex('xray_ceiling', 464, 640, function (ctx, w, h) {
    ctx.fillStyle = '#e9fbff'; ctx.fillRect(0, 0, w, h);
    ctx.shadowBlur = 16;
    for (var i = 0; i < 4; i++) { ctx.shadowColor = i % 2 ? '#ff5fc0' : '#39e6ff'; ctx.fillStyle = i % 2 ? '#ffb8e4' : '#9ef4ff'; ctx.fillRect(40, i * 160 + 40, w - 80, 12); ctx.fillRect(40, i * 160 + 100, w - 80, 12); }
  });
}

/** A cartoon x-ray film: a dark blue sheet with a bright-lined skeleton. kind picks which part. */
function filmTex(kind) {
  return canvasTex('xray_film' + kind, 256, 352, function (ctx, w, h) {
    ctx.fillStyle = '#071d3d'; ctx.fillRect(0, 0, w, h);
    var g = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, h * 0.7); g.addColorStop(0, 'rgba(60,150,255,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#e6fbff'; ctx.fillStyle = '#e6fbff'; ctx.lineWidth = 9; ctx.lineCap = 'round';
    function bone(x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.beginPath(); ctx.arc(x1, y1, 9, 0, 7); ctx.arc(x2, y2, 9, 0, 7); ctx.fill(); }
    if (kind === 0) {
      // a grinning skull
      ctx.beginPath(); ctx.arc(w / 2, 130, 78, 0, 7); ctx.fill();
      ctx.fillRect(w / 2 - 44, 190, 88, 56);
      ctx.fillStyle = '#071d3d'; ctx.beginPath(); ctx.arc(w / 2 - 28, 126, 20, 0, 7); ctx.arc(w / 2 + 28, 126, 20, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(w / 2, 150); ctx.lineTo(w / 2 - 9, 172); ctx.lineTo(w / 2 + 9, 172); ctx.fill();
      ctx.fillRect(w / 2 - 38, 210, 76, 6); for (var t = -3; t <= 3; t++) ctx.fillRect(w / 2 + t * 11 - 2, 200, 4, 40);
      ctx.fillStyle = '#e6fbff'; ctx.font = '900 30px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('SAY AHH', w / 2, 316);
    } else if (kind === 1) {
      // a waving hand: palm and five fingers
      ctx.fillRect(w / 2 - 44, 186, 88, 90);
      [[-44, 186, -76, 80], [-22, 182, -30, 54], [0, 180, 0, 40], [22, 182, 30, 54], [44, 190, 82, 110]].forEach(function (f) { bone(w / 2 + f[0], f[1], w / 2 + f[2], f[3]); });
      bone(w / 2, 276, w / 2, 330);
      ctx.fillStyle = '#e6fbff'; ctx.font = '900 30px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('HI!', w / 2, 40);
    } else {
      // a rib cage and spine, with a smiling heart in the middle
      bone(w / 2, 40, w / 2, 320);
      for (var r = 0; r < 5; r++) { ctx.beginPath(); ctx.arc(w / 2, 90 + r * 40, 70 - r * 6, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); ctx.beginPath(); ctx.arc(w / 2, 90 + r * 40, 70 - r * 6, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke(); }
      ctx.fillStyle = '#ff5fa0'; ctx.beginPath(); ctx.moveTo(w / 2, 190); ctx.bezierCurveTo(w / 2 - 40, 156, w / 2 - 20, 130, w / 2, 152); ctx.bezierCurveTo(w / 2 + 20, 130, w / 2 + 40, 156, w / 2, 190); ctx.fill();
    }
  });
}

var _glow = null;
function boxLight() { return _glow || (_glow = mat(0xdff8ff, { e: 0xbff0ff, ei: 0.7, r: 0.4 })); }

function lightBoxes(g, S, z) {
  [-1.25, 0, 1.25].forEach(function (dz, i) {
    box(g, 0.14, 1.9, 1.1, 0xe8f6ff, S.in(0.05), 2.2, z + dz, { mat: boxLight() });
    var tex = filmTex(i);
    if (tex) quad(g, 0.9, 1.6, 0xffffff, S.in(0.15), 2.2, z + dz, { ry: S.turn, mat: bulb(0xffffff, { map: tex }) });
    else quad(g, 0.9, 1.6, NAVY, S.in(0.15), 2.2, z + dz, { ry: S.turn });
    box(g, 0.1, 0.08, 1.2, [CYAN, PINK, LIME][i], S.in(0.12), 3.2, z + dz, {});
  });
  box(g, 0.14, 0.3, 4, BLUE, S.in(0.06), 0.15, z);
  sign(g, 'LIGHT BOX GALLERY', BLUE, 0xffffff, 3.3, 0.62, S.in(0.1), 4.5, z, { ry: S.turn, border: CYAN });
  [-1.7, 1.7].forEach(function (dz, i) { ball(g, 0.3, i ? PINK : CYAN, S.in(0.5), 0.3, z + dz, { seg: 7, sy: 0.75 }); });
}

function disco(g, S, z) {
  box(g, 0.9, 0.3, 3.4, NAVY, S.in(0.4), 0.15, z);
  [-1.5, 1.5].forEach(function (dz, i) {
    box(g, 0.6, 2.0, 0.7, 0x16162a, S.in(0.35), 1.0, z + dz);
    cyl(g, 0.22, 0.22, 0.06, i ? PINK : CYAN, S.in(0.35) + (S.side < 0 ? 0.3 : -0.3), 0.6, z + dz, { rz: Math.PI / 2, seg: 9 });
    cyl(g, 0.15, 0.15, 0.06, 0xdddddd, S.in(0.35) + (S.side < 0 ? 0.3 : -0.3), 1.4, z + dz, { rz: Math.PI / 2, seg: 8 });
  });
  // coloured floor tiles in front of the stage
  [0, 1, 2].forEach(function (i) { box(g, 0.6, 0.06, 0.9, NEON[i], S.in(0.8), 0.33, z - 1.0 + i * 1.0); });
  neonSign(g, 'X-RAY DISCO', PINK, 0x0d2a5a, 3.0, 0.7, S.in(0.1), 3.9, z, { ry: S.turn });
  bolt(g, 0.8, 0xffe14a, S.in(0.12), 5.0, z - 1.3, { ry: S.turn });
  bolt(g, 0.8, 0xffe14a, S.in(0.12), 5.0, z + 1.3, { ry: S.turn });
}

function scanner(g, S, z) {
  // the gantry: a big white ring standing on the wall side, with colour segments, and a bed running through it
  ring(g, 1.1, 0.34, 0xffffff, S.in(0.0), 1.45, z, { seg: 18, tube: 6 });
  ring(g, 1.1, 0.35, CYAN, S.in(0.0), 1.45, z + 0.05, { seg: 18, tube: 4, arc: Math.PI * 0.7, rz: 0.3 });
  ring(g, 1.1, 0.35, PINK, S.in(0.0), 1.45, z + 0.05, { seg: 18, tube: 4, arc: Math.PI * 0.7, rz: Math.PI + 0.3 });
  box(g, 1.0, 0.18, 3.6, 0xf4fbff, S.in(0.3), 0.7, z + 0.2);
  box(g, 0.9, 0.5, 3.4, BLUE, S.in(0.3), 0.4, z + 0.2);
  // a patient in cheerful socks sticking out one end
  [-0.18, 0.18].forEach(function (d, i) { cyl(g, 0.1, 0.1, 0.4, [LIME, PINK][i], S.in(0.3) + d, 0.98, z + 1.9, { rx: Math.PI / 2, seg: 6 }); });
  ball(g, 0.24, 0xffd5b8, S.in(0.3), 0.98, z - 1.55, { seg: 8 });
  face(g, S.in(0.3), 0.98, z - 1.55, 0.24, 0, { open: true });
  sign(g, 'SCAN-A-RIDE', LIME, NAVY, 2.5, 0.62, S.in(0.1), 3.8, z, { ry: S.turn, border: 0xffffff });
}

function boutique(g, S, z) {
  // lead aprons on a rack: grey with a big yellow star
  box(g, 0.1, 0.1, 3.2, 0xdde8f0, S.in(0.45), 2.4, z);
  [-1.1, 0, 1.1].forEach(function (dz, i) {
    cyl(g, 0.02, 0.02, 0.3, 0xdde8f0, S.in(0.45), 2.2, z + dz, { seg: 3 });
    box(g, 0.1, 1.3, 0.8, [0x8fa4b8, 0x7f95a8, 0x9fb4c8][i], S.in(0.45), 1.5, z + dz);
    box(g, 0.12, 0.3, 0.3, 0xffe14a, S.in(0.38), 1.6, z + dz, {});
  });
  box(g, 0.1, 0.08, 3.4, CYAN, S.in(0.3), 0.04, z);
  // the camera on an arm
  cyl(g, 0.05, 0.05, 2.4, 0xdde8f0, S.in(0.8), 1.2, z + 1.8, { seg: 4 });
  box(g, 0.5, 0.4, 0.5, 0x22304a, S.in(0.8), 2.5, z + 1.8);
  cyl(g, 0.14, 0.14, 0.1, CYAN, S.in(0.8) + (S.side < 0 ? 0.28 : -0.28), 2.5, z + 1.8, { rz: Math.PI / 2, seg: 8 });
  sign(g, 'SMILE!', 0xffe14a, NAVY, 1.9, 0.62, S.in(0.1), 3.7, z, { ry: S.turn, border: 0xffffff });
  // a "radiation: fun" gauge
  ball(g, 0.55, 0xffffff, S.in(0.1), 4.7, z, { seg: 10, sz: 0.2 });
  box(g, 0.05, 0.4, 0.04, PINK, S.in(0.1) + (S.side < 0 ? 0.12 : -0.12), 4.75, z, { rz: 0.9 });
  sign(g, 'FUN LEVEL: MAX', LIME, NAVY, 2.3, 0.45, S.in(0.1), 5.5, z, { ry: S.turn });
}

function bay(g, side, z, k) {
  var S = sideCtx(side);
  wallPanel(g, wallPicture(), side, z, H, 0.0, { r: 0.7 });
  if (k === 0) lightBoxes(g, S, z);
  else if (k === 1) disco(g, S, z);
  else if (k === 2) scanner(g, S, z);
  else boutique(g, S, z);
}

function center(g, z) {
  floorPanel(g, floorPicture(), z, 12);
  ceilingPanel(g, ceilingPicture(), z, 11.6, H);
}

function arch(g, z, i) {
  lightString(g, NEON, H - 0.6, z, { n: 13, sag: 0.5, phase: i });
  [-1, 1].forEach(function (s, n) {
    cyl(g, 0.03, 0.03, 0.9, 0xdde8f0, s * 4.6, H - 0.9, z, { seg: 3 });
    quad(g, 0.55, 0.75, 0xffffff, s * 4.6, H - 1.7, z, { mat: bulb(0xffffff, { map: filmTex((i + n) % 3), side: THREE.DoubleSide }) });
  });
}

function discoBall() {
  var m = new THREE.Group();
  var tex = canvasTex('xray_mirror', 128, 64, function (ctx, w, h) { for (var y = 0; y < 8; y++) for (var x = 0; x < 16; x++) { ctx.fillStyle = (x + y) % 2 ? '#ffffff' : '#9fdcff'; ctx.fillRect(x * 8, y * 8, 8, 8); } });
  var b = ball(m, 0.7, 0xffffff, 0, 4.4, 0, { map: tex, r: 0.15, m: 0.6, e: 0x88ccff, ei: 0.25, seg: 12 });
  if (!tex) b.material = new THREE.MeshStandardMaterial({ color: 0xcfe8ff });
  cyl(m, 0.015, 0.015, 2.0, 0x888899, 0, 5.4, 0, { seg: 3 });
  animated(m);
  spin(m, 'y', 0.9, 0);
  return m;
}

function skeletonHand() {
  var m = new THREE.Group();
  box(m, 0.5, 0.45, 0.14, BONE, 0, 0.0, 0);
  [[-0.2, 0.38, 0.0], [-0.07, 0.48, 0.0], [0.07, 0.5, 0.0], [0.2, 0.44, 0.0]].forEach(function (f) { cyl(m, 0.05, 0.05, 0.5, BONE, f[0], f[1] + 0.22, 0, { seg: 4 }); ball(m, 0.06, BONE, f[0], f[1] + 0.48, 0, { seg: 4 }); });
  cyl(m, 0.05, 0.05, 0.4, BONE, 0.32, 0.08, 0, { seg: 4, rz: -0.9 });
  cyl(m, 0.07, 0.07, 1.4, BONE, 0, -0.95, 0, { seg: 5 });
  m.position.y = 2.4;
  var holder = new THREE.Group();
  holder.add(m);
  animated(m);
  sway(m, 'z', 0.5, 3.2, 0);
  return holder;
}

function sweep(color, side) {
  var outer = new THREE.Group();
  var m = new THREE.Group();
  var c = new THREE.Mesh(new THREE.ConeGeometry(1.0, 5.2, 12, 1, true), new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  c.position.y = -2.6;
  m.add(c);
  m.position.y = H - 0.4;
  outer.add(m);
  outer.traverse(function (o) { o.userData.noMerge = true; });
  sway(m, 'x', 0.5, 0.9, side * 1.7);
  return outer;
}

function extras() {
  var boneGeo = combine([{ geo: new THREE.CapsuleGeometry(0.04, 0.2, 2, 4), color: 0xffffff, matrix: xform(0, 0, 0, 0, 0, Math.PI / 2) }, { geo: new THREE.SphereGeometry(0.07, 4, 3), color: 0xffffff, matrix: xform(-0.16, 0, 0) }, { geo: new THREE.SphereGeometry(0.07, 4, 3), color: 0xffffff, matrix: xform(0.16, 0, 0) }]);
  [-1, 1].forEach(function (side, i) {
    swarm({ geo: boneGeo, material: new THREE.MeshBasicMaterial({ vertexColors: true }), count: 18, seed: 5 + i, colors: [0xffffff, 0xcfeeff, 0xffd0ec], area: { x: [side * 4.4, side * 5.3], y: [0.4, 6.0], z: [-140, 8] }, k: 1, vy: [-1.0, -0.4], wobble: 0.2, turn: 1.6, scale: [1, 1.8] });
    swarm({ geo: sparkleGeo(0.22), material: glowMat(0.9), count: 12, seed: 60 + i, colors: [0xffffff, 0x39e6ff, 0xff5fc0, 0xb6f04a], area: { x: [side * 4.4, side * 5.2], y: [1.0, 5.8], z: [-140, 8] }, k: 1, turn: 1.5, wobble: 0.1, scale: [0.7, 1.4] });
  });
  features(discoBall, { x: -4.9, spacing: 48, count: 4, z0: -16 });
  features(discoBall, { x: 4.9, spacing: 48, count: 4, z0: -40 });
  features(skeletonHand, { x: -5.2, spacing: 64, count: 3, z0: -48, yaw: Math.PI / 2 });
  features(skeletonHand, { x: 5.2, spacing: 64, count: 3, z0: -80, yaw: -Math.PI / 2 });
  features(function (n) { return sweep([PINK, CYAN, LIME][n % 3], -1); }, { x: -4.9, spacing: 56, count: 3, z0: -28 });
  features(function (n) { return sweep([CYAN, LIME, PINK][n % 3], 1); }, { x: 4.9, spacing: 56, count: 3, z0: -56 });
  shimmer(boxLight(), 0.7, 0.18, 2.4, 0);
}

export var xray = { id: 'xray', indoor: true, bay: bay, center: center, arch: arch, extras: extras };
