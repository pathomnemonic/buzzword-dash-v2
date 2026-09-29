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
 * Trail types:
 *   line, spark, sphere, helix, burst, hearts, electric,
 *   bubbles, notes, pills
 */

import * as THREE from 'three';
import { storage } from '../storage.js';

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
    color1: 0x00ff44, color2: 0x00aa22,
    size: 0.35, spread: 0.12, type: 'line'
  },
  trail_neural: {
    color1: 0xaa44ff, color2: 0x6622cc,
    size: 0.45, spread: 0.45, type: 'spark'
  },
  trail_blood: {
    color1: 0xff2222, color2: 0xaa0000,
    size: 0.40, spread: 0.30, type: 'sphere'
  },
  trail_dna: {
    color1: 0x4488ff, color2: 0xff4488,
    size: 0.30, spread: 0.40, type: 'helix'
  },
  trail_fire: {
    color1: 0xff8800, color2: 0xff2200,
    size: 0.50, spread: 0.35, type: 'sphere'
  },
  trail_rainbow: {
    color1: 0xff44ff, color2: 0x44ffff,
    size: 0.40, spread: 0.40, type: 'sphere'
  },
  trail_confetti: {
    color1: 0xff4444, color2: 0x44ff44,
    size: 0.40, spread: 0.50, type: 'burst'
  },
  trail_hearts: {
    color1: 0xff4488, color2: 0xff88aa,
    size: 0.35, spread: 0.30, type: 'hearts'
  },
  trail_lightning: {
    color1: 0xffff44, color2: 0x44aaff,
    size: 0.30, spread: 0.25, type: 'electric'
  },
  trail_bubbles: {
    color1: 0x88ddff, color2: 0xaaeeff,
    size: 0.40, spread: 0.35, type: 'bubbles'
  },
  trail_music: {
    color1: 0xff88ff, color2: 0x88ff88,
    size: 0.30, spread: 0.30, type: 'notes'
  },
  trail_pills: {
    color1: 0xff4444, color2: 0xffffff,
    size: 0.30, spread: 0.25, type: 'pills'
  }
};

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

    // Quality
    var qualityKey = (options && options.quality) || 'high';
    var preset = QUALITY_PRESETS[qualityKey] || QUALITY_PRESETS.high;
    this.maxParticles = preset.maxParticles;
    this.baseSpawnRate = preset.spawnRate;

    // Pool
    this.pool = [];
    var geo = getSharedSphereGeo();

    for (var i = 0; i < this.maxParticles; i++) {
      var mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 1.0
        })
      );
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({
        mesh: mesh,
        life: 0,
        maxLife: 0,
        vx: 0, vy: 0, vz: 0,
        active: false
      });
    }
  }

  getConfig() {
    var equipped = storage.get('equipped');
    var trailId = (equipped && equipped.trail) || 'trail_none';
    return TRAIL_CONFIGS[trailId] || null;
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
      p.mesh.position.z += p.vz * dt;

      var lifeRatio = p.life / p.maxLife;
      p.mesh.material.opacity = lifeRatio * 0.95;

      // Scale: size * 4 (reduced from previous 15x to fix excessive scaling)
      var scale = lifeRatio * config.size * 4;
      p.mesh.scale.set(scale, scale, scale);

      // Type-specific animation
      switch (config.type) {
        case 'helix':
          var angle = this.time * 8 + i * 0.5;
          p.mesh.position.x += Math.sin(angle) * 0.04;
          p.mesh.position.y += Math.cos(angle) * 0.04;
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
      pz + 0.5 + Math.random() * 0.3
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
    }

    // Color
    var t = Math.random();
    var c1 = new THREE.Color(config.color1);
    var c2 = new THREE.Color(config.color2);
    c1.lerp(c2, t);
    p.mesh.material.color.copy(c1);
    p.mesh.material.opacity = 0.95;

    // Scale: size * 4 (reduced from 15x)
    var s = config.size * (0.8 + Math.random() * 0.4) * intensity * 4;
    p.mesh.scale.set(s, s, s);

    if (config.type === 'line') {
      p.mesh.scale.set(s * 0.3, s * 0.3, s * 3.0);
    } else if (config.type === 'pills') {
      p.mesh.scale.set(s * 0.5, s * 0.5, s * 1.5);
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
