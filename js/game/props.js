/**
 * props.js — Procedural medical 3D decoration builders
 *
 * ARCHITECTURE CONTRACT (§23, §30):
 * - Agent 13 owns this file.
 * - All props built from Three.js primitives (no external models).
 * - Specialty-themed prop sets for different subjects.
 * - Props are spawned by track.js and fly toward the camera.
 * - Uses MeshBasicMaterial for guaranteed visibility without lighting.
 * - Uses MeshStandardMaterial where lighting/shadow matters.
 * - Supports quality levels via reduced geometry detail.
 *
 * Prop categories:
 * - General medical: ambulance, hospital, medical cross, pill bottle, syringe
 * - Neurology: brain model, neuron, spine
 * - Cardiology: heart model, ECG monitor, blood cells
 * - Nephrology: kidney model, nephron tube
 * - Genetics: DNA helix
 * - Equipment: stethoscope, microscope, defibrillator
 */

import * as THREE from 'three';

// ===== HELPER: create a colored box quickly =====
function box(w, h, d, color, emissive) {
  var mat = emissive
    ? new THREE.MeshBasicMaterial({ color: color })
    : new THREE.MeshStandardMaterial({ color: color });
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
}

function sphere(radius, color, basic) {
  var mat = basic
    ? new THREE.MeshBasicMaterial({ color: color })
    : new THREE.MeshStandardMaterial({ color: color });
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 10), mat);
}

function cylinder(rTop, rBot, h, color, basic) {
  var mat = basic
    ? new THREE.MeshBasicMaterial({ color: color })
    : new THREE.MeshStandardMaterial({ color: color });
  return new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, 10), mat);
}

// ===== GENERAL MEDICAL =====

export function buildAmbulance() {
  var g = new THREE.Group();
  var body = box(2.5, 1.2, 1.4, 0xf0f0f0);
  body.position.set(0, 1.0, 0); body.castShadow = true; g.add(body);
  var cab = box(1.0, 0.9, 1.3, 0xdddddd);
  cab.position.set(-1.5, 0.85, 0); g.add(cab);
  var stripe = box(2.5, 0.2, 1.42, 0xff2222, true);
  stripe.position.set(0, 1.1, 0); g.add(stripe);
  var cH = box(0.05, 0.3, 0.1, 0xff0000, true);
  cH.position.set(0, 1.5, 0.72); g.add(cH);
  var cV = box(0.05, 0.1, 0.3, 0xff0000, true);
  cV.position.set(0, 1.5, 0.72); g.add(cV);
  var wGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.15, 12);
  var wMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
  [[-0.8,0.25,0.7],[-0.8,0.25,-0.7],[0.8,0.25,0.7],[0.8,0.25,-0.7]].forEach(function(p) {
    var w = new THREE.Mesh(wGeo, wMat);
    w.position.set(p[0], p[1], p[2]); w.rotation.x = Math.PI / 2; g.add(w);
  });
  var l1 = box(0.3, 0.15, 0.2, 0xff4444, true);
  l1.position.set(-0.3, 1.68, 0); g.add(l1);
  var l2 = box(0.3, 0.15, 0.2, 0x4444ff, true);
  l2.position.set(0.3, 1.68, 0); g.add(l2);
  return g;
}

export function buildHospital() {
  var g = new THREE.Group();
  var main = box(3, 4, 2.5, 0xe8e0d8);
  main.position.set(0, 2, 0); main.castShadow = true; g.add(main);
  var winMat = new THREE.MeshBasicMaterial({ color: 0x88ccff });
  for (var row = 0; row < 3; row++) {
    for (var col = 0; col < 4; col++) {
      var win = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.35, 0.05), winMat);
      win.position.set(-0.9 + col * 0.6, 1.2 + row * 1.1, 1.28); g.add(win);
    }
  }
  var door = box(0.6, 0.9, 0.05, 0x336699, true);
  door.position.set(0, 0.45, 1.28); g.add(door);
  var crossH = box(0.8, 0.15, 0.1, 0xff0000, true);
  crossH.position.set(0, 3.8, 1.28); g.add(crossH);
  var crossV = box(0.15, 0.8, 0.1, 0xff0000, true);
  crossV.position.set(0, 3.8, 1.28); g.add(crossV);
  return g;
}

