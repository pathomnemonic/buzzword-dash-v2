/**
 * candylab.js — Candy Lab: a sweet-shop laboratory where the experiments are all sugar.
 *
 * Every 16 units: giant swirl lollipops leaning on the wall, bubbling flasks of fizzy potion, shelves of jars full of
 * gumdrops and gummy bears, and a tiered cake between candy-cane pillars. The floor is a pastel checker with sprinkles,
 * the ceiling pink frosting with gumdrop lights. Moving: sprinkles raining down, fizz rising from the flasks, big
 * lollipops spinning on the wall and gummy bears bouncing by.
 */

import * as THREE from 'three';
import { box, cyl, ball, cone, ring, sign, combine, xform, canvasTex, stripeTex, floorPanel, ceilingPanel, wallPanel, sideCtx } from '../mapkit.js';
import { animated, features, swarm, bob, spin, mover } from '../mapfx.js';
import { face, lightString, dotGeo, glowMat } from './cartoon.js';

var H = 6.4;
var PINK = 0xff8ec8;
var MINT = 0x7ff0c6;
var LEMON = 0xffee7a;
var GRAPE = 0xb98cff;
var ORANGE = 0xffa65c;
var SKY = 0x7fd0ff;
var CREAM = 0xfff6ec;
var SWEETS = [PINK, MINT, LEMON, GRAPE, ORANGE, SKY];

