/**
 * mapkit.js — the building blocks the bright "world" maps are made of.
 *
 * A world map (Pediatric Playland, Cafeteria Carnival, ...) repeats every WORLD_PERIOD units, exactly like the
 * Hospital Hallway: four 4-unit bays per side, so the scenery can scroll past forever without a seam. This file holds
 * what every one of them needs:
 *
 *  - lit, cached materials (so thousands of pieces merge into a handful of draw calls) and "bulb" materials that glow
 *  - small shape helpers (box, cylinder, ball, cone, ring, quad, ...) that add a mesh to a group and place it
 *  - canvas-painted textures (stripes, checks, tiles, signs with lettering)
 *  - kit models: the KayKit pack, when it is loaded (high graphics tier); every use has a built-in stand-in
 *  - a build context, so a map can say "this spins" or "this drifts past" while it is built and the game animates it
 *
 * Nothing in here knows about any one map. The maps live in js/game/maps/.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildScenery } from './scenery.js';

/** One repeat of the scenery along the track: four bays of WORLD_BAY units. */
export var WORLD_BAY = 4;
export var WORLD_PERIOD = 16;
/** Where the lanes end. Nothing the player can run into, and nothing round and gold, is placed inside this. */
export var LANE_EDGE = 4.3;
/** The inner face of the side walls. */
export var WALL_X = 5.5;

// ===== BUILD CONTEXT =====
// buildTrack() opens a context, the map builders record what animates into it, and buildTrack() reads it back.

var cur = null;

/**
 * @param {object} skin
 * @param {THREE.Object3D} root the track's root (movers are added here)
 */
export function beginWorld(skin, root) {
  var movers = new THREE.Group();
  movers.name = 'worldMovers';
  if (root) root.add(movers);
  cur = { skin: skin, root: root, fx: [], movers: movers };
  return cur;
}

/** Close the context and hand back { fx: [function(time, dt, move)], movers: Group }. */
export function endWorld() {
  var c = cur;
  cur = null;
  return c || { fx: [], movers: null };
}

export function currentWorld() { return cur; }

/** Register something to run every frame: fn(time, dt, move). Does nothing when no map is being built (unit tests). */
export function animate(fn) {
  if (cur) cur.fx.push(fn);
  return fn;
}

// ===== MATERIALS =====

var _mats = {};

function key(parts) { return parts.join('|'); }

/**
 * A lit, slightly glossy material, cached so every use of a colour is the same material (and merges into one draw call).
 * @param {number} color hex
 * @param {{r?: number, m?: number, e?: number, ei?: number, op?: number, map?: THREE.Texture, side?: number, flat?: boolean, env?: number}} [o]
 *   r roughness, m metalness, e emissive colour, ei emissive strength, op opacity, env reflection strength
 */
export function mat(color, o) {
  o = o || {};
  var k = key(['L', color, o.r, o.m, o.e, o.ei, o.op, o.map && o.map.uuid, o.side, o.flat, o.env]);
  var m = _mats[k];
  if (!m) {
    m = _mats[k] = new THREE.MeshStandardMaterial({
      color: color,
      roughness: o.r === undefined ? 0.6 : o.r,
      metalness: o.m || 0,
      emissive: o.e || 0x000000,
      emissiveIntensity: o.ei || 0,
      transparent: o.op !== undefined && o.op < 1,
      opacity: o.op === undefined ? 1 : o.op,
      map: o.map || null,
      side: o.side === undefined ? THREE.FrontSide : o.side,
      flatShading: !!o.flat,
      envMapIntensity: o.env === undefined ? 0.55 : o.env
    });
    if (m.transparent) m.depthWrite = false;
  }
  return m;
}

