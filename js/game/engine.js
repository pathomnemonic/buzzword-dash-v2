/**
 * engine.js — Core game-session engine (Agent 1)
 *
 * Architecture-compliant replacement per ARCHITECTURE.md [2].
 *
 * KEY CHANGES FROM PRIOR VERSION:
 * - game.start(options) object signature replaces positional game.start(mode)
 * - Full lifecycle state machine: idle → preparing → countdown → playing → paused → dying → continue_prompt → finishing → ended → disposed
 * - game.setEventSink(handler) replaces individual callback properties
 * - Engine emits semantic events only — no direct audio, storage writes, or UI manipulation
 * - trackRoot group pattern for all environment geometry
 * - Canonical immutable run summary emitted via run_ended event
 * - main.js owns the render loop; engine exposes update(dt, now) and render()
 * - No renderer.setAnimationLoop() inside engine
 * - orderedCardIds is never mutated (no shift())
 * - Multiplayer terminal rules: High Score (timer), Sudden Death (first wrong), Race (target correct)
 * - Lane commitment boundary before gate resolution
 * - Unified damage / fatal-damage / dying state handling
 *
 * OWNERSHIP: Agent 1 — js/game/engine.js
 * This file depends on contracts from Agents 2, 3, 13, 14, 15, 16 that have not yet delivered.
 * Stub/compatibility shims are used where necessary.
 */

import * as THREE from 'three';

// === Imports from other agents (current signatures used as bridge) ===
import { storage } from '../storage.js';
import { getKeyBindings } from '../keybindings.js';
import { getTheme } from './themes.js';
import { getStartSkin, SKINS, isMapUnlocked } from './skins.js';
import { buildTrack, spawnEnvProp, calculateTargetFOV, updateCameraFOV, calculateCameraLean, getStreakVisualIntensity } from './track.js';
import { buildPlayer, getPlayerLimbs, disposeCharacter } from './player.js';
import { setupInput } from './input.js';
import { getDashControl } from '../dashcontrol.js';
import { updateGateHighlights } from './gates.js';
import { spawnObstacle, spawnCoinsForObstacle, preloadStaffModels, spawnCoinBatch, spawnPowerup, enableCoinInstancing, disableCoinInstancing, syncCoinInstances, coinInstanceMeshes, reattachCoinInstances } from './obstacles.js';
import { TrailSystem } from './trails.js';
import { PowerUpFX } from './powerupfx.js';
import { setupEnvironment, softDotTexture } from './materials.js';
import { reportPerformance } from '../errors.js';
import { getQuality, useSceneryModels, maxPixelRatio, lowerTier, createAdaptiveResolution, stepAdaptiveResolution, planAdaptiveStep, DENSITY_LEVELS } from './quality.js';
import { setSceneryDensity } from './mapfx.js';
import { preloadScenery } from './scenery.js';
import { chimeRatio, chainContinues, coinReachable, coinWorth, magnetX, coinGap, fillCoins, COIN_FIRST, coinTouches } from './coinfx.js';
import { getRunRules, normalizeSpeedRamp, speedBonus, POWERUP_OPTIONS, RELAXED_PACE } from '../rules.js';
import { START_STYLES, CAMERA_STYLES, LOOKBACK_STYLE, getStartPose, getIntroCamera } from './cinematics.js';
import { updateModelAnimation } from './charactermodel.js';
import { createPostFX } from './postfx.js';
import { compileSafely } from './safecompile.js';
import { applyKillSwitch } from '../remoteconfig.js';
import { isHospitalHall } from './hospitalhall.js';
import { isWorld } from './worlds.js';
import { fuseWith, FUSIBLE } from './powerupfuse.js';
import { HazardManager, HAZARDS } from './hazards.js';

export { SHOP_ITEMS, QUESTS, AVATARS, ACHIEVEMENTS, CONTINUE_COST } from './shopdata.js';
import { CONTINUE_COST } from './shopdata.js';
import { chooseCommittedLane } from './lanelock.js';
import { GAME_STATES, GAME_MODES, RUN_END_REASONS, LANE_X, ANSWER_LOCK_Z, VISUAL_SPEED, OBSTACLE_GATE_GAP, MONSTER_START_DIST, generateId, removeAndDispose, ALLOWED_TRANSITIONS, buildHeartMesh } from './enginedefs.js';
export { GAME_STATES, GAME_MODES, RUN_END_REASONS } from './enginedefs.js';
import { visualMethods } from './enginevisuals.js';
import { examMonsterMethods } from './engineexam.js';
import { encounterMethods } from './engineencounter.js';
import { runEndMethods } from './enginerunend.js';

// ═══════════════════════════════════════════════════════════════
// GAME CLASS
// ═══════════════════════════════════════════════════════════════

/** Generous timings so obstacles are comfortable to clear: about a second in the air, nearly a second of slide. */
var JUMP_SPEED = 12;
var TUTORIAL_OBSTACLE_DISTANCE = 10; // run units: about five seconds away at the tutorial pace
var JUMP_GRAVITY = 22;
var SLIDE_TIME = 1.1;

class Game {
  constructor() {
    // Three.js core
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.trackRoot = null;

    // Player
    this.playerGroup = null;
    this.limbs = null;
    this.playerShadow = null;

    // Effects (owned outside trackRoot)
    this.trailSystem = null;
    this.powerupFX = null;

    // Skin / track
    this.currentSkin = null;
    this.trackRefs = null;

    // State machine
    this._state = GAME_STATES.IDLE;
    this._eventSink = null;

    // Run identity
    this._runId = null;
    this._startOptions = null;
    this._runStartedAt = 0;

    // Time
    this.elapsedTime = 0;
    this.cameraLeanX = 0;
    this.playerTilt = 0;

    // Gameplay flags (exposed for backward compat with main.js / ui.js)
    this.running = false;
    this.paused = false;
    this.mode = 'endless';
    this.currentLane = 1;
    this.targetLane = 1;
    this.prevLane = 1;

    // Movement
    this.jumping = false;
    this.jumpVel = 0;
    this.playerY = 0;
    this.sliding = false;
    this.slideTimer = 0;
    this.legPhase = 0;

    // Speed
    this.speed = 1.875;
    this.baseSpeed = 1.875;
    this.userSpeed = 1;

    // Scoring
    this.score = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.multiplier = 1;
    this.coins = 0;
    this.encountersDone = 0;
    this.correct = 0;
    this.wrong = 0;
    this.lives = 3;
    this.continued = false;
    this.continuesUsed = 0;

    // Rush
    this.rushing = false;
    this.rushStacks = 0;
    this.maxRushStacks = 3;
    this.rushBonus = 0;
    this.rushInvulnerable = false;
    this.rushPropelTimer = 0;
    this.rushSpeedOverride = 0;
    this.rushesUsed = 0;

    // Encounter state
    this.card = null;
    this.gates = [];
    this.gateMeshes = [];
    this.gateZ = 0;
    this.gatesActive = false;
    this.answerLocked = false;
    this.committedLane = 1;
    this.recentIds = []; this._retryQueue = []; this._retriedIds = {};
    this.runCards = [];

    // Seeded card order support
    this.seededCardOrder = null;
    this._seededCardIndex = 0;

    // Object pools
    this.obstacleMeshes = [];
    this.coinMeshes = [];
    this.envPropMeshes = [];
    this.speedLines = [];

    // Timers
    this.feedbackTimer = 0;
    this.teachTimer = 0;
    this._coinTail = -COIN_FIRST;
    this.powerupSpawnTimer = 0;
    this.envPropSpawnTimer = 0;
    this.speedLineTimer = 0;
    this.waitingForNext = false;
    this.nextEncounterTimer = 0;
    this.shakeTimer = 0;

    // Camera
    this.cameraBasePos = new THREE.Vector3(0, 4.5, 10);
    this.baseFOV = 70;
    this._postfx = null;
    this._fovKick = 0;
    this._slowmo = 0;
    this._flyInT = 0;
    this._flyInStart = 0;
    this._introStyle = 'drop_in';
    this._introCamStyle = 'sweep';
    this._introAnim = 'idle';
    this._introImpactAt = -1;
    this._deathStyle = null;
    this._lastDeathStyle = null;
    this._deathT = 0;
    this._deathImpactAt = -1;
    this._hazards = new HazardManager();
    this.onHazard = null;

    // Animations
    this.celebrateTimer = 0;
    this.mapAnswers = {};    // questions answered per map this run
    this.flourishTimer = 0;  // the hero's spin after 20, 30, 40... in a row
    this._trackGlow = 0;     // how lit the track is for the current streak (0..1.6)
    this.stumbleTimer = 0;
    this.landingTimer = 0;
    this.wasJumping = false;

    // Timing
    this.encounterStartTime = 0;
    this.lastEncounterTime = 0;
    this.fastestDecisionMs = null;

    // Run state
    this.isNewBest = false;
    this._runEnded = false;
    this._runSummary = null;

    // Coin/powerup tracking
    this.runCoinsCollected = 0;
    this.runCoinsMissed = 0; // coins that went past uncollected (for analytics)
    this.runPowerupsCollected = 0;
    this.obstaclesJumped = 0;
    this.obstaclesSlid = 0;

    // Powerups
    this.powerups = { shield: 0, double: 0, magnet: 0, autoPilot: 0, scoreFrenzy: 0, goldRush: 0, jackpot: 0 };
    this.autoPilotGatesLeft = 0;
    this.autoPilotHeld = false; // an Auto-Pilot picked up and waiting for the player to use it

    // Map transition system
    this.encountersUntilTransition = 10;
    this._mapChanges = 0;
    this.transitionActive = false;
    this.transitionTimer = 0;
    this.transitionDuration = 3.0;
    this.transitionOldSkin = null;
    this.transitionNewSkin = null;
    this.transitionProgress = 0;

    // Exam Monster
    this.examMonster = null;
    this.monsterParts = null;
    this.monsterZ = MONSTER_START_DIST;
    this.monsterTargetZ = MONSTER_START_DIST;
    this.monsterVisible = false;
    this.monsterWarningPlayed = false;

    // Heart spawning
    this.heartSpawnCounter = 0;

    // Faceplant / dying
    this.faceplanting = false;
    this.faceplantTimer = 0;

    // Skin name delay
    this._skinNamePending = null;
    this._skinNameDelay = 0;

    // Multiplayer timers
    this._mpTimerRemaining = null;
    this._mpTargetCorrect = null;

    // Mode config
    this._modeConfig = null;
    this._tutorial = false;
    this.tutorialListener = null;

    // Subjects seen tracking
    this._subjectsSeen = new Set();

    // Selection state for variety enforcement
    this._selectionState = {
      recentQuestionTypes: [],
      recentSubjects: []
    };

    // ─── Legacy callback properties (bridge for existing main.js) ───
    // These are maintained for backward compatibility.
    // New code should use setEventSink().
    this.onEncounterStart = null;
    this.onEncounterResolve = null;
    this.onRunEnd = null;
    this.onHudUpdate = null;
    this.onStreakMilestone = null;
    this.onPowerupFused = null;
    this.onSecretFound = null;
    this.onScorePopup = null;
    this.onPowerupCollected = null;
    this.onAchievementUnlocked = null;
    this.onContinuePrompt = null;
    this.onSkinSelected = null;
    this.onMapTransition = null;
    this.onPlayerFaceplant = null;
    this.onMonsterWarning = null;
    this.onSfx = null;
    this.onMonsterCaught = null;
  }

