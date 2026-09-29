/**
 * obstacles.js — Obstacle spawning, coin patterns, and power-up orbs
 *
 * Architecture contract: Sections 16 (checklist), 13.3 (encounter plan)
 *
 * Features:
 * - Jump obstacles (low): gurney, wet floor sign, wheelchair, spilled supplies,
 *   fallen stretcher, medical waste bin
 * - Slide obstacles (high): OR doors, MRI tunnel, caution tape, X-ray arm
 * - Large colored directional indicators (orange up arrow = jump, blue down = slide)
 * - Obstacle bounds metadata for collision checking
 * - Deterministic obstacle spawning from encounter plans
 * - Prevention of impossible layouts (no same-frame jump+slide in same lane)
 * - Glowing coin patterns with multiple formations
 * - Dramatic power-up orbs with spinning rings and type-specific icons
 *
 * Exported obstacle metadata includes:
 * - variantId: unique string identifying the obstacle type
 * - type: 'jump' or 'slide' (matching architecture terminology)
 * - bounds: { width, height, depth } for collision
 * - lane: 0 | 1 | 2
 */

import * as THREE from 'three';

var LANE_X = [-3, 0, 3];

// ===== OBSTACLE VARIANT REGISTRY =====
// Each variant has an id, builder function, collision type, and bounding box.

var JUMP_VARIANTS = [
  { id: 'gurney',           builder: buildGurney,           bounds: { width: 2.2, height: 0.7, depth: 1.2 } },
  { id: 'wet_floor_sign',   builder: buildWetFloorSign,     bounds: { width: 0.8, height: 1.0, depth: 0.8 } },
  { id: 'wheelchair',       builder: buildWheelchair,       bounds: { width: 1.0, height: 1.0, depth: 0.8 } },
  { id: 'spilled_supplies', builder: buildSpilledSupplies,  bounds: { width: 1.5, height: 0.5, depth: 0.8 } },
  { id: 'fallen_stretcher', builder: buildFallenStretcher,  bounds: { width: 2.0, height: 0.5, depth: 0.8 } },
  { id: 'medical_waste_bin',builder: buildMedicalWasteBin,  bounds: { width: 0.7, height: 0.7, depth: 0.7 } }
];

var SLIDE_VARIANTS = [
  { id: 'or_doors',    builder: buildORDoors,    bounds: { width: 2.5, height: 3.2, depth: 0.1 } },
  { id: 'mri_tunnel',  builder: buildMRITunnel,  bounds: { width: 2.8, height: 2.8, depth: 1.5 } },
  { id: 'caution_tape', builder: buildCautionTape, bounds: { width: 2.2, height: 2.2, depth: 0.1 } },
  { id: 'xray_arm',    builder: buildXRayArm,    bounds: { width: 2.5, height: 2.5, depth: 0.4 } }
];

// ===== VARIANT LOOKUP =====

var ALL_VARIANTS_BY_ID = {};
(function () {
  for (var i = 0; i < JUMP_VARIANTS.length; i++) {
    ALL_VARIANTS_BY_ID[JUMP_VARIANTS[i].id] = JUMP_VARIANTS[i];
  }
  for (var j = 0; j < SLIDE_VARIANTS.length; j++) {
    ALL_VARIANTS_BY_ID[SLIDE_VARIANTS[j].id] = SLIDE_VARIANTS[j];
  }
})();

/**
 * Get obstacle variant metadata by ID.
 * @param {string} variantId
 * @returns {object|null}
 */
export function getObstacleVariant(variantId) {
  return ALL_VARIANTS_BY_ID[variantId] || null;
}

/**
 * Get all registered variant IDs.
 * @returns {{ jump: string[], slide: string[] }}
 */
export function getVariantIds() {
  return {
    jump: JUMP_VARIANTS.map(function (v) { return v.id; }),
    slide: SLIDE_VARIANTS.map(function (v) { return v.id; })
  };
}

// ===== JUMP OBSTACLE BUILDERS =====

