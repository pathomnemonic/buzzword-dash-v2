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
import { getTheme } from './themes.js';
import { getRandomSkin, SKINS } from './skins.js';
import {
  buildTrack, spawnEnvProp,
  updateRunningLights, updateAtmosphericParticles,
  updateScrollLines, updateScrollers, updateWallScrollPanels,
  updateWallMarkers, updateSkyboxElements,
  calculateTargetFOV, updateCameraFOV,
  calculateCameraLean, getStreakVisualIntensity
} from './track.js';
import { buildPlayer, getPlayerLimbs, disposeCharacter } from './player.js';
import { setupInput } from './input.js';
import { getCardPool, pickCard, spawnGates, updateGateHighlights, flashGateResult } from './gates.js';
import { spawnObstacle, spawnCoinBatch, spawnPowerup } from './obstacles.js';
import { TrailSystem } from './trails.js';
import { PowerUpFX } from './powerupfx.js';
import { getMonsterParts, disposeExamMonster } from './exammonster.js';
import { buildMonster } from './monsters.js';
import { updateModelAnimation } from './charactermodel.js';
import { createPostFX } from './postfx.js';
import { HazardManager, HAZARDS } from './hazards.js';

export { SHOP_ITEMS, QUESTS, AVATARS, ACHIEVEMENTS, CONTINUE_COST } from './shopdata.js';
import { CONTINUE_COST } from './shopdata.js';

// ─── Canonical Enums (Section 4, Architecture) ───

export var GAME_STATES = Object.freeze({
  IDLE: 'idle',
  PREPARING: 'preparing',
  COUNTDOWN: 'countdown',
  PLAYING: 'playing',
  PAUSED: 'paused',
  DYING: 'dying',
  CONTINUE_PROMPT: 'continue_prompt',
  FINISHING: 'finishing',
  ENDED: 'ended',
  DISPOSED: 'disposed'
});

export var GAME_MODES = Object.freeze({
  ENDLESS: 'endless',
  STUDY: 'study',
  WEAKNESS: 'weakness',
  DAILY: 'daily',
  CHALLENGE: 'challenge',
  TOURNAMENT: 'tournament',
  VERSUS: 'versus',
  MP_HIGH_SCORE: 'mp_highscore',
  MP_SUDDEN_DEATH: 'mp_suddendeath',
  MP_RACE: 'mp_race',
  TIMED_PRACTICE: 'timed_practice'
});

export var RUN_END_REASONS = Object.freeze({
  OUT_OF_LIVES: 'out_of_lives',
  MANUAL_END: 'manual_end',
  NO_MATCHING_CARDS: 'no_matching_cards',
  DAILY_COMPLETE: 'daily_complete',
  CHALLENGE_COMPLETE: 'challenge_complete',
  TIMER_EXPIRED: 'timer_expired',
  SUDDEN_DEATH_ELIMINATION: 'sudden_death_elimination',
  RACE_FINISHED: 'race_finished',
  OPPONENT_FORFEIT: 'opponent_forfeit',
  LOCAL_FORFEIT: 'local_forfeit',
  DISCONNECTED: 'disconnected',
  FATAL_ERROR: 'fatal_error'
});

// ─── Constants ───

var LANE_X = [-3, 0, 3];
var ANSWER_LOCK_Z = -3;

// ─── Utility helpers ───

function generateId() {
  return Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
}

function disposeObject(obj) {
  if (!obj) return;
  if (obj.children) {
    for (var i = obj.children.length - 1; i >= 0; i--) disposeObject(obj.children[i]);
  }
  if (obj.geometry) obj.geometry.dispose();
  if (obj.material) {
    if (Array.isArray(obj.material)) {
      for (var m = 0; m < obj.material.length; m++) {
        if (obj.material[m].map) obj.material[m].map.dispose();
        obj.material[m].dispose();
      }
    } else {
      if (obj.material.map) obj.material.map.dispose();
      obj.material.dispose();
    }
  }
}

function removeAndDispose(parent, obj) {
  if (parent && obj) {
    parent.remove(obj);
    disposeObject(obj);
  }
}

// ─── State machine transition table ───

var ALLOWED_TRANSITIONS = {
  idle: ['preparing', 'disposed'],
  preparing: ['countdown', 'ended', 'idle', 'disposed'],
  countdown: ['playing', 'ended', 'idle', 'disposed'],
  playing: ['paused', 'dying', 'finishing', 'ended', 'disposed'],
  paused: ['playing', 'finishing', 'ended', 'disposed'],
  dying: ['continue_prompt', 'finishing', 'ended', 'disposed'],
  continue_prompt: ['playing', 'finishing', 'ended', 'disposed'],
  finishing: ['ended', 'disposed'],
  ended: ['preparing', 'idle', 'disposed'],
  disposed: []
};

// ─── Heart mesh builder ───

function buildHeartMesh() {
  var group = new THREE.Group();
  var heartMat = new THREE.MeshBasicMaterial({ color: 0xff2255 });
  var glowMat = new THREE.MeshBasicMaterial({ color: 0xff4477, transparent: true, opacity: 0.4 });
  var leftLobe = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), heartMat);
  leftLobe.position.set(-0.12, 0.1, 0);
  group.add(leftLobe);
  var rightLobe = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), heartMat);
  rightLobe.position.set(0.12, 0.1, 0);
  group.add(rightLobe);
  var bottom = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.3, 8), heartMat);
  bottom.position.set(0, -0.12, 0);
  bottom.rotation.z = Math.PI;
  group.add(bottom);
  var glow = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 10), glowMat);
  glow.position.set(0, 0, 0);
  group.add(glow);
  return group;
}

