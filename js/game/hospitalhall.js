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

function cylinder(g, r, h, color, x, y, z, rotZ, rotX) {
  var m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), new THREE.MeshBasicMaterial({ color: color }));
  m.position.set(x, y, z);
  if (rotZ) m.rotation.z = rotZ;
  if (rotX) m.rotation.x = rotX;
  g.add(m);
  return m;
}

/** Which of the four bays this z is (0..3), stable as the corridor scrolls. */
export function bayIndex(z) {
  var k = Math.round(z / HALL_BAY);
  return ((k % 4) + 4) % 4;
}

function hospitalDetails(g, side, z, k, xin, c) {
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

}

// ---------- Operating room: tiled walls, observation window, cabinets, wall monitor, sliding OR doors ----------
function orDetails(g, side, z, k, xin) {
  if (k === 0) {
    box(g, 0.1, 1.9, 3.3, 0x9fb7b2, xin(0.06), 2.6, z);
    box(g, 0.08, 1.7, 3.1, 0xb9e6ee, xin(0.1), 2.6, z);
    box(g, 0.1, 1.7, 0.06, 0x9fb7b2, xin(0.13), 2.6, z);
    box(g, 0.1, 0.2, 3.5, 0x9fb7b2, xin(0.08), 1.65, z);
  } else if (k === 1) {
    // steel cabinets with a scrub sink
    box(g, 0.5, 1.8, 3.0, 0xc9d3d6, xin(0.3), 0.9, z);
    box(g, 0.05, 1.7, 1.4, 0xe3eaec, xin(0.57), 0.9, z - 0.75);
    box(g, 0.05, 1.7, 1.4, 0xe3eaec, xin(0.57), 0.9, z + 0.75);
    box(g, 0.08, 0.5, 0.05, 0x7c8a8e, xin(0.62), 1.1, z - 0.1);
    box(g, 0.08, 0.5, 0.05, 0x7c8a8e, xin(0.62), 1.1, z + 0.1);
    box(g, 0.8, 0.1, 1.2, 0xe3eaec, xin(0.5), 1.85, z);
    cylinder(g, 0.04, 0.5, 0x7c8a8e, xin(0.2), 2.2, z);
  } else if (k === 2) {
    // wall monitor with a heartbeat line
    box(g, 0.1, 1.3, 1.9, 0x1d2428, xin(0.08), 3.1, z);
    box(g, 0.09, 1.1, 1.7, 0x0a2f1e, xin(0.12), 3.1, z);
    var pts = [[-0.7, 0], [-0.4, 0], [-0.3, 0.3], [-0.2, -0.3], [-0.1, 0.5], [0.05, -0.2], [0.2, 0], [0.7, 0]];
    pts.forEach(function (p, i) { if (i) { var q = pts[i - 1]; box(g, 0.08, Math.max(0.05, Math.abs(p[1] - q[1])), 0.14, 0x39ff88, xin(0.17), 3.1 + (p[1] + q[1]) / 2, z + (p[0] + q[0]) / 2); } });
    box(g, 0.5, 0.2, 1.0, 0xc9d3d6, xin(0.4), 0.95, z);
  } else {
    // sliding doors with a red "in use" lamp
    box(g, 0.1, 2.9, 3.4, 0x9fb7b2, xin(0.06), 1.45, z);
    box(g, 0.09, 2.7, 1.5, 0xdbe6e8, xin(0.12), 1.35, z - 0.78);
    box(g, 0.09, 2.7, 1.5, 0xdbe6e8, xin(0.14), 1.35, z + 0.78);
    box(g, 0.1, 0.8, 0.45, 0xb9e6ee, xin(0.18), 1.9, z - 0.78);
    box(g, 0.1, 0.8, 0.45, 0xb9e6ee, xin(0.2), 1.9, z + 0.78);
    box(g, 0.08, 0.3, 0.9, 0x1d2428, xin(0.1), 3.4, z);
    box(g, 0.1, 0.18, 0.18, 0xff3b3b, xin(0.15), 3.4, z - 0.25);
    box(g, 0.1, 0.18, 0.18, 0x4a5558, xin(0.15), 3.4, z + 0.25);
  }
}

