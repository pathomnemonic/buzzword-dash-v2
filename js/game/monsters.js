/**
 * monsters.js — purchasable Exam Monster models.
 *
 * Every builder returns a THREE.Group whose userData.monsterParts follows the
 * same shape as the classic monster in exammonster.js, so the engine can
 * animate any of them without special cases:
 *   { eyes, tentacles, mouth, questionMarks, ridge, backRing, body, aura }
 *
 * The camera sees the monster from behind, so each design puts its character
 * on the back (labels, glow, silhouette) as well as the front.
 */

import * as THREE from 'three';
import { buildExamMonster, getMonsterParts } from './exammonster.js';

var STYLES = {
  monster_classic: { name: 'Exam Monster', builder: 'classic' },
  monster_wraith: { name: 'Pager Wraith', builder: 'wraith' },
  monster_golem: { name: 'Textbook Golem', builder: 'golem' },
  monster_kraken: { name: 'Caffeine Kraken', builder: 'kraken' }
};

export var MONSTER_IDS = Object.keys(STYLES);

function emptyParts() {
  return { eyes: [], tentacles: [], mouth: null, questionMarks: [], ridge: [], backRing: null, body: null, aura: null };
}

/** Text label on a plane, used on the monsters' backs. */
function labelPlane(text, w, h, fg, bg) {
  var canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  var ctx = canvas.getContext('2d');
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, 256, 128); }
  ctx.font = '900 64px Impact, "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#120a22';
  ctx.strokeText(text, 128, 66);
  ctx.fillStyle = fg;
  ctx.fillText(text, 128, 66);
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: !bg, depthWrite: false })
  );
}

function glowEye(x, y, z, size, color) {
  var eye = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 8), new THREE.MeshBasicMaterial({ color: color }));
  eye.position.set(x, y, z);
  return eye;
}

// ===== PAGER WRAITH: a floating ghost trailing pager rings =====
function buildWraith() {
  var g = new THREE.Group();
  var parts = emptyParts();

  var body = new THREE.Mesh(
    new THREE.SphereGeometry(1.1, 16, 14, 0, Math.PI * 2, 0, Math.PI * 0.75),
    new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x1a8fbf, emissiveIntensity: 0.4, transparent: true, opacity: 0.62, roughness: 0.4 })
  );
  body.position.y = 0.2;
  g.add(body);
  parts.body = body;

  var aura = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 12), new THREE.MeshBasicMaterial({ color: 0x33ccff, transparent: true, opacity: 0.15 }));
  g.add(aura);
  parts.aura = aura;

  // Wavering tail of ghostly strips
  for (var i = 0; i < 7; i++) {
    var strip = new THREE.Group();
    var seg = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 1.5, 6),
      new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x1a8fbf, emissiveIntensity: 0.3, transparent: true, opacity: 0.5 })
    );
    seg.position.y = -0.75;
    seg.rotation.x = Math.PI;
    strip.add(seg);
    var a = (i / 7) * Math.PI * 2;
    strip.position.set(Math.cos(a) * 0.7, -0.5, Math.sin(a) * 0.7);
    g.add(strip);
    parts.tentacles.push(strip);
  }

  // Hollow glowing eyes and a wailing mouth (front, toward the player)
  [-0.38, 0.38].forEach(function (x) {
    var eye = glowEye(x, 0.45, -0.95, 0.17, 0xffffff);
    g.add(eye);
    parts.eyes.push(eye);
  });
  var mouth = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshBasicMaterial({ color: 0x001a26 }));
  mouth.scale.set(1, 1.5, 0.5);
  mouth.position.set(0, -0.1, -0.98);
  g.add(mouth);
  parts.mouth = mouth;

  // Back: a big pager screen the camera can read
  var pager = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.95, 0.12), new THREE.MeshStandardMaterial({ color: 0x1c2233 }));
  pager.position.set(0, 0.15, 1.1);
  g.add(pager);
  var screen = labelPlane('CODE BLUE', 1.32, 0.66, '#66ff88', '#04140a');
  screen.position.set(0, 0.15, 1.17);
  g.add(screen);

  var ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.04, 6, 32), new THREE.MeshBasicMaterial({ color: 0x66ffcc, transparent: true, opacity: 0.8 }));
  ring.position.set(0, 0.15, 1.05);
  g.add(ring);
  parts.backRing = ring;

  g.userData.monsterParts = parts;
  g.userData.displayScale = 0.85;
  return g;
}