export function buildMedicalCross() {
  var g = new THREE.Group();
  var h = box(0.4, 1.2, 0.1, 0xff2222, true);
  h.position.set(0, 2.5, 0); g.add(h);
  var v = box(1.2, 0.4, 0.1, 0xff2222, true);
  v.position.set(0, 2.5, 0); g.add(v);
  var pole = cylinder(0.06, 0.06, 2, 0x888888, false);
  pole.position.set(0, 1, 0); g.add(pole);
  var base = cylinder(0.3, 0.35, 0.1, 0x666666, false);
  base.position.set(0, 0.05, 0); g.add(base);
  return g;
}

export function buildPillBottle() {
  var g = new THREE.Group();
  var bottle = cylinder(0.3, 0.3, 1.0, 0xff8833, false);
  bottle.position.set(0, 0.5, 0); g.add(bottle);
  var cap = cylinder(0.32, 0.32, 0.2, 0xeeeeee, false);
  cap.position.set(0, 1.1, 0); g.add(cap);
  var label = new THREE.Mesh(
    new THREE.CylinderGeometry(0.31, 0.31, 0.4, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
  );
  label.position.set(0, 0.5, 0); g.add(label);
  return g;
}

export function buildSyringe() {
  var g = new THREE.Group();
  var barrel = cylinder(0.08, 0.08, 1.2, 0xddddff, false);
  barrel.material.transparent = true; barrel.material.opacity = 0.7;
  barrel.position.set(0, 0.6, 0); g.add(barrel);
  var plunger = cylinder(0.07, 0.07, 0.5, 0x888888, false);
  plunger.position.set(0, 1.0, 0); g.add(plunger);
  var handle = cylinder(0.12, 0.12, 0.04, 0x666666, false);
  handle.position.set(0, 1.25, 0); g.add(handle);
  var needle = cylinder(0.01, 0.005, 0.4, 0xcccccc, false);
  needle.material.metalness = 0.8;
  needle.position.set(0, -0.2, 0); g.add(needle);
  var liquid = cylinder(0.06, 0.06, 0.4, 0x4488ff, true);
  liquid.material.transparent = true; liquid.material.opacity = 0.5;
  liquid.position.set(0, 0.3, 0); g.add(liquid);
  g.scale.set(2, 2, 2);
  return g;
}

// ===== GENETICS =====

export function buildDNAHelix() {
  var g = new THREE.Group();
  var mat1 = new THREE.MeshBasicMaterial({ color: 0x4488ff });
  var mat2 = new THREE.MeshBasicMaterial({ color: 0xff4488 });
  var height = 5, radius = 0.4, turns = 3, segments = 40;
  for (var i = 0; i < segments; i++) {
    var t = i / segments, y = t * height, angle = t * turns * Math.PI * 2;
    var s1 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), mat1);
    s1.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius); g.add(s1);
    var s2 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), mat2);
    s2.position.set(Math.cos(angle + Math.PI) * radius, y, Math.sin(angle + Math.PI) * radius); g.add(s2);
    if (i % 4 === 0) {
      var rung = cylinder(0.02, 0.02, radius * 2, 0x44ff88, true);
      rung.position.set(0, y, 0); rung.rotation.z = Math.PI / 2; rung.rotation.y = angle; g.add(rung);
    }
  }
  return g;
}

// ===== NEUROLOGY =====

export function buildBrain() {
  var g = new THREE.Group();
  var hemiMat = new THREE.MeshStandardMaterial({ color: 0xffaaaa, roughness: 0.7 });
  var left = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 10, 0, Math.PI, 0, Math.PI), hemiMat);
  left.position.set(-0.15, 1.5, 0); left.rotation.y = Math.PI / 2; g.add(left);
  var right = left.clone();
  right.position.set(0.15, 1.5, 0); right.rotation.y = -Math.PI / 2; g.add(right);
  var cb = sphere(0.35, 0xdd8888, false);
  cb.position.set(0, 0.9, 0.2); g.add(cb);
  var stem = cylinder(0.12, 0.08, 0.5, 0xddaaaa, false);
  stem.position.set(0, 0.5, 0.1); g.add(stem);
  var grooveMat = new THREE.MeshBasicMaterial({ color: 0xcc7777 });
  for (var i = 0; i < 5; i++) {
    var groove = new THREE.Mesh(new THREE.TorusGeometry(0.5 + i * 0.05, 0.015, 4, 12, Math.PI * 0.6), grooveMat);
    groove.position.set(0, 1.3 + i * 0.08, -0.1);
    groove.rotation.x = 0.3 + i * 0.15;
    groove.rotation.y = i * 0.3;
    g.add(groove);
  }
  g.scale.set(1.3, 1.3, 1.3);
  return g;
}

