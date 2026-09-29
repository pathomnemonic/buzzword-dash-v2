/**
 * powerupfx.js — Power-up visual effects on the player character
 *
 * Agent 14 — Effects and Trails
 *
 * Architectural compliance:
 * - No independent requestAnimationFrame loops (shield shatter and
 *   gate particles are time-based, driven by the main update loop)
 * - Enforces particle budgets per quality level
 * - Supports pause/resume/reset/dispose lifecycle
 * - Effects remain outside trackRoot (added directly to scene)
 * - Pools transient shield shatter and gate result particles
 * - Supports quality levels: low, medium, high
 * - Supports reduced motion preference
 *
 * Effects:
 *   Shield — bright blue crystal icosahedron
 *   Magnet — golden aura with orbiting coins
 *   Double Score — purple aura with 2X proxy
 *   Rush Boost — orange/red flames with afterimage ghosts
 *   Auto-Pilot — green glow with robot grid overlay
 *   Score Frenzy — pink/hot pink with diamond orbits
 *
 * Transient pooled effects:
 *   Shield shatter shards
 *   Gate result particles
 */

import * as THREE from 'three';

// ===== QUALITY PRESETS =====
var QUALITY_PRESETS = {
  low:    { shardCount: 8,  gateParticleCount: 4,  rushGhostCount: 2 },
  medium: { shardCount: 14, gateParticleCount: 7,  rushGhostCount: 3 },
  high:   { shardCount: 20, gateParticleCount: 10, rushGhostCount: 4 }
};

export class PowerUpFX {
  constructor(scene, options) {
    this.scene = scene;
    this.effects = {};
    this.time = 0;
    this.paused = false;
    this.reducedMotion = (options && options.reducedMotion) || false;

    var qualityKey = (options && options.quality) || 'high';
    var preset = QUALITY_PRESETS[qualityKey] || QUALITY_PRESETS.high;
    this.shardCount = preset.shardCount;
    this.gateParticleCount = preset.gateParticleCount;
    this.rushGhostCount = preset.rushGhostCount;

    // Rush ghost pool
    this.rushGhosts = [];
    this.rushGhostTimer = 0;

    // Shield shatter pool
    this.shardPool = [];

    // Gate particle pool
    this.gateParticlePool = [];

    this._createShieldEffect();
    this._createMagnetEffect();
    this._createDoubleEffect();
    this._createRushBoostEffect();
    this._createAutoPilotEffect();
    this._createScoreFrenzyEffect();
    this._createShardPool();
    this._createGateParticlePool();

    this.hideAll();
  }