// ===== TEXTBOOK GOLEM: a heavy stack of books =====
function buildGolem() {
  var g = new THREE.Group();
  var parts = emptyParts();
  var colors = [0x8b2e2e, 0x2e4f8b, 0x2e7a4f, 0x8b6b2e, 0x5b2e8b];

  var body = new THREE.Group();
  for (var i = 0; i < 5; i++) {
    var w = 2.0 - i * 0.08;
    var book = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.42, 1.5),
      new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.7 })
    );
    book.position.set((i % 2 ? 0.08 : -0.08), -0.7 + i * 0.44, 0);
    book.rotation.y = (i - 2) * 0.05;
    body.add(book);
    // Page edge
    var pages = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 0.34, 0.02), new THREE.MeshBasicMaterial({ color: 0xf1e8cf }));
    pages.position.set(book.position.x, book.position.y, -0.76);
    body.add(pages);
  }
  body.position.y = 0.25;
  g.add(body);
  // The first book doubles as the "body" for the pulse animation.
  parts.body = body.children[0];
  parts.body.material = parts.body.material.clone();
  parts.body.material.emissive = new THREE.Color(0x220000);
  parts.body.material.emissiveIntensity = 0.3;

  var aura = new THREE.Mesh(new THREE.SphereGeometry(1.8, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0.12 }));
  g.add(aura);
  parts.aura = aura;

  // Fiery eyes in the top book, reaching arms made of books
  [-0.4, 0.4].forEach(function (x) {
    var eye = glowEye(x, 0.95, -0.78, 0.13, 0xffaa22);
    g.add(eye);
    parts.eyes.push(eye);
  });
  for (var side = -1; side <= 1; side += 2) {
    var arm = new THREE.Group();
    for (var k = 0; k < 3; k++) {
      var seg = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.32, 0.8), new THREE.MeshStandardMaterial({ color: colors[(k + 1) % colors.length] }));
      seg.position.set(0, -k * 0.05, -k * 0.85);
      arm.add(seg);
    }
    arm.position.set(side * 1.35, 0.1, -0.2);
    g.add(arm);
    parts.tentacles.push(arm);
  }

  // Back cover: title, and a glowing spine ridge
  var title = labelPlane('TEXTBOOK', 1.7, 0.75, '#ffd166', null);
  title.position.set(0, 0.25, 0.77);
  g.add(title);
  var ridgeMat = new THREE.MeshBasicMaterial({ color: 0xffaa33 });
  for (var r = 0; r < 5; r++) {
    var spike = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 4), ridgeMat);
    spike.position.set(-0.8 + r * 0.4, 1.55, 0.2);
    g.add(spike);
    parts.ridge.push(spike);
  }
  var ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.04, 6, 28), new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0.8 }));
  ring.position.set(0, 0.25, 0.85);
  g.add(ring);
  parts.backRing = ring;

  g.userData.monsterParts = parts;
  g.userData.displayScale = 0.7;
  return g;
}