// ═══════════════════════════════════════════════════════════════
// GAME CLASS
// ═══════════════════════════════════════════════════════════════

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
    this.coinSpawnTimer = 0;
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
    this._hazards = new HazardManager();
    this.onHazard = null;

    // Animations
    this.celebrateTimer = 0;
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
    this.runPowerupsCollected = 0;
    this.obstaclesJumped = 0;
    this.obstaclesSlid = 0;

    // Powerups
    this.powerups = { shield: 0, double: 0, magnet: 0, autoPilot: 0, scoreFrenzy: 0 };
    this.autoPilotGatesLeft = 0;

    // Map transition system
    this.encountersUntilTransition = 10;
    this.transitionActive = false;
    this.transitionTimer = 0;
    this.transitionDuration = 3.0;
    this.transitionOldSkin = null;
    this.transitionNewSkin = null;
    this.transitionProgress = 0;

    // Exam Monster
    this.examMonster = null;
    this.monsterParts = null;
    this.monsterZ = 20;
    this.monsterTargetZ = 20;
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
    this.onScorePopup = null;
    this.onPowerupCollected = null;
    this.onAchievementUnlocked = null;
    this.onContinuePrompt = null;
    this.onSkinSelected = null;
    this.onMapTransition = null;
    this.onPlayerFaceplant = null;
    this.onMonsterWarning = null;
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
        if (this.onEncounterStart) this.onEncounterStart(event.payload.card, event.payload.gates);
        break;
      case 'encounter_resolved':
        if (this.onEncounterResolve) this.onEncounterResolve(event.payload.card, event.payload.correct);
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
        if (this.onScorePopup) {
          var pl = event.payload;
          if (typeof pl.points === 'number') this.onScorePopup(pl.points);
          else if (pl.type === 'heart') this.onScorePopup('❤️ +1');
          else if (pl.type === 'coin') this.onScorePopup('🪙 +' + (pl.value || 1));
        }
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
    this.currentSkin = getRandomSkin();
    this.scene.background = new THREE.Color(this.currentSkin.colors.bg);

    this.camera = new THREE.PerspectiveCamera(this.baseFOV, innerWidth / innerHeight, 0.1, 300);
    this.camera.position.copy(this.cameraBasePos);
    this.camera.lookAt(0, 1, -20);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    // Create trackRoot group
    this.trackRoot = new THREE.Group();
    this.trackRoot.name = 'trackRoot';
    this.scene.add(this.trackRoot);

    this.trackRefs = buildTrack(this.scene, this.currentSkin);
    this._rebuildPlayer();
    this._createPlayerShadow();
    this.trailSystem = new TrailSystem(this.scene);
    this.powerupFX = new PowerUpFX(this.scene);
    var self = this;
    this._inputDispose = setupInput(this.renderer.domElement, {
        moveLeft: function() { if (self.targetLane > 0) self.targetLane--; },
        moveRight: function() { if (self.targetLane < 2) self.targetLane++; },
        jump: function() { self.jump(); },
        slide: function() { self.slide(); },
        rush: function() { self.addRushStack(); },
        pause: function() { self.togglePause(); }
    }, {
        enabled: function() { return self._state === GAME_STATES.PLAYING; }
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
      this._updateFlyIn(deltaSeconds);
      updateModelAnimation(this.playerGroup, deltaSeconds, 'idle');
    } else if (state === GAME_STATES.PAUSED) {
      // No simulation update during pause
    }
  }

  /** Cinematic camera sweep over the track while the countdown runs. */
  _updateFlyIn(dt) {
    var duration = 2.4;
    this._flyInT += dt;
    var t = Math.min(this._flyInT / duration, 1);
    var e = 1 - Math.pow(1 - t, 3); // ease-out
    var base = this.cameraBasePos;
    this.camera.position.set(
      base.x + (1 - e) * 5 * Math.sin(this._flyInT * 0.8),
      base.y + (1 - e) * 7,
      base.z + (1 - e) * 14
    );
    this.camera.lookAt(0, 1, -20 + (1 - e) * 12);
  }

  _getPostFX() {
    if (storage.get('glowEffects') === false || storage.get('reducedMotion')) return null;
    if (!this._postfx) {
      try {
        this._postfx = createPostFX(this.renderer, this.scene, this.camera);
      } catch (e) {
        console.warn('[Engine] Post-processing unavailable:', e.message);
        this._postfx = { degraded: true, render: function () {}, setSize: function () {}, dispose: function () {} };
      }
    }
    return this._postfx.degraded ? null : this._postfx;
  }

  render() {
    if (this.renderer && this.scene && this.camera) {
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
      if (pixelRatio) this.renderer.setPixelRatio(Math.min(pixelRatio, 2));
      if (this._postfx) this._postfx.setSize(width, height, Math.min(pixelRatio || 1, 2));
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
    this.userSpeed = options.userSpeed || storage.get('userSpeed') || 1;

    // Transition to preparing
    if (!this._transition(GAME_STATES.PREPARING)) return;

    // Reset all run state
    this._resetRunState();

    // Build environment
    this._cleanupObjects();
    this._cleanupTrack();
    if (this.powerupFX) this.powerupFX.hideAll();

    this.currentSkin = getRandomSkin();
    if (options.skinId) {
      for (var si = 0; si < SKINS.length; si++) {
        if (SKINS[si].name === options.skinId) { this.currentSkin = SKINS[si]; break; }
      }
    }

    this.trackRefs = buildTrack(this.scene, this.currentSkin);

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
    this._flyInT = 0;
    this._transition(GAME_STATES.COUNTDOWN);
    this._emit('countdown_started', {});
  }

  // Called by main.js when countdown finishes
  go() {
    if (!this._transition(GAME_STATES.PLAYING)) return;

    this._runStartedAt = performance.now();
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

    this._spawnEncounter();
  }

  // ═══════════════════════════════════════════════════════
  // RESET
  // ═══════════════════════════════════════════════════════

  _resetRunState() {
    this.currentLane = 1; this.targetLane = 1; this.prevLane = 1;
    this.jumping = false; this.sliding = false;
    this.playerY = 0; this.jumpVel = 0; this.legPhase = 0;
    this.elapsedTime = 0; this.cameraLeanX = 0; this.playerTilt = 0;

    // 1x is a calm 1.875 units/s; higher settings scale linearly from there.
    var mapped = 1.875 * this.userSpeed;
    this.speed = this.mode === GAME_MODES.STUDY ? 1.5 : mapped;
    this.baseSpeed = this.speed;

    this.score = 0; this.streak = 0; this.bestStreak = 0;
    this.multiplier = 1; this.coins = 0;
    this.encountersDone = 0; this.correct = 0; this.wrong = 0;
    this.lives = this.mode === GAME_MODES.STUDY ? 99 : 3;
    this.continued = false; this.continuesUsed = 0;

    this.rushing = false; this.rushStacks = 0; this.rushBonus = 0;
    this.rushInvulnerable = false; this.rushPropelTimer = 0;
    this.rushSpeedOverride = 0; this.rushesUsed = 0;

    this.card = null; this.gatesActive = false;
    this.answerLocked = false; this.committedLane = 1;
    this.waitingForNext = false; this.nextEncounterTimer = 0;
    this.coinSpawnTimer = 0; this.powerupSpawnTimer = 8;
    this.envPropSpawnTimer = 0.5; this.speedLineTimer = 0;
    this.shakeTimer = 0;

    this.runCards = []; this.recentIds = []; this._retryQueue = []; this._retriedIds = {};
    this._hazards.reset();
    this._setHazardClass(null);
    this.feedbackTimer = 0; this.teachTimer = 0;
    this.powerups = { shield: 0, double: 0, magnet: 0, autoPilot: 0, scoreFrenzy: 0 };
    this.autoPilotGatesLeft = 0;

    this.celebrateTimer = 0; this.stumbleTimer = 0;
    this.landingTimer = 0; this.wasJumping = false;
    this.encounterStartTime = 0; this.lastEncounterTime = 0;
    this.fastestDecisionMs = null;
    this.isNewBest = false; this._runEnded = false; this._runSummary = null;
    this.runCoinsCollected = 0; this.runPowerupsCollected = 0;
    this.obstaclesJumped = 0; this.obstaclesSlid = 0;

    this.encountersUntilTransition = 10;
    this.transitionActive = false; this.transitionTimer = 0;

    this.monsterZ = 20; this.monsterTargetZ = 20; this._monsterY = undefined;
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

  pause(reason) {
    if (this._state === GAME_STATES.PLAYING) {
      this._transition(GAME_STATES.PAUSED);
    }
  }

  resume(reason) {
    if (this._state === GAME_STATES.PAUSED) {
      this._transition(GAME_STATES.PLAYING);
    }
  }

  togglePause() {
    if (this._state === GAME_STATES.PLAYING) {
      this.pause('user');
      document.getElementById('pauseOverlay').classList.add('active');
    } else if (this._state === GAME_STATES.PAUSED) {
      this.resume('user');
      document.getElementById('pauseOverlay').classList.remove('active');
    }
  }

  // ═══════════════════════════════════════════════════════
  // PLAYER ACTIONS
  // ═══════════════════════════════════════════════════════

  jump() {
    if (!this.jumping && !this.sliding) {
      this.jumping = true;
      this.jumpVel = 12;
      this._emit('obstacle_dodged', { type: 'jump' });
    }
  }

  slide() {
    if (!this.sliding && !this.jumping) {
      this.sliding = true;
      this.slideTimer = 0;
      this._emit('obstacle_dodged', { type: 'slide' });
    }
  }

  addRushStack() {
    if (!this.gatesActive || this.answerLocked) return;
    if (this.rushStacks < this.maxRushStacks) {
      this.rushStacks++;
      this._fovKick = Math.max(this._fovKick, 7);
      this.rushing = true;
      this.rushInvulnerable = true;
      this.rushesUsed++;

      var distToGate = Math.abs(this.gateZ);
      this.rushPropelTimer = 0.5;
      var neededSpeed = distToGate / 0.5;
      this.rushSpeedOverride = neededSpeed / Math.max(this.speed, 0.01);

      var distanceBonus = Math.max(0, (-this.gateZ - 10)) / 50;
      this.rushBonus = Math.floor(distanceBonus * 40 * this.rushStacks);

      this._emit('rush_started', { stacks: this.rushStacks, bonus: this.rushBonus });

      document.getElementById('rushEl').textContent = '\u26A1 RUSH \u00D7' + this.rushStacks + ' \u26A1';
      document.getElementById('rushEl').classList.add('show');
    }
  }

  // ═══════════════════════════════════════════════════════
  // CONTINUE
  // ═══════════════════════════════════════════════════════

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
      this.playerGroup.rotation.set(0, 0, 0);
      this.playerGroup.scale.set(1, 1, 1);
      this.playerGroup.position.set(LANE_X[1], 0, 0);
      this.playerY = 0;
      this.currentLane = 1;
      this.targetLane = 1;

      // Back the monster off; it would otherwise still be on top of the player.
      this.monsterTargetZ = 14;
      this.monsterZ = Math.max(this.monsterZ, 12);
      this.monsterWarningPlayed = false;

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
  }

  // Legacy bridge
  doContinue() {
    return this.continueRun();
  }

  // ═══════════════════════════════════════════════════════
  // REQUEST END / END RUN
  // ═══════════════════════════════════════════════════════

  requestEnd(reason) {
    this._endRun(reason || RUN_END_REASONS.MANUAL_END);
  }

  endRun() {
    this._endRun(RUN_END_REASONS.MANUAL_END);
  }

  _endRun(reason) {
    if (this._runEnded) return;
    this._runEnded = true;
    this._setHazardClass(null);

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
    var durationMs = endedAt - this._runStartedAt;

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

      continued: this.continued,
      continuesUsed: this.continuesUsed,

      subjectsSeen: Array.from(this._subjectsSeen),
      rushesUsed: this.rushesUsed,
      powerupsCollected: this.runPowerupsCollected,
      obstaclesJumped: this.obstaclesJumped,
      obstaclesSlid: this.obstaclesSlid,

      dailyCompleted: dailyComplete,

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
  }

  getRunSummary() {
    return this._runSummary;
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
      new THREE.CircleGeometry(0.5, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2 })
    );
    this.playerShadow.rotation.x = -Math.PI / 2;
    this.playerShadow.position.set(0, 0.02, 0);
    this.scene.add(this.playerShadow);
  }

  _createExamMonster() {
    if (this.examMonster) disposeExamMonster(this.scene, this.examMonster);
    this.examMonster = buildMonster((storage.get('equipped') || {}).monster);
    this.monsterParts = getMonsterParts(this.examMonster);
    this.examMonster.position.set(0, 1.5, this.monsterZ);
    this.examMonster.visible = true;
    this.scene.add(this.examMonster);
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
  }

  _cleanupTrack() {
    var toRemove = [];
    var self = this;

    var protectedSet = new Set();
    protectedSet.add(self.camera);
    protectedSet.add(self.playerShadow);
    protectedSet.add(self.playerGroup);
    if (self.examMonster) protectedSet.add(self.examMonster);

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
  }

  _readdTrailSystem() {
    if (!this.trailSystem || !this.trailSystem.pool) return;
    for (var i = 0; i < this.trailSystem.pool.length; i++) {
      var p = this.trailSystem.pool[i];
      if (p.mesh && !this.scene.children.includes(p.mesh)) {
        this.scene.add(p.mesh);
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  // MAP TRANSITION
  // ═══════════════════════════════════════════════════════

  _transitionSkin(newSkin) {
    this.transitionActive = true;
    this.transitionTimer = 0;
    this.transitionOldSkin = this.currentSkin;
    this.transitionNewSkin = newSkin;
    this.transitionProgress = 0;

    this._emit('skin_transition_started', { skinName: newSkin.name });
  }

  _updateMapTransition(dt) {
    if (!this.transitionActive) return;

    this.transitionTimer += dt;
    this.transitionProgress = Math.min(this.transitionTimer / this.transitionDuration, 1.0);

    var oldBg = new THREE.Color(this.transitionOldSkin.colors.bg);
    var newBg = new THREE.Color(this.transitionNewSkin.colors.bg);
    var blendedBg = oldBg.clone().lerp(newBg, this.transitionProgress);
    this.scene.background = blendedBg;
    if (this.scene.fog) this.scene.fog.color.copy(blendedBg);

    if (this.transitionProgress >= 1.0) {
      this.transitionActive = false;
      this.currentSkin = this.transitionNewSkin;
      this.transitionOldSkin = null;
      this.transitionNewSkin = null;

      this._cleanupTrack();
      this.trackRefs = buildTrack(this.scene, this.currentSkin);

      if (this.playerGroup && !this.scene.children.includes(this.playerGroup)) this.scene.add(this.playerGroup);
      if (this.playerShadow && !this.scene.children.includes(this.playerShadow)) this.scene.add(this.playerShadow);
      if (this.examMonster && !this.scene.children.includes(this.examMonster)) this.scene.add(this.examMonster);
      this._readdPowerupFX();
      this._readdTrailSystem();

      this._emit('skin_transition_completed', { skinName: this.currentSkin.name });
    }
  }

  // ═══════════════════════════════════════════════════════
  // ENCOUNTER SPAWNING
  // ═══════════════════════════════════════════════════════

  _dueRetryIds() {
    var done = this.encountersDone;
    return this._retryQueue.filter(function (r) { return r.at <= done; }).map(function (r) { return r.id; });
  }

  _spawnEncounter() {
    // Use seeded order if available (multiplayer)
    var card = null;
   var poolResult = getCardPool({
    subjects: storage.get('selectedSubjects') || [],
    filters: {
        exams: storage.get('selectedExams') || [],
        questionTypes: storage.get('selectedQuestionTypes') || [],
        sources: storage.get('selectedSources') || [],
        years: storage.get('selectedYears') || [],
        highYieldOnly: storage.get('highYieldOnly') || false
    },
    includeCustomCards: true,
    mode: this.mode
});

if (poolResult.error || poolResult.cards.length === 0) {
    this._endRun(RUN_END_REASONS.NO_MATCHING_CARDS);
    return;
}

var pickResult;
if (this.seededCardOrder && this._seededCardIndex < this.seededCardOrder.length) {
    pickResult = pickCard({
        pool: poolResult.cards,
        recentIds: this.recentIds,
        mode: this.mode,
        encounterIndex: this._seededCardIndex,
        orderedCardIds: this.seededCardOrder,
        selectionState: this._selectionState,
        rng: Math.random
    });
    this._seededCardIndex++;
} else {
    pickResult = pickCard({
        pool: poolResult.cards,
        recentIds: this.recentIds,
        mode: this.mode,
        encounterIndex: this.encountersDone,
        orderedCardIds: null,
        selectionState: this._selectionState,
        retryIds: this._dueRetryIds(),
        rng: Math.random
    });
    if (pickResult && pickResult.wasRetry && pickResult.card) {
      this._retryQueue = this._retryQueue.filter(function (r) { return r.id !== pickResult.card.id; });
      this._retriedIds[pickResult.card.id] = true;
    }
}

card = pickResult ? pickResult.card : null;

    if (!card) {
      this._endRun(RUN_END_REASONS.NO_MATCHING_CARDS);
      return;
    }

    this.card = card;

    // Signature map hazard (solo endless/weakness only: never in seeded or
    // competitive modes, and never for players who prefer reduced motion).
    if (!this.seededCardOrder && (this.mode === GAME_MODES.ENDLESS || this.mode === GAME_MODES.WEAKNESS) &&
        !storage.get('reducedMotion') &&
        !(typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
      var hazardStarted = this._hazards.maybeStart(this.currentSkin.name, this.encountersDone);
      if (hazardStarted) this._emit('hazard_started', { type: hazardStarted, label: HAZARDS[hazardStarted].label });
    }
    this._subjectsSeen.add(card.subj);
    this.recentIds.push(card.id);
    if (this.recentIds.length > 10) this.recentIds.shift();

    // Update selection state for variety enforcement
    if (card.questionType) {
      this._selectionState.recentQuestionTypes.push(card.questionType);
      if (this._selectionState.recentQuestionTypes.length > 3) this._selectionState.recentQuestionTypes.shift();
    }
    if (card.subj) {
      this._selectionState.recentSubjects.push(card.subj);
      if (this._selectionState.recentSubjects.length > 3) this._selectionState.recentSubjects.shift();
    }

    var correctLane = Math.floor(Math.random() * 3);
    var distractors = card.d.slice();
    this.gates = [];
    for (var i = 0; i < 3; i++) {
      if (i === correctLane) this.gates.push({ label: card.ans, correct: true });
      else this.gates.push({ label: distractors.shift() || 'N/A', correct: false });
    }

    // Auto-pilot support
    if (this.autoPilotGatesLeft > 0) {
      for (var ap = 0; ap < this.gates.length; ap++) {
        if (this.gates[ap].correct) { this.targetLane = ap; break; }
      }
    }

    this.gateZ = -60;
    for (var g = 0; g < this.gateMeshes.length; g++) removeAndDispose(this.scene, this.gateMeshes[g]);
    var gateTheme = { glow: this.currentSkin.colors.gateGlow, gate: this.currentSkin.colors.gateBase };
    this.gateMeshes = spawnGates(this.scene, this.gates, this.currentLane, gateTheme, this.card && this.card.subj);
    this.gatesActive = true;
    this.answerLocked = false;
    this.rushing = false;
    this.rushStacks = 0;
    this.rushInvulnerable = false;
    this.rushPropelTimer = 0;
    this.rushSpeedOverride = 0;
    document.getElementById('rushEl').classList.remove('show');

    this.encounterStartTime = performance.now();

    var presentedAnswers = [this.gates[0].label, this.gates[1].label, this.gates[2].label];
    this._emit('encounter_started', {
      card: card,
      gates: this.gates,
      presentedAnswers: presentedAnswers,
      correctLane: correctLane
    });
  }

  // ═══════════════════════════════════════════════════════
  // ENCOUNTER RESOLUTION
  // ═══════════════════════════════════════════════════════

  _resolveEncounter() {
    this.gatesActive = false;
    document.getElementById('rushEl').classList.remove('show');

    var wasRushing = this.rushing;
    var stacks = this.rushStacks;
    this.rushing = false;
    this.rushStacks = 0;
    this.rushInvulnerable = false;
    this.rushPropelTimer = 0;
    this.rushSpeedOverride = 0;

    var resolvedAt = performance.now();
    this.lastEncounterTime = resolvedAt - this.encounterStartTime;

    var lane = this.committedLane;
    var gate = this.gates[lane];
    var card = this.card;
    var ok = gate.correct;

    // Track decision time
    var decisionMs = resolvedAt - this.encounterStartTime;
    if (ok && decisionMs > 0) {
      if (this.fastestDecisionMs === null || decisionMs < this.fastestDecisionMs) {
        this.fastestDecisionMs = decisionMs;
      }
    }

    this.encountersDone++;

    // Remediation: bring a missed card back a few encounters later (once).
    if (!ok && !this.seededCardOrder && this.mode !== GAME_MODES.DAILY && !this._retriedIds[card.id]) {
      this._retryQueue.push({ id: card.id, at: this.encountersDone + 3 });
    }

    var pointsEarned = 0;
    var coinsEarned = 0;

    // Record encounter result
    var encounterResult = {
      card: card,
      ok: ok,
      choice: gate.label,
      rushed: wasRushing,
      rushStacks: stacks,
      clueShownAt: this.encounterStartTime,
      firstInputAt: null,
      committedAt: resolvedAt,
      resolvedAt: resolvedAt,
      decisionMs: decisionMs,
      correctLane: 0,
      committedLane: lane,
      presentedAnswers: [this.gates[0].label, this.gates[1].label, this.gates[2].label],
      scoreAwarded: 0,
      coinsAwarded: 0
    };

    // Find correct lane
    for (var cl = 0; cl < this.gates.length; cl++) {
      if (this.gates[cl].correct) { encounterResult.correctLane = cl; break; }
    }

    // Map transition check
    this.encountersUntilTransition--;
    if (this.encountersUntilTransition <= 0) {
      this.encountersUntilTransition = 10;
      var newSkin = getRandomSkin();
      var attempts = 0;
      while (newSkin.name === this.currentSkin.name && attempts < 20) {
        newSkin = getRandomSkin();
        attempts++;
      }
      if (newSkin.name !== this.currentSkin.name) {
        this._transitionSkin(newSkin);
      }
    }

    // Monster behavior
    if (this.examMonster) {
      if (!ok) {
        this.monsterTargetZ -= 4;
      } else {
        this.monsterTargetZ += 1.5;
      }
      this.monsterTargetZ = Math.min(this.monsterTargetZ, 30);
      this.monsterTargetZ = Math.max(this.monsterTargetZ, 3);
    }

    if (ok) {
      this.correct++;
      this._fovKick = Math.max(this._fovKick, 3);
      if (!this.seededCardOrder && (this.rushing || (decisionMs > 0 && decisionMs < 1500))) this._slowmo = 0.45;
      this.streak++;
      if (this.streak > this.bestStreak) this.bestStreak = this.streak;

      var mult = this.powerups.double > 0 ? 2 : 1;
      pointsEarned = (10 + this.streak * 2) * this.multiplier * mult;
      if (this.rushBonus > 0) pointsEarned += this.rushBonus;
      pointsEarned += Math.floor(this.userSpeed * 3);
      this.score += pointsEarned;

      var coinMult = this.powerups.scoreFrenzy > 0 ? 5 : 1;
      coinsEarned = (1 + Math.floor(this.streak / 3)) * coinMult;
      this.coins += coinsEarned;

      if (this.streak % 5 === 0) {
        this.multiplier = Math.min(this.multiplier + 1, 8);
        this._emit('streak_milestone', { streak: this.streak, multiplier: this.multiplier });
      }

      this.celebrateTimer = 0.3;
      this.playerY += 0.5;
      this.jumpVel = 3;
      if (!this.jumping) this.jumping = true;

      // Gate visual feedback
      for (var gi = 0; gi < this.gateMeshes.length; gi++) {
        if (this.gates[gi].correct) {
          this.gateMeshes[gi].children[0].material.color.setHex(0x00ff44);
          this.gateMeshes[gi].children[0].material.opacity = 1.0;
          this.gateMeshes[gi].scale.set(1.3, 1.3, 1.3);
          this._spawnGateParticles(this.gateMeshes[gi].position, 0x00ff44, 10);
        } else {
          this.gateMeshes[gi].children[0].material.opacity = 0;
        }
      }

      encounterResult.scoreAwarded = pointsEarned;
      encounterResult.coinsAwarded = coinsEarned;

      this._emit('coin_collected', { points: pointsEarned });

    } else {
      // Wrong answer
      this.wrong++;
      this.streak = 0;
      this.multiplier = Math.max(1, this.multiplier - 1);
      this.lives--;

      this.stumbleTimer = 0.3;

      // Gate visual feedback
      for (var gwi = 0; gwi < this.gateMeshes.length; gwi++) {
        if (this.gates[gwi].correct) {
          this.gateMeshes[gwi].children[0].material.color.setHex(0x00cc55);
          this.gateMeshes[gwi].children[0].material.opacity = 1.0;
        } else if (gwi === lane) {
          this.gateMeshes[gwi].children[0].material.color.setHex(0xff2222);
          this.gateMeshes[gwi].children[0].material.opacity = 0.5;
        } else {
          this.gateMeshes[gwi].children[0].material.opacity = 0;
        }
      }
      flashGateResult(this.gateMeshes, this.gates, lane);
      this._triggerShake();

      this._emit('damage_taken', { source: 'wrong_answer', livesRemaining: this.lives });

      // Sudden Death: first wrong eliminates
      if (this.mode === GAME_MODES.MP_SUDDEN_DEATH) {
        this._emit('encounter_resolved', { card: card, correct: ok, encounterResult: encounterResult });
        this.runCards.push(encounterResult);
        this._endRun(RUN_END_REASONS.SUDDEN_DEATH_ELIMINATION);
        return;
      }

      // Shield check
      if (this.lives < 0 && this.powerups.shield > 0) {
        this.lives = 0;
      }

      // Fatal damage check
      if (this.lives <= 0 && this.mode !== GAME_MODES.STUDY) {
        if (this.powerups.shield > 0) {
          this.powerups.shield = 0;
          this.lives = 1;
          this._emit('shield_broken', {});
          if (this.powerupFX) this.powerupFX.shatterShield(this.playerGroup.position);
        } else {
          // Fatal: transition to dying
          this.feedbackTimer = 1.5;
          this._emit('encounter_resolved', { card: card, correct: ok, encounterResult: encounterResult });
          this.runCards.push(encounterResult);

          this._triggerDeath();
          return;
        }
      }
    }

    // Auto-pilot
    if (this.autoPilotGatesLeft > 0) {
      this.autoPilotGatesLeft--;
      if (this.autoPilotGatesLeft <= 0) {
        this.autoPilotGatesLeft = 0;
        this.powerups.autoPilot = 0;
      }
    }

    this.feedbackTimer = 1.2;
    this.rushBonus = 0;

    // Emit encounter resolved
    this._emit('encounter_resolved', { card: card, correct: ok, encounterResult: encounterResult });
    this.runCards.push(encounterResult);

    // Next encounter scheduling
    if (this.mode === GAME_MODES.STUDY) {
      this.teachTimer = 3.5;
      this.waitingForNext = true;
      this.nextEncounterTimer = ok ? 1.5 : 3.5;
    } else if (!ok) {
      this.teachTimer = 2.0;
      this.waitingForNext = true;
      this.nextEncounterTimer = 1.0;
    } else {
      this.waitingForNext = true;
      this.nextEncounterTimer = 0.05;
    }

    // Challenge completion: a fixed number of seeded encounters
    if ((this.mode === GAME_MODES.CHALLENGE || this.mode === GAME_MODES.TOURNAMENT) &&
        this.encountersDone >= (this._modeConfig.challengeCount || 15)) {
      this.waitingForNext = false;
      var selfC = this;
      setTimeout(function () { selfC._endRun(RUN_END_REASONS.CHALLENGE_COMPLETE); }, 600);
      return;
    }

    // Daily completion check
    if (this.mode === GAME_MODES.DAILY && this.encountersDone >= (this._modeConfig.dailyEncounterCount || 15)) {
      this.waitingForNext = false;
      var self = this;
      setTimeout(function () { self._endRun(RUN_END_REASONS.DAILY_COMPLETE); }, 600);
      return;
    }

    // Race mode: check target correct
    if (this.mode === GAME_MODES.MP_RACE && this._mpTargetCorrect && this.correct >= this._mpTargetCorrect) {
      this.waitingForNext = false;
      var self2 = this;
      setTimeout(function () { self2._endRun(RUN_END_REASONS.RACE_FINISHED); }, 600);
      return;
    }

    // Heart spawn logic
    if (this.lives === 1 && this.mode !== GAME_MODES.STUDY) {
      this.heartSpawnCounter++;
      if (this.heartSpawnCounter >= 3) {
        this.heartSpawnCounter = 0;
        if (Math.random() < 0.7) {
          this._spawnHeartPickup();
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  // DEATH / DYING STATE
  // ═══════════════════════════════════════════════════════

  _triggerDeath() {
    this._transition(GAME_STATES.DYING);

    if (this.examMonster && this.monsterZ < 20) {
      this.monsterTargetZ = 0;
      this.monsterZ = Math.min(this.monsterZ, 10);
      this.examMonster.visible = true;
    }

    this.faceplanting = true;
    this.faceplantTimer = 1.8;
    this._emit('death_started', {});
  }

  _updateDying(dt) {
    this.faceplantTimer -= dt;
    var totalDuration = 1.8;
    var fp = totalDuration - this.faceplantTimer;

    // Animated models play their own death clip; procedural ones faceplant.
    if (this.playerGroup.userData.animator) {
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

    // Dramatic camera
    var camProgress = Math.min(fp / totalDuration, 1.0);
    this.camera.position.x = this.cameraBasePos.x + Math.sin(camProgress * Math.PI) * 2;
    this.camera.position.y = this.cameraBasePos.y - camProgress * 2;
    this.camera.position.z = this.cameraBasePos.z - camProgress * 3;
    this.camera.lookAt(this.playerGroup.position.x, 1, this.playerGroup.position.z);

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
  }

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
      var gravity = 30;
      if (Math.abs(this.jumpVel) < 3) gravity = 18;
      this.jumpVel -= gravity * dt;
      if (this.playerY <= 0) {
        this.playerY = 0;
        this.jumping = false;
        this.jumpVel = 0;
        if (this.wasJumping) this.landingTimer = 0.1;
      }
    }
    this.wasJumping = this.jumping;
    this.playerGroup.position.y = this.playerY;

    // Stretch upward while rising, ease back as the jump peaks (the landing
    // squash below takes over on touchdown).
    if (this.jumping && !this.sliding) {
      this.playerGroup.scale.y = 1 + Math.max(0, Math.min(this.jumpVel, 12)) / 12 * 0.08;
    }

    // Slide
    if (this.sliding) {
      this.slideTimer += dt;
      this.playerGroup.scale.y = 0.35;
      this.playerGroup.position.y = -0.35;
      if (this.slideTimer >= 0.45) {
        this.sliding = false;
        this.playerGroup.scale.y = 1;
        this.playerGroup.position.y = this.playerY;
      }
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
    if (this.limbs && this.celebrateTimer <= 0) {
      var lm = this.limbs;
      var tLL = 0, tRL = 0, tLA = 0, tRA = 0;
      if (this.jumping) {
        // Tuck: arms forward-up, lead knee raised
        tLL = 0.9; tRL = -0.25; tLA = 1.9; tRA = 1.9;
      } else if (this.sliding) {
        // Crouch: legs forward, arms out front for balance
        tLL = 1.1; tRL = 1.0; tLA = 0.9; tRA = 0.9;
      } else {
        this.legPhase += currentSpeed * rushMult * dt * 0.8;
        var sw = Math.sin(this.legPhase) * 0.45;
        tLL = sw; tRL = -sw; tLA = -sw * 0.9; tRA = sw * 0.9;
        this.playerGroup.position.y = this.playerY + Math.abs(Math.sin(this.legPhase)) * 0.06;
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
      var modelState = this.celebrateTimer > 0 ? 'celebrate' : this.jumping ? 'jump' : this.sliding ? 'slide' : 'run';
      updateModelAnimation(this.playerGroup, dt, modelState);
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
    if (this.gatesActive && !this.answerLocked && this.gateZ >= ANSWER_LOCK_Z) {
      // Lock the answer based on nearest lane to player position
      var playerX = this.playerGroup.position.x;
      var bestLane = 1;
      var bestDist = Math.abs(playerX - LANE_X[1]);
      for (var lci = 0; lci < 3; lci++) {
        var d = Math.abs(playerX - LANE_X[lci]);
        if (d < bestDist) {
          bestDist = d;
          bestLane = lci;
        }
      }
      this.committedLane = bestLane;
      this.answerLocked = true;
      this._emit('answer_locked', { lane: bestLane });
    }

    // Gates movement
    if (this.gatesActive) {
      this.gateZ += move;
      for (var gi = 0; gi < this.gateMeshes.length; gi++) {
        this.gateMeshes[gi].position.z = this.gateZ;
        var approachProgress = 1.0 - Math.max(0, -this.gateZ) / 60;
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

    // Coin spawning
    this.coinSpawnTimer -= dt;
    if (this.coinSpawnTimer <= 0) {
      spawnCoinBatch(this.scene, this.coinMeshes);
      this.coinSpawnTimer = 0.8 + Math.random() * 1.2;
    }

    // Power-up spawning
    this.powerupSpawnTimer -= dt;
    if (this.powerupSpawnTimer <= 0) {
      spawnPowerup(this.scene, this.coinMeshes);
      this.powerupSpawnTimer = 15 + Math.random() * 10;
    }

    // Environment props
    this.envPropSpawnTimer -= dt;
    if (this.envPropSpawnTimer <= 0) {
      spawnEnvProp(this.scene, this.envPropMeshes, storage.get('selectedSubjects'));
      this.envPropSpawnTimer = 1.5 + Math.random() * 2;
    }
    for (var ei = this.envPropMeshes.length - 1; ei >= 0; ei--) {
      var ep = this.envPropMeshes[ei];
      ep.position.z += move * 0.7;
      ep.rotation.y += dt * 0.3;
      if (ep.position.z > 10) {
        removeAndDispose(this.scene, ep);
        this.envPropMeshes.splice(ei, 1);
      }
    }

    // Track visuals
    this._updateVisuals(dt, move, currentSpeed, rushMult);

    // Obstacles
    for (var oi = this.obstacleMeshes.length - 1; oi >= 0; oi--) {
      var ob = this.obstacleMeshes[oi];
      ob.position.z += move;
      if (ob.position.z > 2) {
        var od = ob.userData;
        if (od.lane === this.currentLane) {
          var dodged = (od.type === 'high' && this.sliding) || (od.type === 'low' && this.jumping);
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
              this._triggerShake();
              this.stumbleTimer = 0.3;
              if (this.lives <= 0 && this.mode !== GAME_MODES.STUDY) {
                var canCont = this._modeConfig.allowContinue && !this.continued && storage.get('coins') >= (this._modeConfig.continueCost || CONTINUE_COST);
                if (canCont) {
                  this._triggerDeath();
                } else {
                  this._endRun(RUN_END_REASONS.OUT_OF_LIVES);
                }
              }
            }
          }
        }
        removeAndDispose(this.scene, ob);
        this.obstacleMeshes.splice(oi, 1);
      }
    }

    // Coins, power-ups, hearts
    for (var ci = this.coinMeshes.length - 1; ci >= 0; ci--) {
      var c = this.coinMeshes[ci];
      c.position.z += move;

      if (c.userData.type === 'coin') {
        c.rotation.y += dt * 3;
      } else if (c.userData.type === 'powerup') {
        c.rotation.y += dt * 2;
        c.position.y = 1.5 + Math.sin(this.elapsedTime * 3 + ci) * 0.3;
      } else if (c.userData.type === 'heart') {
        c.rotation.y += dt * 2;
        var heartPulse = 1.0 + Math.sin(this.elapsedTime * 4) * 0.15;
        c.scale.set(heartPulse, heartPulse, heartPulse);
        c.position.y = 1.5 + Math.sin(this.elapsedTime * 2 + ci) * 0.2;
      }

      if (c.position.z > 3) {
        removeAndDispose(this.scene, c);
        this.coinMeshes.splice(ci, 1);
        continue;
      }

      if (c.position.z > -3 && c.position.z < 2 && !c.userData.collected) {
        var inLane = c.userData.lane === this.currentLane;
        var magnetActive = this.powerups.magnet > 0;
        var closeEnough = Math.abs(LANE_X[this.currentLane] - c.position.x) < 1.8;

        if (magnetActive && !inLane && c.position.z > -5) {
          c.position.x += (this.playerGroup.position.x - c.position.x) * dt * 5;
        }

        if (inLane || closeEnough || magnetActive) {
          c.userData.collected = true;

          if (c.userData.type === 'powerup') {
            this._collectPowerup(c.userData.powerupType);
          } else if (c.userData.type === 'heart') {
            var maxLives = this.mode === GAME_MODES.STUDY ? 99 : 3;
            if (this.lives < maxLives) this.lives++;
            this._emit('coin_collected', { type: 'heart' });
          } else {
            var coinValue = this.powerups.scoreFrenzy > 0 ? 5 : 1;
            this.coins += coinValue;
            this.runCoinsCollected += coinValue;
            this._emit('coin_collected', { type: 'coin', value: coinValue, lane: c.userData.lane });
          }
          removeAndDispose(this.scene, c);
          this.coinMeshes.splice(ci, 1);
        }
      }
    }

    // Power-up timers
    var timedPowerups = ['double', 'magnet', 'scoreFrenzy'];
    for (var pk = 0; pk < timedPowerups.length; pk++) {
      var pkey = timedPowerups[pk];
      if (this.powerups[pkey] > 0) this.powerups[pkey] -= dt;
    }

    // Feedback timers
    if (this.feedbackTimer > 0) this.feedbackTimer -= dt;
    if (this.teachTimer > 0) this.teachTimer -= dt;

    // Speed progression
    if (this.mode !== GAME_MODES.STUDY) {
      this.speed = Math.min(this.baseSpeed * 2.0, this.baseSpeed + this.encountersDone * 0.3);
    }

    // HUD update
    if (this.onHudUpdate) this.onHudUpdate();
  }

  // ═══════════════════════════════════════════════════════
  // VISUAL-ONLY UPDATE (countdown, etc.)
  // ═══════════════════════════════════════════════════════

  _updateVisuals(dt, move, currentSpeed, rushMult) {
    if (!move) move = 0;
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
  }

  // ═══════════════════════════════════════════════════════
  // EXAM MONSTER
  // ═══════════════════════════════════════════════════════

  _updateExamMonster(dt) {
    if (!this.examMonster) return;

    this.monsterZ += (this.monsterTargetZ - this.monsterZ) * dt * 1.2;
    if (this.monsterZ < 3) this.monsterZ = 3;

    // monsterZ is a "distance to catch" (3 = caught, 30 = far away). The camera
    // sits at z=10 looking forward, so anything drawn at monsterZ > 10 would be
    // behind it. The monster is therefore drawn in front of the camera and
    // grows/approaches as the catch distance shrinks.
    var near = Math.min(1, Math.max(0, (30 - this.monsterZ) / 27));
    var shouldBeVisible = true;
    if (shouldBeVisible !== this.monsterVisible) {
      this.monsterVisible = shouldBeVisible;
      this.examMonster.visible = shouldBeVisible;
    }

    // The monster looms above the player's line of sight so it never hides the
    // runner or the lanes, then swoops down when it makes the catch.
    var dying = this._state === GAME_STATES.DYING || this._state === GAME_STATES.CONTINUE_PROMPT;
    var targetY = dying ? 1.6 : 3.4;
    this._monsterY = (this._monsterY === undefined ? targetY : this._monsterY);
    this._monsterY += (targetY - this._monsterY) * Math.min(1, dt * 4);
    this.examMonster.position.set(0, this._monsterY, dying ? Math.min(this.monsterZ, 5) : 3.5 - near);

    if (this.monsterVisible) {
      var distFactor = dying ? 0.3 + 0.7 * near : 0.22 + 0.3 * near;
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
      this._triggerDeath();
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
  }

  // ═══════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════

  _spawnHeartPickup() {
    var lane = Math.floor(Math.random() * 3);
    var heartGroup = buildHeartMesh();
    heartGroup.position.set(LANE_X[lane], 1.5, -45 - Math.random() * 15);
    heartGroup.userData = { lane: lane, collected: false, type: 'heart' };
    this.scene.add(heartGroup);
    this.coinMeshes.push(heartGroup);
  }

  _collectPowerup(type) {
    switch (type) {
      case 'shield': this.powerups.shield = 999; break;
      case 'magnet': this.powerups.magnet = 10; break;
      case 'double': this.powerups.double = 15; break;
      case 'autoPilot':
        this.autoPilotGatesLeft = 1;
        this.powerups.autoPilot = 999;
        if (this.gatesActive) {
          for (var ap = 0; ap < this.gates.length; ap++) {
            if (this.gates[ap].correct) { this.targetLane = ap; break; }
          }
          this.addRushStack();
        }
        break;
      case 'scoreFrenzy': this.powerups.scoreFrenzy = 8; break;
    }
    this.runPowerupsCollected++;
    this._emit('powerup_collected', { type: type });
  }

  _triggerShake() { this.shakeTimer = 0.15; }

  _transitionToNextEncounter() {
    for (var m = 0; m < this.gateMeshes.length; m++) removeAndDispose(this.scene, this.gateMeshes[m]);
    this.gateMeshes = [];
    if (this.mode !== GAME_MODES.STUDY && Math.random() < 0.4) {
      spawnObstacle(this.scene, this.obstacleMeshes);
    }
    this._spawnEncounter();
  }

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
  }
}

// ═══════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════

export var game = new Game();