function buildGurney() {
  var g = new THREE.Group();
  var bed = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.12, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x44aa66 })
  );
  bed.position.set(0, 0.55, 0);
  bed.castShadow = true;
  g.add(bed);
  var matt = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.1, 1.0),
    new THREE.MeshBasicMaterial({ color: 0xeeeeff })
  );
  matt.position.set(0, 0.63, 0);
  g.add(matt);
  for (var lx = -0.8; lx <= 0.8; lx += 1.6) {
    for (var lz = -0.4; lz <= 0.4; lz += 0.8) {
      var leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6),
        new THREE.MeshBasicMaterial({ color: 0x888899 })
      );
      leg.position.set(lx, 0.25, lz);
      g.add(leg);
    }
  }
  var wMat = new THREE.MeshBasicMaterial({ color: 0x333344 });
  for (var wx = -0.8; wx <= 0.8; wx += 1.6) {
    for (var wz = -0.4; wz <= 0.4; wz += 0.8) {
      var wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 8), wMat);
      wheel.position.set(wx, 0.05, wz);
      wheel.rotation.z = Math.PI / 2;
      g.add(wheel);
    }
  }
  addJumpIndicator(g);
  return g;
}

function buildWetFloorSign() {
  var g = new THREE.Group();
  var sign = new THREE.Mesh(
    new THREE.ConeGeometry(0.4, 1.0, 4),
    new THREE.MeshBasicMaterial({ color: 0xffcc00 })
  );
  sign.position.set(0, 0.5, 0);
  g.add(sign);
  var dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0x222222 })
  );
  dot.position.set(0, 0.35, -0.25);
  g.add(dot);
  var line = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.2, 0.04),
    new THREE.MeshBasicMaterial({ color: 0x222222 })
  );
  line.position.set(0, 0.55, -0.25);
  g.add(line);
  addJumpIndicator(g);
  return g;
}

function buildWheelchair() {
  var g = new THREE.Group();
  var seat = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.08, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x333344 })
  );
  seat.position.set(0, 0.5, 0);
  g.add(seat);
  var back = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.7, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x333344 })
  );
  back.position.set(0, 0.85, 0.32);
  g.add(back);
  var bigWMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
  for (var side = -1; side <= 1; side += 2) {
    var bigW = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 8, 16), bigWMat);
    bigW.position.set(side * 0.5, 0.3, 0.1);
    bigW.rotation.y = Math.PI / 2;
    g.add(bigW);
  }
  for (var s2 = -1; s2 <= 1; s2 += 2) {
    var smW = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), bigWMat);
    smW.position.set(s2 * 0.3, 0.08, -0.3);
    g.add(smW);
  }
  addJumpIndicator(g);
  return g;
}

function buildSpilledSupplies() {
  var g = new THREE.Group();
  var box1 = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.5, 0.4),
    new THREE.MeshStandardMaterial({ color: 0xccbb88 })
  );
  box1.position.set(-0.3, 0.25, 0);
  box1.rotation.z = 0.3;
  g.add(box1);
  var box2 = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.4, 0.35),
    new THREE.MeshStandardMaterial({ color: 0xddccaa })
  );
  box2.position.set(0.4, 0.2, 0.2);
  g.add(box2);
  var cH = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.05, 0.02),
    new THREE.MeshBasicMaterial({ color: 0xff0000 })
  );
  cH.position.set(0.4, 0.35, 0.03);
  g.add(cH);
  var cV = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.2, 0.02),
    new THREE.MeshBasicMaterial({ color: 0xff0000 })
  );
  cV.position.set(0.4, 0.35, 0.03);
  g.add(cV);
  var bottleMat = new THREE.MeshBasicMaterial({ color: 0xff8833 });
  for (var i = 0; i < 4; i++) {
    var bottle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.2, 8),
      bottleMat
    );
    bottle.position.set(
      (Math.random() - 0.5) * 1.5,
      0.1,
      (Math.random() - 0.5) * 0.8
    );
    bottle.rotation.z = Math.random() * Math.PI;
    bottle.rotation.x = Math.random() * 0.5;
    g.add(bottle);
  }
  addJumpIndicator(g);
  return g;
}

