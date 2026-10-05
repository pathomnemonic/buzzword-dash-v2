/**
 * holiday.js — Holiday Wards: the hospital decorated for whatever is happening on the calendar.
 *
 * One map, five looks, picked from today's date when the map is built:
 *   winter  (Dec 1 - Jan 6)   snow, lit pine trees, presents, snowmen, candy canes, falling snow
 *   spring  (Mar 15 - Apr 30) blossom trees, painted eggs, bunnies, tulips, butterflies
 *   summer  (Jun 15 - Aug 31) beach umbrellas, palms, beach balls, sandcastles, gulls
 *   autumn  (Oct 1 - Nov 5)   pumpkins, lanterns, golden trees, hay, friendly bats, falling leaves
 *   party   (every other day) balloons, presents, a cake, streamers and confetti
 * The layout is the same every time (so it scrolls without a seam); only the decorations change.
 */

import * as THREE from 'three';
import { box, cyl, ball, cone, ring, extrude, starShape, combine, xform, canvasTex, floorPanel, sideCtx, slab, kitAt } from '../mapkit.js';
import { swarm, cloudBank } from '../mapfx.js';
import { tree, pine, flowers, butterflyGeo, birdGeo, picket } from '../mapprops.js';

/** Which look today gets. `date` is a Date (the local calendar day counts). */
export function holidaySeason(date) {
  var d = date || new Date();
  var m = d.getMonth() + 1;
  var day = d.getDate();
  var md = m * 100 + day;
  if (md >= 1201 || md <= 106) return 'winter';
  if (md >= 315 && md <= 430) return 'spring';
  if (md >= 615 && md <= 831) return 'summer';
  if (md >= 1001 && md <= 1105) return 'autumn';
  return 'party';
}

var LOOKS = {
  winter: { floor: ['#ffffff', '#c8e0ff'], edge: '#a8c8f0', ground: 0xf4f8ff, bg: 0xdfeeff, top: 0x7fb0f0, sun: 0xffffff, light: [0.8, 0.85, 0.8], colors: [0xe03a3a, 0x2fae58, 0xffd23f, 0x3d8bff] },
  spring: { floor: ['#ffc8de', '#fff0b8'], edge: '#7fdc7a', ground: 0x8fe08a, bg: 0xdff4ff, top: 0x4aa8f0, sun: 0xfff2c0, light: [0.8, 0.85, 1.0], colors: [0xff8fb8, 0xffe06a, 0xb89aff, 0x7ad8ff] },
  summer: { floor: ['#ffe08a', '#ffc860'], edge: '#7fe0ff', ground: 0x4fd0e8, bg: 0xbfeaff, top: 0x1a86f0, sun: 0xfff0b0, light: [0.75, 0.85, 1.1], colors: [0xff5a4a, 0xffd23f, 0x2fd0d8, 0xff8fb8] },
  autumn: { floor: ['#ffdca0', '#ffb86a'], edge: '#e8803a', ground: 0xd98a3a, bg: 0xffcf9a, top: 0xe8803a, sun: 0xffd9a0, light: [0.8, 0.85, 0.95], colors: [0xff8a1f, 0xffc23f, 0x9a62f0, 0xd9382f] },
  party: { floor: ['#ffb8d8', '#b8d4ff'], edge: '#b89aff', ground: 0xffe9f4, bg: 0xdff0ff, top: 0x4aa8f0, sun: 0xfff2c0, light: [0.85, 0.85, 0.9], colors: [0xff5a8a, 0xffd23f, 0x3fd4a0, 0x5a8aff] }
};

var _season = 'party';

/** Called when a track is built: pick today's look and put its colours on the skin. */
function prepare(skin, date) {
  _season = holidaySeason(date);
  var L = LOOKS[_season];
  skin.season = _season;
  skin.colors.bg = L.bg;
  skin.colors.sky = L.top;
  skin.colors.ground = L.ground;
  skin.sky = { top: L.top, horizon: L.bg, sun: L.sun };
  skin.light = { ambient: L.light[0], hemi: L.light[1], dir: L.light[2] };
  skin.colors.lane = L.colors[0];
  skin.colors.coin = 0xffcc22;
  return _season;
}

function floorPicture() {
  var L = LOOKS[_season];
  return canvasTex('holiday_floor_' + _season, 576, 768, function (ctx, w, h) {
    ctx.fillStyle = L.edge; ctx.fillRect(0, 0, w, h);
    for (var j = 0; j < 8; j++) for (var i = 0; i < 6; i++) { ctx.fillStyle = (i + j) % 2 ? L.floor[0] : L.floor[1]; ctx.fillRect(i * 96, j * 96, 96, 96); }
    if (_season === 'winter') { ctx.fillStyle = 'rgba(180,200,240,0.4)'; for (var s = 0; s < 40; s++) ctx.fillRect((s * 83) % w, (s * 131) % h, 6, 3); }
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; [-1.5, 1.5].forEach(function (lx) { ctx.fillRect(w / 2 + lx * 48 - 3, 0, 6, h); });
  });
}