export function buildNeuron() {
  var g = new THREE.Group();
  var soma = sphere(0.3, 0xaa44ff, true);
  soma.position.set(0, 1.5, 0); g.add(soma);
  var nucleus = sphere(0.12, 0x6622cc, true);
  nucleus.position.set(0, 1.5, 0); g.add(nucleus);
  for (var i = 0; i < 6; i++) {
    var angle = (i / 6) * Math.PI * 2;
    var len = 0.5 + Math.random() * 0.4;
    var dend = cylinder(0.03, 0.015, len, 0xbb66ff, true);
    dend.position.set(
      Math.cos(angle) * 0.35, 1.5 + Math.sin(angle) * 0.3, Math.sin(angle * 0.7) * 0.2
    );
    dend.rotation.z = angle + Math.PI / 2;
    g.add(dend);
    var tip = sphere(0.04, 0xdd88ff, true);
    tip.position.set(
      Math.cos(angle) * (0.35 + len * 0.4),
      1.5 + Math.sin(angle) * (0.3 + len * 0.3),
      Math.sin(angle * 0.7) * 0.3
    );
    g.add(tip);
  }
  var axon = cylinder(0.04, 0.03, 1.5, 0x8844cc, true);
  axon.position.set(0, 0.5, 0); g.add(axon);
  for (var j = 0; j < 4; j++) {
    var myelin = cylinder(0.07, 0.07, 0.2, 0xddddff, true);
    myelin.material.transparent = true; myelin.material.opacity = 0.5;
    myelin.position.set(0, 0.1 + j * 0.35, 0); g.add(myelin);
  }
  var terminal = sphere(0.06, 0xff44aa, true);
  terminal.position.set(0, -0.3, 0); g.add(terminal);
  return g;
}

export function buildSpine() {
  var g = new THREE.Group();
  for (var i = 0; i < 8; i++) {
    var vert = cylinder(0.2 - i * 0.01, 0.22 - i * 0.01, 0.18, 0xeeddcc, false);
    vert.position.set(0, i * 0.25, 0); g.add(vert);
    if (i < 7) {
      var disc = cylinder(0.18, 0.18, 0.06, 0x6688aa, true);
      disc.material.transparent = true; disc.material.opacity = 0.6;
      disc.position.set(0, i * 0.25 + 0.12, 0); g.add(disc);
    }
    var proc = box(0.04, 0.04, 0.3, 0xddccbb, false);
    proc.position.set(0, i * 0.25, 0.2); g.add(proc);
  }
  var cord = cylinder(0.06, 0.06, 2.0, 0xffcc88, true);
  cord.material.transparent = true; cord.material.opacity = 0.4;
  cord.position.set(0, 0.9, 0); g.add(cord);
  g.scale.set(2, 2, 2);
  return g;
}

// ===== CARDIOLOGY =====

export function buildHeart() {
  var g = new THREE.Group();
  var heartMat = new THREE.MeshStandardMaterial({ color: 0xcc2233, roughness: 0.5 });
  var leftLobe = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 10), heartMat);
  leftLobe.position.set(-0.2, 1.7, 0); g.add(leftLobe);
  var rightLobe = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 10), heartMat);
  rightLobe.position.set(0.2, 1.7, 0); g.add(rightLobe);
  var bottom = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.7, 10), heartMat);
  bottom.position.set(0, 1.1, 0); bottom.rotation.z = Math.PI; g.add(bottom);
  var aorta = new THREE.Mesh(
    new THREE.TorusGeometry(0.15, 0.06, 8, 12, Math.PI),
    new THREE.MeshBasicMaterial({ color: 0xdd4444 })
  );
  aorta.position.set(0, 2.0, 0); aorta.rotation.x = Math.PI / 2; g.add(aorta);
  var pa = cylinder(0.05, 0.04, 0.4, 0x4444cc, true);
  pa.position.set(-0.25, 2.1, 0.1); pa.rotation.z = 0.5; g.add(pa);
  var pa2 = pa.clone();
  pa2.position.set(0.25, 2.1, 0.1); pa2.rotation.z = -0.5; g.add(pa2);
  g.scale.set(1.5, 1.5, 1.5);
  return g;
}

