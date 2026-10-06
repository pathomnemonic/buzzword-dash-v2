/**
 * dna.js — DNA Helix Tunnel: a candy-coloured carnival hall where a giant double helix turns on each wall.
 *
 * Every 16 units: a pyramid of lettered base-pair blocks, the Gene Machine claw game, a replication-fork slide, and a
 * stand selling chromosome pretzels. On both walls a glowing double helix of beads and rungs turns slowly as the world
 * scrolls by (A pairs with T, G with C, each in its own colour). The floor is striped with base pairs, the ceiling is
 * a sky of floating letters. Moving: the helices, nucleotides drifting past, sparkles, bubbles.
 */

import * as THREE from 'three';
import { box, cyl, ball, cone, sign, combine, xform, canvasTex, css, floorPanel, ceilingPanel, wallPanel, sideCtx, animate, currentWorld } from '../mapkit.js';
import { swarm } from '../mapfx.js';
import { face, bolt, lightString, sparkleGeo, dotGeo, glowMat } from './cartoon.js';

var H = 6.4;
var A = 0xff6bb5;
var T = 0xffe14a;
var G = 0x4fb8ff;
var C = 0x4fe8a8;
var PAIRS = [[A, T], [G, C], [T, A], [C, G]];
var BASES = [A, T, G, C];
var LETTERS = ['A', 'T', 'G', 'C'];
var VIO = 0x8a5cf6;

function wallPicture() {
  return canvasTex('dna_wall', 1024, 410, function (ctx, w, h) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#d9ccff'); g.addColorStop(0.65, '#efe6ff'); g.addColorStop(1, '#ffffff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // faint base-pair ladders in the background
    for (var i = 0; i < 16; i++) {
      var x = i * 64 + 32;
      ctx.fillStyle = ['rgba(255,107,181,0.25)', 'rgba(255,225,74,0.3)', 'rgba(79,184,255,0.25)', 'rgba(79,232,168,0.3)'][i % 4];
      ctx.fillRect(x - 20, 30, 40, 220);
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = '900 34px "Arial Rounded MT Bold", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(LETTERS[i % 4], x, 140);
    }
    // a candy stripe wainscot
    for (var c = 0; c < 32; c++) { ctx.fillStyle = css(BASES[c % 4]); ctx.fillRect(c * 32, h - 70, 32, 70); }
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(0, h - 70, w, 14);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, h - 76, w, 6);
  });
}

function floorPicture() {
  return canvasTex('dna_floor', 576, 768, function (ctx, w, h) {
    ctx.fillStyle = '#e6dcff'; ctx.fillRect(0, 0, w, h);
    // rungs of colour across the floor, a different pair every 96 px
    for (var j = 0; j < 8; j++) {
      var p = PAIRS[j % 4];
      ctx.fillStyle = css(p[0]); ctx.fillRect(14, j * 96 + 40, w / 2 - 20, 16);
      ctx.fillStyle = css(p[1]); ctx.fillRect(w / 2 + 6, j * 96 + 40, w / 2 - 20, 16);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(w / 2 - 6, j * 96 + 44, 12, 8);
    }
    ctx.fillStyle = 'rgba(110,60,230,0.85)'; [-1.5, 1.5].forEach(function (lx) { ctx.fillRect(w / 2 + lx * 48 - 4, 0, 8, h); });
    ctx.fillStyle = '#8a5cf6'; ctx.fillRect(0, 0, 14, h); ctx.fillRect(w - 14, 0, 14, h);
  });
}

function ceilingPicture() {
  return canvasTex('dna_ceiling', 464, 640, function (ctx, w, h) {
    ctx.fillStyle = '#cfe3ff'; ctx.fillRect(0, 0, w, h);
    ctx.font = '900 48px "Arial Rounded MT Bold", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (var i = 0; i < 16; i++) { ctx.fillStyle = css(BASES[i % 4]); ctx.globalAlpha = 0.7; ctx.fillText(LETTERS[(i * 3) % 4], 40 + (i * 137) % (w - 80), 40 + (i * 89) % (h - 80)); }
    ctx.globalAlpha = 1;
  });
}