function gift(g, x, z, c, s) {
  box(g, 0.5 * s, 0.4 * s, 0.5 * s, c, x, 0.2 * s, z);
  box(g, 0.52 * s, 0.4 * s, 0.1 * s, 0xffffff, x, 0.2 * s, z);
  box(g, 0.1 * s, 0.42 * s, 0.52 * s, 0xffffff, x, 0.2 * s, z);
  ball(g, 0.1 * s, 0xffffff, x, 0.46 * s, z, { seg: 4 });
}

function lights(g, x, y, z, r, cols) {
  for (var i = 0; i < 8; i++) { var a = i * 2.4; ball(g, 0.07, cols[i % cols.length], x + Math.cos(a) * r, y + (i % 4) * 0.45, z + Math.sin(a) * r, { seg: 4, bulb: true }); }
}

// ---- winter ----
function winter(g, S, z, k) {
  var C = LOOKS.winter.colors;
  if (k === 0) { pine(g, S.in(0.9), z, 1.5); lights(g, S.in(0.9), 0.8, z, 0.8, C); ball(g, 0.15, 0xffd23f, S.in(0.9), 4.4, z, { seg: 5, bulb: true }); gift(g, S.in(0.5), z + 1.1, C[0], 1); gift(g, S.in(0.5), z - 1.0, C[3], 0.8); }
  else if (k === 1) { ball(g, 0.5, 0xffffff, S.in(0.7), 0.45, z, { seg: 7 }); ball(g, 0.38, 0xffffff, S.in(0.7), 1.1, z, { seg: 7 }); ball(g, 0.28, 0xffffff, S.in(0.7), 1.6, z, { seg: 7 }); cone(g, 0.05, 0.3, 0xff8a1f, S.in(0.7) - S.side * 0.3, 1.6, z, { seg: 4, rz: S.side * Math.PI / 2 }); cyl(g, 0.3, 0.3, 0.3, 0x2a2d3a, S.in(0.7), 1.95, z, { seg: 8 }); box(g, 0.6, 0.1, 0.1, 0xe03a3a, S.in(0.7), 1.4, z); }
  else if (k === 2) { [-1.2, 0, 1.2].forEach(function (dz, i) { cyl(g, 0.07, 0.07, 1.2, i % 2 ? 0xe03a3a : 0xffffff, S.in(0.5), 0.6, z + dz, { seg: 6 }); ring(g, 0.2, 0.07, i % 2 ? 0xffffff : 0xe03a3a, S.in(0.5), 1.2, z + dz, { arc: Math.PI, seg: 8, tube: 4, ry: Math.PI / 2 }); }); gift(g, S.in(0.8), z, C[1], 1.2); }
  else { pine(g, S.in(0.8), z - 0.8, 1.2); lights(g, S.in(0.8), 0.7, z - 0.8, 0.7, C); pine(g, S.in(1.2), z + 1.2, 0.9); gift(g, S.in(0.5), z + 0.2, C[2], 0.9); }
}

// ---- autumn ----
function autumn(g, S, z, k) {
  function pumpkin(x, zz, s, c) { if (!kitAt(g, 'hall/pumpkin_orange', { width: 0.9 * s, height: 0.8 * s, depth: 0.9 * s }, S.side, x, 0, zz, 0)) ball(g, 0.4 * s, c || 0xff8a1f, S.in(x), 0.35 * s, zz, { seg: 7, sy: 0.85 }); }
  if (k === 0) { for (var i = 0; i < 4; i++) pumpkin(0.6 + (i % 2) * 0.5, z - 1.2 + i * 0.8, 1 + (i % 3) * 0.3); }
  else if (k === 1) { if (!kitAt(g, 'hall/tree_pine_orange_large', { width: 2, height: 4, depth: 2 }, S.side, 0.9, 0, z, 0)) pine(g, S.in(0.9), z, 1.5, 0xe8802a); }
  else if (k === 2) { cyl(g, 0.05, 0.05, 2.6, 0x4a3a2a, S.in(0.4), 1.3, z, { seg: 4 }); box(g, 0.6, 0.06, 0.06, 0x4a3a2a, S.in(0.55), 2.6, z); ball(g, 0.18, 0xffc23f, S.in(0.7), 2.4, z, { seg: 5, bulb: true }); for (var j = 0; j < 3; j++) cyl(g, 0.5, 0.5, 0.7, 0xf0c24a, S.in(0.9), 0.4, z - 1.2 + j * 1.2, { seg: 8, rz: Math.PI / 2 }); }
  else { if (!kitAt(g, 'hall/tree_pine_yellow_large', { width: 2, height: 4, depth: 2 }, S.side, 0.9, 0, z + 0.5, 0)) pine(g, S.in(0.9), z + 0.5, 1.4, 0xf0b840); pumpkin(0.5, z - 1.2, 0.9, 0xffa030); }
}

