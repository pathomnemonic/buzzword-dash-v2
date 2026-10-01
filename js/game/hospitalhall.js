/**
 * hospitalhall.js — the Hospital Hallway map: a proper corridor with doors, windows, a ceiling with
 * light panels, handrails, gurneys and IV stands, in the style of a Subway Surfers level.
 *
 * Walls repeat every HALL_PERIOD units (four 4-unit bays), so the corridor scrolls seamlessly while
 * still looking varied: door, window, double doors, then a bay with a poster and equipment.
 */

import * as THREE from 'three';

export var HALL_BAY = 4;
export var HALL_PERIOD = 16;
export var HALL_HEIGHT = 6.4;

function box(g, w, h, d, color, x, y, z, opts) {
  var o = opts || {};
  var mat = new THREE.MeshBasicMaterial({ color: color });
  if (o.opacity !== undefined) { mat.transparent = true; mat.opacity = o.opacity; }
  var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

function cylinder(g, r, h, color, x, y, z) {
  var m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 10), new THREE.MeshBasicMaterial({ color: color }));
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

/** Which of the four bays this z is (0..3), stable as the corridor scrolls. */
export function bayIndex(z) {
  var k = Math.round(z / HALL_BAY);
  return ((k % 4) + 4) % 4;
}

/** One 4-unit bay of one side wall (plus, on the left side, the ceiling above both). */
export function buildHallWallBay(skin, side, z) {
  var g = new THREE.Group();
  var c = skin.colors;
  var d = -side;                       // toward the track
  var xin = function (off) { return side * 5.5 + d * off; };
  var k = bayIndex(z);

  // wall, teal lower panel, handrail and crown
  box(g, 0.3, HALL_HEIGHT, HALL_BAY, c.wallA, side * 5.65, HALL_HEIGHT / 2, z);
  box(g, 0.08, 1.15, HALL_BAY, c.wallB, xin(0.04), 0.575, z);
  box(g, 0.1, 0.08, HALL_BAY, 0xc4ced2, xin(0.13), 1.2, z);
  box(g, 0.1, 0.22, HALL_BAY, c.wallB, xin(0.05), HALL_HEIGHT - 0.2, z);

  if (k === 0 || k === 2) {
    // door with a small window, a frame and a room plaque
    var wide = k === 2;
    var span = wide ? 3.0 : 1.5;
    box(g, 0.1, 2.75, span + 0.2, 0x8aa0a5, xin(0.06), 1.375, z);
    box(g, 0.08, 2.6, span, wide ? 0x2b6f88 : 0x3f8f9c, xin(0.12), 1.3, z);
    if (wide) {
      box(g, 0.1, 2.6, 0.06, 0x8aa0a5, xin(0.13), 1.3, z);                       // split between the leaves
      box(g, 0.1, 0.22, span, 0xf2c230, xin(0.14), 0.4, z);                      // caution band
      box(g, 0.09, 0.7, 0.55, 0xbfe9f4, xin(0.15), 1.9, z - 0.7);
      box(g, 0.09, 0.7, 0.55, 0xbfe9f4, xin(0.15), 1.9, z + 0.7);
      // red cross sign over the doors
      box(g, 0.08, 0.9, 0.28, 0xe03a3a, xin(0.1), 4.1, z);
      box(g, 0.08, 0.28, 0.9, 0xe03a3a, xin(0.1), 4.1, z);
    } else {
      box(g, 0.09, 0.75, 0.5, 0xbfe9f4, xin(0.16), 1.85, z);
      box(g, 0.07, 0.28, 0.7, 0x2f9e6f, xin(0.1), 3.0, z);                       // room plaque
      box(g, 0.08, 0.1, 0.22, 0xf0f5f6, xin(0.12), 3.0, z);
    }
  } else if (k === 1) {
    // window into a ward: frame, glass, blinds
    box(g, 0.1, 1.7, 3.2, 0x8aa0a5, xin(0.06), 2.5, z);
    box(g, 0.08, 1.5, 3.0, 0xa7dcec, xin(0.1), 2.5, z);
    for (var b = 0; b < 4; b++) box(g, 0.1, 0.06, 2.9, 0xf4f8f9, xin(0.14), 3.05 - b * 0.16, z);
    box(g, 0.1, 1.5, 0.06, 0x8aa0a5, xin(0.14), 2.5, z);
    box(g, 0.1, 0.22, 3.4, 0x8aa0a5, xin(0.08), 1.65, z);                        // sill
  } else {
    // notice board, fire extinguisher and a piece of equipment against the wall
    box(g, 0.07, 1.25, 1.5, 0xf5f8f8, xin(0.07), 3.0, z - 0.5);
    box(g, 0.08, 0.22, 0.5, 0x3a86d9, xin(0.1), 3.4, z - 0.8);
    box(g, 0.08, 0.22, 0.5, 0x2f9e6f, xin(0.1), 3.0, z - 0.2);
    box(g, 0.08, 0.5, 0.5, 0xf2c230, xin(0.1), 2.7, z - 0.8);
    cylinder(g, 0.13, 0.7, 0xd93030, xin(0.22), 1.75, z + 1.3);
    box(g, 0.05, 0.14, 0.2, 0x222a2e, xin(0.12), 2.2, z + 1.3);
    if (side < 0) {
      // gurney (white mattress on a steel frame)
      box(g, 0.85, 0.1, 1.9, 0xaab6ba, xin(0.75), 0.75, z - 0.6);
      box(g, 0.8, 0.16, 1.8, 0xf4f8f9, xin(0.75), 0.9, z - 0.6);
      box(g, 0.8, 0.5, 0.1, 0xaab6ba, xin(0.75), 1.15, z + 0.3);
      for (var lx = -1; lx <= 1; lx += 2) for (var lz = -1; lz <= 1; lz += 2) cylinder(g, 0.04, 0.7, 0x8a979b, xin(0.75) + lx * 0.34, 0.37, z - 0.6 + lz * 0.8);
    } else {
      // IV stand with a drip bag
      cylinder(g, 0.03, 2.2, 0xaab6ba, xin(0.7), 1.1, z - 0.5);
      box(g, 0.5, 0.06, 0.06, 0xaab6ba, xin(0.7), 2.2, z - 0.5);
      box(g, 0.14, 0.34, 0.1, 0xcdeef7, xin(0.7), 2.0, z - 0.7, { opacity: 0.85 });
      cylinder(g, 0.28, 0.06, 0x8a979b, xin(0.7), 0.04, z - 0.5);
    }
  }

  if (side < 0) {
    // ceiling with two light panels per bay, built once (from the left side)
    box(g, 11.6, 0.3, HALL_BAY, c.archMain, 0, HALL_HEIGHT + 0.1, z);
    box(g, 1.3, 0.06, 2.6, 0xffffff, -2.4, HALL_HEIGHT - 0.08, z);
    box(g, 1.3, 0.06, 2.6, 0xffffff, 2.4, HALL_HEIGHT - 0.08, z);
  }
  return g;
}