function letterTex(ch, bg) {
  return canvasTex('dna_letter' + ch, 128, 128, function (ctx, w, h) {
    ctx.fillStyle = css(bg); ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(0, 0, w, 12);
    ctx.fillStyle = '#ffffff'; ctx.font = '900 92px "Arial Rounded MT Bold", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ch, w / 2, h / 2 + 6);
  });
}

function blocks(g, S, z) {
  var spec = [[-1.15, 0.45, 0], [0, 0.45, 1], [1.15, 0.45, 2], [-0.58, 1.33, 3], [0.58, 1.33, 0], [0, 2.2, 1]];
  spec.forEach(function (p, i) {
    var tex = letterTex(LETTERS[p[2]], BASES[p[2]]);
    var b = box(g, 0.86, 0.86, 0.86, 0xffffff, S.in(0.6 + (i % 2) * 0.04), p[1], z + p[0], { ry: (i - 2.5) * 0.12, map: tex, r: 0.55 });
    if (!tex) b.material = new THREE.MeshStandardMaterial({ color: BASES[p[2]] });
  });
  face(g, S.in(0.62), 2.2, z, 0.43, S.turn, { open: true });
  sign(g, 'BASE PAIRS', VIO, 0xffffff, 2.6, 0.65, S.in(0.1), 4.4, z, { ry: S.turn, border: 0xffffff });
  box(g, 0.14, 0.3, 4, VIO, S.in(0.06), 0.15, z);
}

function clawMachine(g, S, z) {
  var x = S.in(0.45);
  box(g, 1.0, 2.6, 1.6, A, x, 1.3, z);
  box(g, 0.9, 1.5, 1.4, 0xdff6ff, x + (S.side < 0 ? 0.06 : -0.06), 1.7, z, { op: 0.4 });
  for (var i = 0; i < 6; i++) ball(g, 0.14, BASES[i % 4], x, 1.0 + (i % 2) * 0.14, z - 0.5 + (i % 3) * 0.5, { seg: 6 });
  cyl(g, 0.03, 0.03, 0.8, 0x888899, x, 2.3, z, { seg: 3 });
  cone(g, 0.18, 0.3, 0xdddddd, x, 1.75, z, { seg: 4, rx: Math.PI });
  box(g, 1.04, 0.3, 1.64, T, x, 2.75, z);
  sign(g, 'GENE MACHINE', G, 0xffffff, 2.8, 0.65, S.in(0.1), 4.1, z, { ry: S.turn, border: 0xffffff });
  bolt(g, 0.7, T, S.in(0.12), 5.0, z - 1.3, { ry: S.turn });
  bolt(g, 0.7, T, S.in(0.12), 5.0, z + 1.3, { ry: S.turn });
  [-1.7, 1.7].forEach(function (dz, i) { ball(g, 0.3, BASES[i + 2], S.in(0.5), 0.3, z + dz, { seg: 7, sy: 0.75 }); });
}

function forkSlide(g, S, z) {
  var x = S.in(0.62);
  box(g, 0.9, 0.12, 1.0, T, x, 2.0, z - 1.4);
  [-0.4, 0.4].forEach(function (d) { box(g, 0.1, 2.0, 0.1, VIO, x + d, 1.0, z - 1.8); box(g, 0.1, 2.0, 0.1, VIO, x + d, 1.0, z - 1.0); });
  [[0.9, A], [-0.0, C]].forEach(function (p, i) {
    var run = 2.6, drop = 1.7, len = Math.hypot(run, drop), ang = Math.atan2(drop, run);
    box(g, 0.5, 0.07, len, p[1], x, 1.1, z + 0.2 + (i ? 0.5 : -0.2), { rx: ang, r: 0.25 });
    box(g, 0.07, 0.2, len, 0xffffff, x - 0.28, 1.2, z + 0.2 + (i ? 0.5 : -0.2), { rx: ang });
  });
  sign(g, 'REPLICATION FORK', C, 0x1a4a6a, 3.0, 0.62, S.in(0.1), 4.2, z, { ry: S.turn, border: 0xffffff });
}