// ---- spring ----
function spring(g, S, z, k) {
  var C = LOOKS.spring.colors;
  if (k === 0) { tree(g, S.in(0.9), z, 1.5, 0xffa8c8); flowers(g, S.in(0.6), z + 1.3, C, 8, 0.3); }
  else if (k === 1) { for (var i = 0; i < 5; i++) { ball(g, 0.25, C[i % 4], S.in(0.6 + (i % 2) * 0.3), 0.28, z - 1.4 + i * 0.7, { seg: 7, sy: 1.3 }); } }
  else if (k === 2) { ball(g, 0.35, 0xffffff, S.in(0.7), 0.4, z, { seg: 7, sy: 0.9 }); ball(g, 0.25, 0xffffff, S.in(0.7), 0.85, z + 0.1, { seg: 7 }); box(g, 0.08, 0.5, 0.12, 0xffffff, S.in(0.7), 1.2, z + 0.2); box(g, 0.08, 0.5, 0.12, 0xffffff, S.in(0.7), 1.2, z - 0.05); flowers(g, S.in(0.5), z - 1.2, C, 6, 0.3); }
  else { tree(g, S.in(0.9), z - 0.5, 1.3, 0xffc8d8); flowers(g, S.in(0.6), z + 1.0, C, 10, 0.4); }
}

// ---- summer ----
function summer(g, S, z, k) {
  var C = LOOKS.summer.colors;
  if (k === 0) { cyl(g, 0.03, 0.03, 2.3, 0xffffff, S.in(0.7), 1.15, z, { seg: 4 }); cone(g, 1.2, 0.5, C[0], S.in(0.7), 2.4, z, { seg: 8 }); box(g, 0.8, 0.12, 1.6, 0xffffff, S.in(0.7), 0.3, z + 0.6); }
  else if (k === 1) { cyl(g, 0.1, 0.16, 2.6, 0xb98a55, S.in(0.8), 1.3, z, { seg: 5 }); for (var i = 0; i < 6; i++) { var a = i * 1.05; box(g, 0.2, 0.05, 1.4, 0x2fbf5a, S.in(0.8) + Math.cos(a) * 0.6, 2.7, z + Math.sin(a) * 0.6, { ry: -a + Math.PI / 2, rx: 0.5 }); } }
  else if (k === 2) { ball(g, 0.5, 0xffffff, S.in(0.6), 0.5, z - 0.8, { seg: 8 }); ball(g, 0.5, C[1], S.in(0.6), 0.5, z - 0.8, { seg: 8, sx: 0.5 }); cone(g, 0.6, 0.8, 0xe8c27a, S.in(0.9), 0.4, z + 0.9, { seg: 6 }); box(g, 0.2, 0.3, 0.2, 0xe8c27a, S.in(0.9), 0.95, z + 0.9); cyl(g, 0.01, 0.01, 0.4, 0x333333, S.in(0.9), 1.3, z + 0.9, { seg: 3 }); }
  else { ring(g, 0.45, 0.14, C[3], S.in(0.5), 0.5, z, { rx: Math.PI / 2, seg: 12, tube: 5 }); ring(g, 0.45, 0.14, C[2], S.in(0.5), 0.5, z + 1.2, { rx: Math.PI / 2, seg: 12, tube: 5 }); cyl(g, 0.03, 0.03, 2.3, 0xffffff, S.in(1.0), 1.15, z - 1.0, { seg: 4 }); cone(g, 1.1, 0.5, C[1], S.in(1.0), 2.4, z - 1.0, { seg: 8 }); }
}

// ---- party ----
function party(g, S, z, k) {
  var C = LOOKS.party.colors;
  if (k === 0) { cyl(g, 0.7, 0.7, 0.5, 0xfff0f6, S.in(0.8), 0.5, z, { seg: 12 }); cyl(g, 0.5, 0.5, 0.45, C[0], S.in(0.8), 0.98, z, { seg: 12 }); ball(g, 0.12, 0xe03a3a, S.in(0.8), 1.3, z, { seg: 5 }); for (var i = 0; i < 5; i++) cyl(g, 0.02, 0.02, 0.2, C[i % 4], S.in(0.8) + Math.cos(i * 1.26) * 0.3, 1.3, z + Math.sin(i * 1.26) * 0.3, { seg: 3 }); }
  else if (k === 1) { gift(g, S.in(0.7), z - 0.8, C[0], 1.4); gift(g, S.in(0.7), z + 0.5, C[2], 1.1); gift(g, S.in(0.8), z + 1.4, C[1], 0.8); }
  else if (k === 2) { for (var j = 0; j < 7; j++) ball(g, 0.32, C[j % 4], S.in(0.6), 1.5 + Math.sin(j) * 0.4, z - 1.5 + j * 0.5, { seg: 6, sy: 1.15 }); cyl(g, 0.04, 0.04, 1.4, 0xffffff, S.in(0.6), 0.7, z, { seg: 4 }); }
  else { extrude(g, starShape(0.9, 0.4, 5), 0.15, 0xffd23f, S.in(0.5), 2.6, z, { ry: S.turn }); cyl(g, 0.04, 0.04, 2.0, 0xffffff, S.in(0.5), 1.0, z, { seg: 4 }); gift(g, S.in(0.9), z + 1.2, C[3], 1.0); }
}