/** A flat, unlit colour that does not react to light: lamps, bulbs, sign faces. `add` makes it glow additively. */
export function bulb(color, o) {
  o = o || {};
  var k = key(['B', color, o.op, o.add, o.map && o.map.uuid, o.side, o.fog]);
  var m = _mats[k];
  if (!m) {
    m = _mats[k] = new THREE.MeshBasicMaterial({
      color: color,
      transparent: (o.op !== undefined && o.op < 1) || !!o.add,
      opacity: o.op === undefined ? 1 : o.op,
      map: o.map || null,
      side: o.side === undefined ? THREE.FrontSide : o.side,
      fog: o.fog !== false,
      blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    if (m.transparent) m.depthWrite = false;
  }
  return m;
}

function materialFor(color, o) {
  if (o && o.mat) return o.mat;
  if (o && o.bulb) return bulb(color, o);
  return mat(color, o);
}

// ===== SHAPES =====
// Every helper adds the mesh to `g`, places it, and returns it. `o` can carry rx, ry, rz (rotation, radians),
// sx, sy, sz (scale) and anything mat()/bulb() accept; `bulb: true` makes it unlit; `mat` supplies a material.

function place(mesh, x, y, z, o) {
  mesh.position.set(x, y, z);
  if (o) {
    if (o.rx) mesh.rotation.x = o.rx;
    if (o.ry) mesh.rotation.y = o.ry;
    if (o.rz) mesh.rotation.z = o.rz;
    if (o.sx !== undefined || o.sy !== undefined || o.sz !== undefined) mesh.scale.set(o.sx === undefined ? 1 : o.sx, o.sy === undefined ? 1 : o.sy, o.sz === undefined ? 1 : o.sz);
  }
  return mesh;
}

function add(g, mesh, x, y, z, o) {
  place(mesh, x, y, z, o);
  if (g) g.add(mesh);
  return mesh;
}

export function box(g, w, h, d, color, x, y, z, o) {
  return add(g, new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materialFor(color, o)), x, y, z, o);
}

/** A cylinder along y (rotate with rx / rz). rt and rb are the top and bottom radii. */
export function cyl(g, rt, rb, h, color, x, y, z, o) {
  return add(g, new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, (o && o.seg) || 10), materialFor(color, o)), x, y, z, o);
}

export function ball(g, r, color, x, y, z, o) {
  var seg = (o && o.seg) || 10;
  return add(g, new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(5, Math.round(seg * 0.7))), materialFor(color, o)), x, y, z, o);
}

export function cone(g, r, h, color, x, y, z, o) {
  return add(g, new THREE.Mesh(new THREE.ConeGeometry(r, h, (o && o.seg) || 10), materialFor(color, o)), x, y, z, o);
}

/** A torus (ring). R is the big radius, r the tube; `arc` is how much of the circle (radians). */
export function ring(g, R, r, color, x, y, z, o) {
  return add(g, new THREE.Mesh(new THREE.TorusGeometry(R, r, (o && o.tube) || 6, (o && o.seg) || 16, (o && o.arc) || Math.PI * 2), materialFor(color, o)), x, y, z, o);
}

/** A flat rectangle standing upright, facing +z (turn it with ry). */
export function quad(g, w, h, color, x, y, z, o) {
  return add(g, new THREE.Mesh(new THREE.PlaneGeometry(w, h), materialFor(color, o)), x, y, z, o);
}

/** A flat rectangle lying on the ground (a rug, a painted line). `ry` turns it about the vertical axis. */
export function slab(g, w, d, color, x, y, z, o) {
  var m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), materialFor(color, o));
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = (o && o.ry) || 0;
  return add(g, m, x, y, z, o && { sx: o.sx, sy: o.sy, sz: o.sz });
}

/** A 2D outline pushed out into a solid (a star, a heart, a cloud edge). */
export function extrude(g, shape, depth, color, x, y, z, o) {
  var geo = new THREE.ExtrudeGeometry(shape, { depth: depth, bevelEnabled: !!(o && o.bevel), bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1, curveSegments: (o && o.curve) || 6 });
  geo.translate(0, 0, -depth / 2);
  return add(g, new THREE.Mesh(geo, materialFor(color, o)), x, y, z, o);
}

