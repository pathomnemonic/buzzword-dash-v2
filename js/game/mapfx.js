/**
 * mapfx.js — the things that move beside the track in the bright maps.
 *
 * The motion is decoration. It stays off the lanes, never crosses them, and is soft in colour next to the gates, so
 * nothing here can be mistaken for something to catch or dodge. A map builder asks for an effect while it builds
 * (spin this, drift that, scatter these) and the game calls updateAnimators() every frame with the running time, the
 * frame time and how far the world scrolled this frame.
 *
 * Draw calls matter: the walls repeat many times along the track, so anything that moves is NOT part of the repeating
 * walls. It is one of:
 *   - a shared material or texture animated once for every copy (conveyor belts, twinkling bulbs, flowing water)
 *   - a "feature": a few large animated pieces spaced far apart that scroll past with the world (ferris wheels, windmills)
 *   - a "mover": one object drifting at its own pace (a train, a helicopter, a cloud bank)
 *   - a "swarm": many small things drawn together as one (fish, balloons, butterflies, confetti, bubbles)
 */

import * as THREE from 'three';
import { animate, currentWorld, keepSeparate, combine } from './mapkit.js';
import { mergeStatic } from './materials.js';

/** Run every registered effect. `move` is how far the world scrolled this frame. */
export function updateAnimators(list, time, dt, move) {
  if (!list) return;
  for (var i = 0; i < list.length; i++) list[i](time, dt, move);
}

/**
 * Prepare a finished object for animation: its own parts are merged into a few meshes (so a ferris wheel is a handful
 * of draw calls, not forty), then the whole thing is kept out of the big merge of the scenery.
 */
export function animated(obj) {
  mergeStatic(obj);
  return keepSeparate(obj);
}

/** Turn steadily about an axis ('x' | 'y' | 'z'), `speed` radians per second. */
export function spin(obj, axis, speed, phase) {
  var p = phase || 0;
  animate(function (t) { obj.rotation[axis] = p + t * speed; });
  return obj;
}

/** Rise and fall. */
export function bob(obj, amp, speed, phase) {
  var y0 = obj.position.y;
  var p = phase || 0;
  animate(function (t) { obj.position.y = y0 + Math.sin(t * speed + p) * amp; });
  return obj;
}

/** Rock back and forth about an axis. */
export function sway(obj, axis, amp, speed, phase) {
  var p = phase || 0;
  var r0 = obj.rotation[axis];
  animate(function (t) { obj.rotation[axis] = r0 + Math.sin(t * speed + p) * amp; });
  return obj;
}

/** Breathe in and out in size. */
export function pulse(obj, amp, speed, phase) {
  var p = phase || 0;
  var s0 = obj.scale.x;
  animate(function (t) { obj.scale.setScalar(s0 * (1 + Math.sin(t * speed + p) * amp)); });
  return obj;
}

/**
 * Make a shared material shimmer: its emissive strength (lit materials) or opacity (unlit ones) swells and fades.
 * One call lights every bulb that uses the material. Kept slower than 3 flashes a second.
 */
export function shimmer(material, base, amp, speed, phase) {
  var p = phase || 0;
  var lit = !!material.isMeshStandardMaterial;
  animate(function (t) {
    var v = base + Math.sin(t * speed + p) * amp;
    if (lit) material.emissiveIntensity = v; else material.opacity = Math.max(0, Math.min(1, v));
  });
  return material;
}

/** Slide a texture: a conveyor belt, flowing water, a moving stripe. `du`, `dv` are texture widths per second. */
export function flow(texture, du, dv) {
  if (!texture) return texture;
  animate(function (t) { texture.offset.set((t * du) % 1, (t * dv) % 1); });
  return texture;
}

/** The distance one wrap of the world-space movers covers. */
var NEAR = 14;
var FAR = -150;

/**
 * Drift an object through the world (not part of the repeating walls).
 * @param {THREE.Object3D} obj placed where it starts
 * @param {{k?: number, vz?: number, near?: number, far?: number}} [o]
 *   k   how much of the world's scroll it takes: 1 stands still on the ground, 0 keeps pace with the runner,
 *       0.3 is a slow cloud, above 1 comes at you faster
 *   vz  its own speed along the track in units per second (positive comes toward the runner)
 *   near / far  where it vanishes and where it comes back
 */
