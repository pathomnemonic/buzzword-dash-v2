/**
 * playland.js — Pediatric Playland: the children's ward playroom, painted in every primary colour.
 *
 * The room repeats every 16 units (four bays): a cubby wall of toys, a slide, a pyramid of letter blocks, and a ball
 * pit with a teepee. A mural of hills, a rainbow and a sun runs along the walls, the floor is a mat of pastel puzzle
 * tiles, and the ceiling is painted sky. Beside the track: a toy train circling each wall, balloons bobbing, bubbles
 * rising and pinwheels turning. All of it sits outside the lanes.
 */

import * as THREE from 'three';
import {
  box, cyl, ball, cone, quad, extrude, starShape, heartShape, combine, xform, mat, bulb, canvasTex, css,
  floorPanel, ceilingPanel, wallPanel, sideCtx
} from '../mapkit.js';
import { animated, mover, swarm, shimmer } from '../mapfx.js';

var H = 6.4; // ceiling height

var RED = 0xff4d5a;
var ORANGE = 0xff9a1f;
var YELLOW = 0xffd23f;
var GREEN = 0x3fd47a;
var BLUE = 0x3d8bff;
var PURPLE = 0x9a62f0;
var PINK = 0xff7ab8;
var TEAL = 0x2ec4c9;
var RAINBOW = [RED, ORANGE, YELLOW, GREEN, BLUE, PURPLE];
var PASTELS = [0x7cc4ff, 0x8de8b4, 0xc2a6ff, 0xffa8cf, 0xf2fbff, 0x9fdcff];

// ---------- painted pictures ----------

