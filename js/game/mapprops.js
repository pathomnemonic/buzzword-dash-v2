/**
 * mapprops.js — small props several bright maps share: trees, flowers, benches, fences, and the little flyers
 * (butterflies, birds) that the swarms draw. Every piece is a handful of low-poly shapes in lit colour.
 */

import * as THREE from 'three';
import { box, cyl, ball, cone, combine, xform } from './mapkit.js';

/** A round low-poly tree: trunk and three leafy balls. `s` scales it. */
export function tree(g, x, z, s, leaf, trunk) {
  var k = s || 1;
  cyl(g, 0.12 * k, 0.18 * k, 1.6 * k, trunk || 0x8a5a33, x, 0.8 * k, z, { seg: 6 });
  ball(g, 0.95 * k, leaf || 0x3fbf5a, x, 2.2 * k, z, { seg: 6 });
  ball(g, 0.7 * k, leaf || 0x3fbf5a, x + 0.45 * k, 1.8 * k, z + 0.2 * k, { seg: 5 });
  ball(g, 0.65 * k, leaf || 0x4fcf6a, x - 0.4 * k, 2.55 * k, z - 0.2 * k, { seg: 5 });
}

/** A pointed pine. */
export function pine(g, x, z, s, leaf) {
  var k = s || 1;
  cyl(g, 0.1 * k, 0.14 * k, 0.8 * k, 0x7a4a2a, x, 0.4 * k, z, { seg: 5 });
  cone(g, 0.9 * k, 1.3 * k, leaf || 0x2f9e5a, x, 1.4 * k, z, { seg: 7 });
  cone(g, 0.7 * k, 1.1 * k, leaf || 0x38b066, x, 2.1 * k, z, { seg: 7 });
  cone(g, 0.45 * k, 0.9 * k, leaf || 0x40c070, x, 2.8 * k, z, { seg: 7 });
}

/** A hedge: a long rounded box with a lighter top. */
export function hedge(g, x, y, z, w, h, d, color) {
  box(g, d, h, w, color || 0x2fae58, x, y + h / 2, z);
  box(g, d * 0.8, 0.12, w * 0.96, 0x4fd06f, x, y + h + 0.04, z);
}

/** A clump of flowers: thin stems with coloured round heads. */
export function flowers(g, x, z, colors, n, spread) {
  for (var i = 0; i < n; i++) {
    var a = i * 2.4;
    var fx = x + Math.cos(a) * spread * ((i % 3) / 3 + 0.35);
    var fz = z + Math.sin(a) * spread * 1.6 * ((i % 4) / 4 + 0.3);
    var h = 0.35 + (i % 3) * 0.12;
    cyl(g, 0.012, 0.012, h, 0x2f9e4a, fx, h / 2, fz, { seg: 3 });
    ball(g, 0.075, colors[i % colors.length], fx, h + 0.04, fz, { seg: 5 });
  }
}

/** A park bench facing +x (turn it with ry). */
export function bench(g, x, z, ry, color) {
  var c = color || 0xc9783a;
  var o = { ry: ry || 0 };
  var cos = Math.cos(ry || 0);
  var sin = Math.sin(ry || 0);
  function at(dx, dz) { return [x + dx * cos + dz * sin, z - dx * sin + dz * cos]; }
  var seat = at(0, 0);
  box(g, 0.5, 0.07, 1.4, c, seat[0], 0.5, seat[1], o);
  var back = at(-0.22, 0);
  box(g, 0.07, 0.5, 1.4, c, back[0], 0.82, back[1], o);
  [-0.6, 0.6].forEach(function (dz) {
    var leg = at(0, dz);
    box(g, 0.45, 0.5, 0.07, 0x4a4f5e, leg[0], 0.25, leg[1], o);
  });
}

/** A run of white picket fence along z. */
export function picket(g, x, z, len, h, color) {
  var n = Math.round(len / 0.3);
  for (var i = 0; i < n; i++) box(g, 0.05, h, 0.12, color || 0xffffff, x, h / 2, z - len / 2 + (i + 0.5) * (len / n));
  box(g, 0.05, 0.06, len, color || 0xffffff, x, h * 0.35, z);
  box(g, 0.05, 0.06, len, color || 0xffffff, x, h * 0.8, z);
}

/** One butterfly (two wings and a body) as a vertex-coloured geometry for a swarm. The wings are flat in x-z. */
export function butterflyGeo() {
  var wing = new THREE.CircleGeometry(0.16, 6);
  return combine([
    { geo: wing, color: 0xffffff, matrix: xform(-0.15, 0, 0, -Math.PI / 2, 0, 0, 1, 1.3, 1) },
    { geo: wing, color: 0xffffff, matrix: xform(0.15, 0, 0, -Math.PI / 2, 0, 0, 1, 1.3, 1) },
    { geo: new THREE.CylinderGeometry(0.02, 0.02, 0.26, 4), color: 0x333344, matrix: xform(0, 0, 0, Math.PI / 2, 0, 0) }
  ]);
}

/** A little bird seen from the side: body, head, beak, wing. Faces +z (the way it flies). */
export function birdGeo() {
  return combine([
    { geo: new THREE.SphereGeometry(0.18, 6, 5), color: 0xffffff, matrix: xform(0, 0, 0, 0, 0, 0, 0.8, 0.8, 1.3) },
    { geo: new THREE.SphereGeometry(0.1, 6, 5), color: 0xffffff, matrix: xform(0, 0.08, 0.26) },
    { geo: new THREE.ConeGeometry(0.04, 0.12, 4), color: 0xffa020, matrix: xform(0, 0.07, 0.36, Math.PI / 2, 0, 0) },
    { geo: new THREE.BoxGeometry(0.7, 0.03, 0.2), color: 0xdde6f0, matrix: xform(0, 0.05, 0.02) }
  ]);
}
