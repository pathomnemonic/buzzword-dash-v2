/**
 * engineexam.js — The exam monster: creating, refreshing and per-frame updates.
 *
 * Split out of engine.js. These methods are attached to Game.prototype (see the end of engine.js),
 * so `this` is the Game and nothing about how they are called has changed.
 */

import { storage } from '../storage.js';
import { getMonsterParts, disposeExamMonster } from './exammonster.js';
import { buildMonster } from './monsters.js';
import { createMonsterBehavior, stepMonsterBehavior, monsterOnAnswer, monsterPolicy } from './monsterbehavior.js';
import { updateModelAnimation } from './charactermodel.js';
import { GAME_STATES, GAME_MODES, LANE_X } from './enginedefs.js';
import { LOOKBACK_STYLE, LOOKBACK_HOLD, monsterCatch } from './cinematics.js';

export var examMonsterMethods = {

  _createExamMonster() {
    if (this.examMonster) disposeExamMonster(this.scene, this.examMonster);
    this.examMonster = buildMonster((storage.get('equipped') || {}).monster);
    this.monsterParts = getMonsterParts(this.examMonster);
    this.examMonster.position.set(0, 1.5, this.monsterZ);
    this.examMonster.visible = true;
    this.scene.add(this.examMonster);

    // Behavior state, and every material so the whole monster can fade together.
    this._monsterBehavior = createMonsterBehavior();
    var parts = this.monsterParts || {};
    var selfFading = [];
    if (parts.backRing) selfFading.push(parts.backRing.material);
    if (parts.aura) selfFading.push(parts.aura.material);
    (parts.eyes || []).forEach(function (eye) { if (eye.material) selfFading.push(eye.material); });
    var seen = [];
    this._monsterFade = [];
    var fadeList = this._monsterFade;
    this.examMonster.traverse(function (o) {
      if (!o.material) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
        if (seen.indexOf(m) >= 0) return;
        seen.push(m);
        m.transparent = true;
        fadeList.push({ m: m, base: m.opacity, animated: selfFading.indexOf(m) >= 0 });
      });
    });
  },

  /** A monster model finished downloading: swap the stand-in for it. */
  refreshMonster() {
    if (!this.examMonster || this.examMonster.userData.isModelMonster) return;
    var before = this.examMonster;
    this._createExamMonster();
    if (this.examMonster === before) return;
  },

  /**
   * The look-back opening: while the camera is in front of the runner the monster is seen behind them,
   * then it drops back past the camera and fades out as the camera swings round, so by the time the run
   * starts it is out of the field of view. Every other start keeps the monster hidden.
   */
  _updateIntroMonster() {
    var m = this.examMonster;
    if (!m) return;
    if (this._introCamStyle !== LOOKBACK_STYLE || !this._monsterEnabled()) {
      m.visible = false;
      return;
    }
    var t = this._flyInT;
    var leave = Math.min(1, Math.max(0, (t - LOOKBACK_HOLD) / 1.1)); // 0 while it is being looked at, 1 once it is gone
    var alpha = 1 - Math.min(1, Math.max(0, (leave - 0.5) / 0.5));
    var model = !!m.userData.isModelMonster;
    var ground = model && !m.userData.flying;
    var s = 0.9 * (m.userData.displayScale || 1);
    m.visible = alpha > 0.01;
    m.position.set(0, ground ? 0 : 1.8 + Math.sin(t * 2) * 0.15, 7 + leave * 9);
    m.rotation.set(0, Math.PI, 0); // facing the runner
    m.scale.set(s, s, s);
    if (model) updateModelAnimation(m, 1 / 60, ground ? 'run' : 'idle');
    if (this._monsterFade) {
      for (var i = 0; i < this._monsterFade.length; i++) this._monsterFade[i].m.opacity = this._monsterFade[i].base * alpha;
    }
    this.monsterVisible = false;
  },

  /**
   * Whether the exam monster is part of this run: the player has not turned it off, and the game mode
   * uses one (study and sudden death do not; see MONSTER_POLICY).
   */
  _monsterEnabled() {
    if (this._tutorial) return false;
    var off = this._rules ? this._rules.monsterOff : storage.get('monsterOff');
    return !off && monsterPolicy(this.mode).enabled;
  },

  /** The run is starting: put the monster away; from here on it only shows when the player slips. */
  _hideIntroMonster() {
    if (!this.examMonster) return;
    this.examMonster.visible = false;
    this.monsterVisible = false;
    if (this._monsterBehavior) this._monsterBehavior.fade = 0;
    // (the opening shot leaves it faded out; it must be solid again when it next appears)
    if (this._monsterFade) {
      for (var ri = 0; ri < this._monsterFade.length; ri++) {
        var fr = this._monsterFade[ri];
        if (!fr.animated) fr.m.opacity = fr.base;
      }
    }
  },

  /** The player lost a life to an obstacle: the monster catches up a little, just as it does after a wrong answer. */
  _monsterSlip() {
    if (!this.examMonster || !this._monsterEnabled()) return;
    var policy = monsterPolicy(this.mode);
    if (this._monsterBehavior) monsterOnAnswer(this._monsterBehavior, false);
    this.monsterTargetZ = Math.max(3, Math.min(30, this.monsterTargetZ - policy.miss));
  },

  _updateExamMonster(dt) {
    if (!this.examMonster) return;
    if (!this._monsterEnabled()) {
      // Turned off by the player (a custom run) or not used in this mode: it never appears or catches
      this.examMonster.visible = false;
      return;
    }

    this.monsterZ += (this.monsterTargetZ - this.monsterZ) * dt * 1.2;
    if (this.monsterZ < 3) this.monsterZ = 3;

    // monsterZ is a "distance to catch" (3 = caught, 30 = far away). The camera
    // sits at z=10 looking forward, so anything drawn at monsterZ > 10 would be
    // behind it. The monster is therefore drawn in front of the camera and
    // grows/approaches as the catch distance shrinks.
    var near = Math.min(1, Math.max(0, (30 - this.monsterZ) / 27));
    // Stalk the player across lanes, lunge, and fade as the streak returns.
    var dying = (this._state === GAME_STATES.DYING || this._state === GAME_STATES.CONTINUE_PROMPT) && this._deathCause === 'monster';
    var pose = stepMonsterBehavior(this._monsterBehavior, {
      playerX: this.playerGroup.position.x,
      dist: this.monsterZ,
      streak: this.streak,
      dying: dying,
      time: this.elapsedTime
    }, dt);
    var shouldBeVisible = dying || pose.presence > 0.02;
    if (shouldBeVisible !== this.monsterVisible) {
      this.monsterVisible = shouldBeVisible;
      this.examMonster.visible = shouldBeVisible;
    }
    if (pose.lunged && pose.presence > 0.6) {
      this._emit('monster_warning', {});
      this._sfx('monster_lunge');
    }

    // It hovers above the player's line of sight so it never hides the runner,
    // then swoops down when it makes the catch.
    // 3D-model monsters that walk stalk along the ground behind the runner;
    // flying ones (and the procedural monsters) hover above the line of sight.
    var isModelMonster = !!this.examMonster.userData.isModelMonster;
    var onGround = isModelMonster && !this.examMonster.userData.flying;
    // Flying 3D monsters hover a little lower so they are seen under the question banner
    var targetY = onGround ? pose.hop * 0.6 : (dying ? 1.6 : pose.y - (isModelMonster ? 0.9 : 0));
    this._monsterY = (this._monsterY === undefined ? targetY : this._monsterY);
    this._monsterY += (targetY - this._monsterY) * Math.min(1, dt * 6);
    // When it is the monster that catches the runner, it lunges in, hits them and goes after the runner it knocked away
    var strike = null;
    if (dying && this._deathCause === 'monster') {
      strike = monsterCatch(this._deathT, this._monsterDeathFromZ === undefined ? 3.5 : this._monsterDeathFromZ, !onGround);
      this._monsterY = strike.y;
      this.examMonster.position.set(LANE_X[this.currentLane], strike.y, strike.z);
    } else {
      this.examMonster.position.set(pose.x, this._monsterY, dying ? Math.min(this.monsterZ, 5) : pose.z);
    }
    if (strike) {
      // Leans in for the blow, then rears up
      this.examMonster.rotation.order = 'YXZ';
      this.examMonster.rotation.set(strike.struck ? -0.15 : -0.5, 0, 0);
      if (isModelMonster) updateModelAnimation(this.examMonster, dt, 'attack');
    } else if (isModelMonster) {
      // Lean toward the runner; the clips do the rest of the acting.
      this.examMonster.rotation.order = 'YXZ';
      this.examMonster.rotation.set(pose.rotX * 0.6, pose.rotY * 0.4, pose.rotZ);
      var wanted = dying || pose.lunging ? 'attack' : (onGround ? 'run' : 'idle');
      updateModelAnimation(this.examMonster, dt, wanted);
    } else {
      this.examMonster.rotation.set(pose.rotX, pose.rotY, pose.rotZ);
    }

    if (this.monsterVisible) {
      var distFactor = dying ? 0.3 + 0.7 * near : (0.22 + 0.3 * near) * pose.scale;
      // Keep every design out of the way; larger models are scaled down further.
      distFactor *= (this.examMonster.userData.displayScale || 1);
      if (!dying) distFactor = Math.min(distFactor, 0.6);
      this.examMonster.scale.set(distFactor, distFactor, distFactor);

      // Back-side details: pulsing ring and breathing spine ridge
      if (this.monsterParts && this.monsterParts.backRing) {
        this.monsterParts.backRing.material.opacity = 0.55 + 0.4 * Math.sin(this.elapsedTime * 4);
      }
      if (this.monsterParts && this.monsterParts.ridge) {
        for (var rgi = 0; rgi < this.monsterParts.ridge.length; rgi++) {
          this.monsterParts.ridge[rgi].scale.y = 1 + 0.15 * Math.sin(this.elapsedTime * 3 + rgi * 0.6);
        }
      }

      // Menace grows with proximity: hotter glow, faster ridge pulse.
      var danger = near;
      if (this.monsterParts && this.monsterParts.body && this.monsterParts.body.material.emissiveIntensity !== undefined) {
        this.monsterParts.body.material.emissiveIntensity = 0.3 + danger * 0.9;
      }
      if (this.monsterParts && this.monsterParts.aura) {
        this.monsterParts.aura.material.opacity = 0.15 + danger * 0.25;
      }
    }

    if (this.monsterZ < 8 && !this.monsterWarningPlayed) {
      this.monsterWarningPlayed = true;
      this._emit('monster_warning', {});
    }
    if (this.monsterZ >= 10) this.monsterWarningPlayed = false;

    // Caught: the monster reaches the player. Study mode has no fail state, so
    // it never ends a study session. Rushing makes the player untouchable.
    if (this._state === GAME_STATES.PLAYING && this.mode !== GAME_MODES.STUDY &&
        !this.rushInvulnerable && this.monsterZ <= 3.6) {
      this.lives = 0;
      this._emit('monster_caught', {});
      this._triggerDeath('monster');
      return;
    }

    // Animate monster parts
    if (this.monsterParts && this.monsterVisible) {
      var t = this.elapsedTime;
      if (this.monsterParts.body) {
        var pulse = 1.0 + Math.sin(t * 2) * 0.05;
        this.monsterParts.body.scale.set(pulse, pulse, pulse);
      }
      if (this.monsterParts.eyes) {
        for (var ei = 0; ei < this.monsterParts.eyes.length; ei++) {
          var eye = this.monsterParts.eyes[ei];
          if (eye.material) eye.material.opacity = 0.7 + Math.sin(t * 3 + ei) * 0.3;
        }
      }
      if (this.monsterParts.tentacles) {
        for (var ti = 0; ti < this.monsterParts.tentacles.length; ti++) {
          this.monsterParts.tentacles[ti].rotation.z = Math.sin(t * 1.5 + ti * 0.8) * 0.2;
        }
      }
      if (this.monsterParts.questionMarks) {
        for (var qi = 0; qi < this.monsterParts.questionMarks.length; qi++) {
          var qm = this.monsterParts.questionMarks[qi];
          var angle = t * 1.2 + (qi / this.monsterParts.questionMarks.length) * Math.PI * 2;
          qm.position.x = Math.cos(angle) * 1.5;
          qm.position.z = Math.sin(angle) * 1.5;
          qm.rotation.y += dt * 2;
        }
      }
    }

    // The monster never fades during the run: it drifts in from behind the camera and drifts away again. (The
    // opening shot does fade it out, so every part goes back to the opacity it was built with. Parts that animate
    // their own opacity were just set to an absolute value this frame.)
    if (this.monsterVisible && this._monsterFade) {
      for (var fi = 0; fi < this._monsterFade.length; fi++) {
        var fe = this._monsterFade[fi];
        if (!fe.animated) fe.m.opacity = fe.base;
      }
    }
  },
};