function buildFallenStretcher() {
  var g = new THREE.Group();
  var frame = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.1, 0.8),
    new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  frame.position.set(0, 0.35, 0);
  frame.rotation.z = 0.4;
  g.add(frame);
  var canvas = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.05, 0.65),
    new THREE.MeshBasicMaterial({ color: 0xeeeeff })
  );
  canvas.position.set(0, 0.4, 0);
  canvas.rotation.z = 0.4;
  g.add(canvas);
  for (var i = 0; i < 4; i++) {
    var leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6),
      new THREE.MeshBasicMaterial({ color: 0x666677 })
    );
    var lx = (i < 2 ? -0.7 : 0.7);
    var lz = (i % 2 === 0 ? -0.25 : 0.25);
    leg.position.set(lx, 0.15, lz);
    leg.rotation.z = 0.3;
    g.add(leg);
  }
  addJumpIndicator(g);
  return g;
}

function buildMedicalWasteBin() {
  var g = new THREE.Group();
  var bin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.3, 0.7, 8),
    new THREE.MeshStandardMaterial({ color: 0xdd2222 })
  );
  bin.position.set(0, 0.35, 0);
  bin.rotation.z = 0.5;
  g.add(bin);
  var bioMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
  for (var b = 0; b < 3; b++) {
    var angle = (b / 3) * Math.PI * 2;
    var sym = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 6, 6),
      bioMat
    );
    sym.position.set(
      Math.cos(angle) * 0.15,
      0.45 + Math.sin(angle) * 0.15,
      -0.28
    );
    g.add(sym);
  }
  var lid = new THREE.Mesh(
    new THREE.CylinderGeometry(0.37, 0.37, 0.05, 8),
    new THREE.MeshBasicMaterial({ color: 0xaa1111 })
  );
  lid.position.set(-0.4, 0.2, 0);
  lid.rotation.z = 0.8;
  g.add(lid);
  addJumpIndicator(g);
  return g;
}

// ===== SLIDE OBSTACLE BUILDERS =====

function buildORDoors() {
  var g = new THREE.Group();
  for (var sx = -1; sx <= 1; sx += 2) {
    var frame = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 3.2, 0.1),
      new THREE.MeshBasicMaterial({ color: 0x888899 })
    );
    frame.position.set(sx * 1.2, 1.6, 0);
    g.add(frame);
  }
  var top = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 0.1, 0.1),
    new THREE.MeshBasicMaterial({ color: 0x888899 })
  );
  top.position.set(0, 3.0, 0);
  g.add(top);
  for (var dx = -1; dx <= 1; dx += 2) {
    var door = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 1.2, 0.08),
      new THREE.MeshBasicMaterial({ color: 0x66aa88, transparent: true, opacity: 0.85 })
    );
    door.position.set(dx * 0.55, 2.6, 0);
    g.add(door);
    var win = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.3, 0.02),
      new THREE.MeshBasicMaterial({ color: 0xaaddcc, transparent: true, opacity: 0.5 })
    );
    win.position.set(dx * 0.55, 2.7, -0.05);
    g.add(win);
  }
  addSlideIndicator(g);
  return g;
}