export function buildHeartMonitor() {
  var g = new THREE.Group();
  var screen = box(1.2, 0.8, 0.1, 0x001a00, true);
  screen.position.set(0, 2.5, 0); g.add(screen);
  var bezel = box(1.3, 0.9, 0.08, 0x888888, false);
  bezel.position.set(0, 2.5, 0.02); g.add(bezel);
  var points = [];
  for (var i = 0; i < 20; i++) {
    var x = -0.5 + i * 0.05;
    var y = 2.5;
    if (i === 8) y += 0.15;
    if (i === 9) y -= 0.2;
    if (i === 10) y += 0.3;
    if (i === 11) y -= 0.1;
    points.push(new THREE.Vector3(x, y, -0.06));
  }
  var lineGeo = new THREE.BufferGeometry().setFromPoints(points);
  var line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x00ff00 }));
  g.add(line);
  var pole = cylinder(0.04, 0.04, 2, 0x666666, false);
  pole.position.set(0, 1, 0); g.add(pole);
  var base = cylinder(0.4, 0.5, 0.1, 0x555555, false);
  base.position.set(0, 0.05, 0); g.add(base);
  return g;
}

export function buildBloodCells() {
  var g = new THREE.Group();
  var rbcMat = new THREE.MeshBasicMaterial({ color: 0xdd2222, transparent: true, opacity: 0.7 });
  var wbcMat = new THREE.MeshBasicMaterial({ color: 0xeeeeff, transparent: true, opacity: 0.6 });
  for (var i = 0; i < 12; i++) {
    var rbc = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), rbcMat);
    rbc.position.set(
      (Math.random() - 0.5) * 2,
      0.5 + Math.random() * 2,
      (Math.random() - 0.5) * 1
    );
    rbc.scale.set(1, 0.4, 1);
    rbc.rotation.x = Math.random() * Math.PI;
    rbc.rotation.z = Math.random() * Math.PI;
    g.add(rbc);
  }
  for (var j = 0; j < 3; j++) {
    var wbc = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), wbcMat);
    wbc.position.set(
      (Math.random() - 0.5) * 1.5,
      0.5 + Math.random() * 2,
      (Math.random() - 0.5) * 0.8
    );
    g.add(wbc);
    var nuc = sphere(0.1, 0x6666aa, true);
    nuc.position.copy(wbc.position);
    g.add(nuc);
  }
  var pltMat = new THREE.MeshBasicMaterial({ color: 0xffcc44 });
  for (var k = 0; k < 8; k++) {
    var plt = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), pltMat);
    plt.position.set(
      (Math.random() - 0.5) * 2,
      0.3 + Math.random() * 2.5,
      (Math.random() - 0.5) * 1
    );
    g.add(plt);
  }
  return g;
}

// ===== NEPHROLOGY =====

export function buildKidney() {
  var g = new THREE.Group();
  var kidneyMat = new THREE.MeshStandardMaterial({ color: 0x993333, roughness: 0.6 });
  var outer = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 12), kidneyMat);
  outer.position.set(0, 1.5, 0);
  outer.scale.set(0.7, 1, 0.5);
  g.add(outer);
  var indent = sphere(0.25, 0x771111, false);
  indent.position.set(0.2, 1.5, 0); g.add(indent);
  var ureter = cylinder(0.04, 0.04, 0.8, 0xcc8844, false);
  ureter.position.set(0.15, 0.7, 0); ureter.rotation.z = 0.15; g.add(ureter);
  var artery = cylinder(0.03, 0.03, 0.5, 0xdd2222, true);
  artery.position.set(-0.1, 1.8, 0); artery.rotation.z = 0.8; g.add(artery);
  var vein = cylinder(0.035, 0.035, 0.5, 0x2244aa, true);
  vein.position.set(-0.1, 1.3, 0); vein.rotation.z = 0.6; g.add(vein);
  g.scale.set(1.8, 1.8, 1.8);
  return g;
}