function mural() {
  // 16 units long, 6.4 high, 64 pixels to the unit; the picture wraps at the left and right edges
  return canvasTex('playland_mural', 1024, 410, function (ctx, w, h) {
    var sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#fff7e6');
    sky.addColorStop(0.55, '#ffeccf');
    sky.addColorStop(1, '#ffe3c2');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    // soft sky patch with clouds, from 1.7 up
    var patch = ctx.createLinearGradient(0, 0, 0, h * 0.72);
    patch.addColorStop(0, '#9ed8ff');
    patch.addColorStop(1, '#d9f1ff');
    ctx.fillStyle = patch;
    ctx.fillRect(0, 0, w, h * 0.74);
    // rolling hills, two layers; periods divide the width so the picture tiles
    function hills(color, base, amp, n, phase) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (var x = 0; x <= w; x += 8) ctx.lineTo(x, base + Math.sin((x / w) * Math.PI * 2 * n + phase) * amp);
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    }
    hills('#8fe38c', h * 0.74, 14, 3, 0.6);
    hills('#4fc96b', h * 0.8, 12, 4, 2.2);
    // sun with rays
    var sx = w * 0.18;
    var sy = h * 0.2;
    ctx.fillStyle = '#ffd23f';
    for (var r = 0; r < 14; r++) {
      var a = (r / 14) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(sx + Math.cos(a - 0.1) * 40, sy + Math.sin(a - 0.1) * 40);
      ctx.lineTo(sx + Math.cos(a) * 66, sy + Math.sin(a) * 66);
      ctx.lineTo(sx + Math.cos(a + 0.1) * 40, sy + Math.sin(a + 0.1) * 40);
      ctx.fill();
    }
    ctx.beginPath(); ctx.arc(sx, sy, 38, 0, Math.PI * 2); ctx.fillStyle = '#ffc21a'; ctx.fill();
    ctx.beginPath(); ctx.arc(sx, sy, 30, 0, Math.PI * 2); ctx.fillStyle = '#ffe066'; ctx.fill();
    // rainbow
    var rx = w * 0.62;
    var ry = h * 0.8;
    ['#ff4d5a', '#ff9a1f', '#ffd23f', '#3fd47a', '#3d8bff', '#9a62f0'].forEach(function (c, i) {
      ctx.beginPath();
      ctx.arc(rx, ry, 190 - i * 17, Math.PI, 0);
      ctx.lineWidth = 17;
      ctx.strokeStyle = c;
      ctx.stroke();
    });
    // clouds
    function cloud(x, y, s) {
      ctx.fillStyle = '#ffffff';
      [[0, 0, 26], [30, 6, 20], [-30, 8, 18], [14, -14, 18], [-12, -10, 16]].forEach(function (b) {
        ctx.beginPath(); ctx.arc(x + b[0] * s, y + b[1] * s, b[2] * s, 0, Math.PI * 2); ctx.fill();
      });
    }
    cloud(w * 0.4, h * 0.22, 1.1);
    cloud(w * 0.82, h * 0.16, 0.9);
    cloud(w * 0.08, h * 0.5, 0.7);
    cloud(w * 0.98 - 20, h * 0.36, 0.8);
    // a kite, balloons and stars
    ctx.fillStyle = '#ff7ab8';
    ctx.beginPath(); ctx.moveTo(w * 0.5, h * 0.1); ctx.lineTo(w * 0.5 + 26, h * 0.2); ctx.lineTo(w * 0.5, h * 0.32); ctx.lineTo(w * 0.5 - 26, h * 0.2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#6a4a8a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(w * 0.5, h * 0.32); ctx.quadraticCurveTo(w * 0.47, h * 0.45, w * 0.51, h * 0.58); ctx.stroke();
    [['#ff4d5a', 0.3], ['#3d8bff', 0.33], ['#ffd23f', 0.36]].forEach(function (b, i) {
      var bx = w * (0.9 + i * 0.03) % w;
      ctx.fillStyle = b[0];
      ctx.beginPath(); ctx.ellipse(bx, h * (0.3 + i * 0.03), 15, 19, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#8a7a9a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(bx, h * (0.3 + i * 0.03) + 19); ctx.lineTo(bx - 6, h * (0.3 + i * 0.03) + 60); ctx.stroke();
    });
  });
}

function floorPicture() {
  // 12 across, 16 along, 48 pixels to the unit: 2-unit puzzle mats in pastels
  return canvasTex('playland_floor', 576, 768, function (ctx, w, h) {
    ctx.fillStyle = '#e8f4ff';
    ctx.fillRect(0, 0, w, h);
    for (var j = 0; j < 8; j++) {
      for (var i = 0; i < 6; i++) {
        var c = PASTELS[(i * 2 + j * 3 + ((i + j) % 2)) % PASTELS.length];
        var x = i * 96;
        var y = j * 96;
        ctx.fillStyle = css(c);
        ctx.fillRect(x + 3, y + 3, 90, 90);
        // soft top edge and a darker bottom edge, so each mat reads as a thick foam square
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fillRect(x + 3, y + 3, 90, 5);
        ctx.fillStyle = 'rgba(40,60,110,0.12)';
        ctx.fillRect(x + 3, y + 88, 90, 5);
        // the puzzle knob on two sides
        ctx.fillStyle = css(c);
        ctx.beginPath(); ctx.arc(x + 96, y + 48, 8, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 48, y + 96, 8, 0, Math.PI * 2); ctx.fill();
      }
    }
    // faint grout between mats
    ctx.strokeStyle = 'rgba(70,100,150,0.22)';
    ctx.lineWidth = 2;
    for (var k = 0; k <= 6; k++) { ctx.beginPath(); ctx.moveTo(k * 96, 0); ctx.lineTo(k * 96, h); ctx.stroke(); }
    for (var m = 0; m <= 8; m++) { ctx.beginPath(); ctx.moveTo(0, m * 96); ctx.lineTo(w, m * 96); ctx.stroke(); }
  });
}

function ceilingPicture() {
  // 11.6 across, 16 along; sky with clouds and a few stars
  return canvasTex('playland_ceiling', 464, 640, function (ctx, w, h) {
    var g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#86d0ff');
    g.addColorStop(0.5, '#b7e6ff');
    g.addColorStop(1, '#86d0ff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    [[0.25, 0.18], [0.7, 0.4], [0.35, 0.66], [0.8, 0.86]].forEach(function (p) {
      [[0, 0, 26], [28, 6, 20], [-28, 8, 18], [12, -12, 17]].forEach(function (b) {
        ctx.beginPath(); ctx.arc(p[0] * w + b[0], p[1] * h + b[1], b[2], 0, Math.PI * 2); ctx.fill();
      });
    });
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    [[0.55, 0.1], [0.12, 0.5], [0.9, 0.62], [0.5, 0.95]].forEach(function (p) {
      ctx.beginPath(); ctx.arc(p[0] * w, p[1] * h, 4, 0, Math.PI * 2); ctx.fill();
    });
  });
}