/** Hanging wayfinding sign over the middle of the corridor. */
export function buildHallSign(skin, z) {
  var g = new THREE.Group();
  box(g, 0.05, 0.9, 0.05, 0x8a979b, -1.2, HALL_HEIGHT - 0.5, z);
  box(g, 0.05, 0.9, 0.05, 0x8a979b, 1.2, HALL_HEIGHT - 0.5, z);
  box(g, 3.0, 0.7, 0.12, 0x1f8f5f, 0, HALL_HEIGHT - 1.1, z);
  box(g, 2.7, 0.08, 0.14, 0xf4f8f9, 0, HALL_HEIGHT - 0.9, z);
  box(g, 0.6, 0.2, 0.14, 0xf4f8f9, 0.9, HALL_HEIGHT - 1.25, z);
  box(g, 1.0, 0.1, 0.14, 0xf4f8f9, -0.7, HALL_HEIGHT - 1.25, z);
  return g;
}

/** Polished floor with the coloured wayfinding lines hospitals paint on the ground. */
export function buildHallFloor() {
  var g = new THREE.Group();
  var lines = [[-4.7, 0xf2c230], [-4.45, 0x3a86d9], [4.45, 0x2f9e6f], [4.7, 0xe03a3a]];
  lines.forEach(function (l) {
    var m = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 400), new THREE.MeshBasicMaterial({ color: l[1], transparent: true, opacity: 0.8 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(l[0], 0.012, -190);
    g.add(m);
  });
  for (var tz = -160; tz < 20; tz += 2) {
    var seam = new THREE.Mesh(new THREE.PlaneGeometry(10.6, 0.03), new THREE.MeshBasicMaterial({ color: 0x6f858c, transparent: true, opacity: 0.25 }));
    seam.rotation.x = -Math.PI / 2;
    seam.position.set(0, 0.012, tz);
    g.add(seam);
  }
  return g;
}

export function isHospitalHall(skin) { return !!skin && skin.wallType === 'hospital_hall'; }