function buildMRITunnel() {
  var g = new THREE.Group();
  var ringMat = new THREE.MeshStandardMaterial({ color: 0xddddee });
  var outerRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.3, 0.25, 12, 24),
    ringMat
  );
  outerRing.position.set(0, 1.5, 0);
  outerRing.rotation.y = Math.PI / 2;
  g.add(outerRing);
  var boreMat = new THREE.MeshBasicMaterial({ color: 0x334455 });
  var bore = new THREE.Mesh(
    new THREE.CylinderGeometry(1.0, 1.0, 1.5, 16, 1, true),
    boreMat
  );
  bore.position.set(0, 1.5, 0);
  bore.rotation.x = Math.PI / 2;
  g.add(bore);
  var panel = new THREE.Mesh(
    new THREE.BoxGeometry(2.8, 2.8, 0.15),
    new THREE.MeshStandardMaterial({ color: 0xccccdd })
  );
  panel.position.set(0, 1.5, 0.7);
  g.add(panel);
  var holeVisual = new THREE.Mesh(
    new THREE.CircleGeometry(1.0, 16),
    new THREE.MeshBasicMaterial({ color: 0x222233 })
  );
  holeVisual.position.set(0, 1.5, 0.78);
  g.add(holeVisual);
  var bed = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.1, 2.5),
    new THREE.MeshBasicMaterial({ color: 0xeeeeff })
  );
  bed.position.set(0, 0.55, -0.5);
  g.add(bed);
  var glowRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.9, 0.06, 8, 20),
    new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.6 })
  );
  glowRing.position.set(0, 1.5, 0.3);
  glowRing.rotation.y = Math.PI / 2;
  g.add(glowRing);
  var glowRing2 = glowRing.clone();
  glowRing2.position.set(0, 1.5, -0.3);
  g.add(glowRing2);
  addSlideIndicator(g);
  return g;
}

function buildCautionTape() {
  var g = new THREE.Group();
  for (var side = -1; side <= 1; side += 2) {
    var pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 3.0, 6),
      new THREE.MeshBasicMaterial({ color: 0x888899 })
    );
    pole.position.set(side * 1.0, 1.5, 0);
    g.add(pole);
  }
  var tape = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.15, 0.02),
    new THREE.MeshBasicMaterial({ color: 0xffcc00 })
  );
  tape.position.set(0, 2.2, 0);
  g.add(tape);
  for (var s = 0; s < 5; s++) {
    var stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.16, 0.025),
      new THREE.MeshBasicMaterial({ color: 0x222222 })
    );
    stripe.position.set(-0.8 + s * 0.4, 2.2, 0);
    stripe.rotation.z = 0.5;
    g.add(stripe);
  }
  var tape2 = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.10, 0.02),
    new THREE.MeshBasicMaterial({ color: 0xffcc00 })
  );
  tape2.position.set(0, 1.9, 0);
  g.add(tape2);
  addSlideIndicator(g);
  return g;
}

function buildXRayArm() {
  var g = new THREE.Group();
  var pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 3.0, 8),
    new THREE.MeshBasicMaterial({ color: 0x777788 })
  );
  pole.position.set(-1.0, 1.5, 0);
  g.add(pole);
  var arm = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 0.12, 0.12),
    new THREE.MeshBasicMaterial({ color: 0x888899 })
  );
  arm.position.set(0.2, 2.5, 0);
  g.add(arm);
  var head = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.3, 0.4),
    new THREE.MeshStandardMaterial({ color: 0xaaaacc })
  );
  head.position.set(0.8, 2.2, 0);
  g.add(head);
  var lens = new THREE.Mesh(
    new THREE.CircleGeometry(0.12, 8),
    new THREE.MeshBasicMaterial({ color: 0x44aaff, transparent: true, opacity: 0.7 })
  );
  lens.position.set(0.8, 2.05, -0.21);
  g.add(lens);
  var base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.5, 0.08, 10),
    new THREE.MeshBasicMaterial({ color: 0x666677 })
  );
  base.position.set(-1.0, 0.04, 0);
  g.add(base);
  addSlideIndicator(g);
  return g;
}

// ===== INDICATOR BUILDERS =====

function addJumpIndicator(group) {
  var arrowGroup = new THREE.Group();
  var arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.25, 0.5, 6),
    new THREE.MeshBasicMaterial({ color: 0xff8800 })
  );
  arrow.position.set(0, 0, 0);
  arrowGroup.add(arrow);
  var glowRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.3, 0.04, 6, 12),
    new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.5 })
  );
  glowRing.position.set(0, -0.1, 0);
  glowRing.rotation.x = Math.PI / 2;
  arrowGroup.add(glowRing);
  var arrow2 = new THREE.Mesh(
    new THREE.ConeGeometry(0.15, 0.3, 6),
    new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0.7 })
  );
  arrow2.position.set(0, 0.5, 0);
  arrowGroup.add(arrow2);
  arrowGroup.position.set(0, 1.8, 0);
  group.add(arrowGroup);
  var tintPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(2.5, 0.1),
    new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
  );
  tintPlane.rotation.x = -Math.PI / 2;
  tintPlane.position.set(0, 0.01, 0);
  group.add(tintPlane);
}