function sleeperTex() {
  // the wooden ties of the toy railway, painted: one bay (4 units) long, 0.55 wide
  return canvasTex('playland_sleepers', 44, 320, function (ctx, w, h) {
    ctx.fillStyle = '#9a6a3a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#5e3d1c';
    for (var i = 0; i < 6; i++) ctx.fillRect(2, 14 + i * (h / 6), w - 4, 10);
  });
}

/** A strip of bulbs on the wall: two strips (A and B) swap, so the colours chase each other. */
function bulbTex(offset) {
  return canvasTex('playland_bulbs' + offset, 512, 40, function (ctx, w, h) {
    var cols = ['#ff4d5a', '#3fd47a', '#3d8bff', '#ffd23f'];
    // thin cord along the middle
    ctx.fillStyle = 'rgba(70,70,90,0.9)';
    ctx.fillRect(0, h / 2 - 1, w, 2);
    for (var i = 0; i < 8; i++) {
      if (i % 2 !== offset) continue;
      var x = (i + 0.5) * (w / 8);
      var halo = ctx.createRadialGradient(x, h / 2, 1, x, h / 2, 17);
      halo.addColorStop(0, 'rgba(255,255,255,0.95)');
      halo.addColorStop(0.35, cols[(i >> 1) % 4]);
      halo.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(x, h / 2, 17, 0, Math.PI * 2); ctx.fill();
    }
  });
}

function letterTex(ch, bg, fg) {
  return canvasTex('playland_letter' + ch + bg, 128, 128, function (ctx, w, h) {
    ctx.fillStyle = css(bg);
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(0, 0, w, 10);
    ctx.fillStyle = css(fg);
    ctx.font = '900 92px "Arial Rounded MT Bold", "Trebuchet MS", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, w / 2, h / 2 + 6);
  });
}

// ---------- little toys ----------

function teddy(g, x, y, z, s, color, turn) {
  ball(g, 0.2 * s, color, x, y + 0.2 * s, z, { sy: 1.05, seg: 7 });
  ball(g, 0.14 * s, color, x, y + 0.5 * s, z, { seg: 7 });
  ball(g, 0.055 * s, color, x - 0.1 * s, y + 0.62 * s, z, { seg: 4 });
  ball(g, 0.055 * s, color, x + 0.1 * s, y + 0.62 * s, z, { seg: 4 });
  ball(g, 0.06 * s, 0xfff0d8, x + (turn < 0 ? 0.11 : -0.11) * s, y + 0.46 * s, z, { seg: 4 });
}

function duck(g, x, y, z, s) {
  ball(g, 0.18 * s, YELLOW, x, y + 0.17 * s, z, { sy: 0.85, seg: 7 });
  ball(g, 0.12 * s, YELLOW, x, y + 0.38 * s, z, { seg: 6 });
  cone(g, 0.05 * s, 0.12 * s, ORANGE, x, y + 0.36 * s, z + 0.12 * s, { rx: Math.PI / 2, seg: 4 });
}

function toyBall(g, x, y, z, r, color) { return ball(g, r, color, x, y, z, { seg: 7 }); }

// ---------- one bay on one side ----------