// ---------- Research lab: benches along the walls, glassware, shelves, a periodic-table poster ----------
function labDetails(g, side, z, k, xin) {
  var glass = [0x7fe3ff, 0xff9f6b, 0xb27fff, 0x7fffa8];
  if (k === 0 || k === 2) {
    // bench with a dark top, flasks and a microscope
    box(g, 0.9, 1.0, 3.4, 0xdfe5ea, xin(0.5), 0.5, z);
    box(g, 1.0, 0.08, 3.5, 0x2b3440, xin(0.52), 1.04, z);
    for (var i = 0; i < 3; i++) {
      var col = glass[(i + k) % glass.length];
      cylinder(g, 0.13, 0.3, col, xin(0.55), 1.23, z - 1.0 + i * 0.5);
      cylinder(g, 0.05, 0.2, col, xin(0.55), 1.46, z - 1.0 + i * 0.5);
    }
    box(g, 0.2, 0.5, 0.2, 0x3a4350, xin(0.45), 1.33, z + 1.3);
    box(g, 0.3, 0.1, 0.3, 0x3a4350, xin(0.45), 1.1, z + 1.3);
    // shelf above with bottles
    box(g, 0.4, 0.06, 3.0, 0xdfe5ea, xin(0.25), 2.6, z);
    for (var j = 0; j < 5; j++) cylinder(g, 0.1, 0.35, glass[(j + k) % glass.length], xin(0.25), 2.82, z - 1.2 + j * 0.6);
  } else if (k === 1) {
    // periodic-table style poster
    box(g, 0.07, 1.8, 3.0, 0xf5f8f8, xin(0.07), 3.0, z);
    for (var r = 0; r < 4; r++) for (var cI = 0; cI < 7; cI++) box(g, 0.08, 0.28, 0.32, [0x3a86d9, 0xf2c230, 0xe03a3a, 0x2f9e6f][(r + cI) % 4], xin(0.12), 2.4 + r * 0.38, z - 1.2 + cI * 0.4);
    box(g, 0.8, 1.9, 1.0, 0xc9d3d6, xin(0.45), 0.95, z + 1.9 - 3.3 + 0.3);
  } else {
    // fume hood with a glass front
    box(g, 0.9, 2.9, 3.0, 0xc9d3d6, xin(0.45), 1.45, z);
    box(g, 0.08, 1.4, 2.5, 0xb9e6ee, xin(0.93), 1.8, z);
    box(g, 0.1, 0.3, 2.6, 0xf2c230, xin(0.95), 2.65, z);
    box(g, 0.06, 0.2, 0.8, 0xe03a3a, xin(0.96), 0.6, z);
  }
}

// ---------- Ambulance bay: roller doors, an ambulance, bollards, a lit "EMERGENCY" sign ----------
function bayDetails(g, side, z, k, xin) {
  if (k === 0 || k === 2) {
    // roller door with slats and warning stripes
    box(g, 0.1, 3.4, 3.4, 0x6d7780, xin(0.06), 1.7, z);
    for (var s = 0; s < 8; s++) box(g, 0.08, 0.06, 3.2, 0x59636b, xin(0.12), 0.4 + s * 0.4, z);
    box(g, 0.1, 0.25, 3.5, 0xf2c230, xin(0.1), 3.5, z);
    box(g, 0.1, 0.12, 0.5, 0x222a2e, xin(0.14), 3.5, z - 1.0);
    box(g, 0.1, 0.12, 0.5, 0x222a2e, xin(0.14), 3.5, z + 1.0);
  } else if (k === 1) {
    // EMERGENCY sign
    box(g, 0.1, 1.0, 3.2, 0xd93030, xin(0.08), 3.4, z);
    box(g, 0.08, 0.1, 2.8, 0xffffff, xin(0.14), 3.8, z);
    box(g, 0.08, 0.1, 2.8, 0xffffff, xin(0.14), 3.0, z);
    for (var l = 0; l < 7; l++) box(g, 0.08, 0.36, 0.2, 0xffffff, xin(0.15), 3.4, z - 1.2 + l * 0.4);
  } else {
    // parked ambulance seen from behind: white box, red stripe, beacon
    var ax = xin(1.0);
    box(g, 1.5, 1.7, 2.6, 0xf4f6f7, ax, 1.15, z);
    box(g, 1.52, 0.25, 2.62, 0xd93030, ax, 1.3, z);
    box(g, 1.5, 0.9, 0.9, 0xe6ebec, ax, 0.75, z + 1.7);
    box(g, 1.4, 0.4, 0.05, 0x7fd0e6, ax, 1.4, z + 2.17);
    box(g, 0.5, 0.18, 0.3, 0x3a86d9, ax - 0.4, 2.1, z);
    box(g, 0.5, 0.18, 0.3, 0xff3b3b, ax + 0.4, 2.1, z);
    cylinder(g, 0.25, 0.2, 0x1d2428, ax - 0.7, 0.25, z + 0.9, Math.PI / 2);
    cylinder(g, 0.25, 0.2, 0x1d2428, ax + 0.7, 0.25, z + 0.9, Math.PI / 2);
    cylinder(g, 0.25, 0.2, 0x1d2428, ax - 0.7, 0.25, z - 0.9, Math.PI / 2);
    cylinder(g, 0.25, 0.2, 0x1d2428, ax + 0.7, 0.25, z - 0.9, Math.PI / 2);
  }
  // bollard by every door
  cylinder(g, 0.1, 0.8, 0xf2c230, xin(0.5), 0.4, z + 1.8);
}

var ROOM_DETAILS = { room_or: orDetails, room_lab: labDetails, room_bay: bayDetails };

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

  var detail = ROOM_DETAILS[skin.wallType] || hospitalDetails;
  detail(g, side, z, k, xin, c);

  if (side < 0) {
    // ceiling with two light panels per bay, built once (from the left side)
    box(g, 11.6, 0.3, HALL_BAY, c.archMain, 0, HALL_HEIGHT + 0.1, z);
    box(g, 1.3, 0.06, 2.6, 0xffffff, -2.4, HALL_HEIGHT - 0.08, z);
    box(g, 1.3, 0.06, 2.6, 0xffffff, 2.4, HALL_HEIGHT - 0.08, z);
  }
  return g;
}