export function buildNephronTube() {
  var g = new THREE.Group();
  var glomMat = new THREE.MeshBasicMaterial({ color: 0xdd4444, transparent: true, opacity: 0.7 });
  for (var i = 0; i < 8; i++) {
    var cap = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 6, 8), glomMat);
    cap.position.set(
      (Math.random() - 0.5) * 0.15,
      2.0 + (Math.random() - 0.5) * 0.15,
      (Math.random() - 0.5) * 0.15
    );
    cap.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    g.add(cap);
  }
  var capsule = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0x66aadd, transparent: true, opacity: 0.3 })
  );
  capsule.position.set(0, 2.0, 0); g.add(capsule);
  for (var j = 0; j < 12; j++) {
    var seg = cylinder(0.04, 0.04, 0.15, 0x44ccaa, true);
    var angle = j * 0.5;
    seg.position.set(
      Math.sin(angle) * 0.3,
      1.7 - j * 0.12,
      Math.cos(angle) * 0.15
    );
    seg.rotation.z = Math.cos(angle) * 0.3;
    g.add(seg);
  }
  var duct = cylinder(0.05, 0.05, 0.6, 0x2288aa, true);
  duct.position.set(0.1, 0.4, 0); g.add(duct);
  g.scale.set(2, 2, 2);
  return g;
}

// ===== EQUIPMENT =====

export function buildStethoscope() {
  var g = new THREE.Group();
  var tubeMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.4 });
  var ear1 = sphere(0.06, 0x333333, false);
  ear1.position.set(-0.2, 2.0, 0); g.add(ear1);
  var ear2 = sphere(0.06, 0x333333, false);
  ear2.position.set(0.2, 2.0, 0); g.add(ear2);
  var tube = new THREE.Mesh(
    new THREE.TorusGeometry(0.8, 0.03, 8, 24, Math.PI),
    tubeMat
  );
  tube.position.set(0, 1.0, 0);
  tube.rotation.x = Math.PI / 2;
  g.add(tube);
  var chest = cylinder(0.15, 0.12, 0.06, 0xaaaaaa, false);
  chest.material.metalness = 0.6;
  chest.position.set(0, 0.2, 0); g.add(chest);
  g.scale.set(1.5, 1.5, 1.5);
  return g;
}

export function buildMicroscope() {
  var g = new THREE.Group();
  var base = box(0.8, 0.1, 0.6, 0x333344, false);
  base.position.set(0, 0.05, 0); g.add(base);
  var arm = box(0.12, 1.5, 0.12, 0x444455, false);
  arm.position.set(0, 0.8, 0.2); g.add(arm);
  var stage = box(0.6, 0.06, 0.5, 0x555566, false);
  stage.position.set(0, 0.5, -0.05); g.add(stage);
  var eyepiece = cylinder(0.08, 0.06, 0.3, 0x222233, false);
  eyepiece.position.set(0, 1.7, 0.1); eyepiece.rotation.x = 0.3; g.add(eyepiece);
  var turret = cylinder(0.1, 0.1, 0.08, 0x555566, false);
  turret.position.set(0, 0.65, -0.05); g.add(turret);
  for (var i = 0; i < 3; i++) {
    var obj = cylinder(0.03, 0.025, 0.15, 0x888899, false);
    obj.position.set((i - 1) * 0.08, 0.55, -0.05); g.add(obj);
  }
  var light = sphere(0.05, 0xffff88, true);
  light.position.set(0, 0.35, -0.05); g.add(light);
  g.scale.set(1.5, 1.5, 1.5);
  return g;
}