/** A star outline with `n` points. */
export function starShape(R, r, n) {
  var s = new THREE.Shape();
  var pts = n || 5;
  for (var i = 0; i < pts * 2; i++) {
    var rad = i % 2 === 0 ? R : r;
    var a = Math.PI / 2 + (i * Math.PI) / pts;
    if (i === 0) s.moveTo(Math.cos(a) * rad, Math.sin(a) * rad); else s.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  s.closePath();
  return s;
}

/** A heart outline about 1 unit wide, scaled by `k`. */
export function heartShape(k) {
  var s = new THREE.Shape();
  var u = k || 1;
  s.moveTo(0, -0.5 * u);
  s.bezierCurveTo(-0.9 * u, 0.1 * u, -0.5 * u, 0.7 * u, 0, 0.3 * u);
  s.bezierCurveTo(0.5 * u, 0.7 * u, 0.9 * u, 0.1 * u, 0, -0.5 * u);
  return s;
}

/** Several shapes with their own vertex colours as ONE geometry (for instancing a fish, a balloon, a bird). */
export function combine(parts) {
  var geos = parts.map(function (p) {
    var geo = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    if (p.matrix) geo.applyMatrix4(p.matrix);
    var col = new THREE.Color(p.color);
    var n = geo.attributes.position.count;
    var colors = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) { colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    Object.keys(geo.attributes).forEach(function (name) { if (name !== 'position' && name !== 'normal' && name !== 'color') geo.deleteAttribute(name); });
    geo.index = null;
    return geo;
  });
  var merged = mergeGeometries(geos, false);
  geos.forEach(function (geo) { geo.dispose(); });
  return merged;
}

/** A matrix from position, yaw/pitch/roll and scale, for combine(). */
export function xform(x, y, z, rx, ry, rz, sx, sy, sz) {
  var m = new THREE.Matrix4();
  var q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0));
  m.compose(new THREE.Vector3(x || 0, y || 0, z || 0), q, new THREE.Vector3(sx === undefined ? 1 : sx, sy === undefined ? 1 : sy, sz === undefined ? 1 : sz));
  return m;
}

/** Keep an object (and everything in it) out of the draw-call merging, because it is going to move. */
export function keepSeparate(obj) {
  obj.traverse(function (o) { o.userData.noMerge = true; });
  return obj;
}

// ===== TEXTURES =====

var _tex = {};

/**
 * A texture drawn on a canvas once and reused. Returns null where there is no canvas (unit tests), so every caller
 * must cope with that.
 * @param {string} name cache key
 * @param {number} w
 * @param {number} h
 * @param {function(CanvasRenderingContext2D, number, number): void} draw
 * @param {{repeat?: number[], nearest?: boolean, aniso?: number}} [o]
 */
export function canvasTex(name, w, h, draw, o) {
  if (_tex[name] !== undefined) return _tex[name];
  var t = null;
  if (typeof document !== 'undefined') {
    try {
      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext && canvas.getContext('2d');
      if (ctx) {
        draw(ctx, w, h);
        t = new THREE.CanvasTexture(canvas);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = (o && o.aniso) || 4;
        if (o && o.repeat) t.repeat.set(o.repeat[0], o.repeat[1]);
        if (o && o.nearest) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter; }
        if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
      }
    } catch (e) {
      t = null;
    }
  }
  _tex[name] = t;
  return t;
}

export function css(hex) { return '#' + ('000000' + hex.toString(16)).slice(-6); }

/** Stripes of two colours, `n` of each pair across the texture (vertical stripes; turn the quad for others). */
export function stripeTex(c1, c2, n) {
  return canvasTex('stripe' + c1 + '_' + c2 + '_' + n, 64, 64, function (ctx, w, h) {
    var sw = w / (n * 2);
    for (var i = 0; i < n * 2; i++) { ctx.fillStyle = css(i % 2 ? c2 : c1); ctx.fillRect(i * sw, 0, Math.ceil(sw), h); }
  });
}

/** A checkerboard of `n` x `n` squares. */
export function checkerTex(c1, c2, n) {
  return canvasTex('check' + c1 + '_' + c2 + '_' + n, 128, 128, function (ctx, w, h) {
    var s = w / n;
    for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) { ctx.fillStyle = css((i + j) % 2 ? c2 : c1); ctx.fillRect(i * s, j * s, Math.ceil(s), Math.ceil(s)); }
  });
}

/**
 * A sign face: a rounded plate with centred lettering, drawn once per text. The text is cosmetic only.
 * @param {string} text
 * @param {number} bg plate colour (hex)
 * @param {number} fg letter colour (hex)
 * @param {{w?: number, h?: number, font?: string, border?: number, size?: number}} [o]
 */
export function signTex(text, bg, fg, o) {
  o = o || {};
  var w = o.w || 256;
  var h = o.h || 96;
  return canvasTex('sign' + text + bg + fg + w + h + (o.border || ''), w, h, function (ctx) {
    var r = h * 0.22;
    ctx.fillStyle = css(bg);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(2, 2, w - 4, h - 4, r); else ctx.rect(2, 2, w - 4, h - 4);
    ctx.fill();
    if (o.border !== undefined) { ctx.lineWidth = h * 0.07; ctx.strokeStyle = css(o.border); ctx.stroke(); }
    ctx.fillStyle = css(fg);
    ctx.font = (o.font || '900 ') + Math.round(o.size || h * 0.56) + 'px "Arial Rounded MT Bold", "Trebuchet MS", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + h * 0.04);
  });
}