function addSlideIndicator(group) {
  var arrowGroup = new THREE.Group();
  var arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.25, 0.5, 6),
    new THREE.MeshBasicMaterial({ color: 0x4488ff })
  );
  arrow.rotation.z = Math.PI;
  arrow.position.set(0, 0, 0);
  arrowGroup.add(arrow);
  var glowRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.3, 0.04, 6, 12),
    new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.5 })
  );
  glowRing.position.set(0, 0.1, 0);
  glowRing.rotation.x = Math.PI / 2;
  arrowGroup.add(glowRing);
  var arrow2 = new THREE.Mesh(
    new THREE.ConeGeometry(0.15, 0.3, 6),
    new THREE.MeshBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 0.7 })
  );
  arrow2.rotation.z = Math.PI;
  arrow2.position.set(0, -0.5, 0);
  arrowGroup.add(arrow2);
  arrowGroup.position.set(0, 1.5, 0);
  group.add(arrowGroup);
  var tintPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(2.5, 0.1),
    new THREE.MeshBasicMaterial({ color: 0x2266ff, transparent: true, opacity: 0.3, side: THREE.DoubleSide })
  );
  tintPlane.rotation.x = -Math.PI / 2;
  tintPlane.position.set(0, 0.01, 0);
  group.add(tintPlane);
}

// ===== OBSTACLE SPAWNING =====

/**
 * Spawn a random obstacle.
 *
 * @param {THREE.Scene} scene
 * @param {THREE.Object3D[]} obstacleMeshes - Array to push the obstacle into
 * @param {object} [planEntry] - Optional deterministic plan entry from encounter plan
 *   Shape: { type: 'jump'|'slide', lane: 0|1|2, variantId: string, spawnOffset: number }
 * @returns {object} Metadata about the spawned obstacle: { variantId, type, lane, bounds }
 */
export function spawnObstacle(scene, obstacleMeshes, planEntry) {
  var lane;
  var isSlide;
  var variant;
  var spawnZ;

  if (planEntry) {
    // Deterministic from encounter plan
    lane = planEntry.lane;
    isSlide = planEntry.type === 'slide';
    variant = ALL_VARIANTS_BY_ID[planEntry.variantId];
    spawnZ = planEntry.spawnOffset || -50;

    // Fallback if variant not found
    if (!variant) {
      var variants = isSlide ? SLIDE_VARIANTS : JUMP_VARIANTS;
      variant = variants[0];
    }
  } else {
    // Random spawning
    lane = Math.floor(Math.random() * 3);
    isSlide = Math.random() < 0.5;
    var variants2 = isSlide ? SLIDE_VARIANTS : JUMP_VARIANTS;
    variant = variants2[Math.floor(Math.random() * variants2.length)];
    spawnZ = -50;
  }

  var obs = variant.builder();
  obs.position.set(LANE_X[lane], 0, spawnZ);
  obs.userData = {
    lane: lane,
    type: isSlide ? 'high' : 'low',
    variantId: variant.id,
    obstacleType: isSlide ? 'slide' : 'jump',
    bounds: variant.bounds
  };
  scene.add(obs);
  obstacleMeshes.push(obs);

  return {
    variantId: variant.id,
    type: isSlide ? 'slide' : 'jump',
    lane: lane,
    bounds: variant.bounds
  };
}

/**
 * Check whether two obstacle plan entries would create an impossible layout
 * (e.g., jump and slide in the same lane at the same Z offset).
 *
 * @param {object} entry1 - { type, lane, spawnOffset }
 * @param {object} entry2 - { type, lane, spawnOffset }
 * @returns {boolean} True if the layout is impossible/unfair
 */