// ===== CAFFEINE KRAKEN: a giant coffee cup with restless tentacles =====
function buildKraken() {
  var g = new THREE.Group();
  var parts = emptyParts();

  var cup = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 0.85, 1.7, 16),
    new THREE.MeshStandardMaterial({ color: 0xf4f0e8, roughness: 0.5, emissive: 0x331a00, emissiveIntensity: 0.2 })
  );
  g.add(cup);
  parts.body = cup;

  var coffee = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.05, 16), new THREE.MeshBasicMaterial({ color: 0x3b1f0e }));
  coffee.position.y = 0.83;
  g.add(coffee);

  var aura = new THREE.Mesh(new THREE.SphereGeometry(1.7, 12, 12), new THREE.MeshBasicMaterial({ color: 0xff7733, transparent: true, opacity: 0.12 }));
  g.add(aura);
  parts.aura = aura;

  // Handle
  var handle = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.11, 8, 16), new THREE.MeshStandardMaterial({ color: 0xf4f0e8 }));
  handle.position.set(1.15, 0, 0);
  g.add(handle);

  // Tentacles spilling over the rim
  var tentMat = new THREE.MeshStandardMaterial({ color: 0x5a2d18, emissive: 0x220a00, emissiveIntensity: 0.3 });
  for (var i = 0; i < 8; i++) {
    var t = new THREE.Group();
    for (var s = 0; s < 6; s++) {
      var seg = new THREE.Mesh(new THREE.CylinderGeometry(0.15 - s * 0.018, 0.17 - s * 0.018, 0.4, 6), tentMat);
      seg.position.y = s * 0.36;
      seg.rotation.z = Math.sin(s * 0.7 + i) * 0.25;
      t.add(seg);
    }
    var a = (i / 8) * Math.PI * 2;
    t.position.set(Math.cos(a) * 0.85, 0.85, Math.sin(a) * 0.85);
    t.rotation.x = Math.sin(a) * 0.5;
    t.rotation.z = -Math.cos(a) * 0.5;
    g.add(t);
    parts.tentacles.push(t);
  }

  // Front face: jittery red eyes and a jagged mouth
  [-0.4, 0.4].forEach(function (x) {
    var eye = glowEye(x, 0.25, -0.98, 0.16, 0xff2222);
    g.add(eye);
    parts.eyes.push(eye);
  });
  var mouth = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.22, 0.05), new THREE.MeshBasicMaterial({ color: 0x120500 }));
  mouth.position.set(0, -0.2, -0.96);
  g.add(mouth);
  parts.mouth = mouth;

  // Back: cup sleeve label and rising steam
  var sleeve = new THREE.Mesh(new THREE.CylinderGeometry(1.03, 0.9, 0.75, 16, 1, true, Math.PI * 0.55, Math.PI * 0.9), new THREE.MeshBasicMaterial({ color: 0x8b5a2b, side: THREE.DoubleSide }));
  sleeve.position.y = -0.1;
  g.add(sleeve);
  var label = labelPlane('4 AM', 1.3, 0.65, '#ff4d4d', null);
  label.position.set(0, -0.05, 0.98);
  g.add(label);
  var steamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 });
  for (var st = 0; st < 5; st++) {
    var puff = new THREE.Mesh(new THREE.SphereGeometry(0.14 + st * 0.02, 6, 6), steamMat.clone());
    puff.position.set((st - 2) * 0.22, 1.25 + st * 0.28, 0.1);
    g.add(puff);
    parts.ridge.push(puff);
  }
  var ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.04, 6, 28), new THREE.MeshBasicMaterial({ color: 0xff7733, transparent: true, opacity: 0.8 }));
  ring.position.set(0, -0.05, 1.0);
  g.add(ring);
  parts.backRing = ring;

  g.userData.monsterParts = parts;
  g.userData.displayScale = 0.55;
  return g;
}

/**
 * Build the monster for a shop item id (falls back to the classic design).
 * @param {string} id
 * @returns {THREE.Group}
 */
export function buildMonster(id) {
  switch (id) {
    case 'monster_wraith': return buildWraith();
    case 'monster_golem': return buildGolem();
    case 'monster_kraken': return buildKraken();
    default: {
      var classic = buildExamMonster();
      classic.userData.monsterParts = getMonsterParts(classic);
      return classic;
    }
  }
}

export function getMonsterName(id) {
  return (STYLES[id] || STYLES.monster_classic).name;
}