/** Paint a texture onto a mesh (cloning the material so other meshes keep theirs). */
export function textured(mesh, tex, o) {
  if (!tex) return mesh;
  mesh.material = mat(0xffffff, { map: tex, r: (o && o.r) === undefined ? 0.7 : o.r, e: o && o.e, ei: o && o.ei, op: o && o.op, side: o && o.side });
  return mesh;
}

/** An unlit sign (a quad carrying lettering). */
export function sign(g, text, bg, fg, w, h, x, y, z, o) {
  var tex = signTex(text, bg, fg, { border: o && o.border, w: o && o.tw, h: o && o.th });
  var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), tex ? bulb(0xffffff, { map: tex, side: THREE.DoubleSide }) : bulb(bg, { side: THREE.DoubleSide }));
  return add(g, m, x, y, z, o);
}

// ===== KIT MODELS =====

/**
 * Put a kit model ('rest/food_burger') in the world, scaled to fit the box and standing on y. Returns the group, or
 * null when the model is not loaded (low and medium graphics) so the caller can draw its own version instead.
 * @param {THREE.Object3D} g parent
 * @param {string} name 'pack/model'
 * @param {{width?: number, height?: number, depth?: number}} fit
 * @param {number} yaw turn about the vertical axis (radians); 0 means the model's front faces +z
 */
export function kit(g, name, fit, x, y, z, yaw) {
  var m = buildScenery(name, fit);
  if (!m) return null;
  m.position.set(x, y, z);
  m.rotation.y = yaw || 0;
  g.add(m);
  return m;
}

/** A kit model standing against a side wall, its front facing the track. */
export function kitAt(g, name, fit, side, xin, y, z, extraYaw) {
  return kit(g, name, fit, side * WALL_X - side * xin, y, z, (side < 0 ? Math.PI / 2 : -Math.PI / 2) + (extraYaw || 0));
}

// ===== SMALL SHARED PROPS =====

/** A fluffy cloud: a few overlapping white balls. Returns a group of about 90 triangles per ball. */
export function cloudShape() {
  var parts = [];
  var balls = [[0, 0, 0, 1], [1.0, -0.15, 0.1, 0.8], [-1.0, -0.2, 0, 0.75], [0.45, 0.45, 0, 0.7], [-0.5, 0.35, 0.1, 0.65], [1.7, -0.3, 0, 0.5], [-1.65, -0.35, 0, 0.5]];
  balls.forEach(function (b) {
    parts.push({ geo: new THREE.SphereGeometry(b[3], 8, 6), color: 0xffffff, matrix: xform(b[0], b[1], b[2], 0, 0, 0, 1, 0.82, 0.9) });
  });
  return combine(parts);
}

/** A string of triangular flags hanging between two points; each flag is its own colour. Returns a group. */
export function bunting(span, colors, sag, y, z, flagSize) {
  var g = new THREE.Group();
  var n = Math.max(3, Math.round(span / ((flagSize || 0.5) * 1.1)));
  var size = flagSize || 0.5;
  var cords = [];
  for (var i = 0; i < n; i++) {
    var t = (i + 0.5) / n;
    var x = -span / 2 + t * span;
    var dip = -Math.sin(t * Math.PI) * (sag || 0.4);
    var flag = new THREE.Mesh(new THREE.ConeGeometry(size * 0.5, size, 3), bulb(colors[i % colors.length], { side: THREE.DoubleSide }));
    flag.rotation.set(0, 0, Math.PI);
    flag.scale.set(1, 1, 0.12);
    flag.position.set(x, y + dip - size * 0.5, z);
    g.add(flag);
    cords.push(new THREE.Vector3(x, y + dip, z));
  }
  var pts = [new THREE.Vector3(-span / 2, y, z)].concat(cords).concat([new THREE.Vector3(span / 2, y, z)]);
  for (var k = 0; k < pts.length - 1; k++) {
    var a = pts[k];
    var b = pts[k + 1];
    var len = a.distanceTo(b);
    var cord = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, len, 3), bulb(0x4a4a58));
    cord.position.copy(a).add(b).multiplyScalar(0.5);
    cord.rotation.z = Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 2;
    g.add(cord);
  }
  return g;
}