function cubbies(g, S, z) {
  var w = 3.5;
  var h = 2.7;
  var d = 0.62;
  var fx = S.in(d / 2 + 0.03);
  // frame: boards between the cubbies
  box(g, d, 0.1, w, 0xffffff, fx, 0.05, z);
  box(g, d, 0.1, w, 0xffffff, fx, h / 2, z);
  box(g, d, 0.1, w, 0xffffff, fx, h, z);
  for (var i = 0; i < 4; i++) box(g, d, h, 0.09, 0xffffff, fx, h / 2, z - w / 2 + 0.045 + i * ((w - 0.09) / 3));
  // coloured backs
  var cw = (w - 0.09) / 3 - 0.09;
  for (var r = 0; r < 2; r++) {
    for (var c = 0; c < 3; c++) {
      var col = RAINBOW[(r * 3 + c + 1) % 6];
      var cz = z - w / 2 + 0.09 + cw / 2 + c * ((w - 0.09) / 3);
      box(g, 0.04, h / 2 - 0.12, cw, col, S.in(d + 0.0), r * (h / 2) + h / 4 + 0.03, cz);
      // a toy in each
      var ty = r * (h / 2) + 0.12;
      var tx = S.in(0.38);
      if ((r + c) % 3 === 0) teddy(g, tx, ty, cz, 1.05, [0xc98a52, 0xf2c9a0, 0x8a5a3a][c % 3], S.side);
      else if ((r + c) % 3 === 1) { box(g, 0.34, 0.34, 0.34, RAINBOW[(c + r * 2) % 6], tx, ty + 0.17, cz - 0.15, { ry: 0.4 }); toyBall(g, tx, ty + 0.2, cz + 0.22, 0.2, RAINBOW[(c + 3) % 6]); }
      else duck(g, tx, ty, cz, 1.2);
    }
  }
  // a name sign on top
  box(g, 0.12, 0.34, 1.8, PURPLE, S.in(0.1), h + 0.35, z);
}

function slide(g, S, z) {
  var x = S.in(0.62);
  var tz = z - 1.35;
  // tower: four posts, a deck, a roof and a ladder
  [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]].forEach(function (p) {
    box(g, 0.1, 2.3, 0.1, BLUE, x + p[0], 1.15, tz + p[1]);
  });
  box(g, 1.05, 0.12, 1.05, YELLOW, x, 1.75, tz);
  box(g, 0.05, 0.4, 1.05, RED, x - S.side * 0.5, 2.0, tz);   // rail on the lane side stays low
  box(g, 0.05, 0.4, 1.05, RED, x + S.side * 0.5, 2.0, tz);
  cone(g, 0.9, 0.7, RED, x, 2.65, tz, { seg: 4, ry: Math.PI / 4 });
  // ladder on the far side
  box(g, 0.78, 0.06, 0.06, 0xf4f4f8, x, 0.4, tz - 0.62);
  box(g, 0.78, 0.06, 0.06, 0xf4f4f8, x, 0.9, tz - 0.62);
  box(g, 0.78, 0.06, 0.06, 0xf4f4f8, x, 1.4, tz - 0.62);
  box(g, 0.06, 1.6, 0.06, 0xf4f4f8, x - 0.36, 0.85, tz - 0.62, { rx: -0.12 });
  box(g, 0.06, 1.6, 0.06, 0xf4f4f8, x + 0.36, 0.85, tz - 0.62, { rx: -0.12 });
  // the slide itself runs toward the runner, parallel to the wall
  var run = 3.0;
  var drop = 1.5;
  var len = Math.hypot(run, drop);
  var ang = Math.atan2(drop, run);
  var cz = tz + 0.5 + run / 2;
  var cy = 1.72 - drop / 2;
  box(g, 0.78, 0.07, len, YELLOW, x, cy, cz, { rx: ang, r: 0.25, m: 0.1 });
  box(g, 0.07, 0.22, len, RED, x - 0.42, cy + 0.12, cz, { rx: ang });
  box(g, 0.07, 0.22, len, RED, x + 0.42, cy + 0.12, cz, { rx: ang });
  // supports
  box(g, 0.08, 0.8, 0.08, BLUE, x - 0.38, 0.4, tz + 2.2);
  box(g, 0.08, 0.8, 0.08, BLUE, x + 0.38, 0.4, tz + 2.2);
}