function chromosome(g, x, z, c1, c2, turn) {
  // an X: two crossed capsules, joined by a pinched waist (the centromere), with a face
  [[0.3, c1], [-0.3, c2]].forEach(function (p) {
    cyl(g, 0.17, 0.17, 1.3, p[1], x, 1.0, z, { rz: p[0], rx: 0, seg: 8 });
    ball(g, 0.17, p[1], x - Math.sin(p[0]) * 0.65, 1.0 + Math.cos(p[0]) * 0.65, z, { seg: 6 });
    ball(g, 0.17, p[1], x + Math.sin(p[0]) * 0.65, 1.0 - Math.cos(p[0]) * 0.65, z, { seg: 6 });
  });
  face(g, x, 1.0, z, 0.3, turn, { open: true });
}

function pretzels(g, S, z) {
  [-1.3, 0, 1.3].forEach(function (dz, i) { chromosome(g, S.in(0.5), z + dz, [A, G, T][i], [T, C, A][i], S.turn); });
  for (var s = 0; s < 8; s++) cone(g, 0.5, 0.3, s % 2 ? 0xffffff : A, S.in(0.35), 3.0, z - 1.6 + s * 0.46, { seg: 4, rz: S.side * 0.35, ry: 0.0 });
  [-1.7, 1.7].forEach(function (dz) { cyl(g, 0.05, 0.05, 3.0, 0xe8e8f0, S.in(0.8), 1.5, z + dz, { seg: 4 }); });
  sign(g, 'CHROMOSOME PRETZELS', T, 0x4a2a8a, 3.4, 0.62, S.in(0.1), 4.2, z, { ry: S.turn, border: 0xffffff });
}

function bay(g, side, z, k) {
  var S = sideCtx(side);
  wallPanel(g, wallPicture(), side, z, H, 0.0, { r: 0.8 });
  if (k === 0) blocks(g, S, z);
  else if (k === 1) clawMachine(g, S, z);
  else if (k === 2) forkSlide(g, S, z);
  else pretzels(g, S, z);
}

function center(g, z) {
  floorPanel(g, floorPicture(), z, 12);
  ceilingPanel(g, ceilingPicture(), z, 11.6, H);
}

function arch(g, z, i) {
  // a double helix of beads across the ceiling
  for (var b = 0; b < 21; b++) {
    var t = b / 20;
    var x = -5.0 + t * 10.0;
    var a = t * Math.PI * 4 + i;
    ball(g, 0.1, BASES[b % 4], x, H - 1.5 + Math.sin(a) * 0.5, z, { seg: 4, bulb: true });
    ball(g, 0.1, BASES[(b + 2) % 4], x, H - 1.5 - Math.sin(a) * 0.5, z, { seg: 4, bulb: true });
    if (b % 2 === 0) cyl(g, 0.02, 0.02, Math.abs(Math.sin(a)) * 1.0 + 0.02, 0xffffff, x, H - 1.5, z, { seg: 3 });
  }
  lightString(g, BASES, H - 0.5, z, { n: 9, sag: 0.3, phase: i, half: 4.8, r: 0.08 });
}

// ---------- the turning helices ----------

var STEPS = 150;
var SPACING = 1.0;
var SPAN = STEPS * SPACING; // 150, a whole number of 6-unit turns, so the pattern wraps without a jump
var TWIST = (Math.PI * 2) / 6;