/** Hanging fixtures over the middle of the room: a wayfinding sign, surgical lamps, pipes or caged lights. */
export function buildHallSign(skin, z) {
  var g = new THREE.Group();
  var top = HALL_HEIGHT;
  if (skin.archType === 'or_lamps') {
    for (var lx = -1; lx <= 1; lx += 2) {
      cylinder(g, 0.04, 1.2, 0x9aa7ab, lx * 1.9, top - 0.6, z);
      cylinder(g, 0.95, 0.14, 0xe8eef0, lx * 1.9, top - 1.25, z);
      cylinder(g, 0.6, 0.06, 0xfffbe0, lx * 1.9, top - 1.35, z);
      for (var d = 0; d < 6; d++) cylinder(g, 0.07, 0.05, 0xffffff, lx * 1.9 + Math.cos(d * 1.047) * 0.35, top - 1.4, z + Math.sin(d * 1.047) * 0.35);
    }
  } else if (skin.archType === 'lab_pipes') {
    cylinder(g, 0.12, 10.8, 0x9aa7ab, 0, top - 0.5, z, Math.PI / 2);
    cylinder(g, 0.08, 10.8, 0x3a86d9, 0, top - 0.8, z + 0.5, Math.PI / 2);
    cylinder(g, 0.08, 10.8, 0xf2c230, 0, top - 0.8, z - 0.5, Math.PI / 2);
    for (var p = -4; p <= 4; p += 4) box(g, 0.1, 0.5, 0.1, 0x6f7b80, p, top - 0.3, z);
  } else if (skin.archType === 'bay_lights') {
    for (var bx = -2.4; bx <= 2.4; bx += 4.8) {
      box(g, 0.05, 0.8, 0.05, 0x59636b, bx, top - 0.4, z);
      box(g, 1.4, 0.22, 0.5, 0xfff6c8, bx, top - 0.9, z);
      box(g, 1.5, 0.05, 0.6, 0x59636b, bx, top - 1.05, z);
    }
    box(g, 0.3, 0.3, 0.3, 0xff3b3b, 0, top - 0.5, z);
  } else {
    box(g, 0.05, 0.9, 0.05, 0x8a979b, -1.2, top - 0.5, z);
    box(g, 0.05, 0.9, 0.05, 0x8a979b, 1.2, top - 0.5, z);
    box(g, 3.0, 0.7, 0.12, 0x1f8f5f, 0, top - 1.1, z);
    box(g, 2.7, 0.08, 0.14, 0xf4f8f9, 0, top - 0.9, z);
    box(g, 0.6, 0.2, 0.14, 0xf4f8f9, 0.9, top - 1.25, z);
    box(g, 1.0, 0.1, 0.14, 0xf4f8f9, -0.7, top - 1.25, z);
  }
  return g;
}

var FLOOR_LINES = {
  hall_floor: [[-4.7, 0xf2c230], [-4.45, 0x3a86d9], [4.45, 0x2f9e6f], [4.7, 0xe03a3a]],
  or_floor: [[-4.6, 0xf2c230], [4.6, 0xf2c230]],
  lab_floor: [[-4.6, 0xf2c230], [-4.3, 0x222a2e], [4.3, 0x222a2e], [4.6, 0xf2c230]],
  bay_floor: [[-4.7, 0xf2c230], [4.7, 0xf2c230]]
};

/** Polished floor with the coloured safety and wayfinding lines each kind of room paints on the ground. */
export function buildHallFloor(skin) {
  var g = new THREE.Group();
  var lines = FLOOR_LINES[skin && skin.groundType] || FLOOR_LINES.hall_floor;
  lines.forEach(function (l) {
    var m = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 400), new THREE.MeshBasicMaterial({ color: l[1], transparent: true, opacity: 0.8 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(l[0], 0.012, -190);
    g.add(m);
  });
  if (skin && skin.groundType === 'bay_floor') {
    // dashed lane markings like a driveway
    for (var dz = -160; dz < 20; dz += 4) {
      [-1, 1].forEach(function (dx) {
        var dash = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 1.6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(dx, 0.012, dz);
        g.add(dash);
      });
    }
    return g;
  }
  for (var tz = -160; tz < 20; tz += 2) {
    var seam = new THREE.Mesh(new THREE.PlaneGeometry(10.6, 0.03), new THREE.MeshBasicMaterial({ color: 0x6f858c, transparent: true, opacity: 0.25 }));
    seam.rotation.x = -Math.PI / 2;
    seam.position.set(0, 0.012, tz);
    g.add(seam);
  }
  return g;
}

/** Every walled-in map (hospital hallway, operating room, lab, ambulance bay). */
export function isHospitalHall(skin) { return !!skin && (skin.wallType === 'hospital_hall' || /^room_/.test(skin.wallType)); }