  // ═══════════════════════════════════════════════════════
  // STATE MACHINE
  // ═══════════════════════════════════════════════════════

  getState() { return this._state; }

  _transition(newState) {
    var allowed = ALLOWED_TRANSITIONS[this._state];
    if (!allowed || allowed.indexOf(newState) < 0) {
      console.warn('[Engine] Invalid transition: ' + this._state + ' -> ' + newState);
      return false;
    }
    var oldState = this._state;
    this._state = newState;

    // Update legacy boolean flags for backward compat
    this.running = (newState === GAME_STATES.PLAYING || newState === GAME_STATES.DYING || newState === GAME_STATES.COUNTDOWN);
    this.paused = (newState === GAME_STATES.PAUSED);
    if (typeof document !== 'undefined' && document.body) document.body.classList.toggle('is-dying', newState === GAME_STATES.DYING);

    this._emit('state_changed', { from: oldState, to: newState });
    return true;
  }

  // ═══════════════════════════════════════════════════════
  // EVENT SINK
  // ═══════════════════════════════════════════════════════

  setEventSink(handler) {
    this._eventSink = handler;
  }

  _emit(type, payload) {
    var event = {
      type: type,
      occurredAt: performance.now(),
      runId: this._runId,
      payload: payload || {}
    };

    if (this._eventSink) {
      try { this._eventSink(event); } catch (e) { console.error('[Engine] Event sink error:', e); }
    }

    // Bridge: map to legacy callbacks for backward compat with existing main.js
    // A failing UI/audio callback must never break game logic.
    try {
      this._bridgeLegacyCallback(event);
    } catch (e) {
      console.error('[Engine] Callback error for ' + event.type + ':', e);
    }
  }

  _bridgeLegacyCallback(event) {
    switch (event.type) {
      case 'encounter_started':
        if (this.onEncounterStart) this.onEncounterStart(event.payload.card, event.payload.gates, event.payload);
        break;
      case 'encounter_resolved':
        if (this.onEncounterResolve) this.onEncounterResolve(event.payload.card, event.payload.correct, event.payload.encounterResult && event.payload.encounterResult.choice);
        break;
      case 'run_ended':
        if (this.onRunEnd) this.onRunEnd();
        break;
      case 'score_changed':
        if (this.onHudUpdate) this.onHudUpdate();
        break;
      case 'streak_milestone':
        if (this.onStreakMilestone) this.onStreakMilestone(event.payload.streak, event.payload.multiplier);
        break;
      case 'coin_collected':
        var pl = event.payload;
        if (pl.type === 'coin' && typeof pl.chain === 'number' && this.onCoinCollected) {
          this.onCoinCollected(pl); // a coin off the track: chime, counter bump, a coin flying to the counter
        } else if (this.onScorePopup) {
          if (typeof pl.points === 'number') this.onScorePopup(pl.points);
          else if (pl.type === 'heart') this.onScorePopup('❤️ +1');
          else if (pl.type === 'coin') this.onScorePopup('🪙 +' + (pl.value || 1));
        }
        break;
      case 'secret_found':
        if (this.onSecretFound) this.onSecretFound(event.payload);
        break;
      case 'powerup_fused':
        if (this.onPowerupFused) this.onPowerupFused(event.payload);
        break;
      case 'powerup_collected':
        if (this.onPowerupCollected) this.onPowerupCollected(event.payload.type);
        break;
      case 'continue_requested':
        if (this.onContinuePrompt) this.onContinuePrompt(event.payload.cost);
        break;
      case 'skin_transition_started':
        if (this.onMapTransition) this.onMapTransition(event.payload.skinName);
        break;
      case 'skin_transition_completed':
        if (this.onSkinSelected) this.onSkinSelected(event.payload.skinName);
        break;
      case 'death_started':
        if (this.onPlayerFaceplant) this.onPlayerFaceplant();
        break;
      case 'monster_warning':
        if (this.onMonsterWarning) this.onMonsterWarning();
        break;
      case 'monster_caught':
        if (this.onMonsterCaught) this.onMonsterCaught();
        break;
      case 'hazard_started':
        if (this.onHazard) this.onHazard(event.payload);
        break;
    }
    // Always emit HUD updates on many event types
    if (['score_changed', 'encounter_resolved', 'coin_collected', 'powerup_collected',
         'rush_started', 'damage_taken', 'continue_applied', 'streak_milestone'].indexOf(event.type) >= 0) {
      if (this.onHudUpdate) this.onHudUpdate();
    }
  }

  // ═══════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════

  init(options) {
    options = options || {};
    var container = options.container || document.getElementById('gameContainer');

    this.scene = new THREE.Scene();
    this.currentSkin = getStartSkin();
    this.scene.background = new THREE.Color(this.currentSkin.colors.bg);

    this.camera = new THREE.PerspectiveCamera(this.baseFOV, innerWidth / innerHeight, 0.1, 300);
    this.camera.position.copy(this.cameraBasePos);
    this.camera.lookAt(0, 1, -20);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(innerWidth, innerHeight);
    this._baseRatio = maxPixelRatio(getQuality(), devicePixelRatio);
    this._resScale = 1;
    this._adaptive = createAdaptiveResolution();
    this.renderer.setPixelRatio(this._baseRatio);
    this.renderer.shadowMap.enabled = useSceneryModels();
    setupEnvironment(this.renderer, this.scene);
    preloadScenery().catch(function () { /* the built-in versions are used */ });
    preloadStaffModels();
    container.appendChild(this.renderer.domElement);
    // A quick tap (not a swipe) may land on the hidden secret; everything else about the touch is handled by input.js
    var tapStart = null;
    var tapGame = this;
    this.renderer.domElement.addEventListener('pointerdown', function (e) { tapStart = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    this.renderer.domElement.addEventListener('pointerup', function (e) {
      if (tapStart && performance.now() - tapStart.t < 400 && Math.abs(e.clientX - tapStart.x) < 14 && Math.abs(e.clientY - tapStart.y) < 14) tapGame.tryCollectSecret(e.clientX, e.clientY);
      tapStart = null;
    });

    // Create trackRoot group
    this.trackRoot = new THREE.Group();
    this.trackRoot.name = 'trackRoot';
    this.scene.add(this.trackRoot);

    this.trackRefs = buildTrack(this.scene, this.currentSkin, { quality: getQuality() === 'low' ? 'low' : 'medium', ambientParticles: !!storage.get('ambientParticles') });
    setSceneryDensity(this.trackRefs, DENSITY_LEVELS[this._densityIndex || 0]);
    this._rebuildPlayer();
    this._createPlayerShadow();
    this.trailSystem = new TrailSystem(this.scene);
    this.powerupFX = new PowerUpFX(this.scene);
    var self = this;
    this._inputDispose = setupInput(this.renderer.domElement, {
        moveLeft: function() { if (self.targetLane > 0) { self.targetLane--; self._sfx('lane'); self._tut('action', 'moveLeft'); } },
        moveRight: function() { if (self.targetLane < 2) { self.targetLane++; self._sfx('lane'); self._tut('action', 'moveRight'); } },
        jump: function() { self.jump(); },
        slide: function() { self.slide(); },
        rush: function() { self.addRushStack(); },
        autoPilot: function() { self.useAutoPilot(); },
        pause: function() { if (self._tutorial) self._tut('pause'); else self.togglePause(); }
    }, {
        keyBindings: getKeyBindings,
        enabled: function() { return self._state === GAME_STATES.PLAYING; },
        doubleTap: function() { return getDashControl() === 'double'; }
    });

    // Moving keys are ignored while paused, but Escape must be able to un-pause
    // (The state is noted before the normal key handler runs, so one press never pauses and resumes.)
    var pausedBeforeKey = false;
    window.addEventListener('keydown', function () { pausedBeforeKey = self._state === GAME_STATES.PAUSED; }, true);
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && pausedBeforeKey) self.resume('user');
    });

    // NOTE: No renderer.setAnimationLoop() here.
    // main.js owns the render loop and calls game.update() and game.render().

