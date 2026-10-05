/**
 * enginevisuals.js — Sparks, scenery, map and skin transitions, gate particles.
 *
 * Split out of engine.js. These methods are attached to Game.prototype (see the end of engine.js),
 * so `this` is the Game and nothing about how they are called has changed.
 */

import * as THREE from 'three';
import { storage } from '../storage.js';
import { buildTrack, updateRunningLights, updateAtmosphericParticles, updateScrollLines, updateScrollers, updateWallScrollPanels, updateWallMarkers, updateSkyboxElements } from './track.js';
import { softDotTexture } from './materials.js';
import { getQuality, isLowQuality, useSceneryModels, DENSITY_LEVELS } from './quality.js';
import { buildSideScenery, animateSideScenery } from './scenery.js';
import { updateAnimators, setSceneryDensity } from './mapfx.js';
import { trackGlow } from './combo.js';
import { secretFor, buildSecret, planSecretTime, isTapOnSecret, secretReward } from './secrets.js';

export var visualMethods = {

  /** A short burst of glowing sparks at a pickup. */
  _spawnSparks(position, color) {
    if (isLowQuality() || storage.get('reducedMotion')) return;
    var tex = softDotTexture();
    if (!this._sparks) this._sparks = [];
    for (var i = 0; i < 10; i++) {
      var mat = new THREE.SpriteMaterial({ map: tex, color: color, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending });
      var sprite = new THREE.Sprite(mat);
      sprite.scale.setScalar(0.28);
      sprite.position.copy(position);
      var a = Math.random() * Math.PI * 2;
      var sp = 1.6 + Math.random() * 1.8;
      sprite.userData = { vx: Math.cos(a) * sp, vy: 1 + Math.random() * 2, vz: Math.sin(a) * sp * 0.5, life: 0.55 };
      this.scene.add(sprite);
      this._sparks.push(sprite);
    }
  },

  _updateSparks(dt, move) {
    if (!this._sparks || !this._sparks.length) return;
    for (var i = this._sparks.length - 1; i >= 0; i--) {
      var s = this._sparks[i];
      var u = s.userData;
      u.life -= dt;
      if (u.life <= 0) {
        this.scene.remove(s);
        s.material.dispose();
        this._sparks.splice(i, 1);
        continue;
      }
      u.vy -= 6 * dt;
      s.position.x += u.vx * dt;
      s.position.y += u.vy * dt;
      s.position.z += u.vz * dt + move;
      s.material.opacity = Math.max(0, u.life / 0.55);
    }
  },

  /** Street lights and trees rising over the walls, added once the models are loaded. */
  _ensureSideScenery() {
    if (!useSceneryModels() || !this.trackRefs) return;
    var skinName = this.currentSkin && this.currentSkin.name;
    if (this._sideGroup && this._sideGroup.parent === this.scene && this._sideSkin === skinName) return;
    var side = buildSideScenery(skinName);
    if (!side) return;
    // A new map replaces the previous map's scenery
    if (this._sideGroup) {
      this.scene.remove(this._sideGroup);
      this.trackRefs.scrollers = this.trackRefs.scrollers.filter(function (s) { return s.group !== this._sideGroup; }, this);
    }
    this._sideSkin = skinName;
    this._sideGroup = side.group;
    this.scene.add(side.group);
    this.trackRefs.scrollers.push({ group: side.group, spacing: side.spacing });
  },

  /**
   * A streak lights the world: from 10 in a row the lights and exposure rise a little (and flare for a moment when it
   * is reached), from 20 a little more; a miss lets it fade. Steady for players who prefer reduced motion (no flare).
   */
  _updateTrackGlow(dt) {
    var target = trackGlow(this.streak || 0);
    var g = this._trackGlow || 0;
    // approach the target; a flare above it dies away on its own
    g += (target - g) * Math.min(1, dt * (g > target ? 1.2 : 2.5));
    if (Math.abs(g - target) < 0.002) g = target;
    this._trackGlow = g;
    var shown = storage.get('reducedMotion') ? Math.min(g, target) : g;
    if (this.renderer) {
      if (this._exposureBase === undefined) this._exposureBase = this.renderer.toneMappingExposure;
      this.renderer.toneMappingExposure = this._exposureBase * (1 + 0.14 * shown);
    }
    var lights = this.trackRefs && this.trackRefs.lights;
    if (lights) {
      for (var i = 0; i < lights.length; i++) {
        var l = lights[i];
        if (l.userData.baseI === undefined) l.userData.baseI = l.intensity;
        l.intensity = l.userData.baseI * (1 + 0.22 * shown);
      }
    }
  },

  /**
   * The hidden secret (see secrets.js): partway through a solo run something friendly shows up well outside the lanes
   * and drifts slowly by; a tap on it pays a few coins. At most one a run, never in a competitive (seeded) run.
   */
  _updateSecret(dt, move) {
    var st = this._secret;
    if (!st) st = this._secret = { at: planSecretTime(), mesh: null, done: false };
    if (st.done || this.seededCardOrder || this._state !== 'playing') return;
    if (!st.mesh) {
      var def = this.currentSkin && secretFor(this.currentSkin.name);
      if (!def || this.elapsedTime < st.at || this.transitionActive) return;
      var side = Math.random() < 0.5 ? -1 : 1;
      var mesh = buildSecret(def.kind);
      mesh.userData.baseY = 1.3;
      mesh.userData.side = side;
      mesh.scale.setScalar(1.5);
      mesh.position.set(side * 7.4, 1.3, -62);
      this.scene.add(mesh);
      st.mesh = mesh;
      st.def = def;
      return;
    }
    var m = st.mesh;
    m.position.z += move * 0.45; // it drifts past slowly, so there is time to spot it
    m.userData.tick(this.elapsedTime);
    if (m.position.z > 11) this._removeSecret(true);
  },

  _removeSecret(done) {
    var st = this._secret;
    if (!st || !st.mesh) return;
    this.scene.remove(st.mesh);
    st.mesh.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material && !o.material.userData.shared) o.material.dispose(); });
    st.mesh = null;
    if (done) st.done = true;
  },

  /**
   * A tap (screen pixels) while a secret is on show: did it land on it? Pays the coins and tells the app.
   * @returns {boolean} true when the secret was found
   */
  tryCollectSecret(clientX, clientY) {
    var st = this._secret;
    if (!st || !st.mesh || !this.camera || !this.renderer) return false;
    var rect = this.renderer.domElement.getBoundingClientRect();
    var v = st.mesh.position.clone();
    v.y += 0.7;
    v.project(this.camera);
    if (v.z > 1) return false;
    var sx = rect.left + (v.x * 0.5 + 0.5) * rect.width;
    var sy = rect.top + (-v.y * 0.5 + 0.5) * rect.height;
    if (!isTapOnSecret(clientX, clientY, sx, sy)) return false;
    var first = !storage.secretFound(this.currentSkin.name);
    var coins = secretReward(first);
    this.coins += coins;
    this.runCoinsCollected += coins;
    storage.markSecretFound(this.currentSkin.name);
    this._spawnSparks(st.mesh.position, 0xfff2a0);
    this._spawnSparks(st.mesh.position, 0xffffff);
    this._emit('coin_collected', { type: 'coin', value: coins });
    this._emit('secret_found', { name: st.def.name, coins: coins, first: first });
    this._removeSecret(true);
    return true;
  },

  _updateVisuals(dt, move, currentSpeed, rushMult) {
    if (!move) move = 0;
    this._updateSecret(dt, move);
    this._updateTrackGlow(dt);
    this._ensureSideScenery();
    animateSideScenery(this._sideGroup, this.elapsedTime, dt);
    this._updateSparks(dt, move);
    if (!currentSpeed) currentSpeed = this.speed;
    if (!rushMult) rushMult = 1;

    if (this.trackRefs) {
      if (this.trackRefs.runningLights) updateRunningLights(this.trackRefs.runningLights, this.elapsedTime, currentSpeed * rushMult);
      if (this.trackRefs.particlePool) updateAtmosphericParticles(this.trackRefs.particlePool, this.trackRefs.particleStates, dt, move, this.elapsedTime);
      if (this.trackRefs.scrollers) updateScrollers(this.trackRefs.scrollers, move);
      if (this.trackRefs.scrollLines) updateScrollLines(this.trackRefs.scrollLines, dt, move);
      if (this.trackRefs.wallScrollPanels) updateWallScrollPanels(this.trackRefs.wallScrollPanels, dt, move);
      if (this.trackRefs.wallMarkers) updateWallMarkers(this.trackRefs.wallMarkers, dt, move);
      if (this.trackRefs.skyboxElements) updateSkyboxElements(this.trackRefs.skyboxElements, dt, move, this.elapsedTime);
      // trains, balloons, fish and the like in a bright world (they stand still for players who prefer reduced motion)
      if (this.trackRefs.animators && this.trackRefs.animators.length && !storage.get('reducedMotion')) updateAnimators(this.trackRefs.animators, this.elapsedTime, dt, move);
    }

    // Speed lines
    var speedRatio = this.speed / this.baseSpeed;
    if (speedRatio > 1.3 || this.rushing) {
      this.speedLineTimer -= dt;
      if (this.speedLineTimer <= 0) {
        var lineLen = 2 + Math.random() * 4;
        var lineOpacity = 0.15 + (speedRatio - 1) * 0.1;
        if (this.rushing) lineOpacity = 0.3 + this.rushStacks * 0.1;
        var lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: Math.min(lineOpacity, 0.6) });
        var speedLine = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, lineLen), lineMat);
        speedLine.position.set((Math.random() - 0.5) * 12, Math.random() * 6, -30 - Math.random() * 20);
        this.scene.add(speedLine);
        this.speedLines.push(speedLine);
        this.speedLineTimer = this.rushing ? 0.02 / Math.max(this.rushStacks, 1) : 0.1 / Math.max(speedRatio, 1);
      }
    }
    for (var sli = this.speedLines.length - 1; sli >= 0; sli--) {
      var sl = this.speedLines[sli];
      sl.position.z += (move || 0) * 2.5;
      sl.material.opacity -= dt * 0.5;
      if (sl.position.z > 10 || sl.material.opacity <= 0) {
        sl.geometry.dispose();
        sl.material.dispose();
        this.scene.remove(sl);
        this.speedLines.splice(sli, 1);
      }
    }
  },

  _spawnGateParticles(position, color, count) {
    var scene = this.scene;
    for (var i = 0; i < count; i++) {
      var particle = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 4, 4),
        new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.8 })
      );
      particle.position.set(position.x, position.y, position.z);
      var pAngle = (i / count) * Math.PI * 2;
      var pSpeed = 2 + Math.random() * 2;
      var vx = Math.cos(pAngle) * pSpeed;
      var vy = 1 + Math.random() * 2;
      var vz = Math.sin(pAngle) * pSpeed;
      scene.add(particle);

      (function (p, velX, velY, velZ, sc) {
        var startTime = Date.now();
        function animateParticle() {
          var elapsed = (Date.now() - startTime) / 1000;
          if (elapsed > 0.4) {
            sc.remove(p);
            p.geometry.dispose();
            p.material.dispose();
            return;
          }
          p.position.x += velX * 0.016;
          p.position.y += velY * 0.016;
          p.position.z += velZ * 0.016;
          velY -= 6 * 0.016;
          p.material.opacity = (1 - elapsed / 0.4) * 0.8;
          var s = (1 - elapsed / 0.4) * 0.8 + 0.2;
          p.scale.set(s, s, s);
          requestAnimationFrame(animateParticle);
        }
        animateParticle();
      })(particle, vx, vy, vz, scene);
    }
  },

  _updateMapTransition(dt) {
    if (!this.transitionActive) return;

    this.transitionTimer += dt;
    this.transitionProgress = Math.min(this.transitionTimer / this.transitionDuration, 1.0);

    var oldBg = new THREE.Color(this.transitionOldSkin.colors.bg);
    var newBg = new THREE.Color(this.transitionNewSkin.colors.bg);
    var blendedBg = oldBg.clone().lerp(newBg, this.transitionProgress);
    this.scene.background = blendedBg;
    if (this.scene.fog) this.scene.fog.color.copy(blendedBg);

    // The doorway to the next map comes running toward us, and we run through it
    var gateway = this._mapGateway;
    if (gateway) {
      gateway.position.z = -80 + this.transitionProgress * 86;
      gateway.rotation.z = Math.sin(this.transitionTimer * 1.5) * 0.02;
      var glow = 0.8 + 0.2 * Math.sin(this.transitionTimer * 6);
      gateway.userData.mats.forEach(function (m) { m.opacity = glow; });
    }
    var flash = typeof document !== 'undefined' ? document.getElementById('mapFlash') : null;
    if (flash) {
      flash.style.background = this._mapGatewayColor || '#ffffff';
      if (this.transitionProgress >= 0.9) flash.classList.add('on');
    }

    if (this.transitionProgress >= 1.0) {
      this._removeMapGateway();
      if (flash) flash.classList.remove('on'); // (it fades out over the first moments of the new map)
      this.transitionActive = false;
      this.currentSkin = this.transitionNewSkin;
      this.transitionOldSkin = null;
      this.transitionNewSkin = null;

      this._cleanupTrack();
      this.trackRefs = buildTrack(this.scene, this.currentSkin, { quality: getQuality() === 'low' ? 'low' : 'medium', ambientParticles: !!storage.get('ambientParticles') });
      setSceneryDensity(this.trackRefs, DENSITY_LEVELS[this._densityIndex || 0]);

      if (this.playerGroup && !this.scene.children.includes(this.playerGroup)) this.scene.add(this.playerGroup);
      if (this.playerShadow && !this.scene.children.includes(this.playerShadow)) this.scene.add(this.playerShadow);
      if (this.examMonster && !this.scene.children.includes(this.examMonster)) this.scene.add(this.examMonster);
      this._readdPowerupFX();
      this._readdTrailSystem();

      this._emit('skin_transition_completed', { skinName: this.currentSkin.name });
    }
  },

  /** A glowing doorway in the next map's colours, built ahead of the runner. */
  _buildMapGateway(skin) {
    this._removeMapGateway();
    var hex = skin.colors.archGlow || skin.colors.wallGlow || 0xffffff;
    var group = new THREE.Group();
    var mats = [];
    function mat() {
      var m = new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.8, fog: false });
      mats.push(m);
      return m;
    }
    var ring = new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.8, 10, 40, Math.PI), mat());
    ring.position.set(0, 0, 0);
    group.add(ring);
    [-5.2, 5.2].forEach(function (x) {
      var pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 5.2, 10), mat());
      pillar.position.set(x, -2.6, 0);
      group.add(pillar);
    });
    var veil = new THREE.Mesh(new THREE.PlaneGeometry(10.4, 5.2), new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.3, side: THREE.DoubleSide, fog: false, depthWrite: false }));
    veil.position.set(0, -0.0, 0);
    group.add(veil);
    group.position.set(0, 2.6, -80);
    group.userData.mats = mats;
    this.scene.add(group);
    this._mapGateway = group;
    this._mapGatewayColor = '#' + ('000000' + hex.toString(16)).slice(-6);
  },

  _removeMapGateway() {
    var g = this._mapGateway;
    if (!g) return;
    this.scene.remove(g);
    g.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    this._mapGateway = null;
  },

  _transitionSkin(newSkin) {
    this._buildMapGateway(newSkin);
    this.transitionActive = true;
    this.transitionTimer = 0;
    this.transitionOldSkin = this.currentSkin;
    this.transitionNewSkin = newSkin;
    this.transitionProgress = 0;

    this._emit('skin_transition_started', { skinName: newSkin.name });
  },

  _readdPowerupFX() {
    if (!this.powerupFX || !this.powerupFX.effects) return;
    for (var key in this.powerupFX.effects) {
      var effect = this.powerupFX.effects[key];
      if (effect && effect.group && !this.scene.children.includes(effect.group)) {
        this.scene.add(effect.group);
      }
    }
    if (this.powerupFX.rushGhosts) {
      for (var i = 0; i < this.powerupFX.rushGhosts.length; i++) {
        var ghost = this.powerupFX.rushGhosts[i];
        if (ghost.mesh && !this.scene.children.includes(ghost.mesh)) {
          this.scene.add(ghost.mesh);
        }
      }
    }
  },

  _readdTrailSystem() {
    if (!this.trailSystem || !this.trailSystem.pool) return;
    for (var i = 0; i < this.trailSystem.pool.length; i++) {
      var p = this.trailSystem.pool[i];
      if (p.mesh && !this.scene.children.includes(p.mesh)) {
        this.scene.add(p.mesh);
      }
    }
  },
};