var BUILD = { winter: winter, autumn: autumn, spring: spring, summer: summer, party: party };

function bay(g, side, z, k) {
  var S = sideCtx(side);
  picket(g, S.in(0.0) + side * 0.12, z, 4, 0.7, LOOKS[_season].colors[k % 4]);
  BUILD[_season](g, S, z, k);
}

function center(g, z) { floorPanel(g, floorPicture(), z, 12); }

function arch(g, z, i) {
  var C = LOOKS[_season].colors;
  for (var f = 0; f < 13; f++) {
    var t = f / 12;
    ball(g, 0.1, C[(f + i) % 4], -5.4 + t * 10.8, 6.5 - Math.sin(t * Math.PI) * 0.5, z, { seg: 4, bulb: true });
  }
  if (_season === 'party') [-1, 1].forEach(function (s, n) { ball(g, 0.3, C[(i + n) % 4], s * 4.7, 5.9, z, { seg: 6, sy: 1.2 }); });
}

function ground(g) { slab(g, 400, 400, LOOKS[_season].ground, 0, -0.02, -190, { r: 1 }); }

function extras() {
  cloudBank(8, { seed: 8 });
  var L = LOOKS[_season];
  var flake = combine([{ geo: new THREE.SphereGeometry(0.07, 5, 4), color: 0xffffff }]);
  var leaf = combine([{ geo: new THREE.PlaneGeometry(0.2, 0.14), color: 0xffffff }]);
  [-1, 1].forEach(function (side, i) {
    var area = { x: [side * 4.6, side * 9], y: [0.3, 7], z: [-120, 6] };
    if (_season === 'winter') swarm({ geo: flake, material: new THREE.MeshBasicMaterial({ vertexColors: true }), count: 50, seed: 5 + i, colors: [0xffffff], area: area, k: 1, vy: [-1.0, -0.5], wobble: 0.3, scale: [0.8, 1.6] });
    else if (_season === 'autumn') swarm({ geo: leaf, material: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }), count: 36, seed: 7 + i, colors: [0xe8802a, 0xf0b840, 0xd9382f], area: area, k: 1, vy: [-0.9, -0.5], wobble: 0.4, turn: 3, scale: [1.2, 2] });
    else if (_season === 'spring' || _season === 'summer') swarm({ geo: butterflyGeo(), count: 8, seed: 9 + i, colors: L.colors, area: { x: [side * 5, side * 9], y: [1, 3], z: [-140, 8] }, k: 1, vx: [-0.3, 0.3], vz: [-0.5, 0.5], wobble: 0.5, flap: 0.9, scale: [1, 1.5], flat: true });
    else swarm({ geo: leaf, material: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }), count: 40, seed: 11 + i, colors: L.colors, area: area, k: 1, vy: [-0.9, -0.5], wobble: 0.3, turn: 3, scale: [1, 1.6] });
  });
  if (_season === 'autumn') {
    var bat = combine([{ geo: new THREE.SphereGeometry(0.12, 5, 4), color: 0xffffff }, { geo: new THREE.BoxGeometry(0.7, 0.03, 0.2), color: 0xffffff, matrix: xform(0, 0.03, 0) }]);
    swarm({ geo: bat, count: 8, seed: 3, colors: [0x5a3a8a, 0x3a2a5a], area: { x: [-22, 22], y: [7, 12], z: [-140, 8] }, k: 0.4, vz: [-3, -1.5], face: true, flap: 0.6, scale: [1.5, 2.2] });
  } else if (_season === 'summer') {
    swarm({ geo: birdGeo(), count: 6, seed: 4, colors: [0xffffff], area: { x: [-24, 24], y: [7, 12], z: [-140, 8] }, k: 0.3, vz: [-4, -2.5], face: true, flap: 0.5, scale: [1.3, 2] });
  }
}

export var holiday = { id: 'holiday', indoor: false, bay: bay, center: center, arch: arch, ground: ground, extras: extras, prepare: prepare };