    window.addEventListener('resize', function () {
      self.resize(innerWidth, innerHeight, devicePixelRatio);
    });
  }

  // ═══════════════════════════════════════════════════════
  // FRAME APIs (called by main.js)
  // ═══════════════════════════════════════════════════════

  update(deltaSeconds, nowMs) {
    if (deltaSeconds > 0.1) deltaSeconds = 0.016;

    // Brief slow motion after a lightning-fast correct answer (solo only, so
    // it can never desync a multiplayer match).
    if (this._slowmo > 0) {
      this._slowmo -= deltaSeconds;
      deltaSeconds *= 0.35;
    }

    var state = this._state;

    if (state === GAME_STATES.PLAYING) {
      this._updatePlaying(deltaSeconds);
    } else if (state === GAME_STATES.DYING) {
      this._updateDying(deltaSeconds);
    } else if (state === GAME_STATES.COUNTDOWN) {
      // Countdown is managed by UI; engine just keeps scene renderable
      this._updateVisuals(deltaSeconds);
      this._updateFlyIn();
      updateModelAnimation(this.playerGroup, deltaSeconds, this._introAnim || 'idle');
    } else if (state === GAME_STATES.PAUSED) {
      // No simulation update during pause
    }
  }

  /** Cinematic camera sweep over the track while the countdown runs. */
  _updateFlyIn() {
    // Wall-clock time, like the 3-2-1 overlay it plays under, so a slow frame rate cannot leave the shot unfinished at GO
    this._flyInT = (performance.now() - this._flyInStart) / 1000;
    var cam = getIntroCamera(this._introCamStyle, this._flyInT, this.cameraBasePos);
    this.camera.position.set(cam.position.x, cam.position.y, cam.position.z);
    this.camera.lookAt(cam.lookAt.x, cam.lookAt.y, cam.lookAt.z);

    this._updateIntroMonster();

    // The runner has an entrance too: a varied start each run
    var start = getStartPose(this._introStyle, this._flyInT);
    this._applyPose(start.pose);
    this._introAnim = start.anim;
    if (start.impact && this._flyInT - this._introImpactAt > 0.25) {
      this._introImpactAt = this._flyInT;
      this._poseImpact(start.impact);
    }
  }

  /** Apply a cinematic pose on top of the runner's start position. */
  _applyPose(pose) {
    var g = this.playerGroup;
    g.position.set(LANE_X[this.currentLane] + pose.x, pose.y, pose.z);
    g.rotation.set(pose.rotX, pose.rotY, pose.rotZ);
    g.scale.set(pose.scale, pose.scale * pose.squash, pose.scale);
  }

  /** Back to the ordinary upright runner. */
  _resetPose() {
    this.playerGroup.position.set(LANE_X[this.currentLane], 0, 0);
    this.playerGroup.rotation.set(0, 0, 0);
    this.playerGroup.scale.set(1, 1, 1);
  }

  /** Ask the UI layer to play a named sound effect. */
  _sfx(name) {
    if (this.onSfx) {
      try { this.onSfx(name); } catch (e) { /* audio must never break the game */ }
    }
  }

  /** Puffs of dust or sparkles at the runner's feet. */
  _poseImpact(kind) {
    this._sfx(kind === 'dust' ? 'impact_dust' : 'sparkle');
    var at = this.playerGroup.position.clone();
    at.y += 0.4;
    this._spawnSparks(at, kind === 'dust' ? 0xd8d0c0 : 0xffffff);
  }

  _getPostFX() {
    if (storage.get('glowEffects') === false || storage.get('reducedMotion') || !useSceneryModels()) return null;
    if (!this._postfx) {
      try {
        var selfFx = this;
        this._postfx = createPostFX(this.renderer, this.scene, this.camera, function () { return selfFx.targetFrameMs; });
      } catch (e) {
        console.warn('[Engine] Post-processing unavailable:', e.message);
        this._postfx = { degraded: true, render: function () {}, setSize: function () {}, dispose: function () {} };
      }
    }
    if (this._postfx.degraded) this._noteSlowSession();
    return this._postfx.degraded ? null : this._postfx;
  }

  /**
   * The frame rate could not keep up. One slow session can be a busy tab; two
   * in a row means "Auto" graphics should start a tier lower next time.
   */
  _noteSlowSession() {
    if (this._perfHinted) return;
    this._perfHinted = true;
    reportPerformance({ tier: getQuality() }); // only sent if the player switched reports on
    if ((storage.get('quality') || 'auto') !== 'auto') return;
    var strikes = (storage.get('perfStrikes') || 0) + 1;
    storage.set('perfStrikes', strikes);
    if (strikes >= 2) {
      storage.set('perfHint', lowerTier(getQuality()));
      storage.set('perfStrikes', 0);
    }
  }

  /** Step the render resolution down when slow and back up when there is headroom. */
  _adaptResolution() {
    var now = performance.now();
    if (this._lastFrameAt) {
      var scale = stepAdaptiveResolution(this._adaptive, now - this._lastFrameAt, now, this.targetFrameMs);
      if (scale !== null) {
        // thin the moving scenery before giving up sharpness, and bring sharpness back before the scenery
        var slower = scale < this._resScale;
        var plan = planAdaptiveStep(slower ? 'slower' : 'faster', this._densityIndex || 0, this._resScale >= 1);
        if (plan.densityIndex !== (this._densityIndex || 0)) {
          this._densityIndex = plan.densityIndex;
          setSceneryDensity(this.trackRefs, DENSITY_LEVELS[this._densityIndex]);
        }
        if (plan.applyResolution) this._setResolutionScale(scale);
        else this._adaptive.level = Math.max(0, this._adaptive.level + (slower ? -1 : 1)); // the resolution did not move, so neither does its level
      }
    }
    this._lastFrameAt = now;
  }

  _setResolutionScale(scale) {
    this._resScale = scale;
    var ratio = this._baseRatio * scale;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(innerWidth, innerHeight);
    if (this._postfx) this._postfx.setSize(innerWidth, innerHeight, ratio);
    if (scale <= 0.6) this._noteSlowSession(); // even the lowest resolution is struggling
  }

  render() {
    if (this.renderer && this.scene && this.camera) {
      if (!this._coinsInstanced) { enableCoinInstancing(this.scene); this._coinsInstanced = true; }
      reattachCoinInstances(this.scene); // a scene sweep must never leave coins undrawn
      syncCoinInstances(this.coinMeshes);
      this._adaptResolution();
      var fx = this._getPostFX();
      if (fx) fx.render();
      else this.renderer.render(this.scene, this.camera);
    }
  }

  resize(width, height, pixelRatio) {
    if (this.camera) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
    if (this.renderer) {
      this.renderer.setSize(width, height);
      if (pixelRatio) this.renderer.setPixelRatio(Math.min(pixelRatio, this._baseRatio) * this._resScale);
      if (this._postfx) this._postfx.setSize(width, height, Math.min(pixelRatio || 1, this._baseRatio) * this._resScale);
    }
  }

  // ═══════════════════════════════════════════════════════
  // game.start(options) — Section 6.2
  // ═══════════════════════════════════════════════════════

  start(optionsOrMode) {
    // Bridge: support both old positional and new object signature
    var options;
    if (typeof optionsOrMode === 'string') {
      // Legacy: game.start('endless')
      options = { mode: optionsOrMode };
    } else {
      options = optionsOrMode || {};
    }

    this._startOptions = options;
    this._runId = options.runId || generateId();
    this.mode = options.mode || GAME_MODES.ENDLESS;

    this._modeConfig = options.modeConfig || {};
    // The how-to-play runs in the real game: no random coins, power-ups, obstacles or monster, and the
    // tutorial decides when an obstacle or a question arrives (see tutorialObstacle / tutorialEncounter)
    this._tutorial = !!this._modeConfig.tutorial;
    if (this._modeConfig.allowContinue === undefined) {
      this._modeConfig.allowContinue = (this.mode !== GAME_MODES.MP_SUDDEN_DEATH &&
                                         this.mode !== GAME_MODES.MP_HIGH_SCORE &&
                                         this.mode !== GAME_MODES.MP_RACE &&
                                         this.mode !== GAME_MODES.CHALLENGE &&
                                         this.mode !== GAME_MODES.TOURNAMENT);
    }
    if (this._modeConfig.continueCost === undefined) {
      this._modeConfig.continueCost = CONTINUE_COST;
    }
    if (this._modeConfig.dailyEncounterCount === undefined) {
      this._modeConfig.dailyEncounterCount = 15;
    }

    // Seeded card order (multiplayer)
    if (options.orderedCardIds && Array.isArray(options.orderedCardIds)) {
      // Clone to avoid mutation
      this.seededCardOrder = options.orderedCardIds.slice();
    } else {
      this.seededCardOrder = null;
    }
    this._seededCardIndex = 0;

    // Speed
    // Ranked matches pass league rules (fewer power-ups, a faster track in the top leagues)
    this._leagueRules = options.leagueRules || null;
    this.userSpeed = (options.userSpeed || storage.get('userSpeed') || 1) *
      ((this._leagueRules && this._leagueRules.speedMultiplier) || 1);

    // Transition to preparing
    if (!this._transition(GAME_STATES.PREPARING)) return;

    // Reset all run state
    this._resetRunState();

    // Build environment
    this._cleanupObjects();
    this._cleanupTrack();
    if (this.powerupFX) this.powerupFX.hideAll();

    this.currentSkin = getStartSkin(); // runs open indoors; the first map change goes outdoors
    this._mapChanges = 0;
    // A favorite map (Settings) stays for the whole run; it is only cosmetic
    this._mapPinned = false;
    // A map handed in (a shared multiplayer map) is only used when it is one of the free maps: nobody is shown a map
    // they have not bought just because another player picked it
    var sharedMap = options.skinId && SKINS.some(function (k) { return (k.id === options.skinId || k.name === options.skinId) && isMapUnlocked(k, function () { return false; }); }) ? options.skinId : '';
    var wantedMap = sharedMap || storage.get('preferredMap');
    if (wantedMap) {
      for (var si = 0; si < SKINS.length; si++) {
        // A map the player has not bought is never chosen as a favorite (a shared multiplayer map always is)
        if ((SKINS[si].name === wantedMap || SKINS[si].id === wantedMap) && (sharedMap || isMapUnlocked(SKINS[si], function (id) { return storage.ownsItem(id); }))) {
          this.currentSkin = SKINS[si];
          this._mapPinned = !sharedMap;
          break;
        }
      }
    }

    this.trackRefs = buildTrack(this.scene, this.currentSkin, { quality: getQuality() === 'low' ? 'low' : 'medium', ambientParticles: !!storage.get('ambientParticles') });
    setSceneryDensity(this.trackRefs, DENSITY_LEVELS[this._densityIndex || 0]);

    this.camera.position.copy(this.cameraBasePos);
    this.camera.fov = this.baseFOV;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(0, 1, -20);

    this._rebuildPlayer();
    this._createPlayerShadow();
    this._readdPowerupFX();
    this._readdTrailSystem();
    this._createExamMonster();

    this._skinNamePending = this.currentSkin.name;
    this._skinNameDelay = 4.0;
  }

  // Called by main.js after countdown UI starts
  beginCountdown() {
    // Compile the shaders for everything now on screen, off the main thread when supported
    // (compileSafely, not renderer.compileAsync: that one throws from a timer when the scene is disposed while it waits)
    compileSafely(this.renderer, this.scene, this.camera);
    this._flyInT = 0;
    this._flyInStart = performance.now();
    this._introImpactAt = -1;
    var reduced = !!storage.get('reducedMotion');
    this._introStyle = reduced ? 'warp_in' : START_STYLES[Math.floor(Math.random() * START_STYLES.length)];
    // With the exam monster on, the run opens with a look-back shot (the monster is behind you); otherwise a random sweep
    var monsterOn = !!this.examMonster && this._monsterEnabled();
    this._introCamStyle = reduced ? 'sweep' : (monsterOn ? LOOKBACK_STYLE : CAMERA_STYLES[Math.floor(Math.random() * CAMERA_STYLES.length)]);
    this._transition(GAME_STATES.COUNTDOWN);
    this._emit('countdown_started', {});
  }

  // Called by main.js when countdown finishes
  go() {
    if (!this._transition(GAME_STATES.PLAYING)) return;

    // Camera distance is cosmetic (Settings -> Camera)
    var view = storage.get('cameraView');
    if (view === 'close') this.cameraBasePos.set(0, 3.7, 8);
    else if (view === 'far') this.cameraBasePos.set(0, 5.4, 12);
    else this.cameraBasePos.set(0, 4.5, 10);

    // Personal rule changes (single-player only) make this a custom run
    this._rules = getRunRules(this.mode, {
      disabledPowerups: storage.get('disabledPowerups'),
      hazardsOff: storage.get('hazardsOff'),
      monsterOff: storage.get('monsterOff'),
      relaxedPace: storage.get('relaxedPace'),
      speedRamp: storage.get('speedRamp')
    });
    if (this._leagueRules && Array.isArray(this._leagueRules.disabledPowerups)) {
      this._rules.disabledPowerups = this._leagueRules.disabledPowerups.slice();
    }
    // The remote kill switch (remoteconfig.js) can turn a mechanic off for everyone without an update
    var kill = applyKillSwitch(this._rules, POWERUP_OPTIONS.map(function (p) { return p.id; }));
    if (kill.mapsPinned) this._mapPinned = true;
    this._rushOff = kill.rushOff;
    this._resetPose();
    this._hideIntroMonster();
    this._introAnim = 'run';
    this._runStartedAt = performance.now();
    this._pausedTotalMs = 0;
    this._pausedAt = 0;
    this._emit('run_started', { skinName: this.currentSkin.name });

    // Emit skin name for UI
    if (this.onSkinSelected) this.onSkinSelected(this.currentSkin.name);

    // Multiplayer timer init
    if (this.mode === GAME_MODES.MP_HIGH_SCORE && this._modeConfig.timeLimitSeconds) {
      this._mpTimerRemaining = this._modeConfig.timeLimitSeconds;
    }
    if (this.mode === GAME_MODES.MP_RACE && this._modeConfig.targetCorrect) {
      this._mpTargetCorrect = this._modeConfig.targetCorrect;
    }

    if (!this._tutorial) this._spawnEncounter();
    this._tut('go');
  }

  // ═══════════════════════════════════════════════════════
  // RESET
  // ═══════════════════════════════════════════════════════

  _resetRunState() {
    this.currentLane = 1; this.targetLane = 1; this.prevLane = 1;
    this.jumping = false; this.sliding = false; this._slideBlend = 0; this._slideOnLand = false;
    this.playerY = 0; this.jumpVel = 0; this.legPhase = 0;
    this.elapsedTime = 0; this.cameraLeanX = 0; this.playerTilt = 0;

    // 1x is a calm 1.875 units/s; higher settings scale linearly from there.
    var mapped = 1.875 * this.userSpeed * (this._rules && this._rules.relaxed ? RELAXED_PACE : 1);
    // (the tutorial runs at the normal 1x pace whatever the speed setting)
    this.speed = this._tutorial ? 1.875 : (this.mode === GAME_MODES.STUDY ? 1.5 : mapped);
    this.baseSpeed = this.speed;

    this._lastSpeedBonus = 0;
    // Nothing from the last run's ending may carry into this one
    this._slowmo = 0; this._fovKick = 0;
    this._deathStyle = null; this._deathCause = null; this._deathT = 0; this._monsterDeathFromZ = undefined;
    if (this._monsterBehavior) { this._monsterBehavior.fade = 0; this._monsterBehavior.calm = 99; this._monsterBehavior.lunge = 0; this._monsterBehavior.recoil = 0; }
    this.score = 0; this.streak = 0; this.bestStreak = 0;
    this.multiplier = 1; this.coins = 0;
    this.encountersDone = 0; this.correct = 0; this.wrong = 0;
    this.lives = this.mode === GAME_MODES.STUDY ? 99 : (this._modeConfig.lives || 3);
    this.continued = false; this.continuesUsed = 0;

    this.rushing = false; this.rushStacks = 0; this.rushBonus = 0;
    this.rushInvulnerable = false; this.rushPropelTimer = 0;
    this.rushSpeedOverride = 0; this.rushesUsed = 0;

    this.card = null; this.gatesActive = false;
    this.answerLocked = false; this.committedLane = 1;
    this.waitingForNext = false; this.nextEncounterTimer = 0;
    this._coinTail = -COIN_FIRST; this.powerupSpawnTimer = 8;
    this._coinChain = 0; this._coinChainT = -99;
    this.envPropSpawnTimer = 0.5; this.speedLineTimer = 0;
    this.shakeTimer = 0;

    this.runCards = []; this.recentIds = []; this._retryQueue = []; this._retriedIds = {};
    this._hazards.reset();
    this._setHazardClass(null);
    this.feedbackTimer = 0; this.teachTimer = 0;
    this.powerups = { shield: 0, double: 0, magnet: 0, autoPilot: 0, scoreFrenzy: 0, goldRush: 0, jackpot: 0 };
    this._lastPowerup = null; this.fortress = false;
    this.autoPilotGatesLeft = 0;
    this.autoPilotHeld = false; // an Auto-Pilot picked up and waiting for the player to use it

    this.celebrateTimer = 0; this.flourishTimer = 0; this._trackGlow = 0; this.mapAnswers = {}; this._removeSecret(false); this._secret = null; this.stumbleTimer = 0;
    this.landingTimer = 0; this.wasJumping = false;
    this.encounterStartTime = 0; this.lastEncounterTime = 0;
    this.fastestDecisionMs = null;
    this.isNewBest = false; this._runEnded = false; this._runSummary = null;
    this.runCoinsCollected = 0; this.runPowerupsCollected = 0; this.runCoinsMissed = 0;
    this.obstaclesJumped = 0; this.obstaclesSlid = 0;

    this.encountersUntilTransition = 10;
    this.transitionActive = false; this.transitionTimer = 0;
    if (this._removeMapGateway) this._removeMapGateway();
    var mapFlash = typeof document !== 'undefined' ? document.getElementById('mapFlash') : null;
    if (mapFlash) mapFlash.classList.remove('on');

    this.monsterZ = MONSTER_START_DIST; this.monsterTargetZ = MONSTER_START_DIST; this._monsterY = undefined;
    this.monsterVisible = false; this.monsterWarningPlayed = false;
    this.heartSpawnCounter = 0;
    this.faceplanting = false; this.faceplantTimer = 0;

    this._skinNamePending = null; this._skinNameDelay = 0;
    this._mpTimerRemaining = null; this._mpTargetCorrect = null;
    this._subjectsSeen = new Set();
    this._selectionState = { recentQuestionTypes: [], recentSubjects: [] };
    this._seededCardIndex = 0;

    if (this.playerGroup) {
      this.playerGroup.scale.set(1, 1, 1);
      this.playerGroup.position.set(0, 0, 0);
      this.playerGroup.rotation.set(0, 0, 0);
    }
  }

  // ═══════════════════════════════════════════════════════
  // PAUSE / RESUME
  // ═══════════════════════════════════════════════════════

  /** Show or hide the pause screen. Whoever pauses or resumes, the screen follows. */
  _showPauseOverlay(show) {
    if (typeof document === 'undefined') return;
    var overlay = document.getElementById('pauseOverlay');
    if (overlay) overlay.classList.toggle('active', !!show);
  }

  pause(reason) {
    if (this._state === GAME_STATES.PLAYING) {
      this._pausedAt = performance.now();
      this._transition(GAME_STATES.PAUSED);
      this._showPauseOverlay(true);
      this._sfx('pause');
    }
  }

  resume(reason) {
    if (this._state === GAME_STATES.PAUSED) {
      // Time spent paused is not play time: it must not count towards the run's length or the time to answer
      if (this._pausedAt) {
        var away = performance.now() - this._pausedAt;
        this._pausedTotalMs = (this._pausedTotalMs || 0) + away;
        if (this.encounterStartTime) this.encounterStartTime += away;
        this._pausedAt = 0;
      }
      this._transition(GAME_STATES.PLAYING);
      this._sfx('resume');
    }
    // Always clear the screen, even if the state already moved on
    this._showPauseOverlay(false);
  }

  togglePause() {
    if (this._state === GAME_STATES.PLAYING) {
      this.pause('user');
    } else if (this._state === GAME_STATES.PAUSED) {
      this.resume('user');
    }
  }

  // ═══════════════════════════════════════════════════════
  // PLAYER ACTIONS
  // ═══════════════════════════════════════════════════════

  jump() {
    if (this.sliding) { this.sliding = false; this._slideOnLand = false; } // a jump cancels a slide
    if (!this.jumping) {
      this.jumping = true;
      this.jumpVel = JUMP_SPEED;
      this._emit('obstacle_dodged', { type: 'jump' });
      this._tut('action', 'jump');
    }
  }

  slide() {
    if (this.jumping) {
      // Sliding in the air drops you fast and starts the slide on landing
      this.jumpVel = Math.min(this.jumpVel, -18);
      this._slideOnLand = true;
      return;
    }
    if (!this.sliding) {
      this.sliding = true;
      this.slideTimer = 0;
      this._emit('obstacle_dodged', { type: 'slide' });
      this._tut('action', 'slide');
    }
  }

  addRushStack() {
    if (!this.gatesActive || this.answerLocked || this._rushOff) return;
    if (this.rushStacks < this.maxRushStacks) {
      this.rushStacks++;
      this._fovKick = Math.max(this._fovKick, 7);
      this.rushing = true;
      this.rushInvulnerable = true;
      this.rushesUsed++;

      var distToGate = Math.abs(this.gateZ) / VISUAL_SPEED; // in run units
      this.rushPropelTimer = 0.5;
      var neededSpeed = distToGate / 0.5;
      this.rushSpeedOverride = neededSpeed / Math.max(this.speed, 0.01);

      var distanceBonus = Math.max(0, (-this.gateZ / VISUAL_SPEED - 10)) / 50;
      this.rushBonus = Math.floor(distanceBonus * 40 * this.rushStacks);

      this._emit('rush_started', { stacks: this.rushStacks, bonus: this.rushBonus });
      this._tut('action', 'rush');

      document.getElementById('rushEl').textContent = '\u26A1 RUSH \u00D7' + this.rushStacks + ' \u26A1';
      document.getElementById('rushEl').classList.add('show');
    }
  }

  // ═══════════════════════════════════════════════════════
  // CONTINUE
  // ═══════════════════════════════════════════════════════



  // ═══════════════════════════════════════════════════════
  // REQUEST END / END RUN
  // ═══════════════════════════════════════════════════════

  requestEnd(reason) {
    this._endRun(reason || RUN_END_REASONS.MANUAL_END);
  }

  endRun() {
    this._endRun(RUN_END_REASONS.MANUAL_END);
  }



  // ═══════════════════════════════════════════════════════
  // DISPOSE
  // ═══════════════════════════════════════════════════════

  dispose() {
    this._transition(GAME_STATES.DISPOSED);
    this._cleanupObjects();
    this._cleanupTrack();
    if (this.trailSystem) { this.trailSystem.dispose(); this.trailSystem = null; }
    if (this.powerupFX) { this.powerupFX.dispose(); this.powerupFX = null; }
    disableCoinInstancing();
    this._coinsInstanced = false;
    if (this.renderer) { this.renderer.dispose(); }
  }

  // ═══════════════════════════════════════════════════════
  // NIGHT MODE (legacy bridge)
  // ═══════════════════════════════════════════════════════

  updateNightMode() {
    var theme = getTheme(storage.get('selectedSubjects'));
    this.scene.background.set(theme.bg);
  }

  // ═══════════════════════════════════════════════════════
  // PLAYER BUILD
  // ═══════════════════════════════════════════════════════

  _rebuildPlayer() {
    if (this.playerGroup) {
      this.scene.remove(this.playerGroup);
      disposeCharacter(this.playerGroup);
    }
    this.playerGroup = buildPlayer();
    this.limbs = getPlayerLimbs(this.playerGroup);
    this.scene.add(this.playerGroup);
  }

  rebuildPlayer() { this._rebuildPlayer(); }
  buildPlayer() { this._rebuildPlayer(); }

  _createPlayerShadow() {
    if (this.playerShadow) {
      this.scene.remove(this.playerShadow);
      this.playerShadow.geometry.dispose();
      this.playerShadow.material.dispose();
    }
    this.playerShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5),
      // Soft blob shadow instead of a hard-edged disc
      new THREE.MeshBasicMaterial({ color: 0x000000, map: softDotTexture(), transparent: true, opacity: 0.45, depthWrite: false })
    );
    this.playerShadow.rotation.x = -Math.PI / 2;
    this.playerShadow.position.set(0, 0.02, 0);
    this.scene.add(this.playerShadow);
  }



  // ═══════════════════════════════════════════════════════
  // TRACK MANAGEMENT
  // ═══════════════════════════════════════════════════════

  _cleanupObjects() {
    var i;
    for (i = 0; i < this.gateMeshes.length; i++) removeAndDispose(this.scene, this.gateMeshes[i]);
    this.gateMeshes = [];
    for (i = 0; i < this.obstacleMeshes.length; i++) removeAndDispose(this.scene, this.obstacleMeshes[i]);
    this.obstacleMeshes = [];
    for (i = 0; i < this.coinMeshes.length; i++) removeAndDispose(this.scene, this.coinMeshes[i]);
    this.coinMeshes = [];
    for (i = 0; i < this.envPropMeshes.length; i++) removeAndDispose(this.scene, this.envPropMeshes[i]);
    this.envPropMeshes = [];
    for (i = 0; i < this.speedLines.length; i++) {
      this.speedLines[i].geometry.dispose();
      this.speedLines[i].material.dispose();
      this.scene.remove(this.speedLines[i]);
    }
    this.speedLines = [];
    this._removeSecret(false);
  }

  _cleanupTrack() {
    var toRemove = [];
    var self = this;

    var protectedSet = new Set();
    protectedSet.add(self.camera);
    protectedSet.add(self.playerShadow);
    protectedSet.add(self.playerGroup);
    if (self.examMonster) protectedSet.add(self.examMonster);
    // The meshes that draw every coin in bulk are not scenery
    coinInstanceMeshes().forEach(function (m) { protectedSet.add(m); });

    // Live gameplay objects must survive a map change: the scene is swept for
    // old environment pieces, but obstacles/gates/coins/pickups/props still
    // have collision or scoring state. Removing only their meshes leaves
    // invisible obstacles that still cost a life.
    [self.gateMeshes, self.obstacleMeshes, self.coinMeshes, self.envPropMeshes, self.speedLines].forEach(function (list) {
      if (list) list.forEach(function (m) { if (m) protectedSet.add(m); });
    });

    if (self.powerupFX && self.powerupFX.effects) {
      for (var key in self.powerupFX.effects) {
        var effect = self.powerupFX.effects[key];
        if (effect && effect.group) protectedSet.add(effect.group);
      }
      if (self.powerupFX.rushGhosts) {
        for (var gi = 0; gi < self.powerupFX.rushGhosts.length; gi++) {
          if (self.powerupFX.rushGhosts[gi].mesh) protectedSet.add(self.powerupFX.rushGhosts[gi].mesh);
        }
      }
    }

    if (self.trailSystem && self.trailSystem.pool) {
      for (var ti = 0; ti < self.trailSystem.pool.length; ti++) {
        if (self.trailSystem.pool[ti].mesh) protectedSet.add(self.trailSystem.pool[ti].mesh);
      }
    }

    this.scene.traverse(function (child) {
      if (protectedSet.has(child)) return;
      var parent = child.parent;
      while (parent) {
        if (protectedSet.has(parent)) return;
        parent = parent.parent;
      }
      if (child.isMesh || child.isGroup || child.isLine) toRemove.push(child);
      if (child.isLight && child.userData.skinLight) toRemove.push(child);
    });

    for (var i = 0; i < toRemove.length; i++) {
      if (toRemove[i].parent === this.scene) removeAndDispose(this.scene, toRemove[i]);
    }
    this.trackRefs = null;
  }



  // ═══════════════════════════════════════════════════════
  // MAP TRANSITION
  // ═══════════════════════════════════════════════════════



  // ═══════════════════════════════════════════════════════
  // ENCOUNTER SPAWNING
  // ═══════════════════════════════════════════════════════



  // ═══════════════════════════════════════════════════════
  // ENCOUNTER RESOLUTION
  // ═══════════════════════════════════════════════════════


  // ═══════════════════════════════════════════════════════
  // DEATH / DYING STATE
  // ═══════════════════════════════════════════════════════



  // ═══════════════════════════════════════════════════════
  // MAIN UPDATE (PLAYING state)
  // ═══════════════════════════════════════════════════════

  /** Show/hide the CSS treatment for the active map hazard. */
  _setHazardClass(type) {
    if (typeof document === 'undefined') return;
    var cl = document.body.classList;
    Object.keys(HAZARDS).forEach(function (k) { cl.remove('hazard-' + k); });
    if (type) cl.add('hazard-' + type);
    this._hazardClass = type;
  }

  _applyHazard(fx) {
    if (fx.type && this._hazardClass !== fx.type) this._setHazardClass(fx.type);
    if (fx.ended) this._setHazardClass(null);
    if (fx.shake) this._triggerShake();
    if (fx.fovKick) this._fovKick = Math.max(this._fovKick, fx.fovKick);
  }

  _updatePlaying(dt) {
    this.elapsedTime += dt;
    var hazardFx = this._hazards.update(dt);
    if (hazardFx.type || hazardFx.ended) this._applyHazard(hazardFx);
    var currentSpeed = this.speed * hazardFx.speedMult;
    var rushMult = 1.0 + this.rushStacks;

    // Rush propulsion
    if (this.rushPropelTimer > 0) {
      this.rushPropelTimer -= dt;
      if (this.rushSpeedOverride > 0) {
        rushMult = this.rushSpeedOverride;
      } else {
        rushMult = 3.0;
      }
      if (this.rushPropelTimer <= 0) {
        this.rushInvulnerable = false;
        this.rushSpeedOverride = 0;
      }
    }

    var move = currentSpeed * rushMult * dt;

    // Multiplayer timer
    if (this.mode === GAME_MODES.MP_HIGH_SCORE && this._mpTimerRemaining !== null) {
      this._mpTimerRemaining -= dt;
      if (this._mpTimerRemaining <= 0) {
        this._mpTimerRemaining = 0;
        this._endRun(RUN_END_REASONS.TIMER_EXPIRED);
        return;
      }
    }

    // Delayed skin name
    if (this._skinNamePending && this._skinNameDelay > 0) {
      this._skinNameDelay -= dt;
      if (this._skinNameDelay <= 0) {
        if (this.onSkinSelected) this.onSkinSelected(this._skinNamePending);
        this._skinNamePending = null;
      }
    }

    // Map transition
    this._updateMapTransition(dt);

    // Exam monster
    this._updateExamMonster(dt);

    // Auto-pilot
    if (this.autoPilotGatesLeft > 0 && this.gatesActive) {
      for (var ap = 0; ap < this.gates.length; ap++) {
        if (this.gates[ap].correct) { this.targetLane = ap; break; }
      }
    }

    // PLAYER MOVEMENT
    var targetX = LANE_X[this.targetLane];
    var dx = targetX - this.playerGroup.position.x;
    var snapSpeed = Math.min(1, 12 * dt);
    var absDx = Math.abs(dx);
    if (absDx > 0.01) {
      var easeMultiplier = absDx > 1.5 ? 1.5 : (absDx < 0.3 ? 0.5 : 1.0);
      this.playerGroup.position.x += dx * snapSpeed * easeMultiplier;
    } else {
      this.playerGroup.position.x = targetX;
    }
    this.currentLane = this.targetLane;

    // Body tilt
    var tiltTarget = 0;
    if (this.targetLane !== this.prevLane) {
      tiltTarget = (this.targetLane - this.prevLane) * -0.15;
    }
    this.playerTilt += (tiltTarget - this.playerTilt) * Math.min(1, 8 * dt);
    if (Math.abs(this.playerTilt) < 0.005) {
      this.playerTilt = 0;
      this.prevLane = this.targetLane;
    }
    this.playerGroup.rotation.z = this.playerTilt;

    // Jump
    if (this.jumping) {
      this.playerY += this.jumpVel * dt;
      var gravity = JUMP_GRAVITY;
      if (Math.abs(this.jumpVel) < 3) gravity = JUMP_GRAVITY * 0.6; // floaty at the top
      this.jumpVel -= gravity * dt;
      if (this.playerY <= 0) {
        this.playerY = 0;
        this.jumping = false;
        this.jumpVel = 0;
        if (this.wasJumping) this.landingTimer = 0.1;
        if (this._slideOnLand) { this._slideOnLand = false; this.slide(); }
      }
    }
    this.wasJumping = this.jumping;
    this.playerGroup.position.y = this.playerY;

    // Stretch upward while rising, ease back as the jump peaks (the landing
    // squash below takes over on touchdown).
    if (this.jumping && !this.sliding) {
      this.playerGroup.scale.y = 1 + Math.max(0, Math.min(this.jumpVel, 12)) / 12 * 0.08;
    }

    // Slide (duck): lean into it and sink a little, easing in and out. The body is
    // never squashed flat, which looked like a pancake on 3D characters.
    if (this.sliding) {
      this.slideTimer += dt;
      if (this.slideTimer >= SLIDE_TIME) this.sliding = false;
    }
    this._slideBlend = this._slideBlend || 0;
    this._slideBlend += ((this.sliding ? 1 : 0) - this._slideBlend) * Math.min(1, dt * 14);
    if (this._slideBlend < 0.01 && !this.sliding) this._slideBlend = 0;
    var sb = this._slideBlend;
    if (sb > 0) {
      var animator = this.playerGroup.userData.animator;
      if (animator) {
        // Animated models roll or duck with their own clip. Without one the runner crouches: head and hands
        // forward, lower to the ground, and keeps running in that pose (never flattened)
        var hasClip = animator.hasClip('slide');
        this.playerGroup.scale.set(1, 1 - (hasClip ? 0.04 : 0.08) * sb, 1);
        this.playerGroup.position.y = this.playerY - (hasClip ? 0.05 : 0.38) * sb;
        this.playerGroup.rotation.x = hasClip ? 0 : -0.5 * sb;
      } else {
        // Blocky characters crouch and lean back a touch, like a feet-first slide
        this.playerGroup.scale.set(1 + 0.04 * sb, 1 - 0.2 * sb, 1 + 0.04 * sb);
        this.playerGroup.position.y = this.playerY - 0.3 * sb;
        this.playerGroup.rotation.x = 0.25 * sb;
      }
    } else if (this.playerGroup.rotation.x !== 0 && this.stumbleTimer <= 0 && this.mode !== undefined && this._state === GAME_STATES.PLAYING) {
      this.playerGroup.rotation.x = 0;
      this.playerGroup.scale.set(1, 1, 1);
    }

    // Landing squash
    if (this.landingTimer > 0 && !this.sliding) {
      this.landingTimer -= dt;
      this.playerGroup.scale.y = 0.85;
      if (this.landingTimer <= 0) this.playerGroup.scale.y = 1.0;
    }

    // Stumble animation
    if (this.stumbleTimer > 0) {
      this.stumbleTimer -= dt;
      var stumbleProgress = this.stumbleTimer / 0.3;
      this.playerGroup.rotation.x = stumbleProgress * 0.15;
      if (this.stumbleTimer <= 0) this.playerGroup.rotation.x = 0;
    }

    // Flourish: a full spin with both arms up (kept off for players who prefer reduced motion)
    if (this.flourishTimer > 0) {
      this.flourishTimer -= dt;
      var fp = Math.max(0, this.flourishTimer) / 1.2;
      this.playerGroup.rotation.y = storage.get('reducedMotion') ? 0 : (1 - fp) * Math.PI * 2;
      if (this.limbs) {
        if (this.limbs.rightArm) this.limbs.rightArm.rotation.x = 2.6;
        if (this.limbs.leftArm) this.limbs.leftArm.rotation.x = 2.6;
      }
      if (this.flourishTimer <= 0) this.playerGroup.rotation.y = 0;
    }

    // Celebration
    if (this.celebrateTimer > 0) {
      this.celebrateTimer -= dt;
      if (this.limbs && this.limbs.rightArm) {
        var celebProgress = this.celebrateTimer / 0.3;
        var pumpAngle = celebProgress > 0.5
          ? 2.2 * ((1.0 - celebProgress) / 0.5)
          : 2.2 * (celebProgress / 0.5);
        this.limbs.rightArm.rotation.x = pumpAngle;
      }
      if (this.celebrateTimer <= 0 && this.limbs && this.limbs.rightArm) {
        this.limbs.rightArm.rotation.x = 0;
      }
    }

    // Limb animation. Characters face -Z, so a positive rotation.x swings a
    // hanging limb forward. Every pose is eased toward its target so limbs
    // never freeze mid-swing or pop when jumping, sliding and running switch.
    if (this.limbs && this.celebrateTimer <= 0 && this.flourishTimer <= 0) {
      var lm = this.limbs;
      var tLL = 0, tRL = 0, tLA = 0, tRA = 0;
      if (this.jumping) {
        // Tuck: arms forward-up, lead knee raised
        tLL = 0.9; tRL = -0.25; tLA = 1.9; tRA = 1.9;
      } else if (this.sliding) {
        // Crouch: legs forward, arms out front for balance
        tLL = 1.1; tRL = 1.0; tLA = 0.9; tRA = 0.9;
      } else {
        this.legPhase += currentSpeed * rushMult * VISUAL_SPEED * dt * 0.8;
        var sw = Math.sin(this.legPhase) * 0.45;
        tLL = sw; tRL = -sw; tLA = -sw * 0.9; tRA = sw * 0.9;
        this.playerGroup.position.y = this.playerY + Math.abs(Math.sin(this.legPhase)) * 0.06 - 0.3 * (this._slideBlend || 0);
        if (lm.cape) {
          lm.cape.rotation.x = 0.15 + Math.sin(this.legPhase * 1.5) * 0.1;
        }
      }
      var ease = Math.min(1, dt * 22);
      if (lm.leftLeg) lm.leftLeg.rotation.x += (tLL - lm.leftLeg.rotation.x) * ease;
      if (lm.rightLeg) lm.rightLeg.rotation.x += (tRL - lm.rightLeg.rotation.x) * ease;
      if (lm.leftArm) lm.leftArm.rotation.x += (tLA - lm.leftArm.rotation.x) * ease;
      if (lm.rightArm) lm.rightArm.rotation.x += (tRA - lm.rightArm.rotation.x) * ease;
    }

    // Animated glTF avatars are driven by their own clips.
    if (this.playerGroup.userData.animator) {
      var modelState = this.celebrateTimer > 0 || this.flourishTimer > 0 ? 'celebrate' : this.jumping ? 'jump' : this.sliding ? 'slide' : 'run';
      // The run cycle plays faster with the look of the run (cadence follows speed, up to a cap)
      var cadence = modelState === 'run' ? Math.min(3, 1.3 * Math.pow(Math.max(0.5, currentSpeed * rushMult / 1.875), 0.7)) : 1;
      updateModelAnimation(this.playerGroup, dt * cadence, modelState);
    }

    // Shadow
    if (this.playerShadow) {
      this.playerShadow.position.x = this.playerGroup.position.x;
      this.playerShadow.position.z = this.playerGroup.position.z;
      var shadowScale = Math.max(0.3, 1.0 - this.playerY * 0.15);
      this.playerShadow.scale.set(shadowScale, shadowScale, shadowScale);
      this.playerShadow.material.opacity = 0.2 * shadowScale;
    }

    // Trail system
    if (this.trailSystem) {
      this.trailSystem.update(dt, this.playerGroup.position.x, this.playerGroup.position.y, this.playerGroup.position.z, this.streak);
    }

    // Power-up VFX
    if (this.powerupFX) {
      this.powerupFX.update(dt, {
        x: this.playerGroup.position.x,
        y: this.playerGroup.position.y,
        z: this.playerGroup.position.z
      }, this.powerups, this.rushStacks);
    }

    // Camera shake
    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt;
      var intensity = this.shakeTimer * 3;
      this.camera.position.x = this.cameraBasePos.x + (Math.random() - 0.5) * intensity;
      this.camera.position.y = this.cameraBasePos.y + (Math.random() - 0.5) * intensity * 0.5;
    } else {
      this.cameraLeanX = calculateCameraLean(this.cameraLeanX, this.targetLane, dt, this.cameraBasePos.x);
      this.camera.position.x = this.cameraLeanX;
      this.camera.position.y = this.cameraBasePos.y;
    }

    // FOV
    var streakVis = getStreakVisualIntensity(this.streak);
    var targetFOV = calculateTargetFOV(this.baseSpeed, currentSpeed * rushMult, this.baseFOV, this.baseFOV + 15 + streakVis.fovBoost, this.rushing);
    updateCameraFOV(this.camera, targetFOV + this._fovKick, dt, 2.0);
    this._fovKick *= Math.max(0, 1 - dt * 5);

    // ─── Lane commitment (Section 8.3) ───
    if (this.gatesActive && !this.answerLocked && this.gateZ >= ANSWER_LOCK_Z * VISUAL_SPEED) {
      // The gates are close: no more dashing. The lane that counts is settled when the gate is crossed (see lanelock.js)
      var bestLane = chooseCommittedLane({ targetLane: this.targetLane, playerX: this.playerGroup.position.x, laneX: LANE_X });
      this.committedLane = bestLane;
      this.answerLocked = true;
      this._emit('answer_locked', { lane: bestLane });
    }

    // Gates movement
    if (this.gatesActive) {
      this.gateZ += move * VISUAL_SPEED;
      for (var gi = 0; gi < this.gateMeshes.length; gi++) {
        this.gateMeshes[gi].position.z = this.gateZ;
        var approachProgress = 1.0 - Math.max(0, -this.gateZ) / Math.abs(this._gateSpawnZ || -60);
        var gateScale = 1.0 + approachProgress * 0.08;
        this.gateMeshes[gi].scale.set(gateScale, gateScale, gateScale);
        var frame = this.gateMeshes[gi].children[0];
        if (gi === this.currentLane) {
          frame.material.opacity = 0.6 + approachProgress * 0.3;
        } else {
          frame.material.opacity = 0.4 - approachProgress * 0.15;
        }
      }
      updateGateHighlights(this.gateMeshes, this.currentLane);
      if (this.gateZ >= 0) this._resolveEncounter();
    }

    // Next encounter timer
    if (this.waitingForNext) {
      this.nextEncounterTimer -= dt;
      if (this.nextEncounterTimer <= 0) {
        this.waitingForNext = false;
        this._transitionToNextEncounter();
      }
    }

    // Coin spawning: batches are laid end to end out to the horizon, so there is nearly always a coin in some lane
    if (!this._tutorial) {
      this._coinTail += move; // (the farthest coin laid out so far moves toward the runner like everything else)
      var coinPowerUp = this.powerups.scoreFrenzy > 0 || this.powerups.goldRush > 0 || this.powerups.jackpot > 0;
      var self2 = this;
      this._coinTail = fillCoins(this._coinTail,
        function (z) { return spawnCoinBatch(self2.scene, self2.coinMeshes, z); },
        function () { return coinGap(Math.random(), coinPowerUp); });
    }

    // Power-up spawning
    this.powerupSpawnTimer -= dt;
    if (this.powerupSpawnTimer <= 0 && !this._tutorial) {
      // (no second Auto-Pilot while one is in hand or working)
      var noSpawn = (this._rules && this._rules.disabledPowerups) || [];
      if (this.autoPilotHeld || this.autoPilotGatesLeft > 0) noSpawn = noSpawn.concat(['autoPilot']);
      spawnPowerup(this.scene, this.coinMeshes, undefined, noSpawn);
      this.powerupSpawnTimer = 15 + Math.random() * 10;
    }

    // Environment props
    this.envPropSpawnTimer -= dt;
    if (this.envPropSpawnTimer <= 0) {
      // (nothing floats inside the hospital corridor: it has a ceiling)
      if (!isHospitalHall(this.currentSkin) && !isWorld(this.currentSkin)) spawnEnvProp(this.scene, this.envPropMeshes, storage.get('selectedSubjects'));
      this.envPropSpawnTimer = 1.5 + Math.random() * 2;
    }
    for (var ei = this.envPropMeshes.length - 1; ei >= 0; ei--) {
      var ep = this.envPropMeshes[ei];
      var epu = ep.userData;
      ep.position.z += move * VISUAL_SPEED * (epu.speed || 0.7);
      ep.rotation.y += dt * (epu.spin || 0.3);
      if (epu.baseY !== undefined) ep.position.y = epu.baseY + Math.sin(this.elapsedTime * 0.6 + epu.phase) * epu.bob;
      if (ep.position.z > 10) {
        removeAndDispose(this.scene, ep);
        this.envPropMeshes.splice(ei, 1);
      }
    }

    // Track visuals
    this._updateVisuals(dt, move * VISUAL_SPEED, currentSpeed * VISUAL_SPEED, rushMult);

    // Obstacles
    for (var oi = this.obstacleMeshes.length - 1; oi >= 0; oi--) {
      var ob = this.obstacleMeshes[oi];
      ob.position.z += move * VISUAL_SPEED;
      if (ob.userData.staff) updateModelAnimation(ob.userData.staff, dt, 'run');
      var od = ob.userData;
      // The runner stands at z = 0. From the moment the obstacle is within about a stride and a half of the runner
      // until its middle reaches them, any moment spent jumping (clear of the ground) or sliding counts as clearing
      // it, so a jump or slide timed a little early or a little late still works. Only an obstacle that arrives
      // without one of those having happened hurts.
      if (!od.checked && od.lane === this.currentLane && ob.position.z > -1.5 && !od.cleared) {
        if ((od.type === 'high' && (this.sliding || this._slideBlend > 0.4)) || (od.type === 'low' && this.jumping && this.playerY > 0.3)) od.cleared = true;
      }
      if (!od.checked && ob.position.z > 0.15) {
        od.checked = true;
        if (od.lane === this.currentLane) {
          var dodged = !!od.cleared;
          if (dodged) {
            if (od.type === 'low') this.obstaclesJumped++;
            else this.obstaclesSlid++;
          }
          if (!dodged && !this.rushInvulnerable) {
            if (this.powerups.shield > 0) {
              this.powerups.shield = 0;
              this._emit('shield_broken', {});
              if (this.powerupFX) this.powerupFX.shatterShield(this.playerGroup.position);
            } else {
              this.lives--;
              this._emit('damage_taken', { source: 'obstacle', livesRemaining: this.lives });
              this._monsterSlip();
              this._triggerShake();
              this.stumbleTimer = 0.3;
              if (this.lives <= 0 && this.mode !== GAME_MODES.STUDY) {
                var canCont = this._modeConfig.allowContinue && !this.continued && storage.get('coins') >= (this._modeConfig.continueCost || CONTINUE_COST);
                if (canCont) {
                  this._triggerDeath(od.type === 'high' ? 'overhead' : 'ground');
                } else {
                  this._endRun(RUN_END_REASONS.OUT_OF_LIVES);
                }
              }
            }
          }
        }
      }
      // It leaves once it is well behind the runner
      if (ob.position.z > 2.5 * VISUAL_SPEED) {
        removeAndDispose(this.scene, ob);
        this.obstacleMeshes.splice(oi, 1);
      }
    }

    // Coins, power-ups, hearts
    for (var ci = this.coinMeshes.length - 1; ci >= 0; ci--) {
      var c = this.coinMeshes[ci];
      c.position.z += move * VISUAL_SPEED;

      if (c.userData.type === 'coin') {
        c.rotation.y += dt * 3;
      } else if (c.userData.type === 'powerup') {
        c.rotation.y += dt * 2;
        // a flat icon (shield, magnet, wheel) turns back to face the camera and only sways, so it always reads
        if (c.userData.flatIcon && c.userData.icon) c.userData.icon.rotation.y = -c.rotation.y + Math.sin(this.elapsedTime * 2.2) * 0.3;
        c.position.y = 1.5 + Math.sin(this.elapsedTime * 3 + ci) * 0.3;
      } else if (c.userData.type === 'heart') {
        c.rotation.y += dt * 2;
        var heartPulse = 1.0 + Math.sin(this.elapsedTime * 4) * 0.15;
        c.scale.set(heartPulse, heartPulse, heartPulse);
        c.position.y = 1.5 + Math.sin(this.elapsedTime * 2 + ci) * 0.2;
      }

      if (c.position.z > 3 * VISUAL_SPEED) {
        if (c.userData.type === 'coin') this.runCoinsMissed++;
        removeAndDispose(this.scene, c);
        this.coinMeshes.splice(ci, 1);
        continue;
      }

      // The magnet reaches well ahead and curves coins in, quicker as they get close
      if (this.powerups.magnet > 0 && c.userData.type === 'coin' && !c.userData.collected && c.position.z > -9 * VISUAL_SPEED && c.position.z < 2 * VISUAL_SPEED) {
        c.position.x = magnetX(c.position.x, this.playerGroup.position.x, c.position.z, dt);
      }

      // A coin is taken where the runner actually is, in the moment it passes: not in the lane they have asked for,
      // not over a long stretch. So flicking between lanes cannot scoop up coins from both. (Power-ups and hearts are
      // more forgiving, as they always were.)
      if (c.userData.type === 'coin') {
        if (!c.userData.collected && c.position.z > -3 && c.position.z < 3) {
          var magnetOn = this.powerups.magnet > 0;
          var touched = coinTouches(c.position.x - this.playerGroup.position.x, c.position.z);
          if (touched && (magnetOn || coinReachable(c.position.y, this.playerY, c.userData.air))) {
            c.userData.collected = true;
            this._pickUpCoin(c);
            removeAndDispose(this.scene, c);
            this.coinMeshes.splice(ci, 1);
          }
        }
      } else if (c.position.z > -3 * VISUAL_SPEED && c.position.z < 2 * VISUAL_SPEED && !c.userData.collected) {
        var inLane = c.userData.lane === this.currentLane;
        var closeEnough = Math.abs(LANE_X[this.currentLane] - c.position.x) < 1.8;

        if (inLane || closeEnough || this.powerups.magnet > 0) {
          c.userData.collected = true;

          if (c.userData.type === 'powerup') {
            this._collectPowerup(c.userData.powerupType);
          } else if (c.userData.type === 'heart') {
            var maxLives = this.mode === GAME_MODES.STUDY ? 99 : (this._modeConfig.lives || 3);
            if (this.lives < maxLives) this.lives++;
            this._emit('coin_collected', { type: 'heart' });
          }
          removeAndDispose(this.scene, c);
          this.coinMeshes.splice(ci, 1);
        }
      }
    }

    // Power-up timers
    var timedPowerups = ['double', 'magnet', 'scoreFrenzy', 'goldRush', 'jackpot'];
    for (var pk = 0; pk < timedPowerups.length; pk++) {
      var pkey = timedPowerups[pk];
      if (this.powerups[pkey] > 0) this.powerups[pkey] -= dt;
    }

    // Feedback timers
    if (this.feedbackTimer > 0) this.feedbackTimer -= dt;
    if (this.teachTimer > 0) this.teachTimer -= dt;

    // Speed progression
    if (this.mode !== GAME_MODES.STUDY) {
      // Every N questions the run gets a little faster (set in Settings; 0.5 every 20 by default)
      var ramp = (this._rules && this._rules.speedRamp) || normalizeSpeedRamp(null);
      var bonus = speedBonus(ramp, this.encountersDone);
      this.speed = Math.min(1.875 * 10, this.baseSpeed + bonus * 1.875);
      if (bonus !== this._lastSpeedBonus) {
        if (bonus > 0 && this.onSpeedUp) this.onSpeedUp(+(this.speed / 1.875).toFixed(2));
        this._lastSpeedBonus = bonus;
      }
    }

    // HUD update
    if (this.onHudUpdate) this.onHudUpdate();
  }

  // ═══════════════════════════════════════════════════════
  // VISUAL-ONLY UPDATE (countdown, etc.)
  // ═══════════════════════════════════════════════════════





  // ═══════════════════════════════════════════════════════
  // EXAM MONSTER
  // ═══════════════════════════════════════════════════════


  // ═══════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════

  _spawnHeartPickup() {
    var lane = Math.floor(Math.random() * 3);
    var heartGroup = buildHeartMesh();
    heartGroup.position.set(LANE_X[lane], 1.5, (-45 - Math.random() * 15) * VISUAL_SPEED);
    heartGroup.userData = { lane: lane, collected: false, type: 'heart' };
    this.scene.add(heartGroup);
    this.coinMeshes.push(heartGroup);
  }

  /** A coin off the track: counts it, keeps the chain going (the chime climbs), and tells the screen where it was. */
  _pickUpCoin(c) {
    var air = !!c.userData.air && this.playerY > 0.4; // taken in the air, mid-jump: worth double
    var coinValue = coinWorth({ airJump: air, frenzy: this.powerups.scoreFrenzy > 0, goldRush: this.powerups.goldRush > 0 });
    this.coins += coinValue;
    this.runCoinsCollected += coinValue;
    this._coinChain = chainContinues(this.elapsedTime - this._coinChainT) ? this._coinChain + 1 : 0;
    this._coinChainT = this.elapsedTime;
    this._spawnSparks(c.position, air ? 0xffffff : 0xffd54a);
    // where on the screen it was, so a coin can fly to the counter from there
    if (!this._coinScreen) this._coinScreen = new THREE.Vector3();
    this._coinScreen.copy(c.position).project(this.camera);
    this._emit('coin_collected', {
      type: 'coin', value: coinValue, lane: c.userData.lane, chain: this._coinChain, ratio: chimeRatio(this._coinChain), air: air,
      sx: (this._coinScreen.x * 0.5 + 0.5) * innerWidth, sy: (-this._coinScreen.y * 0.5 + 0.5) * innerHeight
    });
  }

  _collectPowerup(type) {
    if (this._rules && this._rules.disabledPowerups.indexOf(type) >= 0) return;
    switch (type) {
      case 'shield': this.powerups.shield = 999; break;
      case 'magnet': this.powerups.magnet = 10; break;
      case 'double': this.powerups.double = 15; break;
      case 'autoPilot':
        // Picked up, not used: it waits in hand until the player taps its button on a question they do not know.
        // Only one at a time.
        if (this.autoPilotHeld || this.autoPilotGatesLeft > 0) return;
        this.autoPilotHeld = true;
        break;
      case 'scoreFrenzy': this.powerups.scoreFrenzy = 8; break;
    }
    this.runPowerupsCollected++;
    this._emit('powerup_collected', { type: type });
    // two different power-ups close together fuse (never in a seeded, competitive run)
    var now = this.elapsedTime || 0;
    var fusion = this.seededCardOrder ? null : fuseWith(this._lastPowerup, type, now);
    if (fusion) {
      Object.keys(fusion.timers).forEach(function (k) { this.powerups[k] = Math.max(this.powerups[k] || 0, fusion.timers[k]); }, this);
      if (fusion.fortress) this.fortress = true;
      this._lastPowerup = null;
      this._emit('powerup_fused', { id: fusion.id, label: fusion.label, detail: fusion.detail });
    } else {
      this._lastPowerup = FUSIBLE.indexOf(type) >= 0 ? { type: type, at: now } : this._lastPowerup;
    }
  }

  /**
   * Use the Auto-Pilot in hand on the question that is up now: the runner steers to the right gate.
   * @returns {boolean} whether it was used
   */
  useAutoPilot() {
    if (!this.autoPilotHeld || !this.running || this.paused || !this.gatesActive || this.answerLocked) return false;
    this.autoPilotHeld = false;
    this.autoPilotGatesLeft = 1;
    this.powerups.autoPilot = 999;
    for (var ap = 0; ap < this.gates.length; ap++) {
      if (this.gates[ap].correct) { this.targetLane = ap; break; }
    }
    this.addRushStack();
    this._emit('autopilot_used', {});
    return true;
  }

  _triggerShake() { this.shakeTimer = 0.15; }

  _clearGates() {
    for (var m = 0; m < this.gateMeshes.length; m++) removeAndDispose(this.scene, this.gateMeshes[m]);
    this.gateMeshes = [];
  }

  // ═══════════════════════════════════════════════════════
  // TUTORIAL (the how-to-play runs in the real game)
  // ═══════════════════════════════════════════════════════

  /** Tell the tutorial (if one is open) what just happened: a move, an obstacle result, an answer. */
  _tut(type, data) {
    if (this._tutorial && typeof this.tutorialListener === 'function') {
      try { this.tutorialListener(type, data); } catch (e) { console.error('[Tutorial] listener error:', e); }
    }
  }

  /** Send one obstacle down the runner's own lane: 'low' (jump over it) or 'high' (slide under it). */
  tutorialObstacle(kind) {
    if (!this._tutorial) return;
    spawnObstacle(this.scene, this.obstacleMeshes, {
      lane: this.currentLane,
      type: kind === 'high' ? 'slide' : 'jump',
      variantId: kind === 'high' ? 'hanging_sign' : 'gurney',
      spawnOffset: -TUTORIAL_OBSTACLE_DISTANCE
    });
  }

  /** Put one chosen question on the track (the same gates, clue and answer choices as a real run). */
  tutorialEncounter(cardId) {
    if (!this._tutorial) return;
    this._clearGates();
    this.seededCardOrder = [cardId];
    this._seededCardIndex = 0;
    this._spawnEncounter();
  }

  _transitionToNextEncounter() {
    this._clearGates();
    // Obstacles use any lane (so they give nothing away about the answer), but they trail well behind
    // the gate: they only arrive after the answer has been locked in, never right at the gate.
    this._spawnEncounter();
    if (this.mode !== GAME_MODES.STUDY && Math.random() < 0.4) {
      var obstacleZ = (this._gateSpawnZ || -50 * VISUAL_SPEED) - OBSTACLE_GATE_GAP * VISUAL_SPEED;
      var made = spawnObstacle(this.scene, this.obstacleMeshes, null, { spawnZ: obstacleZ });
      // a reward for getting past it: an arc over a jump, a trail under an overhead obstacle
      if (made) spawnCoinsForObstacle(this.scene, this.coinMeshes, made, obstacleZ);
    }
  }

}

// ═══════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════

// Parts of the Game class live in their own files; attached here so `this` is still the Game.
Object.assign(Game.prototype, visualMethods, examMonsterMethods, encounterMethods, runEndMethods);

export var game = new Game();
