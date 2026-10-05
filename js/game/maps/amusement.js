/**
 * amusement.js — Anatomy Amusement Park: a fairground whose rides are the human body.
 *
 * Every 16 units along the boardwalk: a ticket booth, a midway game with prize balloons, a heart-shaped balloon arch,
 * and a popcorn cart. A coaster track runs on stilts behind one side. Big rides pass in the distance: a heart-spoked
 * ferris wheel, a carousel, and a DNA drop tower. Moving: the rides, coaster cars, balloons, confetti, drifting clouds.
 */

import * as THREE from 'three';
import { box, cyl, ball, cone, ring, extrude, heartShape, combine, xform, canvasTex, floorPanel, sideCtx, slab } from '../mapkit.js';
import { animated, features, mover, spin, swarm, cloudBank } from '../mapfx.js';
import { picket } from '../mapprops.js';

var RED = 0xff4d6a;
var YELLOW = 0xffd23f;
var BLUE = 0x3d8bff;
var GREEN = 0x3fd47a;
var PURPLE = 0x9a62f0;
var ORANGE = 0xff9a1f;
var PINK = 0xff7ab8;
var TEAL = 0x2ec4c9;
var FAIR = [RED, YELLOW, BLUE, GREEN, PURPLE, ORANGE, PINK, TEAL];

function boardwalk() {
  return canvasTex('amuse_floor', 576, 768, function (ctx, w, h) {
    ctx.fillStyle = '#7fd0ff';
    ctx.fillRect(0, 0, w, h);
    for (var r = 0; r < 16; r++) {
      var tone = ['#f1d3a0', '#e8c78e', '#f4daae', '#ebcd98'][r % 4];
      ctx.fillStyle = tone; ctx.fillRect(24, r * 48 + 1, w - 48, 46);
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(24, r * 48 + 1, w - 48, 4);
      ctx.fillStyle = 'rgba(120,80,40,0.25)';
      for (var p = 0; p < 6; p++) ctx.fillRect(24 + ((p * 97 + r * 41) % (w - 48)), r * 48 + 1, 2, 46);
    }
    // painted lane stripes, in fair colours, between the lanes
    [-1.5, 1.5].forEach(function (lx, i) { ctx.fillStyle = i ? '#ff4d6a' : '#3d8bff'; ctx.fillRect(w / 2 + lx * 48 - 3, 0, 6, h); });
    // little confetti dots on the planks
    for (var c = 0; c < 70; c++) { ctx.fillStyle = ['#ff4d6a', '#ffd23f', '#3d8bff', '#3fd47a'][c % 4]; ctx.fillRect(40 + (c * 83) % (w - 80), (c * 131) % h, 5, 5); }
  });
}

function marquee(g, S, z, x, y, w, c1, c2) {
  box(g, 0.2, 0.7, w, c1, x, y, z);
  for (var i = 0; i < Math.round(w / 0.4); i++) ball(g, 0.07, i % 2 ? c2 : 0xfff6c0, x + S.side * -0.12, y, z - w / 2 + 0.2 + i * 0.4, { seg: 4, bulb: true });
}

function ticketBooth(g, S, z) {
  box(g, 1.0, 1.0, 1.8, RED, S.in(0.6), 0.5, z);
  box(g, 1.0, 1.4, 1.8, 0xffe9c2, S.in(0.6), 1.7, z);
  box(g, 0.05, 0.7, 1.1, 0x6ac4ff, S.in(0.12), 1.8, z);
  cone(g, 0.95, 0.9, YELLOW, S.in(0.6), 2.9, z, { seg: 4, ry: Math.PI / 4 });
  marquee(g, S, z + 1.6, S.in(0.15), 3.5, 0.1, RED, YELLOW);
  box(g, 0.1, 0.5, 1.6, BLUE, S.in(0.1), 3.6, z - 0.0);
  // a heart-shaped sign on top
  extrude(g, heartShape(1.1), 0.12, RED, S.in(0.6), 3.9, z, { ry: S.turn, curve: 4 });
}

function midway(g, S, z) {
  box(g, 0.8, 1.0, 3.4, PURPLE, S.in(0.5), 0.5, z);
  box(g, 0.9, 0.08, 3.5, YELLOW, S.in(0.5), 1.04, z);
  [-1.6, 1.6].forEach(function (dz) { box(g, 0.1, 2.6, 0.1, 0xffffff, S.in(0.15), 1.9, z + dz); });
  for (var i = 0; i < 7; i++) box(g, 1.0, 0.1, 0.5, i % 2 ? 0xffffff : RED, S.in(0.5), 3.15 - i * 0.04, z - 1.5 + i * 0.5, { rz: S.side * 0.25 });
  // stacked prize cups and a row of plush balls
  for (var j = 0; j < 5; j++) cyl(g, 0.16, 0.12, 0.3, FAIR[j], S.in(0.5), 1.22, z - 1 + j * 0.5, { seg: 6 });
  for (var k = 0; k < 4; k++) ball(g, 0.16, FAIR[(k + 3) % 8], S.in(0.5), 1.7, z - 0.8 + k * 0.5, { seg: 6 });
}