  // ===== SHIELD =====
  _createShieldEffect() {
    var group = new THREE.Group();

    var outerBubble = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.5, 2),
      new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    );
    group.add(outerBubble);

    var wireframe = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.52, 1),
      new THREE.MeshBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 0.7, wireframe: true })
    );
    group.add(wireframe);

    var innerGlow = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.2, 2),
      new THREE.MeshBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.25 })
    );
    group.add(innerGlow);

    var hexRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.4, 0.07, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0x44aaff, transparent: true, opacity: 0.5 })
    );
    hexRing.rotation.x = Math.PI / 2;
    group.add(hexRing);

    var hexRing2 = new THREE.Mesh(
      new THREE.TorusGeometry(1.35, 0.06, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.35 })
    );
    hexRing2.rotation.x = Math.PI / 3;
    hexRing2.rotation.z = Math.PI / 4;
    group.add(hexRing2);

    var equatorRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.48, 0.04, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xaaddff, transparent: true, opacity: 0.6 })
    );
    equatorRing.rotation.x = Math.PI / 2;
    group.add(equatorRing);

    group.visible = false;
    this.scene.add(group);
    this.effects.shield = {
      group: group, outer: outerBubble, wireframe: wireframe,
      inner: innerGlow, hexRing: hexRing, hexRing2: hexRing2, equatorRing: equatorRing
    };
  }

  // ===== MAGNET =====
  _createMagnetEffect() {
    var group = new THREE.Group();

    var aura = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.3 })
    );
    group.add(aura);

    var ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.2, 0.08, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd740, transparent: true, opacity: 0.7 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.8;
    group.add(ring);

    var footRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.0, 0.07, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.6 })
    );
    footRing.rotation.x = Math.PI / 2;
    footRing.position.y = 0.05;
    group.add(footRing);

    for (var i = 0; i < 8; i++) {
      var coinParticle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 0.03, 8),
        new THREE.MeshBasicMaterial({ color: 0xffd740 })
      );
      coinParticle.rotation.x = Math.PI / 2;
      coinParticle.userData.orbitAngle = (i / 8) * Math.PI * 2;
      coinParticle.userData.orbitRadius = 1.2;
      coinParticle.userData.orbitSpeed = 2.0 + i * 0.15;
      coinParticle.userData.orbitY = 0.5 + (i % 3) * 0.4;
      group.add(coinParticle);
    }

    for (var sp = 0; sp < 6; sp++) {
      var sparkle = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.05, 0),
        new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.9 })
      );
      sparkle.userData.sparklePhase = (sp / 6) * Math.PI * 2;
      sparkle.userData.sparkleSpeed = 3 + sp * 0.3;
      group.add(sparkle);
    }

    group.visible = false;
    this.scene.add(group);
    this.effects.magnet = { group: group, ring: ring, aura: aura, footRing: footRing };
  }

  // ===== DOUBLE SCORE =====
  _createDoubleEffect() {
    var group = new THREE.Group();

    var aura = new THREE.Mesh(
      new THREE.SphereGeometry(1.0, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xaa44ff, transparent: true, opacity: 0.3 })
    );
    group.add(aura);

    var rings = [];
    for (var i = 0; i < 3; i++) {
      var ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.6 + i * 0.3, 0.06, 6, 20),
        new THREE.MeshBasicMaterial({ color: 0xcc66ff, transparent: true, opacity: 0.7 - i * 0.12 })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.8;
      ring.userData.pulsePhase = i / 3;
      rings.push(ring);
      group.add(ring);
    }

    var twoXGroup = new THREE.Group();
    var twoBlock = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.25, 0.06),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    twoBlock.position.set(-0.12, 0, 0);
    twoXGroup.add(twoBlock);
    var xBar1 = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.30, 0.06),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    xBar1.rotation.z = Math.PI / 4;
    xBar1.position.set(0.15, 0, 0);
    twoXGroup.add(xBar1);
    var xBar2 = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.30, 0.06),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    xBar2.rotation.z = -Math.PI / 4;
    xBar2.position.set(0.15, 0, 0);
    twoXGroup.add(xBar2);
    twoXGroup.position.set(0, 2.6, 0);
    group.add(twoXGroup);

    for (var s = 0; s < 6; s++) {
      var star = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.12, 0),
        new THREE.MeshBasicMaterial({ color: 0xdd88ff, transparent: true, opacity: 0.9 })
      );
      star.userData.orbitAngle = (s / 6) * Math.PI * 2;
      group.add(star);
    }

    var showerParticles = [];
    for (var fp = 0; fp < 12; fp++) {
      var dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 4, 4),
        new THREE.MeshBasicMaterial({ color: 0xcc66ff, transparent: true, opacity: 0.8 })
      );
      dot.userData.showerPhase = (fp / 12) * Math.PI * 2;
      dot.userData.showerSpeed = 1.5 + Math.random();
      dot.userData.showerRadius = 0.8 + Math.random() * 0.4;
      showerParticles.push(dot);
      group.add(dot);
    }

    group.visible = false;
    this.scene.add(group);
    this.effects.double = { group: group, rings: rings, aura: aura, twoXGroup: twoXGroup, showerParticles: showerParticles };
  }

  // ===== RUSH BOOST =====
  _createRushBoostEffect() {
    var group = new THREE.Group();

    var flameSmall = new THREE.Mesh(
      new THREE.SphereGeometry(0.9, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.3 })
    );
    flameSmall.position.y = 0.3;
    group.add(flameSmall);

    var flameMed = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0 })
    );
    flameMed.position.y = 0.5;
    group.add(flameMed);

    var flameLarge = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0 })
    );
    flameLarge.position.y = 0.7;
    group.add(flameLarge);

    var particles = [];
    for (var p = 0; p < 16; p++) {
      var particle = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 4, 4),
        new THREE.MeshBasicMaterial({
          color: p % 3 === 0 ? 0xff8800 : (p % 3 === 1 ? 0xffcc00 : 0xff4400),
          transparent: true, opacity: 0.95
        })
      );
      particle.userData.phase = (p / 16) * Math.PI * 2;
      particle.userData.speed = 1 + Math.random() * 0.5;
      particle.userData.radius = 0.3 + Math.random() * 0.5;
      particles.push(particle);
      group.add(particle);
    }

    var fireRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.0, 0.09, 6, 16),
      new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0 })
    );
    fireRing.rotation.x = Math.PI / 2;
    fireRing.position.y = 0.05;
    group.add(fireRing);

    var speedIndicators = [];
    for (var si = 0; si < 6; si++) {
      var speedLine = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.03, 0.8),
        new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0 })
      );
      speedLine.userData.angle = (si / 6) * Math.PI * 2;
      speedLine.userData.baseRadius = 0.6;
      speedIndicators.push(speedLine);
      group.add(speedLine);
    }

    group.visible = false;
    this.scene.add(group);
    this.effects.rushBoost = {
      group: group, flameSmall: flameSmall, flameMed: flameMed,
      flameLarge: flameLarge, particles: particles, fireRing: fireRing,
      speedIndicators: speedIndicators, stacks: 0
    };

    // Rush ghost pool (separate from group so they trail behind)
    for (var gi = 0; gi < this.rushGhostCount; gi++) {
      var ghost = new THREE.Mesh(
        new THREE.SphereGeometry(0.6, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0 })
      );
      ghost.visible = false;
      this.scene.add(ghost);
      this.rushGhosts.push({ mesh: ghost, life: 0, active: false });
    }
  }

  // ===== AUTO-PILOT =====
  _createAutoPilotEffect() {
    var group = new THREE.Group();

    var aura = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0x00ee66, transparent: true, opacity: 0.3 })
    );
    group.add(aura);

    var crossH = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.2, 0.14),
      new THREE.MeshBasicMaterial({ color: 0x00ff66 })
    );
    crossH.position.y = 2.6;
    group.add(crossH);

    var crossV = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.7, 0.14),
      new THREE.MeshBasicMaterial({ color: 0x00ff66 })
    );
    crossV.position.y = 2.6;
    group.add(crossV);

    var crossGlow = new THREE.Mesh(
      new THREE.TorusGeometry(0.5, 0.06, 6, 12),
      new THREE.MeshBasicMaterial({ color: 0x44ff88, transparent: true, opacity: 0.6 })
    );
    crossGlow.position.y = 2.6;
    group.add(crossGlow);

    var footRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.1, 0.07, 6, 16),
      new THREE.MeshBasicMaterial({ color: 0x00ff66, transparent: true, opacity: 0.55 })
    );
    footRing.rotation.x = Math.PI / 2;
    footRing.position.y = 0.05;
    group.add(footRing);

    var gridLines = [];
    for (var gl = 0; gl < 6; gl++) {
      var gridLine = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 2.2, 0.02),
        new THREE.MeshBasicMaterial({ color: 0x00ff44, transparent: true, opacity: 0.25 })
      );
      gridLine.position.set((gl - 2.5) * 0.25, 1.0, -0.3);
      gridLines.push(gridLine);
      group.add(gridLine);
    }
    for (var gh = 0; gh < 5; gh++) {
      var hLine = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.02, 0.02),
        new THREE.MeshBasicMaterial({ color: 0x00ff44, transparent: true, opacity: 0.2 })
      );
      hLine.position.set(0, 0.3 + gh * 0.4, -0.3);
      gridLines.push(hLine);
      group.add(hLine);
    }

    var scanLine = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.04, 0.02),
      new THREE.MeshBasicMaterial({ color: 0x66ff88, transparent: true, opacity: 0.5 })
    );
    scanLine.position.set(0, 1.0, -0.35);
    group.add(scanLine);

    group.visible = false;
    this.scene.add(group);
    this.effects.autoPilot = {
      group: group, crossH: crossH, crossV: crossV, crossGlow: crossGlow,
      aura: aura, footRing: footRing, gridLines: gridLines, scanLine: scanLine
    };
  }

  // ===== SCORE FRENZY =====
  _createScoreFrenzyEffect() {
    var group = new THREE.Group();

    var aura = new THREE.Mesh(
      new THREE.SphereGeometry(1.0, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xff4488, transparent: true, opacity: 0.3 })
    );
    group.add(aura);

    var diamonds = [];
    for (var d = 0; d < 8; d++) {
      var diamond = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.16, 0),
        new THREE.MeshBasicMaterial({ color: 0xff66aa, transparent: true, opacity: 0.95 })
      );
      diamond.userData.orbitAngle = (d / 8) * Math.PI * 2;
      diamond.userData.orbitSpeed = 2.0 + d * 0.25;
      diamond.userData.orbitRadius = 1.2;
      diamond.userData.heightOffset = (d % 3) * 0.3;
      diamonds.push(diamond);
      group.add(diamond);
    }

    var ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.1, 0.06, 6, 20),
      new THREE.MeshBasicMaterial({ color: 0xff4488, transparent: true, opacity: 0.7 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.0;
    group.add(ring);

    var sparkles = [];
    for (var sp = 0; sp < 10; sp++) {
      var sparkle = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 4, 4),
        new THREE.MeshBasicMaterial({
          color: sp % 2 === 0 ? 0xffaacc : 0xff88ff,
          transparent: true, opacity: 0.9
        })
      );
      sparkle.userData.sparklePhase = (sp / 10) * Math.PI * 2;
      sparkle.userData.sparkleRadius = 0.8 + Math.random() * 0.6;
      sparkle.userData.sparkleSpeed = 2 + Math.random() * 2;
      sparkle.userData.sparkleY = 0.3 + Math.random() * 1.8;
      sparkles.push(sparkle);
      group.add(sparkle);
    }

    group.visible = false;
    this.scene.add(group);
    this.effects.scoreFrenzy = { group: group, aura: aura, diamonds: diamonds, ring: ring, sparkles: sparkles };
  }

  // ===== POOLED TRANSIENT EFFECTS =====

  _createShardPool() {
    var sharedGeo = new THREE.TetrahedronGeometry(0.15, 0);
    for (var i = 0; i < this.shardCount; i++) {
      var shard = new THREE.Mesh(
        sharedGeo,
        new THREE.MeshBasicMaterial({
          color: i % 2 === 0 ? 0x4488ff : 0x88ccff,
          transparent: true, opacity: 0
        })
      );
      shard.visible = false;
      this.scene.add(shard);
      this.shardPool.push({
        mesh: shard, active: false, life: 0,
        vx: 0, vy: 0, vz: 0
      });
    }
  }

  _createGateParticlePool() {
    var sharedGeo = new THREE.SphereGeometry(0.06, 4, 4);
    for (var i = 0; i < this.gateParticleCount; i++) {
      var particle = new THREE.Mesh(
        sharedGeo,
        new THREE.MeshBasicMaterial({ color: 0x00ff44, transparent: true, opacity: 0 })
      );
      particle.visible = false;
      this.scene.add(particle);
      this.gateParticlePool.push({
        mesh: particle, active: false, life: 0,
        vx: 0, vy: 0, vz: 0
      });
    }
  }

  // ===== MAIN UPDATE =====
  update(dt, playerPos, powerups, rushBoostStacks) {
    if (this.paused || this.reducedMotion) {
      // Still update transient pools (they need to fade out)
      this._updateShardPool(dt);
      this._updateGateParticlePool(dt);
      this._updateRushGhosts(dt, 0, 0, 0, 0);
      return;
    }

    this.time += dt;

    var px = playerPos.x || 0;
    var py = playerPos.y || 0;
    var pz = playerPos.z || 0;

    // Position all effect groups on the player
    for (var key in this.effects) {
      if (this.effects[key] && this.effects[key].group) {
        this.effects[key].group.position.set(px, py, pz);
      }
    }

    // --- Shield ---
    var shieldActive = powerups.shield > 0;
    if (this.effects.shield) {
      this.effects.shield.group.visible = shieldActive;
      if (shieldActive) {
        this.effects.shield.wireframe.rotation.y += dt * 0.5;
        this.effects.shield.wireframe.rotation.x += dt * 0.3;
        this.effects.shield.outer.material.opacity = 0.30 + Math.sin(this.time * 2) * 0.08;
        this.effects.shield.inner.material.opacity = 0.20 + Math.sin(this.time * 3) * 0.07;
        this.effects.shield.hexRing.rotation.z += dt * 0.3;
        this.effects.shield.hexRing2.rotation.z -= dt * 0.2;
        this.effects.shield.hexRing2.rotation.x += dt * 0.15;
        this.effects.shield.equatorRing.rotation.z += dt * 0.8;
        this.effects.shield.equatorRing.material.opacity = 0.5 + Math.sin(this.time * 4) * 0.15;
      }
    }

    // --- Magnet ---
    var magnetActive = powerups.magnet > 0;
    if (this.effects.magnet) {
      this.effects.magnet.group.visible = magnetActive;
      if (magnetActive) {
        this.effects.magnet.ring.rotation.z += dt * 1.5;
        this.effects.magnet.footRing.rotation.z -= dt * 1.2;
        this.effects.magnet.footRing.material.opacity = 0.5 + Math.sin(this.time * 3) * 0.15;

        var mChildren = this.effects.magnet.group.children;
        for (var mi = 0; mi < mChildren.length; mi++) {
          var child = mChildren[mi];
          if (child.userData.orbitAngle !== undefined) {
            child.userData.orbitAngle += dt * child.userData.orbitSpeed;
            var a = child.userData.orbitAngle;
            var r = child.userData.orbitRadius;
            var oy = child.userData.orbitY || 0.8;
            child.position.set(Math.cos(a) * r, oy + Math.sin(this.time * 3 + mi) * 0.15, Math.sin(a) * r);
            child.rotation.z += dt * 3;
          }
          if (child.userData.sparklePhase !== undefined) {
            var spPhase = child.userData.sparklePhase + this.time * child.userData.sparkleSpeed;
            child.position.set(Math.cos(spPhase) * 0.6, 0.8 + Math.sin(spPhase * 1.5) * 0.5, Math.sin(spPhase) * 0.6);
            child.material.opacity = 0.5 + Math.sin(this.time * 5 + child.userData.sparklePhase) * 0.4;
          }
        }
      }
    }

    // --- Double Score ---
    var doubleActive = powerups.double > 0;
    if (this.effects.double) {
      this.effects.double.group.visible = doubleActive;
      if (doubleActive) {
        for (var di = 0; di < this.effects.double.rings.length; di++) {
          var dring = this.effects.double.rings[di];
          var phase = (this.time * 0.8 + dring.userData.pulsePhase) % 1;
          var scale = 1 + phase * 1.5;
          dring.scale.set(scale, scale, scale);
          dring.material.opacity = (1 - phase) * 0.7;
        }
        if (this.effects.double.twoXGroup) {
          this.effects.double.twoXGroup.position.y = 2.6 + Math.sin(this.time * 2.5) * 0.2;
          this.effects.double.twoXGroup.rotation.y += dt * 1.5;
        }
        var dChildren = this.effects.double.group.children;
        for (var dci = 0; dci < dChildren.length; dci++) {
          if (dChildren[dci].userData.orbitAngle !== undefined) {
            dChildren[dci].userData.orbitAngle += dt * 1.8;
            var da = dChildren[dci].userData.orbitAngle;
            dChildren[dci].position.set(Math.cos(da) * 1.3, 1.2 + Math.sin(this.time * 2 + dci) * 0.3, Math.sin(da) * 1.3);
            dChildren[dci].rotation.y += dt * 4;
          }
        }
        if (this.effects.double.showerParticles) {
          for (var spi = 0; spi < this.effects.double.showerParticles.length; spi++) {
            var sp2 = this.effects.double.showerParticles[spi];
            var sPhase = (this.time * sp2.userData.showerSpeed + sp2.userData.showerPhase) % 1;
            var sr = sp2.userData.showerRadius;
            sp2.position.set(
              Math.cos(sp2.userData.showerPhase * 3 + this.time) * sr,
              2.5 - sPhase * 3.0,
              Math.sin(sp2.userData.showerPhase * 3 + this.time) * sr
            );
            sp2.material.opacity = (1 - sPhase) * 0.8;
            var sScale = (1 - sPhase) * 1.5 + 0.3;
            sp2.scale.set(sScale, sScale, sScale);
          }
        }
      }
    }

    // --- Rush Boost ---
    var rushActive = rushBoostStacks > 0;
    if (this.effects.rushBoost) {
      this.effects.rushBoost.group.visible = rushActive;
      if (rushActive) {
        var stacks = Math.min(rushBoostStacks, 3);
        this.effects.rushBoost.flameSmall.material.opacity = 0.25 + stacks * 0.1;
        this.effects.rushBoost.flameSmall.scale.set(
          1 + Math.sin(this.time * 8) * 0.15,
          1 + Math.sin(this.time * 6) * 0.2,
          1 + Math.sin(this.time * 7) * 0.15
        );
        this.effects.rushBoost.flameMed.material.opacity = stacks >= 2 ? 0.22 : 0;
        this.effects.rushBoost.flameLarge.material.opacity = stacks >= 3 ? 0.18 : 0;
        this.effects.rushBoost.fireRing.material.opacity = stacks * 0.3;
        this.effects.rushBoost.fireRing.rotation.z += dt * (2 + stacks);

        for (var fp = 0; fp < this.effects.rushBoost.particles.length; fp++) {
          var fpart = this.effects.rushBoost.particles[fp];
          fpart.visible = fp < stacks * 6;
          if (fpart.visible) {
            var fPhase = (this.time * fpart.userData.speed + fpart.userData.phase) % 1;
            fpart.position.set(
              Math.cos(this.time * 3 + fpart.userData.phase) * fpart.userData.radius,
              fPhase * 2.8,
              Math.sin(this.time * 3 + fpart.userData.phase) * fpart.userData.radius
            );
            fpart.material.opacity = (1 - fPhase) * 0.95;
            var fScale = (1 - fPhase) * 1.2 + 0.3;
            fpart.scale.set(fScale, fScale, fScale);
          }
        }

        for (var sli = 0; sli < this.effects.rushBoost.speedIndicators.length; sli++) {
          var sl = this.effects.rushBoost.speedIndicators[sli];
          sl.visible = stacks >= 2;
          if (sl.visible) {
            var slAngle = sl.userData.angle + this.time * 0.5;
            var slR = sl.userData.baseRadius + Math.sin(this.time * 4 + sli) * 0.2;
            sl.position.set(Math.cos(slAngle) * slR, 0.8 + sli * 0.25, 1.0 + Math.sin(this.time * 3 + sli) * 0.3);
            sl.material.opacity = 0.3 + stacks * 0.1;
          }
        }

        // Spawn rush ghosts
        this.rushGhostTimer -= dt;
        if (this.rushGhostTimer <= 0 && stacks >= 1) {
          this.rushGhostTimer = 0.08 / stacks;
          for (var rgi = 0; rgi < this.rushGhosts.length; rgi++) {
            if (!this.rushGhosts[rgi].active) {
              this.rushGhosts[rgi].active = true;
              this.rushGhosts[rgi].life = 0.25 + stacks * 0.05;
              this.rushGhosts[rgi].mesh.position.set(px, py + 0.8, pz + 0.5);
              this.rushGhosts[rgi].mesh.visible = true;
              this.rushGhosts[rgi].mesh.material.opacity = 0.35;
              this.rushGhosts[rgi].mesh.material.color.setHex(
                stacks >= 3 ? 0xff2200 : (stacks >= 2 ? 0xff4400 : 0xff6600)
              );
              var ghostScale = 0.8 + stacks * 0.15;
              this.rushGhosts[rgi].mesh.scale.set(ghostScale, ghostScale * 1.5, ghostScale);
              break;
            }
          }
        }
      }
    }

    // Update rush ghosts (always, so they fade out when rush ends)
    this._updateRushGhosts(dt);

    // --- Auto-Pilot ---
    var autoActive = powerups.autoPilot > 0;
    if (this.effects.autoPilot) {
      this.effects.autoPilot.group.visible = autoActive;
      if (autoActive) {
        this.effects.autoPilot.crossH.rotation.y += dt * 2.5;
        this.effects.autoPilot.crossV.rotation.y += dt * 2.5;
        this.effects.autoPilot.crossGlow.rotation.y += dt * 2.5;
        var bobY = 2.6 + Math.sin(this.time * 2) * 0.25;
        this.effects.autoPilot.crossH.position.y = bobY;
        this.effects.autoPilot.crossV.position.y = bobY;
        this.effects.autoPilot.crossGlow.position.y = bobY;
        this.effects.autoPilot.footRing.material.opacity = 0.45 + Math.sin(this.time * 3) * 0.2;
        this.effects.autoPilot.footRing.rotation.z += dt * 0.5;
        if (this.effects.autoPilot.gridLines) {
          for (var gli = 0; gli < this.effects.autoPilot.gridLines.length; gli++) {
            this.effects.autoPilot.gridLines[gli].material.opacity = 0.15 + Math.sin(this.time * 4 + gli * 0.5) * 0.1;
          }
        }
        if (this.effects.autoPilot.scanLine) {
          this.effects.autoPilot.scanLine.position.y = 0.3 + (Math.sin(this.time * 2) + 1) * 0.5 * 1.6;
          this.effects.autoPilot.scanLine.material.opacity = 0.4 + Math.sin(this.time * 6) * 0.15;
        }
      }
    }

    // --- Score Frenzy ---
    var frenzyActive = powerups.scoreFrenzy > 0;
    if (this.effects.scoreFrenzy) {
      this.effects.scoreFrenzy.group.visible = frenzyActive;
      if (frenzyActive) {
        this.effects.scoreFrenzy.aura.material.opacity = 0.25 + Math.sin(this.time * 4) * 0.1;
        var ringPhase = (this.time * 1.2) % 1;
        var ringScale = 1 + ringPhase * 0.6;
        this.effects.scoreFrenzy.ring.scale.set(ringScale, ringScale, ringScale);
        this.effects.scoreFrenzy.ring.material.opacity = (1 - ringPhase) * 0.7;

        for (var fi = 0; fi < this.effects.scoreFrenzy.diamonds.length; fi++) {
          var dm = this.effects.scoreFrenzy.diamonds[fi];
          dm.userData.orbitAngle += dt * dm.userData.orbitSpeed;
          var fa = dm.userData.orbitAngle;
          var fr = dm.userData.orbitRadius;
          dm.position.set(Math.cos(fa) * fr, 0.5 + dm.userData.heightOffset + Math.sin(this.time * 2.5 + fi) * 0.25, Math.sin(fa) * fr);
          dm.rotation.y += dt * 5;
          dm.rotation.x += dt * 3;
        }

        if (this.effects.scoreFrenzy.sparkles) {
          for (var ski = 0; ski < this.effects.scoreFrenzy.sparkles.length; ski++) {
            var sk = this.effects.scoreFrenzy.sparkles[ski];
            var skAngle = this.time * sk.userData.sparkleSpeed + sk.userData.sparklePhase;
            sk.position.set(
              Math.cos(skAngle) * sk.userData.sparkleRadius,
              sk.userData.sparkleY + Math.sin(skAngle * 1.3) * 0.3,
              Math.sin(skAngle) * sk.userData.sparkleRadius
            );
            sk.material.opacity = 0.5 + Math.sin(this.time * 8 + ski) * 0.4;
            var skScale = 0.8 + Math.sin(this.time * 6 + ski * 0.7) * 0.4;
            sk.scale.set(skScale, skScale, skScale);
          }
        }
      }
    }

    // Update transient pools
    this._updateShardPool(dt);
    this._updateGateParticlePool(dt);
  }

  // ===== TRANSIENT POOL UPDATES (time-based, no RAF) =====

  _updateRushGhosts(dt) {
    for (var i = 0; i < this.rushGhosts.length; i++) {
      var gh = this.rushGhosts[i];
      if (gh.active) {
        gh.life -= dt;
        if (gh.life <= 0) {
          gh.active = false;
          gh.mesh.visible = false;
        } else {
          gh.mesh.material.opacity = (gh.life / 0.35) * 0.3;
          gh.mesh.scale.multiplyScalar(0.97);
        }
      }
    }
  }

  _updateShardPool(dt) {
    for (var i = 0; i < this.shardPool.length; i++) {
      var s = this.shardPool[i];
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.active = false;
        s.mesh.visible = false;
        continue;
      }
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      s.vy -= 9.8 * dt;
      var ratio = s.life / 0.7;
      s.mesh.material.opacity = ratio * 0.95;
      s.mesh.rotation.x += 0.2 * dt * 60;
      s.mesh.rotation.y += 0.25 * dt * 60;
      s.mesh.scale.set(ratio, ratio, ratio);
    }
  }

  _updateGateParticlePool(dt) {
    for (var i = 0; i < this.gateParticlePool.length; i++) {
      var gp = this.gateParticlePool[i];
      if (!gp.active) continue;
      gp.life -= dt;
      if (gp.life <= 0) {
        gp.active = false;
        gp.mesh.visible = false;
        continue;
      }
      gp.mesh.position.x += gp.vx * dt;
      gp.mesh.position.y += gp.vy * dt;
      gp.mesh.position.z += gp.vz * dt;
      gp.vy -= 6 * dt;
      var ratio = gp.life / 0.4;
      gp.mesh.material.opacity = ratio * 0.8;
      var sc = ratio * 0.8 + 0.2;
      gp.mesh.scale.set(sc, sc, sc);
    }
  }

  // ===== PUBLIC TRANSIENT EFFECT TRIGGERS =====

  /**
   * Shield shatter — uses pooled shards, no independent RAF.
   * Called by engine when shield breaks.
   */
  shatterShield(playerPos) {
    var spx = playerPos.x || 0;
    var spy = (playerPos.y || 0) + 0.8;
    var spz = playerPos.z || 0;

    var spawned = 0;
    for (var i = 0; i < this.shardPool.length; i++) {
      if (spawned >= this.shardCount) break;
      var s = this.shardPool[i];
      if (s.active) continue;

      s.active = true;
      s.mesh.visible = true;
      s.life = 0.7;
      s.mesh.position.set(spx, spy, spz);
      s.mesh.material.opacity = 0.95;
      s.mesh.scale.set(1, 1, 1);

      var angle = (spawned / this.shardCount) * Math.PI * 2;
      s.vx = Math.cos(angle) * (3.5 + Math.random() * 1.5);
      s.vy = 1.5 + Math.random() * 3.0;
      s.vz = Math.sin(angle) * (3.5 + Math.random() * 1.5);

      spawned++;
    }
  }

  /**
   * Gate result particles — uses pooled particles, no independent RAF.
   * Called by engine when a gate resolves correctly.
   */
  spawnGateParticles(position, color, count) {
    var spawned = 0;
    var targetCount = Math.min(count || this.gateParticleCount, this.gateParticleCount);

    for (var i = 0; i < this.gateParticlePool.length; i++) {
      if (spawned >= targetCount) break;
      var gp = this.gateParticlePool[i];
      if (gp.active) continue;

      gp.active = true;
      gp.mesh.visible = true;
      gp.life = 0.4;
      gp.mesh.position.set(position.x, position.y, position.z);
      gp.mesh.material.color.setHex(color || 0x00ff44);
      gp.mesh.material.opacity = 0.8;
      gp.mesh.scale.set(1, 1, 1);

      var angle = (spawned / targetCount) * Math.PI * 2;
      var speed = 2 + Math.random() * 2;
      gp.vx = Math.cos(angle) * speed;
      gp.vy = 1 + Math.random() * 2;
      gp.vz = Math.sin(angle) * speed;

      spawned++;
    }
  }

  // ===== LIFECYCLE =====

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
  }

  reset() {
    this.hideAll();
    this.time = 0;
    this.rushGhostTimer = 0;
    // Deactivate all transient pools
    for (var i = 0; i < this.shardPool.length; i++) {
      this.shardPool[i].active = false;
      this.shardPool[i].mesh.visible = false;
    }
    for (var j = 0; j < this.gateParticlePool.length; j++) {
      this.gateParticlePool[j].active = false;
      this.gateParticlePool[j].mesh.visible = false;
    }
  }

  setReducedMotion(enabled) {
    this.reducedMotion = enabled;
    if (enabled) {
      this.hideAll();
    }
  }

  hideAll() {
    for (var key in this.effects) {
      if (this.effects[key] && this.effects[key].group) {
        this.effects[key].group.visible = false;
      }
    }
    for (var gi = 0; gi < this.rushGhosts.length; gi++) {
      this.rushGhosts[gi].active = false;
      this.rushGhosts[gi].mesh.visible = false;
    }
  }

  dispose() {
    for (var key in this.effects) {
      if (this.effects[key] && this.effects[key].group) {
        this.scene.remove(this.effects[key].group);
        this.effects[key].group.traverse(function (child) {
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        });
      }
    }
    for (var gi = 0; gi < this.rushGhosts.length; gi++) {
      this.scene.remove(this.rushGhosts[gi].mesh);
      this.rushGhosts[gi].mesh.geometry.dispose();
      this.rushGhosts[gi].mesh.material.dispose();
    }
    this.rushGhosts = [];
    for (var si = 0; si < this.shardPool.length; si++) {
      this.scene.remove(this.shardPool[si].mesh);
      // shared geometry — do not dispose individually
      this.shardPool[si].mesh.material.dispose();
    }
    this.shardPool = [];
    for (var gpi = 0; gpi < this.gateParticlePool.length; gpi++) {
      this.scene.remove(this.gateParticlePool[gpi].mesh);
      this.gateParticlePool[gpi].mesh.material.dispose();
    }
    this.gateParticlePool = [];
    this.effects = {};
  }
}