export function isImpossibleLayout(entry1, entry2) {
  if (!entry1 || !entry2) return false;
  // Same lane, overlapping Z, different required action
  if (entry1.lane === entry2.lane) {
    var zDistance = Math.abs((entry1.spawnOffset || 0) - (entry2.spawnOffset || 0));
    if (zDistance < 5 && entry1.type !== entry2.type) {
      return true; // Player can't jump AND slide simultaneously
    }
  }
  return false;
}

// ===== COINS WITH GLOW =====

function makeCoinMesh(lane, z, y) {
  var group = new THREE.Group();
  var coin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 0.08, 10),
    new THREE.MeshBasicMaterial({ color: 0xffd740 })
  );
  coin.rotation.x = Math.PI / 2;
  group.add(coin);
  var ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.35, 0.04, 6, 16),
    new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.3 })
  );
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  group.position.set(LANE_X[lane], y || 1.2, z);
  group.userData = { lane: lane, collected: false, type: 'coin' };
  return group;
}

// ===== COIN PATTERNS =====

function spawnCoinLine(scene, coinMeshes, lane, startZ, count) {
  for (var i = 0; i < count; i++) {
    var c = makeCoinMesh(lane, startZ - i * 2.5);
    scene.add(c);
    coinMeshes.push(c);
  }
}

function spawnCoinArc(scene, coinMeshes, startZ) {
  var centerLane = Math.floor(Math.random() * 3);
  for (var i = 0; i < 6; i++) {
    var lane = i < 2 ? Math.max(0, centerLane - 1) : i > 3 ? Math.min(2, centerLane + 1) : centerLane;
    var yOff = Math.sin(i / 5 * Math.PI) * 1.5;
    var c = makeCoinMesh(lane, startZ - i * 2, 1.2 + yOff);
    scene.add(c);
    coinMeshes.push(c);
  }
}

function spawnCoinZigzag(scene, coinMeshes, startZ) {
  for (var i = 0; i < 9; i++) {
    var c = makeCoinMesh(i % 3, startZ - i * 2);
    scene.add(c);
    coinMeshes.push(c);
  }
}

function spawnCoinThreeLane(scene, coinMeshes, startZ) {
  for (var l = 0; l < 3; l++) {
    for (var i = 0; i < 4; i++) {
      var c = makeCoinMesh(l, startZ - i * 2.5 - l * 1.2);
      scene.add(c);
      coinMeshes.push(c);
    }
  }
}

function spawnCoinDiamond(scene, coinMeshes, startZ) {
  var pos = [[1, 0], [0, -2], [2, -2], [1, -4], [0, -6], [2, -6], [1, -8]];
  for (var i = 0; i < pos.length; i++) {
    var c = makeCoinMesh(pos[i][0], startZ + pos[i][1]);
    scene.add(c);
    coinMeshes.push(c);
  }
}

/**
 * Spawn a batch of coins in a random pattern.
 *
 * @param {THREE.Scene} scene
 * @param {THREE.Object3D[]} coinMeshes
 * @param {number} [startZ]
 */
export function spawnCoinBatch(scene, coinMeshes, startZ) {
  var z = startZ || (-40 - Math.random() * 20);
  var p = Math.floor(Math.random() * 5);
  switch (p) {
    case 0: spawnCoinLine(scene, coinMeshes, Math.floor(Math.random() * 3), z, 6 + Math.floor(Math.random() * 4)); break;
    case 1: spawnCoinArc(scene, coinMeshes, z); break;
    case 2: spawnCoinZigzag(scene, coinMeshes, z); break;
    case 3: spawnCoinThreeLane(scene, coinMeshes, z); break;
    case 4: spawnCoinDiamond(scene, coinMeshes, z); break;
  }
}

/**
 * Spawn coins from a deterministic plan.
 *
 * @param {THREE.Scene} scene
 * @param {THREE.Object3D[]} coinMeshes
 * @param {object[]} coinPlan - Array of { lane, offset, height }
 */
export function spawnCoinsFromPlan(scene, coinMeshes, coinPlan) {
  if (!coinPlan || !Array.isArray(coinPlan)) return;
  for (var i = 0; i < coinPlan.length; i++) {
    var cp = coinPlan[i];
    var c = makeCoinMesh(cp.lane, cp.offset, cp.height || 1.2);
    scene.add(c);
    coinMeshes.push(c);
  }
}