function wallPicture() {
  return canvasTex('candy_wall', 1024, 410, function (ctx, w, h) {
    ctx.fillStyle = '#ffd3ea'; ctx.fillRect(0, 0, w, h);
    // wide candy stripes in pastel
    for (var i = 0; i < 16; i++) { ctx.fillStyle = i % 2 ? '#ffe9f4' : '#ffc2e0'; ctx.fillRect(i * 64, 0, 64, h); }
    // peppermint swirls
    for (var s = 0; s < 6; s++) {
      var cx = 90 + s * 165, cy = 120 + (s % 2) * 40;
      for (var r = 5; r > 0; r--) { ctx.fillStyle = r % 2 ? '#ffffff' : '#ff6aa8'; ctx.beginPath(); ctx.arc(cx, cy, r * 11, 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 5; ctx.beginPath(); for (var a = 0; a < 6.3; a += 0.2) ctx.lineTo(cx + Math.cos(a) * a * 8, cy + Math.sin(a) * a * 8); ctx.stroke();
    }
    // a gingham band and sprinkles
    for (var gx = 0; gx < 32; gx++) for (var gy = 0; gy < 4; gy++) { ctx.fillStyle = (gx + gy) % 2 ? '#ffffff' : '#ffb0d8'; ctx.fillRect(gx * 32, h - 128 + gy * 32, 32, 32); }
    for (var q = 0; q < 50; q++) { ctx.fillStyle = ['#7ff0c6', '#ffee7a', '#b98cff', '#7fd0ff'][q % 4]; ctx.save(); ctx.translate((q * 211) % w, 20 + (q * 97) % 220); ctx.rotate(q); ctx.fillRect(-7, -2, 14, 4); ctx.restore(); }
    ctx.fillStyle = '#ff6aa8'; ctx.fillRect(0, h - 134, w, 8);
  });
}

function floorPicture() {
  return canvasTex('candy_floor', 576, 768, function (ctx, w, h) {
    for (var j = 0; j < 16; j++) for (var i = 0; i < 12; i++) { ctx.fillStyle = (i + j) % 2 ? '#fff3fa' : '#c9f5e4'; ctx.fillRect(i * 48, j * 48, 48, 48); }
    for (var q = 0; q < 90; q++) { ctx.fillStyle = ['#ff6aa8', '#7fd0ff', '#ffd23f', '#b98cff'][q % 4]; ctx.save(); ctx.translate((q * 137) % w, (q * 211) % h); ctx.rotate(q * 1.3); ctx.fillRect(-8, -2.5, 16, 5); ctx.restore(); }
    ctx.fillStyle = '#ff6aa8'; [-1.5, 1.5].forEach(function (lx) { ctx.fillRect(w / 2 + lx * 48 - 4, 0, 8, h); });
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 14, h); ctx.fillRect(w - 14, 0, 14, h);
    ctx.fillStyle = '#ff6aa8'; ctx.fillRect(14, 0, 5, h); ctx.fillRect(w - 19, 0, 5, h);
  });
}

function ceilingPicture() {
  return canvasTex('candy_ceiling', 464, 640, function (ctx, w, h) {
    ctx.fillStyle = '#ffd0e8'; ctx.fillRect(0, 0, w, h);
    // frosting drips and sprinkles
    ctx.fillStyle = '#ffffff';
    for (var i = 0; i < 8; i++) { var x = 20 + i * 56; ctx.beginPath(); ctx.arc(x, 20 + (i % 3) * 14, 28, 0, Math.PI * 2); ctx.fill(); }
    for (var q = 0; q < 50; q++) { ctx.fillStyle = ['#7ff0c6', '#ffee7a', '#b98cff', '#7fd0ff'][q % 4]; ctx.save(); ctx.translate((q * 97) % w, (q * 151) % h); ctx.rotate(q); ctx.fillRect(-7, -2, 14, 4); ctx.restore(); }
  });
}

function swirlTex(c1, c2) {
  return canvasTex('candy_swirl' + c1 + c2, 128, 128, function (ctx, w, h) {
    ctx.fillStyle = c1; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = c2; ctx.lineWidth = 14; ctx.lineCap = 'round'; ctx.beginPath();
    for (var a = 0; a < 18; a += 0.12) ctx.lineTo(w / 2 + Math.cos(a) * a * 3.2, h / 2 + Math.sin(a) * a * 3.2);
    ctx.stroke();
  });
}

function lollipop(g, S, z, c1, c2, r, y, withFace) {
  var tex = swirlTex(c1, c2);
  var d = cyl(g, r, r, 0.12, 0xffffff, S.in(0.12), y, z, { rz: Math.PI / 2, seg: 10, map: tex, r: 0.4 });
  if (!tex) d.material = new THREE.MeshStandardMaterial({ color: c1 });
  cyl(g, 0.05, 0.05, y, CREAM, S.in(0.12), y / 2, z, { seg: 5 });
  if (withFace) face(g, S.in(0.12) - S.side * 0.0, y, z, r * 0.9, S.turn, { open: true });
  return d;
}

function lollies(g, S, z) {
  lollipop(g, S, z - 1.25, '#ff6aa8', '#ffffff', 0.78, 2.1, true);
  lollipop(g, S, z, '#7fd0ff', '#ffffff', 0.9, 2.5, true);
  lollipop(g, S, z + 1.25, '#ffd23f', '#ff9a3d', 0.7, 1.95, true);
  box(g, 0.14, 0.3, 4, PINK, S.in(0.06), 0.15, z);
  sign(g, 'SWIRL SHOP', MINT, 0x6a2a52, 2.6, 0.65, S.in(0.1), 4.9, z, { ry: S.turn, border: 0xffffff });
}

function flask(g, S, z, c, big) {
  var x = S.in(0.5);
  var s = big ? 1.2 : 0.9;
  ball(g, 0.55 * s, 0xe9fbff, x, 0.6 * s, z, { seg: 8, op: 0.4 });
  ball(g, 0.46 * s, c, x, 0.5 * s, z, { seg: 8, sy: 0.8, e: c, ei: 0.35, op: 0.9 });
  cyl(g, 0.17 * s, 0.2 * s, 0.7 * s, 0xe9fbff, x, 1.2 * s, z, { seg: 6, op: 0.45 });
  cyl(g, 0.2 * s, 0.2 * s, 0.1, ORANGE, x, 1.6 * s, z, { seg: 8 });
}

function potions(g, S, z) {
  flask(g, S, z - 1.3, PINK, true);
  flask(g, S, z, MINT, false);
  flask(g, S, z + 1.3, GRAPE, true);
  // a bubbling bench and a hanging recipe card
  box(g, 0.9, 0.12, 4, 0xffffff, S.in(0.5), 0.0 + 0.05, z);
  sign(g, 'SUGAR RUSH', PINK, 0xffffff, 2.5, 0.65, S.in(0.1), 3.9, z, { ry: S.turn, border: 0xffffff });
  ball(g, 0.25, LEMON, S.in(0.12), 4.8, z - 1.2, { seg: 6, bulb: true });
  ball(g, 0.25, MINT, S.in(0.12), 4.8, z + 1.2, { seg: 6, bulb: true });
}

function gummy(g, x, y, z, c, s) {
  ball(g, 0.16 * s, c, x, y + 0.16 * s, z, { seg: 6, sy: 1.1 });
  ball(g, 0.12 * s, c, x, y + 0.4 * s, z, { seg: 6 });
  ball(g, 0.05 * s, c, x - 0.09 * s, y + 0.5 * s, z, { seg: 4 });
  ball(g, 0.05 * s, c, x + 0.09 * s, y + 0.5 * s, z, { seg: 4 });
}

function jars(g, S, z) {
  box(g, 0.14, 3.2, 3.8, CREAM, S.in(0.07), 1.6, z);
  [0.2, 1.3, 2.4].forEach(function (y, r) {
    box(g, 0.6, 0.07, 3.8, 0xffffff, S.in(0.38), y + 0.1, z);
    for (var j = 0; j < 3; j++) {
      var jz = z - 1.3 + j * 1.3;
      var c = SWEETS[(r * 2 + j) % 6];
      cyl(g, 0.26, 0.26, 0.55, 0xeafcff, S.in(0.38), y + 0.4, jz, { seg: 6, op: 0.42 });
      cyl(g, 0.22, 0.22, 0.4, c, S.in(0.38), y + 0.33, jz, { seg: 6, e: c, ei: 0.12 });
      cyl(g, 0.2, 0.2, 0.07, ORANGE, S.in(0.38), y + 0.7, jz, { seg: 6 });
      if (r === 2 && j === 1) gummy(g, S.in(0.38), y + 0.74, jz, c, 0.85);
    }
  });
  sign(g, 'GUMDROPS', LEMON, 0x6a2a52, 2.3, 0.6, S.in(0.1), 4.1, z, { ry: S.turn, border: 0xffffff });
}

function candyCane(g, x, z, h) {
  cyl(g, 0.12, 0.12, h, 0xffffff, x, h / 2, z, { seg: 8, map: stripeTex(0xff4d7a, 0xffffff, 6), r: 0.4 });
  ring(g, 0.26, 0.12, 0xff4d7a, x, h, z + 0.26, { arc: Math.PI, seg: 8, tube: 5 });
}

function cake(g, S, z) {
  var x = S.in(0.5);
  [[0.8, 0.5, PINK], [0.6, 0.45, 0xffffff], [0.4, 0.4, MINT]].forEach(function (t, i) {
    var y = [0.25, 0.75, 1.2][i];
    cyl(g, t[0], t[0], t[1], t[2], x, y, z, { seg: 9 });
    cyl(g, t[0] + 0.03, t[0] + 0.03, 0.08, 0xffffff, x, y + t[1] / 2, z, { seg: 9 });
  });
  ball(g, 0.14, 0xff3d5a, x, 1.55, z, { seg: 7 });
  face(g, x, 0.25, z, 0.8, S.turn, { open: true });
  candyCane(g, S.in(0.5), z - 1.6, 2.4);
  candyCane(g, S.in(0.5), z + 1.6, 2.4);
  sign(g, 'BAKE-OFF', ORANGE, 0xffffff, 2.2, 0.65, S.in(0.1), 3.8, z, { ry: S.turn, border: 0xffffff });
  [-1, 1].forEach(function (d) { cone(g, 0.25, 0.5, SWEETS[d + 2], S.in(0.15), 0.25, z + d * 1.0, { seg: 5 }); });
}

function bay(g, side, z, k) {
  var S = sideCtx(side);
  wallPanel(g, wallPicture(), side, z, H, 0.0, { r: 0.85 });
  if (k === 0) lollies(g, S, z);
  else if (k === 1) potions(g, S, z);
  else if (k === 2) jars(g, S, z);
  else cake(g, S, z);
}

function center(g, z) {
  floorPanel(g, floorPicture(), z, 12);
  ceilingPanel(g, ceilingPicture(), z, 11.6, H);
}

function arch(g, z, i) {
  // garlands of gumdrops and a hanging lollipop at each side
  lightString(g, SWEETS, H - 0.65, z, { n: 13, sag: 0.55, phase: i, r: 0.15 });
  for (var f = 0; f < 6; f++) { var x = -4.2 + f * 1.7; cone(g, 0.18, 0.3, SWEETS[(f + i) % 6], x, H - 1.2 - Math.sin((f / 5) * Math.PI) * 0.5, z, { seg: 6, rx: Math.PI }); }
  [-1, 1].forEach(function (s, n) {
    cyl(g, 0.02, 0.02, 0.9, 0xffffff, s * 4.6, H - 0.9, z, { seg: 3 });
    ball(g, 0.32, SWEETS[(i + n * 2) % 6], s * 4.6, H - 1.5, z, { seg: 9, sz: 0.4 });
  });
}

function bigPop(n) {
  var m = new THREE.Group();
  var tex = swirlTex(n ? '#7fd0ff' : '#ff6aa8', '#ffffff');
  var wheel = new THREE.Group();
  var d = cyl(wheel, 1.1, 1.1, 0.16, 0xffffff, 0, 0, 0, { rz: Math.PI / 2, seg: 16, map: tex, r: 0.4 });
  if (!tex) d.material = new THREE.MeshStandardMaterial({ color: PINK });
  wheel.position.y = 2.6;
  m.add(wheel);
  cyl(m, 0.06, 0.06, 2.6, CREAM, 0, 1.3, 0, { seg: 5 });
  animated(wheel);
  spin(wheel, 'x', n ? -0.7 : 0.7, 0);
  return m;
}

function gummyBear() {
  var m = new THREE.Group();
  gummy(m, 0, 0, 0, PINK, 2.2);
  ball(m, 0.12, 0xffffff, -0.1, 0.9, 0.2, { seg: 4 });
  ball(m, 0.12, 0xffffff, 0.1, 0.9, 0.2, { seg: 4 });
  animated(m);
  bob(m, 0.35, 3.2, 0);
  return m;
}

function extras() {
  var sprinkle = combine([{ geo: new THREE.CapsuleGeometry(0.03, 0.14, 2, 4), color: 0xffffff, matrix: xform(0, 0, 0, 0, 0, Math.PI / 2) }]);
  [-1, 1].forEach(function (side, i) {
    swarm({ geo: sprinkle, material: new THREE.MeshBasicMaterial({ vertexColors: true }), count: 30, seed: 5 + i, colors: SWEETS, area: { x: [side * 4.4, side * 5.3], y: [0.4, 6.0], z: [-140, 8] }, k: 1, vy: [-1.3, -0.7], wobble: 0.15, turn: 2.2, scale: [1, 1.8] });
    swarm({ geo: dotGeo(0.24), material: glowMat(0.45), count: 14, seed: 30 + i, colors: [0xffffff, 0xffe0f0, 0xe0fff4], area: { x: [side * 4.7, side * 5.2], y: [0.8, 5.6], z: [-140, 8] }, k: 1, vy: [0.4, 1.0], wobble: 0.2, scale: [0.6, 1.4] });
  });
  features(function (n) { var p = bigPop(n % 2); return p; }, { x: -5.15, spacing: 56, count: 3, z0: -30, yaw: 0 });
  features(function (n) { var p = bigPop((n + 1) % 2); return p; }, { x: 5.15, spacing: 56, count: 3, z0: -58, yaw: 0 });
  [-1, 1].forEach(function (side, i) { var b = gummyBear(); b.position.set(side * 4.9, 0.0, -30 - i * 30); mover(b, { k: 1, vz: -3 }); });
}

export var candylab = { id: 'candylab', indoor: true, bay: bay, center: center, arch: arch, extras: extras };