// ===== PICTURE PANELS =====
// A floor, ceiling or wall is painted as ONE picture that covers a whole period (16 units), then each 4-unit bay shows
// its quarter of it. Every bay uses the same material, so the whole floor is a single draw call, and because the
// picture repeats every period the track scrolls without a seam.

function panelMaterial(tex, o) {
  return mat(0xffffff, { map: tex, r: (o && o.r) === undefined ? 0.75 : o.r, env: (o && o.env) === undefined ? 0.25 : o.env, e: o && o.e, ei: o && o.ei, op: o && o.op, side: o && o.side });
}

function fract(v) { return ((v % 1) + 1) % 1; }

/** A floor strip for the bay centred on z. Along the track the picture runs from near (v0) to far (v0 + a quarter). */
export function floorPanel(g, tex, z, width, o) {
  var geo = new THREE.PlaneGeometry(width, WORLD_BAY);
  var uv = geo.attributes.uv;
  var v0 = fract(-(z + WORLD_BAY / 2) / WORLD_PERIOD);
  for (var i = 0; i < uv.count; i++) uv.setY(i, v0 + uv.getY(i) * 0.25);
  var m = new THREE.Mesh(geo, tex ? panelMaterial(tex, o) : mat((o && o.color) || 0xcccccc));
  m.rotation.x = -Math.PI / 2;
  m.position.set(0, (o && o.y) || 0.012, z);
  g.add(m);
  return m;
}

/** A ceiling strip facing down, with the picture running the same way as on the floor. */
export function ceilingPanel(g, tex, z, width, y, o) {
  var geo = new THREE.PlaneGeometry(width, WORLD_BAY);
  var uv = geo.attributes.uv;
  var v0 = fract(-(z + WORLD_BAY / 2) / WORLD_PERIOD);
  for (var i = 0; i < uv.count; i++) uv.setY(i, v0 + (1 - uv.getY(i)) * 0.25);
  // a ceiling faces away from the light, so it glows a little of its own
  var lamp = { e: 0xffffff, ei: 0.15 };
  var m = new THREE.Mesh(geo, tex ? panelMaterial(tex, Object.assign(lamp, o || {})) : mat((o && o.color) || 0xcccccc, { side: THREE.DoubleSide }));
  m.rotation.x = Math.PI / 2;
  m.position.set(0, y, z);
  g.add(m);
  return m;
}

/**
 * A wall surface facing the track. The picture is seen the same way round from both sides (left to right as you look
 * at it), whichever wall it is on.
 * @param {number} side -1 left wall, +1 right wall
 * @param {number} xin how far in from the wall line the surface sits
 * @param {number} h wall height
 */
export function wallPanel(g, tex, side, z, h, xin, o) {
  var geo = new THREE.PlaneGeometry(WORLD_BAY, h);
  var uv = geo.attributes.uv;
  for (var i = 0; i < uv.count; i++) {
    var local = (uv.getX(i) - 0.5) * WORLD_BAY;
    uv.setX(i, side < 0 ? (local - z) / WORLD_PERIOD : (z + local) / WORLD_PERIOD);
    uv.setY(i, uv.getY(i) * ((o && o.vmax) || 1));
  }
  var m = new THREE.Mesh(geo, tex ? panelMaterial(tex, o) : mat((o && o.color) || 0xcccccc));
  m.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
  m.position.set(side * WALL_X - side * (xin || 0.01), (o && o.y0 || 0) + h / 2, z);
  g.add(m);
  return m;
}

/**
 * Where things go along one side wall. `in(off)` is an x coordinate `off` units in from the wall (toward the lanes),
 * `out(off)` is `off` units behind it. `turn` is the yaw that makes something face the track.
 */
export function sideCtx(side) {
  var d = -side;
  return {
    side: side,
    turn: side < 0 ? Math.PI / 2 : -Math.PI / 2,
    // nothing is ever placed more than 0.85 in from the wall, so low scenery stays out of the lanes (they begin 1.2 in)
    in: function (off) { return side * WALL_X + d * Math.min(off, 0.85); },
    out: function (off) { return side * WALL_X + side * off; }
  };
}