export function buildDefibrillator() {
  var g = new THREE.Group();
  var unit = box(0.8, 0.5, 0.3, 0xdd4444, false);
  unit.position.set(0, 0.6, 0); g.add(unit);
  var screen = box(0.4, 0.25, 0.02, 0x001100, true);
  screen.position.set(0, 0.75, -0.16); g.add(screen);
  var pts = [];
  for (var i = 0; i < 10; i++) {
    var px = -0.15 + i * 0.03;
    var py = 0.75 + (i === 5 ? 0.08 : i === 6 ? -0.05 : 0);
    pts.push(new THREE.Vector3(px, py, -0.17));
  }
  var ecgLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0x00ff00 })
  );
  g.add(ecgLine);
  for (var side = -1; side <= 1; side += 2) {
    var handle = cylinder(0.04, 0.04, 0.3, 0x333333, false);
    handle.position.set(side * 0.5, 0.5, 0.2); g.add(handle);
    var paddle = cylinder(0.1, 0.08, 0.06, 0xcccccc, false);
    paddle.material.metalness = 0.5;
    paddle.position.set(side * 0.5, 0.3, 0.2); g.add(paddle);
  }
  for (var c = -1; c <= 1; c += 2) {
    var cable = cylinder(0.015, 0.015, 0.4, 0x222222, true);
    cable.position.set(c * 0.35, 0.45, 0.15);
    cable.rotation.z = c * 0.5;
    g.add(cable);
  }
  g.scale.set(1.5, 1.5, 1.5);
  return g;
}

// ===== PILL CAPSULE =====

export function buildPillCapsule() {
  var g = new THREE.Group();
  var topMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
  var botMat = new THREE.MeshBasicMaterial({ color: 0xeeeeee });
  var top = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2), topMat);
  top.position.set(0, 1.7, 0); g.add(top);
  var mid = cylinder(0.2, 0.2, 0.3, 0xff4444, true);
  mid.position.set(0, 1.55, 0); g.add(mid);
  var midBot = cylinder(0.2, 0.2, 0.3, 0xeeeeee, true);
  midBot.position.set(0, 1.25, 0); g.add(midBot);
  var bot = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), botMat);
  bot.position.set(0, 1.1, 0); g.add(bot);
  g.scale.set(2.5, 2.5, 2.5);
  return g;
}

// ===== SPECIALTY-THEMED PROP SETS =====

export var SPECIALTY_PROPS = {
  "Neurology": [buildBrain, buildNeuron, buildSpine, buildDNAHelix],
  "Cardiology": [buildHeart, buildHeartMonitor, buildBloodCells, buildDefibrillator],
  "Nephrology": [buildKidney, buildNephronTube, buildSyringe, buildPillBottle],
  "Psychiatry": [buildBrain, buildNeuron, buildPillCapsule, buildMedicalCross],
  "Gastroenterology": [buildPillCapsule, buildPillBottle, buildSyringe, buildMicroscope],
  "Pulmonology": [buildStethoscope, buildHeartMonitor, buildSyringe, buildDefibrillator],
  "Infectious Disease": [buildMicroscope, buildSyringe, buildBloodCells, buildPillBottle],
  "Endocrinology": [buildDNAHelix, buildMicroscope, buildPillCapsule, buildSyringe],
  "Hematology/Oncology": [buildBloodCells, buildDNAHelix, buildMicroscope, buildSyringe],
  "Rheumatology": [buildSpine, buildSyringe, buildPillCapsule, buildStethoscope],
  "Obstetrics/Gynecology": [buildHeartMonitor, buildSyringe, buildStethoscope, buildPillBottle],
  "Pediatrics": [buildStethoscope, buildSyringe, buildPillBottle, buildHeartMonitor],
  "Surgery": [buildDefibrillator, buildSyringe, buildHeartMonitor, buildStethoscope],
  "Emergency Medicine": [buildAmbulance, buildDefibrillator, buildSyringe, buildHeartMonitor],
  "default": [buildAmbulance, buildHospital, buildDNAHelix, buildPillBottle, buildHeartMonitor, buildSyringe, buildMedicalCross]
};

// All prop builders (used for general spawning)
export var PROP_BUILDERS = [
  buildAmbulance,
  buildHospital,
  buildDNAHelix,
  buildPillBottle,
  buildHeartMonitor,
  buildSyringe,
  buildMedicalCross,
  buildBrain,
  buildNeuron,
  buildSpine,
  buildHeart,
  buildBloodCells,
  buildKidney,
  buildNephronTube,
  buildStethoscope,
  buildMicroscope,
  buildDefibrillator,
  buildPillCapsule
];

// Get specialty-appropriate builders for the current subject
export function getSpecialtyProps(subjects) {
  if (!subjects || subjects.length === 0) return SPECIALTY_PROPS["default"];
  var primary = subjects[0];
  return SPECIALTY_PROPS[primary] || SPECIALTY_PROPS["default"];
}