export function mover(obj, o) {
  o = o || {};
  var k = o.k === undefined ? 1 : o.k;
  var vz = o.vz || 0;
  var near = o.near === undefined ? NEAR : o.near;
  var far = o.far === undefined ? FAR : o.far;
  var span = near - far;
  var world = currentWorld();
  if (world && world.movers && !obj.parent) world.movers.add(obj);
  keepSeparate(obj);
  animate(function (t, dt, move) {
    var z = obj.position.z + move * k + vz * dt;
    if (z > near) z -= span; else if (z < far) z += span;
    obj.position.z = z;
  });
  return obj;
}

/**
 * Several of the same large thing spaced evenly along one side, scrolling past with the world: a ferris wheel, a
 * windmill, a water tower. They are animated pieces, so there are only a few, far apart.
 * @param {function(number): THREE.Object3D} make builds copy number i (call animated() / spin() inside as needed)
 * @param {{x: number, y?: number, z0?: number, spacing: number, count: number, yaw?: number}} o
 */
export function features(make, o) {
  var z0 = o.z0 === undefined ? -30 : o.z0;
  var span = o.spacing * o.count;
  var far = z0 - span + o.spacing;
  var near = z0 + o.spacing;
  var out = [];
  for (var i = 0; i < o.count; i++) {
    var obj = make(i);
    obj.position.set(o.x, o.y || 0, z0 - i * o.spacing);
    if (o.yaw) obj.rotation.y = o.yaw;
    mover(obj, { k: 1, near: near, far: far });
    out.push(obj);
  }
  return out;
}

/**
 * A swarm: lots of small things drawn as ONE instanced mesh and moved every frame.
 * @param {object} o
 * @param {THREE.BufferGeometry} o.geo built with combine() (vertex colours)
 * @param {number} o.count
 * @param {number[]} [o.colors] each item is tinted one of these
 * @param {{x: number[], y: number[], z: number[]}} o.area where they live: [min, max] on each axis
 * @param {number} [o.k] share of the world's scroll (1 = still on the ground)
 * @param {number[]} [o.vx] own speed sideways [min, max], units per second
 * @param {number[]} [o.vy]
 * @param {number[]} [o.vz]
 * @param {number[]} [o.scale] [min, max]
 * @param {number} [o.wobble] sideways/up-down wander
 * @param {boolean} [o.face] turn to face where it is heading (fish, birds)
 * @param {number} [o.flap] rolls the item back and forth this much (radians), a cheap wing beat
 * @param {number} [o.turn] spins the item this fast (radians per second): about the vertical axis, or about x when axis is 'x'
 * @param {string} [o.axis] 'x' to spin about the x axis (a pinwheel on a side wall)
 * @param {number} [o.seed]
 * @param {THREE.Material} [o.material]
 * @returns {THREE.InstancedMesh}
 */