// ===== POWER-UPS =====

var PU_TYPES = [
  { type: 'shield', color: 0x4488ff, iconGeo: 'octahedron', label: 'SHIELD' },
  { type: 'magnet', color: 0xffaa00, iconGeo: 'cone', label: 'MAGNET' },
  { type: 'double', color: 0xaa44ff, iconGeo: 'tetrahedron', label: '2× SCORE' },
  { type: 'autoPilot', color: 0x00ee66, iconGeo: 'box', label: 'AUTO' },
  { type: 'scoreFrenzy', color: 0xff4488, iconGeo: 'dodecahedron', label: 'FRENZY' }
];

/**
 * Spawn a random power-up orb.
 *
 * @param {THREE.Scene} scene
 * @param {THREE.Object3D[]} coinMeshes
 * @param {object} [planEntry] - Optional deterministic plan { type, lane, offset }
 */
export function spawnPowerup(scene, coinMeshes, planEntry) {
  var puDef;
  var lane;
  var spawnZ;

  if (planEntry) {
    // Deterministic
    lane = planEntry.lane;
    spawnZ = planEntry.offset || -55;
    puDef = null;
    for (var pi = 0; pi < PU_TYPES.length; pi++) {
      if (PU_TYPES[pi].type === planEntry.type) {
        puDef = PU_TYPES[pi];
        break;
      }
    }
    if (!puDef) puDef = PU_TYPES[Math.floor(Math.random() * PU_TYPES.length)];
  } else {
    // Random
    puDef = PU_TYPES[Math.floor(Math.random() * PU_TYPES.length)];
    lane = Math.floor(Math.random() * 3);
    spawnZ = -55;
  }

  var color = puDef.color;
  var group = new THREE.Group();

  // Outer glow
  var outer = new THREE.Mesh(
    new THREE.SphereGeometry(0.98, 16, 16),
    new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.15 })
  );
  group.add(outer);

  // Mid glow
  var mid = new THREE.Mesh(
    new THREE.SphereGeometry(0.68, 14, 14),
    new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.30 })
  );
  group.add(mid);

  // Inner core
  var inner = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 12, 12),
    new THREE.MeshBasicMaterial({ color: color })
  );
  group.add(inner);

  // Type-specific icon
  var icon;
  switch (puDef.iconGeo) {
    case 'octahedron':
      icon = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      break;
    case 'cone':
      icon = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.45, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      break;
    case 'tetrahedron':
      icon = new THREE.Mesh(new THREE.TetrahedronGeometry(0.27, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      break;
    case 'box':
      var crossGroup = new THREE.Group();
      crossGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: 0xffffff })));
      crossGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.38, 0.12), new THREE.MeshBasicMaterial({ color: 0xffffff })));
      icon = crossGroup;
      break;
    case 'dodecahedron':
      icon = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      break;
    default:
      icon = new THREE.Mesh(new THREE.OctahedronGeometry(0.27, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  }
  if (icon) {
    icon.position.set(0, 0.9, 0);
    group.add(icon);
  }

  // Spinning rings
  var ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.75, 0.05, 8, 24),
    new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.5 })
  );
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  var ring2 = new THREE.Mesh(
    new THREE.TorusGeometry(0.72, 0.04, 8, 24),
    new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.35 })
  );
  ring2.rotation.y = Math.PI / 2;
  group.add(ring2);

  var ring3 = new THREE.Mesh(
    new THREE.TorusGeometry(0.78, 0.03, 8, 24),
    new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.25 })
  );
  ring3.rotation.x = Math.PI / 4;
  ring3.rotation.z = Math.PI / 4;
  group.add(ring3);

  group.position.set(LANE_X[lane], 1.5, spawnZ);
  group.userData = {
    lane: lane,
    collected: false,
    type: 'powerup',
    powerupType: puDef.type
  };

  scene.add(group);
  coinMeshes.push(group);
}
