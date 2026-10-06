/**
 * cartoon.js — the little bits of camp the upgraded body-and-science maps share: faces on everything, lightning bolts,
 * capsules, drops, hanging light strings, a lit sign and a few painted floor and sky pictures.
 *
 * Everything here is built from the mapkit shapes, so it merges into the same few draw calls as the rest of a bay, and
 * everything stays low-poly. Nothing in here is placed in the lanes: the callers put it on the walls or overhead.
 */

import * as THREE from 'three';
import { ball, cyl, cone, ring, box, extrude, combine, xform, bulb, canvasTex, css } from '../mapkit.js';

/**
 * A cartoon face on a round thing: two eyes with highlights, a smile and pink cheeks. It looks along `turn` (yaw), so a
 * face on a wall passes `S.turn` and looks at the runner.
 * @param {THREE.Object3D} g
 * @param {number} r the radius of the thing it sits on
 * @param {{shades?: boolean, lash?: boolean, open?: boolean, color?: number}} [o]
 */
export function face(g, x, y, z, r, turn, o) {
  o = o || {};
  var f = new THREE.Group();
  var ex = r * 0.34;
  var ey = r * 0.16;
  var zz = r * 0.93;
  if (o.shades) {
    box(f, r * 0.5, r * 0.3, r * 0.1, 0x16161e, -ex, ey, zz, { r: 0.3 });
    box(f, r * 0.5, r * 0.3, r * 0.1, 0x16161e, ex, ey, zz, { r: 0.3 });
    box(f, r * 0.2, r * 0.07, r * 0.1, 0x16161e, 0, ey + r * 0.04, zz);
    box(f, r * 0.14, r * 0.06, r * 0.1, 0xffffff, -ex - r * 0.1, ey + r * 0.07, zz + r * 0.06, { bulb: true });
  } else {
    // eyes are short flat discs, which is a handful of triangles each (a sphere would be five times as many)
    [-ex, ex].forEach(function (px) {
      cyl(f, r * 0.2, r * 0.2, r * 0.1, 0xffffff, px, ey, zz, { rx: Math.PI / 2, sy: 1, seg: 7, r: 0.3 });
      cyl(f, r * 0.1, r * 0.1, r * 0.1, 0x1b1b2a, px + r * 0.015, ey - r * 0.01, zz + r * 0.07, { rx: Math.PI / 2, seg: 5 });
      if (o.lash) cyl(f, r * 0.012, r * 0.012, r * 0.22, 0x1b1b2a, px + (px < 0 ? -r * 0.17 : r * 0.17), ey + r * 0.2, zz + r * 0.04, { rz: px < 0 ? 0.7 : -0.7, seg: 3 });
    });
  }
  // a wide smile: the bottom half of a ring, with a tongue when it is open
  ring(f, r * 0.3, r * 0.05, 0x3a1626, 0, -r * 0.14, zz - r * 0.02, { arc: Math.PI, rz: Math.PI, seg: 6, tube: 3 });
  if (o.open) box(f, r * 0.2, r * 0.12, r * 0.06, 0xff7a8a, 0, -r * 0.3, zz - r * 0.01);
  [-1, 1].forEach(function (s) { cyl(f, r * 0.1, r * 0.1, r * 0.05, 0xff8fb0, s * r * 0.62, -r * 0.1, zz - r * 0.1, { rx: Math.PI / 2, seg: 5 }); });
  f.position.set(x, y, z);
  f.rotation.y = turn || 0;
  g.add(f);
  return f;
}

/** A lightning bolt outline, about 1 tall, centred. */
export function boltShape(k) {
  var u = k || 1;
  var s = new THREE.Shape();
  s.moveTo(0.1 * u, 0.5 * u);
  s.lineTo(-0.32 * u, -0.05 * u);
  s.lineTo(-0.04 * u, -0.05 * u);
  s.lineTo(-0.16 * u, -0.5 * u);
  s.lineTo(0.34 * u, 0.12 * u);
  s.lineTo(0.05 * u, 0.12 * u);
  s.closePath();
  return s;
}

/** A lit bolt standing on the wall (facing +z; turn it with ry). */
export function bolt(g, size, color, x, y, z, o) {
  return extrude(g, boltShape(size), 0.1 * size, color, x, y, z, Object.assign({ bulb: true, curve: 2 }, o || {}));
}

