/**
 * enginerunend.js — Dying, continuing and ending a run.
 *
 * Split out of engine.js. These methods are attached to Game.prototype (see the end of engine.js),
 * so `this` is the Game and nothing about how they are called has changed.
 */

import { storage } from '../storage.js';
import { disposeExamMonster } from './exammonster.js';
import { pickDeathStyle, getDeathPose, DEATH_DURATION } from './cinematics.js';
import { updateModelAnimation } from './charactermodel.js';
import { CONTINUE_COST } from './shopdata.js';
import { GAME_STATES, GAME_MODES, RUN_END_REASONS, LANE_X, generateId } from './enginedefs.js';

export var runEndMethods = {

  /**
   * @param {string} [cause] 'ground' | 'overhead' | 'monster' | 'other' picks a fitting death
   */
  _triggerDeath(cause) {
    this._transition(GAME_STATES.DYING);
    this._deathStyle = storage.get('reducedMotion') ? 'faceplant' : pickDeathStyle(cause || 'other', this._lastDeathStyle);
    this._lastDeathStyle = this._deathStyle;
    if (this._deathStyle !== 'faceplant') this._sfx('death_' + this._deathStyle);
    this._deathT = 0;
    this._deathImpactAt = -1;

    // The monster only dives in when it is the one that caught the runner; after a
    // crash it stays where it was so it does not cover the death.
    this._deathCause = cause || 'other';
    if (this._deathCause === 'monster' && this.examMonster && this.monsterZ < 20) {
      this.monsterTargetZ = 0;
      this.monsterZ = Math.min(this.monsterZ, 10);
      this.examMonster.visible = true;
      // Where it lunges from (it may have been hidden far behind the camera: it swoops in from no farther than this)
      this._monsterDeathFromZ = Math.min(this.examMonster.position.z, 12);
    }

    // Nothing from the run may stay on the runner while the death plays: the magnet and shield rings, the dash
    // ghosts and the trail are put away (their update only runs while playing, so they would otherwise freeze in place)
    this._clearRunEffects();

    this.faceplanting = true;
    this.faceplantTimer = DEATH_DURATION;
    this._emit('death_started', {});
  },

  /** Hide every effect that decorates the runner during a run: power-up rings, dash ghosts, the trail, speed lines. */
  _clearRunEffects() {
    if (this.powerupFX) this.powerupFX.hideAll();
    if (this.trailSystem) this.trailSystem.reset();
    if (this.speedLines) {
      for (var i = 0; i < this.speedLines.length; i++) {
        this.scene.remove(this.speedLines[i]);
        this.speedLines[i].geometry.dispose();
        this.speedLines[i].material.dispose();
      }
      this.speedLines.length = 0;
    }
  },

  _updateDying(dt) {
    this.faceplantTimer -= dt;
    var totalDuration = DEATH_DURATION;
    var fp = totalDuration - this.faceplantTimer;

    // Each death is different; "faceplant" keeps the classic behaviour.
    this._deathT += dt;
    var shake = 0;
    if (this._deathStyle && this._deathStyle !== 'faceplant') {
      var dp = getDeathPose(this._deathStyle, this._deathT);
      this._applyPose(dp.pose);
      shake = dp.camShake;
      if (dp.impact && this._deathT - this._deathImpactAt > 0.2) {
        this._deathImpactAt = this._deathT;
        this._poseImpact(dp.impact);
      }
      if (this.playerGroup.userData.animator) updateModelAnimation(this.playerGroup, dt, dp.useClip ? 'death' : 'idle');
    } else if (this.playerGroup.userData.animator) {
      // Animated models play their own death clip; procedural ones faceplant.
      updateModelAnimation(this.playerGroup, dt, 'death');
    } else if (fp < 0.3) {
      this.playerGroup.rotation.x = (fp / 0.3) * 0.8;
    } else if (fp < 0.6) {
      this.playerGroup.rotation.x = 0.8 + ((fp - 0.3) / 0.3) * 0.5;
      if (this.limbs && this.limbs.leftArm) this.limbs.leftArm.rotation.x = -1.2 * ((fp - 0.3) / 0.3);
      if (this.limbs && this.limbs.rightArm) this.limbs.rightArm.rotation.x = -1.2 * ((fp - 0.3) / 0.3);
    } else if (fp < 1.0) {
      this.playerGroup.rotation.x = Math.PI / 2;
      this.playerGroup.position.y = Math.max(0, this.playerGroup.position.y - dt * 5);
    }

    // Death camera: move in on the runner and drift to a three-quarter view, always
    // keeping the runner in frame so the whole fall can be seen.
    var camProgress = Math.min(fp / totalDuration, 1.0);
    var px = this.playerGroup.position.x;
    var pz = this.playerGroup.position.z;
    this.camera.position.x = px * 0.6 + Math.sin(camProgress * 1.4) * 2.2;
    this.camera.position.y = this.cameraBasePos.y - 1.5 - camProgress * 0.3;
    this.camera.position.z = pz + 8 - camProgress * 1.5;
    if (shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * shake;
      this.camera.position.y += (Math.random() - 0.5) * shake * 0.6;
    }
    this.camera.lookAt(px, 1.1 + this.playerGroup.position.y * 0.4, pz);

    this._updateExamMonster(dt);

    if (this.faceplantTimer <= 0) {
      this.faceplanting = false;

      var canContinue = this._modeConfig.allowContinue &&
                        !this.continued &&
                        storage.get('coins') >= (this._modeConfig.continueCost || CONTINUE_COST);

      if (canContinue) {
        this._transition(GAME_STATES.CONTINUE_PROMPT);
        this._emit('continue_requested', { cost: this._modeConfig.continueCost || CONTINUE_COST });
      } else {
        this._endRun(RUN_END_REASONS.OUT_OF_LIVES);
      }
    }

    if (this.onHudUpdate) this.onHudUpdate();
  },

  continueRun() {
    if (this._state !== GAME_STATES.CONTINUE_PROMPT) return false;

    var cost = this._modeConfig.continueCost || CONTINUE_COST;
    if (storage.spendCoins(cost)) {
      this.lives = 1;
      this.continued = true;
      this.continuesUsed++;

      this.faceplanting = false;
      this.faceplantTimer = 0;
      this.camera.position.copy(this.cameraBasePos);
      this.camera.lookAt(0, 1, -20);
      this._deathStyle = null;
      this.playerGroup.rotation.set(0, 0, 0);
      this.playerGroup.scale.set(1, 1, 1);
      this.playerGroup.position.set(LANE_X[1], 0, 0);
      this.playerY = 0;
      this.currentLane = 1;
      this.targetLane = 1;

      // Back the monster off; it would otherwise still be on top of the player.
      this.monsterTargetZ = 18;
      this.monsterZ = Math.max(this.monsterZ, 16);
      this.monsterWarningPlayed = false;
      this._deathCause = null;
      // ...and put it out of sight behind the camera, so it does not pop in from where it knocked the runner
      if (this._monsterBehavior) { this._monsterBehavior.fade = 0; this._monsterBehavior.calm = 99; this._monsterBehavior.lunge = 0; }

      if (this.limbs) {
        if (this.limbs.leftArm) this.limbs.leftArm.rotation.x = 0;
        if (this.limbs.rightArm) this.limbs.rightArm.rotation.x = 0;
      }

      this._transition(GAME_STATES.PLAYING);
      this._emit('continue_applied', {});
      this._spawnEncounter();
      return true;
    }
    return false;
  },

  // Legacy bridge
  doContinue() {
    return this.continueRun();
  },

  _endRun(reason) {
    if (this._runEnded) return;
    this._runEnded = true;
    this._setHazardClass(null);
    this._tut('ended');

    document.getElementById('pauseOverlay').classList.remove('active');
    document.getElementById('rushEl').classList.remove('show');

    this.faceplanting = false;
    this.camera.position.copy(this.cameraBasePos);
    this.camera.fov = this.baseFOV;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(0, 1, -20);

    if (this.playerGroup) {
      this.playerGroup.rotation.set(0, 0, 0);
      this.playerGroup.scale.set(1, 1, 1);
      this.playerGroup.position.set(0, 0, 0);
    }

    if (this.powerupFX) this.powerupFX.hideAll();

    if (this.examMonster) {
      disposeExamMonster(this.scene, this.examMonster);
      this.examMonster = null;
      this.monsterParts = null;
    }

    // Determine if new best
    this.isNewBest = this.score > storage.get('bestScore');

    // Build canonical run summary (Section 7.1)
    var endedAt = performance.now();
    // A run quit from the pause menu was still paused when it ended
    var pausedMs = (this._pausedTotalMs || 0) + (this._pausedAt ? endedAt - this._pausedAt : 0);
    var durationMs = Math.max(0, endedAt - this._runStartedAt - pausedMs);

    var encounters = [];
    for (var ri = 0; ri < this.runCards.length; ri++) {
      var rc = this.runCards[ri];
      encounters.push({
        eventId: generateId(),
        encounterIndex: ri,
        cardId: rc.card.id,
        subject: rc.card.subj,
        presentedAnswers: rc.presentedAnswers || [null, null, null],
        correctLane: rc.correctLane || 0,
        committedLane: rc.committedLane || 0,
        selectedAnswer: rc.choice,
        correct: rc.ok,
        rushed: rc.rushed || false,
        rushStacks: rc.rushStacks || 0,
        clueShownAt: rc.clueShownAt || 0,
        firstInputAt: rc.firstInputAt || null,
        committedAt: rc.committedAt || 0,
        resolvedAt: rc.resolvedAt || 0,
        decisionMs: rc.decisionMs || null,
        scoreAwarded: rc.scoreAwarded || 0,
        coinsAwarded: rc.coinsAwarded || 0
      });
    }

    var dailyComplete = this.mode === GAME_MODES.DAILY &&
      this.encountersDone >= (this._modeConfig.dailyEncounterCount || 15) &&
      reason === RUN_END_REASONS.DAILY_COMPLETE;

    this._runSummary = Object.freeze({
      runId: this._runId,
      mode: this.mode,
      endReason: reason,
      completed: this.encountersDone > 0,

      startedAt: this._runStartedAt,
      endedAt: endedAt,
      durationMs: durationMs,

      score: this.score,
      coinsEarned: this.coins,
      coinsCollected: this.runCoinsCollected,

      encountersCompleted: this.encountersDone,
      correct: this.correct,
      wrong: this.wrong,
      bestStreak: this.bestStreak,
      fastestDecisionMs: this.fastestDecisionMs,
      userSpeed: this.userSpeed,

      continued: this.continued,
      continuesUsed: this.continuesUsed,

      subjectsSeen: Array.from(this._subjectsSeen),
      rushesUsed: this.rushesUsed,
      powerupsCollected: this.runPowerupsCollected,
      obstaclesJumped: this.obstaclesJumped,
      obstaclesSlid: this.obstaclesSlid,

      dailyCompleted: dailyComplete,

      // Custom rules keep a run off the leaderboards (see rules.js)
      custom: !!(this._rules && this._rules.custom),
      rules: this._rules ? {
        disabledPowerups: this._rules.disabledPowerups.slice(),
        hazardsOff: this._rules.hazardsOff,
        monsterOff: this._rules.monsterOff,
        relaxed: !!this._rules.relaxed,
        speedRamp: this._rules.speedRamp
      } : null,

      encounters: encounters,

      multiplayer: {
        matchId: (this._startOptions && this._startOptions.matchId) || null,
        result: 'none',
        opponentId: null,
        raceTimeMs: null,
        eliminated: reason === RUN_END_REASONS.SUDDEN_DEATH_ELIMINATION,
        forfeit: reason === RUN_END_REASONS.LOCAL_FORFEIT
      }
    });

    this._transition(GAME_STATES.ENDED);
    this._cleanupObjects();

    // Emit run_ended with canonical summary (fires exactly once)
    this._emit('run_ended', this._runSummary);
  },

  getRunSummary() {
    return this._runSummary;
  },
};