function helix(side, seed) {
  var world = currentWorld();
  var beadGeo = combine([{ geo: new THREE.SphereGeometry(0.2, 6, 4), color: 0xffffff }]);
  var rungGeo = combine([{ geo: new THREE.CylinderGeometry(0.05, 0.05, 1, 3), color: 0xffffff }]);
  var mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.05, emissive: 0x222222, emissiveIntensity: 0.3 });
  var beads = new THREE.InstancedMesh(beadGeo, mat, STEPS * 2);
  var rungs = new THREE.InstancedMesh(rungGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }), STEPS);
  [beads, rungs].forEach(function (m) { m.frustumCulled = false; m.userData.noMerge = true; });
  beads.userData.swarmCount = STEPS * 2;
  rungs.userData.swarmCount = STEPS;
  var col = new THREE.Color();
  for (var i = 0; i < STEPS; i++) {
    var p = PAIRS[(i + seed) % 4];
    beads.setColorAt(i * 2, col.set(p[0]));
    beads.setColorAt(i * 2 + 1, col.set(p[1]));
    rungs.setColorAt(i, col.set(0xffffff));
  }
  var d = new THREE.Object3D();
  var off = 0;
  var cx = side * 5.25;
  var cy = 3.4;
  var R = 0.95;
  function write(t, dt, move) {
    off = (off + move) % SPAN;
    for (var j = 0; j < STEPS; j++) {
      var z = 8 - ((j * SPACING + off) % SPAN);
      var a = z * TWIST + t * 0.9;
      var ca = Math.cos(a), sa = Math.sin(a);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(1);
      d.position.set(cx + ca * R * 0.8, cy + sa * R, z);
      d.updateMatrix(); beads.setMatrixAt(j * 2, d.matrix);
      d.position.set(cx - ca * R * 0.8, cy - sa * R, z);
      d.updateMatrix(); beads.setMatrixAt(j * 2 + 1, d.matrix);
      d.position.set(cx, cy, z);
      d.rotation.set(0, 0, Math.atan2(sa * R, ca * R * 0.8) - Math.PI / 2);
      d.scale.set(1, Math.hypot(ca * R * 0.8, sa * R) * 2, 1);
      d.updateMatrix(); rungs.setMatrixAt(j, d.matrix);
    }
    beads.instanceMatrix.needsUpdate = true;
    rungs.instanceMatrix.needsUpdate = true;
  }
  write(0, 0, 0);
  animate(write);
  if (world && world.movers) { world.movers.add(beads); world.movers.add(rungs); }
}

function extras() {
  helix(-1, 0);
  helix(1, 2);
  [-1, 1].forEach(function (side, i) {
    var nuc = combine([{ geo: new THREE.SphereGeometry(0.2, 7, 5), color: 0xffffff }, { geo: new THREE.SphereGeometry(0.13, 6, 4), color: 0xffffff, matrix: xform(0.3, 0.1, 0) }]);
    swarm({ geo: nuc, material: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3 }), count: 14, seed: 6 + i, colors: BASES, area: { x: [side * 4.5, side * 5.2], y: [0.6, 5.6], z: [-140, 8] }, k: 1, vz: [-3, -1], vy: [-0.3, 0.3], wobble: 0.3, turn: 1.2, scale: [0.8, 1.5] });
    swarm({ geo: dotGeo(0.25), material: glowMat(0.4), count: 12, seed: 40 + i, colors: [0xffffff, 0xe8e0ff, 0xd8f0ff], area: { x: [side * 4.7, side * 5.2], y: [0.8, 5.6], z: [-140, 8] }, k: 1, vy: [0.4, 1.0], wobble: 0.2, scale: [0.6, 1.4] });
    swarm({ geo: sparkleGeo(0.2), material: glowMat(0.9), count: 10, seed: 70 + i, colors: [0xffffff, 0xffe14a, 0xff6bb5, 0x4fb8ff], area: { x: [side * 4.4, side * 5.2], y: [1.0, 5.8], z: [-140, 8] }, k: 1, turn: 1.5, wobble: 0.1, scale: [0.7, 1.3] });
  });
}

export var dna = { id: 'dna', indoor: true, bay: bay, center: center, arch: arch, extras: extras };