function blocks(g, S, z) {
  var letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  var colors = [RED, BLUE, GREEN, ORANGE, PURPLE, TEAL];
  var spec = [[-1.15, 0.45], [0, 0.45], [1.15, 0.45], [-0.58, 1.33], [0.58, 1.33], [0, 2.2]];
  spec.forEach(function (p, i) {
    var tex = letterTex(letters[i], colors[i], 0xffffff);
    var b = box(g, 0.86, 0.86, 0.86, 0xffffff, S.in(0.62 + (i % 2) * 0.04), p[1], z + p[0], { ry: (i - 2.5) * 0.12, map: tex, r: 0.55 });
    if (!tex) b.material = mat(colors[i]);
  });
  // a big striped beach ball next to the pyramid
  var stripes = canvasTex('playland_beachball', 128, 64, function (ctx, w, h) {
    for (var s = 0; s < 8; s++) { ctx.fillStyle = css([RED, 0xffffff, BLUE, 0xffffff, YELLOW, 0xffffff, GREEN, 0xffffff][s]); ctx.fillRect(s * 16, 0, 16, h); }
  });
  var bb = ball(g, 0.5, 0xffffff, S.in(0.8), 0.5, z + 1.7, { map: stripes, r: 0.35, seg: 12 });
  if (!stripes) bb.material = mat(RED);
}

function ballPit(g, S, z) {
  var x = S.in(0.75);
  var pz = z - 0.5;
  // rim of soft blue boards
  box(g, 1.3, 0.55, 0.22, BLUE, x, 0.28, pz - 1.0);
  box(g, 1.3, 0.55, 0.22, BLUE, x, 0.28, pz + 1.0);
  box(g, 0.22, 0.55, 2.2, BLUE, x - 0.54, 0.28, pz);
  box(g, 0.22, 0.55, 2.2, BLUE, x + 0.54, 0.28, pz);
  box(g, 1.0, 0.3, 1.8, 0x7fb6ff, x, 0.18, pz);
  // a heap of balls
  var cols = [RED, YELLOW, GREEN, ORANGE, PINK, 0xffffff, PURPLE, TEAL];
  var n = 0;
  for (var i = 0; i < 9; i++) {
    var a = i * 2.399;
    var rr = 0.13 + (i % 4) * 0.12;
    toyBall(g, x + Math.cos(a) * rr * 1.2 * 0.8, 0.45 + (i % 3) * 0.1, pz + Math.sin(a) * rr * 2.4 * 0.6, 0.2, cols[n++ % cols.length]);
  }
  // a teepee
  var tx = S.in(0.9);
  var tz = z + 1.5;
  cone(g, 0.7, 2.1, RED, tx, 1.05, tz, { seg: 6 });
  cone(g, 0.2, 0.9, 0xfff3dc, tx - S.side * 0.38, 0.45, tz, { seg: 3, ry: S.side * 0.0, rz: 0 });
  cyl(g, 0.02, 0.02, 0.8, 0xc9a06a, tx, 2.35, tz, { seg: 4 });
  box(g, 0.01, 0.18, 0.3, YELLOW, tx, 2.6, tz + 0.15);
}

function railAndTrim(g, S, z, k) {
  // baseboard in a rainbow colour per bay
  box(g, 0.1, 0.3, 4, RAINBOW[k], S.in(0.05), 0.15, z);
  // the shelf the toy train runs on
  var bed = box(g, 0.55, 0.09, 4, 0xffffff, S.in(0.32), 3.05, z, { map: sleeperTex(), r: 0.8 });
  if (!bed.material.map) bed.material = mat(0x9a6a3a);
  box(g, 0.05, 0.06, 4, 0xd9dde4, S.in(0.15), 3.13, z, { m: 0.5, r: 0.3 });
  box(g, 0.05, 0.06, 4, 0xd9dde4, S.in(0.49), 3.13, z, { m: 0.5, r: 0.3 });
  box(g, 0.1, 0.5, 0.1, 0xffffff, S.in(0.15), 2.7, z - 1.2);
  box(g, 0.1, 0.5, 0.1, 0xffffff, S.in(0.15), 2.7, z + 1.2);
  // paper stars and hearts along the top
  var shapes = [starShape(0.3, 0.14, 5), heartShape(0.6), starShape(0.3, 0.14, 5), heartShape(0.6)];
  for (var j = 0; j < 3; j++) {
    var sh = shapes[(k + j) % 4];
    extrude(g, sh, 0.05, RAINBOW[(k * 2 + j * 2 + 1) % 6], S.in(0.12), 5.7, z - 1.2 + j * 1.2, { ry: S.turn, rz: j === 1 ? 0.2 : -0.1 });
  }
}

