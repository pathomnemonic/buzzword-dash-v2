/**
 * trails.js — Player trail effect system
 *
 * Agent 14 — Effects and Trails
 *
 * Architectural compliance:
 * - No independent requestAnimationFrame loops
 * - Enforces particle budgets per quality level
 * - Supports pause/resume/reset/dispose lifecycle
 * - Effects remain outside trackRoot (added directly to scene)
 * - Pools all particles at construction; no runtime allocations
 * - Reads storage for equipped trail only (allowed dependency)
 * - Fixes excessive scaling from previous version
 * - Supports quality levels: low, medium, high
 * - Supports reduced motion preference
 *
 * Each trail has a shape that matches its name (see trailshapes.js): hearts are hearts, notes are music notes,
 * pills are capsules, and so on, instead of coloured circles.
 */

import * as THREE from 'three';
import { storage } from '../storage.js';
import { getTrailGeometry } from './trailshapes.js';

// ===== QUALITY PRESETS =====
var QUALITY_PRESETS = {
  low:    { maxParticles: 50,  spawnRate: 0.04 },
  medium: { maxParticles: 100, spawnRate: 0.025 },
  high:   { maxParticles: 150, spawnRate: 0.015 }
};

// ===== TRAIL CONFIGURATIONS =====
var TRAIL_CONFIGS = {
  trail_none: null,
  trail_ekg: {
    color1: 0x00ff44, color2: 0x00cc33, shape: 'ekg',
    size: 0.35, spread: 0.12, type: 'line'
  },
  trail_neural: {
    color1: 0xcc77ff, color2: 0x8844ee, shape: 'star', glow: true,
    size: 0.45, spread: 0.45, type: 'spark'
  },
  trail_blood: {
    color1: 0xff2222, color2: 0xbb0000, shape: 'cell',
    size: 0.40, spread: 0.30, type: 'cell'
  },
  trail_dna: {
    color1: 0x4488ff, color2: 0xff4488, shape: 'bead',
    size: 0.30, spread: 0.40, type: 'helix'
  },
  trail_fire: {
    color1: 0xffaa00, color2: 0xff2200, shape: 'flame', glow: true,
    size: 0.50, spread: 0.35, type: 'flame'
  },
  trail_rainbow: {
    color1: 0xff44ff, color2: 0x44ffff, shape: 'ribbon', rainbow: true,
    size: 0.40, spread: 0.40, type: 'ribbon'
  },
  trail_confetti: {
    color1: 0xff4444, color2: 0x44ff44, shape: 'confetti', confetti: true,
    size: 0.40, spread: 0.50, type: 'burst'
  },
  trail_hearts: {
    color1: 0xff4488, color2: 0xff88aa, shape: 'heart',
    size: 0.35, spread: 0.30, type: 'hearts'
  },
  trail_lightning: {
    color1: 0xffff44, color2: 0x44aaff, shape: 'bolt', glow: true,
    size: 0.30, spread: 0.25, type: 'electric'
  },
  trail_bubbles: {
    color1: 0x88ddff, color2: 0xcceeff, shape: 'bubble', see: true,
    size: 0.40, spread: 0.35, type: 'bubbles'
  },
  trail_music: {
    color1: 0xff88ff, color2: 0x88ff88, shape: 'note',
    size: 0.30, spread: 0.30, type: 'notes'
  },
  trail_pills: {
    color1: 0xff4444, color2: 0xffffff, shape: 'pill', pills: true,
    size: 0.30, spread: 0.25, type: 'pills'
  }
};

/** The trail settings (exported so tests can check every trail draws what its description says). */
export var TRAIL_SETTINGS = TRAIL_CONFIGS;

var CONFETTI_COLORS = [0xff4466, 0xffd23f, 0x3ddc84, 0x4aa8ff, 0xc77dff];

// ===== SHARED GEOMETRY (created once, reused by all particles) =====
var _sharedSphereGeo = null;

function getSharedSphereGeo() {
  if (!_sharedSphereGeo) {
    _sharedSphereGeo = new THREE.SphereGeometry(0.1, 6, 6);
  }
  return _sharedSphereGeo;
}