function balloonArch(g, S, z) {
  var x = S.in(0.5);
  [-1.4, 1.4].forEach(function (dz) { cyl(g, 0.05, 0.05, 2.6, 0xffffff, x, 1.3, z + dz, { seg: 4 }); });
  for (var i = 0; i < 9; i++) {
    var t = i / 8;
    ball(g, 0.3, FAIR[i % 8], x, 2.3 + Math.sin(t * Math.PI) * 1.0, z - 1.5 + t * 3, { seg: 6, sy: 1.15 });
  }
  extrude(g, heartShape(1.2), 0.14, RED, x, 3.8, z, { ry: S.turn, curve: 4 });
  ball(g, 0.3, PINK, x, 0.4, z + 1.6, { seg: 6 });
}

function popcornCart(g, S, z) {
  var x = S.in(0.65);
  box(g, 0.8, 0.9, 1.4, 0xffffff, x, 0.75, z);
  box(g, 0.82, 0.12, 1.42, RED, x, 1.25, z);
  box(g, 0.7, 0.9, 1.2, 0xbfe6ff, x, 1.75, z, { op: 0.6 });
  for (var j = 0; j < 8; j++) ball(g, 0.16, 0xfff4c8, x + Math.cos(j) * 0.2, 1.4 + (j % 3) * 0.2, z + Math.sin(j * 1.7) * 0.4, { seg: 5 });
  cone(g, 0.9, 0.5, RED, x, 2.5, z, { seg: 4, ry: Math.PI / 4 });
  [-0.5, 0.5].forEach(function (dz) { cyl(g, 0.3, 0.3, 0.08, 0x2a2d3a, x, 0.3, z + dz, { rz: Math.PI / 2, seg: 8 }); });
  cyl(g, 0.4, 0.4, 0.06, FAIR[2], S.in(1.2), 0.3, z + 1.5, { seg: 8 });
}

function bay(g, side, z, k) {
  var S = sideCtx(side);
  // a colourful picket rail along the path
  picket(g, S.in(0.05), z, 4, 0.7, FAIR[(k * 2 + (side > 0 ? 1 : 0)) % 8]);
  // coaster track on stilts behind: a rail, supports, a few cross ties
  var tx = S.out(5.5);
  box(g, 0.25, 0.25, 4, 0xffffff, tx, 5.2 + Math.sin(z * 0.1) * 0.8, z);
  box(g, 0.2, 0.2, 4, RED, tx + 0.7, 5.2 + Math.sin(z * 0.1) * 0.8, z);
  box(g, 0.25, 5.0, 0.25, 0xd9dde4, tx, 2.5, z - 1.5);
  if (k === 0) ticketBooth(g, S, z);
  else if (k === 1) midway(g, S, z);
  else if (k === 2) balloonArch(g, S, z);
  else popcornCart(g, S, z);
}

function center(g, z) { floorPanel(g, boardwalk(), z, 12); }

function arch(g, z, i) {
  for (var f = 0; f < 13; f++) {
    var t = f / 12;
    var x = -5.4 + t * 10.8;
    var y = 6.6 - Math.sin(t * Math.PI) * 0.5;
    cone(g, 0.15, 0.32, FAIR[(f + i) % 8], x, y - 0.16, z, { seg: 3, rz: Math.PI, sz: 0.2, bulb: true });
  }
  [-1, 1].forEach(function (s) { ball(g, 0.12, 0xfff6c0, s * 5.0, 6.6, z, { seg: 4, bulb: true }); });
}

function ground(g) {
  slab(g, 400, 400, 0x62d06c, 0, -0.02, -190, { r: 1 });
}

function ferris() {
  var f = new THREE.Group();
  var wheel = new THREE.Group();
  ring(wheel, 6, 0.18, 0xffffff, 0, 0, 0, { seg: 24, tube: 4 });
  ring(wheel, 4.2, 0.1, PINK, 0, 0, 0, { seg: 20, tube: 4 });
  for (var i = 0; i < 10; i++) {
    var a = (i / 10) * Math.PI * 2;
    box(wheel, 0.08, 6, 0.08, 0xffffff, 0, 0, 0, { rz: a });
    box(wheel, 1.0, 0.7, 0.8, FAIR[i % 8], Math.cos(a) * 6, Math.sin(a) * 6 - 0.6, 0);
  }
  extrude(wheel, heartShape(2.6), 0.3, RED, 0, 0, 0, { curve: 5 });
  wheel.position.y = 7.5;
  f.add(wheel);
  box(f, 0.5, 7.5, 0.5, 0xd9dde4, -2.2, 3.7, 0, { rz: -0.3 });
  box(f, 0.5, 7.5, 0.5, 0xd9dde4, 2.2, 3.7, 0, { rz: 0.3 });
  animated(wheel);
  spin(wheel, 'z', 0.25, 0);
  f.rotation.y = Math.PI / 2;
  return f;
}