var _strips = {};
function bulbStripMat(n, tex) {
  return _strips[n] || (_strips[n] = bulb(0xffffff, { map: tex, op: 0.99 }));
}

function bay(g, side, z, k) {
  var S = sideCtx(side);
  wallPanel(g, mural(), side, z, H, 0.0, { r: 0.9 });
  railAndTrim(g, S, z, k);
  if (k === 0) cubbies(g, S, z);
  else if (k === 1) slide(g, S, z);
  else if (k === 2) blocks(g, S, z);
  else ballPit(g, S, z);
  // strings of bulbs high on the wall; the two strips take turns (their glow is animated in extras)
  [0, 1].forEach(function (n) {
    var tex = bulbTex(n);
    if (tex) quad(g, 4, 0.32, 0xffffff, S.in(0.1), 5.1, z, { ry: S.turn, mat: bulbStripMat(n, tex) });
  });
}

function center(g, z) {
  floorPanel(g, floorPicture(), z, 12);
  ceilingPanel(g, ceilingPicture(), z, 11.6, H);
}

function arch(g, z, i) {
  // a garland of flags across the room, with three paper shapes hanging from it
  var y = H - 0.55;
  var n = 11;
  for (var f = 0; f < n; f++) {
    var t = f / (n - 1);
    var x = -5.2 + t * 10.4;
    var dip = Math.sin(t * Math.PI) * 0.5;
    var c = RAINBOW[(f + i) % 6];
    cone(g, 0.14, 0.3, c, x, y - dip - 0.15, z, { seg: 3, rz: Math.PI, sz: 0.2, bulb: true });
  }
  // paper shapes hang at the sides only: the middle of the view has to stay clear for the gates
  [-1, 1].forEach(function (s, n) {
    var sh = n === 0 ? starShape(0.34, 0.16, 5) : heartShape(0.7);
    cyl(g, 0.012, 0.012, 0.5, 0x777788, s * 4.5, y - 0.2, z, { seg: 3 });
    extrude(g, sh, 0.06, RAINBOW[(i * 2 + n + 4) % 6], s * 4.5, y - 0.75, z, { curve: 3 });
  });
  cyl(g, 0.012, 0.012, 10.4, 0x777788, 0, y - 0.05, z, { rz: Math.PI / 2, seg: 3 });
}

// ---------- the things that move ----------

function makeTrain(side) {
  var S = sideCtx(side);
  var t = new THREE.Group();
  var x = 0;
  // engine: red boiler, blue cab with a yellow roof, black chimney, front lamp
  cyl(t, 0.2, 0.2, 0.9, RED, x, 0.38, -0.25, { rx: Math.PI / 2, seg: 10 });
  box(t, 0.5, 0.52, 0.46, BLUE, x, 0.5, 0.42);
  box(t, 0.56, 0.07, 0.52, YELLOW, x, 0.8, 0.42);
  cyl(t, 0.07, 0.09, 0.3, 0x333844, x, 0.72, -0.5, { seg: 8 });
  ball(t, 0.08, YELLOW, x, 0.38, -0.72, { bulb: true, seg: 6 });
  [[-0.27, -0.45], [0.27, -0.45], [-0.27, 0.3], [0.27, 0.3]].forEach(function (p) { cyl(t, 0.13, 0.13, 0.08, 0x2a2d3a, x + p[0], 0.13, p[1], { rz: Math.PI / 2, seg: 8 }); });
  // three cars in rainbow colours, each carrying a toy
  [GREEN, ORANGE, PURPLE].forEach(function (c, i) {
    var cz = 1.35 + i * 1.0;
    box(t, 0.56, 0.3, 0.84, c, x, 0.3, cz);
    box(t, 0.6, 0.05, 0.88, 0xffffff, x, 0.47, cz);
    [[-0.27, -0.28], [0.27, -0.28], [-0.27, 0.28], [0.27, 0.28]].forEach(function (p) { cyl(t, 0.11, 0.11, 0.07, 0x2a2d3a, x + p[0], 0.11, cz + p[1], { rz: Math.PI / 2, seg: 8 }); });
    if (i === 0) ball(t, 0.2, RED, x, 0.68, cz, { seg: 8 });
    else if (i === 1) box(t, 0.34, 0.34, 0.34, BLUE, x, 0.66, cz, { ry: 0.5 });
    else teddy(t, x, 0.47, cz, 1.0, 0xc98a52, side);
    box(t, 0.05, 0.05, 0.2, 0x555a66, x, 0.28, cz - 0.52);
  });
  t.position.set(S.in(0.32), 3.12, -40);
  return animated(t);
}