export class TrailSystem {
  constructor(scene, options) {
    this.scene = scene;
    this.time = 0;
    this.spawnTimer = 0;
    this.paused = false;
    this.reducedMotion = (options && options.reducedMotion) || false;
    // +1: the trail streams toward the camera (the game looks at the runner from behind).
    // -1: it streams away (the Locker looks at the runner from the front).
    this.direction = options && options.direction === -1 ? -1 : 1;
    // particles that travel past this z are put away (the Locker's camera is close: nothing should fly through it)
    this.clipZ = options && typeof options.clipZ === 'number' ? options.clipZ : Infinity;
    // A trail to show instead of the equipped one (the Locker's preview)
    this.overrideId = null;

    // Quality
    var qualityKey = (options && options.quality) || 'high';
    var preset = QUALITY_PRESETS[qualityKey] || QUALITY_PRESETS.high;
    this.maxParticles = preset.maxParticles;
    this.baseSpawnRate = preset.spawnRate;

    // Pool
    this.pool = [];
    var geo = getSharedSphereGeo(); // replaced by the trail's own shape when a particle is launched

    for (var i = 0; i < this.maxParticles; i++) {
      var mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 1.0,
          side: THREE.DoubleSide,
          depthWrite: false
        })
      );
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({
        mesh: mesh,
        life: 0,
        maxLife: 0,
        vx: 0, vy: 0, vz: 0,
        spin: 0, phase: 0, baseX: 0, baseY: 0, strand: 0, sx: 1, sy: 1,
        active: false
      });
    }
  }

  getConfig() {
    var equipped = storage.get('equipped');
    var trailId = this.overrideId || (equipped && equipped.trail) || 'trail_none';
    return TRAIL_CONFIGS[trailId] || null;
  }

  /** Show this trail (null: back to the equipped one). Particles already in the air are cleared. */
  setOverride(trailId) {
    if (this.overrideId === (trailId || null)) return;
    this.overrideId = trailId || null;
    this.reset();
  }

  update(dt, playerX, playerY, playerZ, streak) {
    if (this.paused || this.reducedMotion) return;

    this.time += dt;
    var config = this.getConfig();

    if (!config) {
      // Hide all active particles when no trail is equipped
      for (var h = 0; h < this.pool.length; h++) {
        if (this.pool[h].active) {
          this.pool[h].mesh.visible = false;
          this.pool[h].active = false;
        }
      }
      return;
    }

    var intensity = Math.min(3.0, 1.0 + streak * 0.08);
    var spawnRate = this.baseSpawnRate / intensity;

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = spawnRate;
      this._spawnParticle(config, playerX, playerY, playerZ, intensity);
    }

    // Update active particles
    for (var i = 0; i < this.pool.length; i++) {
      var p = this.pool[i];
      if (!p.active) continue;

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }

      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt * this.direction;
      if (p.mesh.position.z > this.clipZ) { p.active = false; p.mesh.visible = false; continue; }

      var lifeRatio = p.life / p.maxLife;
      p.mesh.material.opacity = lifeRatio * 0.95 * (p.opacityScale || 1);

      // Scale: size * 4 (reduced from previous 15x to fix excessive scaling)
      var scale = lifeRatio * config.size * 4;
      p.mesh.scale.set(scale * p.sx, scale * p.sy, scale);

      // Flat shapes turn as they fly
      if (p.spin) p.mesh.rotation.z += p.spin * dt;

      // Type-specific animation
      switch (config.type) {
        case 'helix':
          // two strands that wind around each other, with the beads of each strand opposite one another
          var ang = p.phase + (p.maxLife - p.life) * 7;
          p.mesh.position.x = p.baseX + Math.cos(ang) * 0.22;
          p.mesh.position.y = p.baseY + Math.sin(ang) * 0.22;
          break;
        case 'electric':
          p.mesh.position.x += Math.sin(this.time * 20 + i) * 0.06;
          break;
        case 'bubbles':
          p.vy += dt * 0.5;
          var bubbleScale = scale * (1 + (1 - lifeRatio) * 0.5);
          p.mesh.scale.set(bubbleScale, bubbleScale, bubbleScale);
          break;
        case 'burst':
          p.vx *= 1.01;
          p.vz *= 1.01;
          break;
        case 'hearts':
          p.mesh.rotation.z = Math.sin(this.time * 4 + i) * 0.35; // a gentle sway
          break;
        case 'flame':
          p.mesh.scale.set(scale * (0.7 + lifeRatio * 0.3), scale * (1.1 + (1 - lifeRatio) * 0.3), scale);
          break;
      }
    }
  }

  _spawnParticle(config, px, py, pz, intensity) {
    var p = null;
    for (var i = 0; i < this.pool.length; i++) {
      if (!this.pool[i].active) {
        p = this.pool[i];
        break;
      }
    }
    if (!p) return;

    p.active = true;
    p.mesh.visible = true;
    p.maxLife = 1.5 + Math.random() * 0.5;
    p.life = p.maxLife;

    var spread = config.spread * intensity;
    p.mesh.position.set(
      px + (Math.random() - 0.5) * spread,
      (py + 0.5) + (Math.random() - 0.5) * spread * 0.5,
      pz + this.direction * (0.5 + Math.random() * 0.3)
    );

    // Default velocities
    p.vx = (Math.random() - 0.5) * 1.8;
    p.vy = (Math.random() - 0.3) * 1.2;
    p.vz = 2.5 + Math.random() * 2.5;

    // Type-specific spawn behavior
    switch (config.type) {
      case 'burst':
        var burstAngle = Math.random() * Math.PI * 2;
        p.vx = Math.cos(burstAngle) * 2.0;
        p.vz = Math.sin(burstAngle) * 2.0 + 1.5;
        p.vy = Math.random() * 2.0;
        break;
      case 'hearts':
        p.vx *= 0.5;
        p.vy = 0.5 + Math.random() * 1.0;
        p.vz = 1.5 + Math.random();
        break;
      case 'electric':
        p.vx = (Math.random() - 0.5) * 3.0;
        p.vy = (Math.random() - 0.5) * 0.5;
        p.vz = 3.0 + Math.random() * 2.0;
        p.maxLife = 0.8 + Math.random() * 0.4;
        p.life = p.maxLife;
        break;
      case 'bubbles':
        p.vx *= 0.3;
        p.vy = 1.0 + Math.random() * 1.5;
        p.vz = 1.0 + Math.random() * 1.5;
        break;
      case 'notes':
        p.vx = (Math.random() - 0.5) * 2.0;
        p.vy = 1.0 + Math.random() * 1.0;
        p.vz = 1.5 + Math.random() * 1.5;
        break;
      case 'pills':
        p.vx = (Math.random() - 0.5) * 1.5;
        p.vy = -0.5 + Math.random() * 0.5;
        p.vz = 2.0 + Math.random() * 2.0;
        break;
      case 'line':
        p.vy = 0;
        p.vx = 0;
        break;
      case 'helix':
        p.vx = 0;
        p.vy = 0;
        p.vz = 2.5;
        break;
      case 'flame':
        p.vx *= 0.4;
        p.vy = 1.0 + Math.random() * 1.5;
        p.vz = 1.5 + Math.random() * 1.5;
        break;
    }

    // The shape this trail is made of
    p.mesh.geometry = getTrailGeometry(config.shape);
    p.mesh.rotation.set(0, 0, 0);
    p.spin = 0;
    p.mesh.material.blending = config.glow ? THREE.AdditiveBlending : THREE.NormalBlending;

    // Color
    var t = Math.random();
    var c1 = new THREE.Color(config.color1);
    var c2 = new THREE.Color(config.color2);
    if (config.rainbow) {
      c1.setHSL((this.time * 0.9) % 1, 1, 0.55); // the ribbon cycles through every colour
    } else if (config.confetti) {
      c1.setHex(CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]);
    } else if (config.pills) {
      c1.setHex(Math.random() < 0.5 ? config.color1 : config.color2); // red and white pills
    } else if (config.type === 'helix') {
      p.strand = this._strand = (this._strand || 0) ^ 1;
      c1.setHex(p.strand ? config.color2 : config.color1);
    } else {
      c1.lerp(c2, t);
    }
    p.mesh.material.color.copy(c1);
    p.mesh.material.opacity = config.see ? 0.55 : 0.95;
    p.opacityScale = config.see ? 0.55 / 0.95 : 1;

    // Scale: size * 4 (reduced from 15x)
    var s = config.size * (0.8 + Math.random() * 0.4) * intensity * 4;
    p.mesh.scale.set(s, s, s);

    p.sx = 1;
    p.sy = 1;
    if (config.type === 'line') {
      p.sx = 1.4; p.sy = 1.4;
    } else if (config.type === 'pills') {
      p.sx = 0.9; p.sy = 0.9;
      p.mesh.rotation.z = Math.random() * Math.PI;
      p.spin = (Math.random() - 0.5) * 3;
    } else if (config.type === 'burst') {
      p.mesh.rotation.z = Math.random() * Math.PI;
      p.spin = (Math.random() - 0.5) * 12; // confetti tumbles
    } else if (config.type === 'cell') {
      p.spin = (Math.random() - 0.5) * 2;
    } else if (config.type === 'ribbon') {
      p.sx = 1.8; p.sy = 1.8;
    } else if (config.type === 'helix') {
      p.baseX = p.mesh.position.x;
      p.baseY = p.mesh.position.y;
      p.phase = p.strand ? Math.PI : 0;
    } else if (config.type === 'spark') {
      p.spin = (Math.random() - 0.5) * 8;
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
    this.time = 0;
    this.spawnTimer = 0;
    for (var i = 0; i < this.pool.length; i++) {
      this.pool[i].active = false;
      this.pool[i].mesh.visible = false;
    }
  }

  setReducedMotion(enabled) {
    this.reducedMotion = enabled;
    if (enabled) {
      this.reset();
    }
  }

  dispose() {
    for (var i = 0; i < this.pool.length; i++) {
      this.scene.remove(this.pool[i].mesh);
      // Shared geometry — do NOT dispose (other instances may use it)
      this.pool[i].mesh.material.dispose();
    }
    this.pool = [];
  }
}