/** A capsule lying along z (a pill, a sausage of myelin, a bacterium). */
export function capsule(g, r, len, color, x, y, z, o) {
  o = o || {};
  var yaw = o.ry || 0;
  var grp = new THREE.Group();
  cyl(grp, r, r, len, color, 0, 0, 0, Object.assign({ rx: Math.PI / 2, seg: 8 }, o, { ry: 0 }));
  ball(grp, r, color, 0, 0, len / 2, Object.assign({ seg: 8 }, o, { ry: 0 }));
  ball(grp, r, color, 0, 0, -len / 2, Object.assign({ seg: 8 }, o, { ry: 0 }));
  grp.position.set(x, y, z);
  grp.rotation.y = yaw;
  g.add(grp);
  return grp;
}

/** A teardrop (a drop of blood or water), point up, about 2r tall. */
export function drop(g, r, color, x, y, z, o) {
  ball(g, r, color, x, y, z, Object.assign({ seg: 8 }, o || {}));
  return cone(g, r * 0.82, r * 1.5, color, x, y + r * 1.0, z, Object.assign({ seg: 8 }, o || {}));
}

/** A swoop of tiny lights across the hall at height y, sagging `sag` in the middle. */
export function lightString(g, colors, y, z, o) {
  o = o || {};
  var n = o.n || 12;
  var half = o.half || 5.2;
  var sag = o.sag === undefined ? 0.5 : o.sag;
  var phase = o.phase || 0;
  for (var f = 0; f < n; f++) {
    var t = f / (n - 1);
    var x = -half + t * half * 2;
    ball(g, o.r || 0.1, colors[(f + phase) % colors.length], x, y - Math.sin(t * Math.PI) * sag, z, { seg: 4, bulb: true });
  }
  cyl(g, 0.012, 0.012, half * 2, 0x666677, 0, y - sag * 0.5, z, { rz: Math.PI / 2, seg: 3 });
}

/** A starburst: `n` points, for the fixtures and sparkles. */
export function sparkleGeo(r) {
  var parts = [];
  for (var i = 0; i < 3; i++) parts.push({ geo: new THREE.OctahedronGeometry(r, 0), color: 0xffffff, matrix: xform(0, 0, 0, 0, (i * Math.PI) / 3, 0, i === 0 ? 1 : 0.55, i === 0 ? 0.28 : 1, i === 0 ? 0.28 : 0.28) });
  return combine(parts);
}

/** A small sphere, for bubbles, spores and thought dots. */
export function dotGeo(r) { return combine([{ geo: new THREE.SphereGeometry(r, 7, 5), color: 0xffffff }]); }

/** A soft additive material for glowing swarms. */
export function glowMat(opacity) {
  return new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: opacity === undefined ? 0.7 : opacity, depthWrite: false, blending: THREE.AdditiveBlending });
}

/** A neon sign as a texture: bright letters with a glow on a dark plate. */
export function neonTex(text, color, plate, w, h) {
  w = w || 256;
  h = h || 96;
  return canvasTex('neon' + text + color + plate + w + h, w, h, function (ctx) {
    ctx.fillStyle = css(plate);
    ctx.fillRect(0, 0, w, h);
    ctx.shadowColor = css(color);
    ctx.shadowBlur = h * 0.28;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = css(color);
    ctx.lineWidth = h * 0.06;
    ctx.font = '900 ' + Math.round(h * 0.56) + 'px "Arial Rounded MT Bold", "Trebuchet MS", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(text, w / 2, h / 2 + 3);
    ctx.fillText(text, w / 2, h / 2 + 3);
  });
}

/** An unlit neon sign face on a plate. Returns the mesh, or null if there is no canvas. */
export function neonSign(g, text, color, plate, w, h, x, y, z, o) {
  var tex = neonTex(text, color, plate, o && o.tw, o && o.th);
  if (!tex) return null;
  var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), bulb(0xffffff, { map: tex, side: THREE.DoubleSide }));
  m.position.set(x, y, z);
  if (o && o.ry) m.rotation.y = o.ry;
  if (g) g.add(m);
  return m;
}