export function swarm(o) {
  var n = o.count;
  var material = o.material || new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0, envMapIntensity: 0.5, flatShading: !!o.flat });
  var mesh = new THREE.InstancedMesh(o.geo, material, n);
  mesh.frustumCulled = false;
  mesh.userData.noMerge = true;
  mesh.userData.swarmCount = n; // so the scenery can be thinned on a slow device (see setSceneryDensity)
  var seed = o.seed || 1;
  var rnd = function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  var between = function (r) { return r[0] + (r[1] - r[0]) * rnd(); };
  var items = [];
  var tint = new THREE.Color();
  for (var i = 0; i < n; i++) {
    var item = {
      x: between(o.area.x), y: between(o.area.y), z: between(o.area.z),
      vx: o.vx ? between(o.vx) : 0, vy: o.vy ? between(o.vy) : 0, vz: o.vz ? between(o.vz) : 0,
      s: o.scale ? between(o.scale) : 1, ph: rnd() * 6.283, yaw: 0
    };
    items.push(item);
    tint.set(o.colors ? o.colors[Math.floor(rnd() * o.colors.length) % o.colors.length] : 0xffffff);
    mesh.setColorAt(i, tint);
  }
  var dummy = new THREE.Object3D();
  var k = o.k === undefined ? 1 : o.k;
  var wob = o.wobble || 0;
  var zNear = o.area.z[1];
  var zFar = o.area.z[0];
  var zSpan = zNear - zFar;
  var write = function (t, dt, move) {
    for (var j = 0; j < n; j++) {
      var it = items[j];
      it.z += move * k + it.vz * dt;
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      if (it.z > zNear) it.z -= zSpan; else if (it.z < zFar) it.z += zSpan;
      if (it.x > o.area.x[1]) { it.x = o.area.x[0]; } else if (it.x < o.area.x[0]) { it.x = o.area.x[1]; }
      if (it.y > o.area.y[1]) { it.y = o.area.y[0]; } else if (it.y < o.area.y[0]) { it.y = o.area.y[1]; }
      var wx = wob ? Math.sin(t * 1.3 + it.ph) * wob : 0;
      var wy = wob ? Math.sin(t * 1.7 + it.ph * 1.9) * wob * 0.6 : 0;
      dummy.position.set(it.x + wx, it.y + wy, it.z);
      if (o.face) {
        // the way it is going, counting the scroll toward the runner
        var gz = (k * move) / Math.max(dt, 1e-3) + it.vz;
        dummy.rotation.set(0, Math.atan2(it.vx, gz), o.flap ? Math.sin(t * 9 + it.ph) * o.flap : 0);
      } else if (o.axis === 'x') {
        dummy.rotation.set(it.ph + t * (o.turn || 0), o.yaw || 0, 0);
      } else {
        dummy.rotation.set(0, it.ph + (o.turn ? t * o.turn : 0), o.flap ? Math.sin(t * 7 + it.ph) * o.flap : 0);
      }
      dummy.scale.setScalar(it.s);
      dummy.updateMatrix();
      mesh.setMatrixAt(j, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  write(0, 0, 0); // a first frame, so a map being looked at without moving is not an empty box
  animate(write);
  var world = currentWorld();
  if (world && world.movers) world.movers.add(mesh);
  return mesh;
}

/** Soft white clouds drifting slowly by on both sides. One draw call. */
export function cloudBank(count, o) {
  o = o || {};
  var parts = [];
  var balls = [[0, 0, 0, 1], [1.0, -0.15, 0.1, 0.8], [-1.0, -0.2, 0, 0.75], [0.45, 0.45, 0, 0.7], [-0.5, 0.35, 0.1, 0.65], [1.7, -0.3, 0, 0.5], [-1.65, -0.35, 0, 0.5]];
  balls.forEach(function (b) {
    parts.push({ geo: new THREE.SphereGeometry(b[3], 8, 6), color: 0xffffff, matrix: new THREE.Matrix4().compose(new THREE.Vector3(b[0], b[1], b[2]), new THREE.Quaternion(), new THREE.Vector3(1, 0.8, 0.9)) });
  });
  var material = o.material || new THREE.MeshBasicMaterial({ vertexColors: true, fog: true, transparent: true, opacity: o.opacity === undefined ? 0.96 : o.opacity, depthWrite: false });
  return swarm({
    geo: combine(parts), material: material, count: count, seed: o.seed || 7,
    colors: o.colors || [0xffffff],
    area: o.area || { x: [-70, 70], y: [14, 34], z: [-150, 10] },
    k: o.k === undefined ? 0.12 : o.k, scale: o.scale || [3, 6], vx: o.vx || [0.2, 0.7]
  });
}


/**
 * Draw only part of every swarm (fish, balloons, butterflies...). 1 is all of it, 0 none. The moving pieces that are not
 * swarms (trains, windmills) stay: they are few.
 * @param {{worldMovers?: THREE.Object3D}} refs the track references from buildTrack
 * @param {number} density 0..1
 */
export function setSceneryDensity(refs, density) {
  if (!refs || !refs.worldMovers) return;
  refs.worldMovers.children.forEach(function (m) {
    var n = m.userData && m.userData.swarmCount;
    if (!n) return;
    m.count = density <= 0 ? 0 : Math.max(1, Math.ceil(n * density));
    m.visible = m.count > 0;
  });
}