function carousel() {
  var c = new THREE.Group();
  cyl(c, 3, 3, 0.4, 0xffe9c2, 0, 0.3, 0, { seg: 14 });
  var top = new THREE.Group();
  for (var i = 0; i < 6; i++) {
    var a = (i / 6) * Math.PI * 2;
    cyl(top, 0.06, 0.06, 2.4, 0xffffff, Math.cos(a) * 2.4, 1.5, Math.sin(a) * 2.4, { seg: 4 });
    box(top, 0.7, 0.6, 0.35, FAIR[i], Math.cos(a) * 2.4, 0.9, Math.sin(a) * 2.4, { ry: -a });
  }
  cone(top, 3.4, 1.4, RED, 0, 3.4, 0, { seg: 12 });
  cyl(top, 0.2, 0.2, 2.6, YELLOW, 0, 1.5, 0, { seg: 6 });
  c.add(top);
  animated(top);
  spin(top, 'y', 0.6, 0);
  return c;
}

function tower() {
  var t = new THREE.Group();
  var helix = new THREE.Group();
  for (var i = 0; i < 26; i++) {
    var a = i * 0.5;
    ball(helix, 0.22, BLUE, Math.cos(a) * 0.8, i * 0.4, Math.sin(a) * 0.8, { seg: 5 });
    ball(helix, 0.22, PINK, -Math.cos(a) * 0.8, i * 0.4, -Math.sin(a) * 0.8, { seg: 5 });
    if (i % 2 === 0) cyl(helix, 0.04, 0.04, 1.6, 0xffffff, 0, i * 0.4, 0, { rz: Math.PI / 2, ry: -a, seg: 3 });
  }
  helix.position.y = 0.3;
  t.add(helix);
  box(t, 1.6, 0.3, 1.6, YELLOW, 0, 0.1, 0);
  animated(helix);
  spin(helix, 'y', 0.5, 0);
  return t;
}

function extras() {
  cloudBank(10, { seed: 9 });
  features(ferris, { x: -24, spacing: 120, count: 2, z0: -60 });
  features(carousel, { x: 15, spacing: 100, count: 2, z0: -40 });
  features(tower, { x: -15, spacing: 90, count: 2, z0: -100 });
  // coaster cars rolling along the elevated track on each side
  [-1, 1].forEach(function (side, n) {
    for (var c = 0; c < 2; c++) {
      var car = new THREE.Group();
      for (var j = 0; j < 3; j++) { box(car, 0.9, 0.6, 1.1, FAIR[(j + n * 3 + c) % 8], 0, 0, j * 1.3); ball(car, 0.2, 0xffe0c0, 0, 0.5, j * 1.3, { seg: 5 }); }
      car.position.set(side * (5.5 + 5.5) + 0.35 * side, 5.7, -50 - c * 80);
      animated(car);
      mover(car, { k: 0.2 });
    }
  });
  var balloon = combine([
    { geo: new THREE.SphereGeometry(0.3, 8, 6), color: 0xffffff, matrix: xform(0, 0, 0, 0, 0, 0, 1, 1.18, 1) },
    { geo: new THREE.CylinderGeometry(0.008, 0.008, 1.1, 3), color: 0xcccccc, matrix: xform(0, -0.95, 0) }
  ]);
  [-1, 1].forEach(function (side, i) {
    swarm({ geo: balloon, count: 10, seed: 30 + i * 7, colors: FAIR, area: { x: [side * 5.5, side * 9], y: [3, 7], z: [-140, 8] }, k: 1, wobble: 0.25, scale: [1, 1.5] });
    var conf = combine([{ geo: new THREE.PlaneGeometry(0.14, 0.09), color: 0xffffff }]);
    swarm({ geo: conf, material: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }), count: 40, seed: 70 + i, colors: FAIR, area: { x: [side * 4.6, side * 8], y: [0.4, 7], z: [-100, 6] }, k: 1, vy: [-0.9, -0.5], wobble: 0.3, turn: 3, scale: [1, 1.5] });
  });
}

export var amusement = { id: 'amusement', indoor: false, bay: bay, center: center, arch: arch, ground: ground, extras: extras };