function bubbleGeo() {
  return combine([{ geo: new THREE.SphereGeometry(0.2, 8, 6), color: 0xffffff }]);
}

function pinwheels(side) {
  var common = {
    count: 5, seed: 31 + (side > 0 ? 7 : 0),
    area: { x: [side * 5.0, side * 5.0], y: [1.6, 3.6], z: [-140, 8] },
    k: 1, scale: [0.85, 1.2]
  };
  var stick = combine([{ geo: new THREE.CylinderGeometry(0.018, 0.018, 1.1, 4), color: 0xf4f4f8, matrix: xform(0, -0.55, 0) }, { geo: new THREE.SphereGeometry(0.05, 6, 4), color: 0xffd23f }]);
  var blades = [];
  var cs = [RED, YELLOW, BLUE, GREEN];
  for (var b = 0; b < 4; b++) {
    var shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(0.3, 0.02); shape.lineTo(0.3, 0.3); shape.closePath();
    var geo = new THREE.ShapeGeometry(shape);
    blades.push({ geo: geo, color: cs[b], matrix: xform(0.05, 0, 0, 0, Math.PI / 2, (b * Math.PI) / 2) });
  }
  var bladeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide });
  swarm(Object.assign({ geo: stick, axis: 'y', turn: 0 }, common));
  swarm(Object.assign({ geo: combine(blades), axis: 'x', turn: side > 0 ? 3.2 : -3.2, material: bladeMat }, common));
}

function extras() {
  // a toy train circling each wall, one per side at its own pace
  [-1, 1].forEach(function (side, i) {
    for (var c = 0; c < 2; c++) {
      var train = makeTrain(side);
      train.position.z = -30 - c * 78 - i * 20;
      train.rotation.y = 0;
      mover(train, { k: 0.45 + i * 0.12 });
    }
  });
  // balloons that bob beside the walls
  var balloon = combine([
    { geo: new THREE.SphereGeometry(0.3, 9, 7), color: 0xffffff, matrix: xform(0, 0, 0, 0, 0, 0, 1, 1.18, 1) },
    { geo: new THREE.ConeGeometry(0.06, 0.1, 5), color: 0xdddddd, matrix: xform(0, -0.37, 0, Math.PI, 0, 0) },
    { geo: new THREE.CylinderGeometry(0.008, 0.008, 1.1, 3), color: 0xcccccc, matrix: xform(0, -0.95, 0) }
  ]);
  [-1, 1].forEach(function (side, i) {
    swarm({ geo: balloon, count: 7, seed: 5 + i * 11, colors: RAINBOW.concat([PINK]), area: { x: [side * 4.5, side * 5.1], y: [3.3, 5.3], z: [-140, 8] }, k: 1, wobble: 0.16, scale: [0.9, 1.25] });
  });
  // bubbles
  var bubbleMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending });
  [-1, 1].forEach(function (side, i) {
    swarm({ geo: bubbleGeo(), material: bubbleMat, count: 14, seed: 90 + i * 5, colors: [0xbfe6ff, 0xffd0f0, 0xd6ffe6], area: { x: [side * 4.6, side * 5.2], y: [0.8, 5.8], z: [-140, 8] }, k: 1, vy: [0.35, 0.8], wobble: 0.15, scale: [0.5, 1.2] });
  });
  pinwheels(-1);
  pinwheels(1);
  // the two strings of bulbs on the walls take turns, slower than twice a second
  if (_strips[0]) shimmer(_strips[0], 0.55, 0.45, 3.0, 0);
  if (_strips[1]) shimmer(_strips[1], 0.55, 0.45, 3.0, Math.PI);
}

export var playland = {
  id: 'playland',
  indoor: true,
  bay: bay,
  center: center,
  arch: arch,
  extras: extras
};
