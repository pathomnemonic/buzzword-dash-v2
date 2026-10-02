/**
 * engineencounter.js — Spawning an encounter (gates, obstacles, coins) and resolving the answer.
 *
 * Split out of engine.js. These methods are attached to Game.prototype (see the end of engine.js),
 * so `this` is the Game and nothing about how they are called has changed.
 */

import { storage } from '../storage.js';
import { getNextSkin } from './skins.js';
import { getCardPool, pickCard, nextSeededIndex, spawnGates, flashGateResult } from './gates.js';
import { monsterOnAnswer, monsterPolicy } from './monsterbehavior.js';
import { HAZARDS } from './hazards.js';
import { missExplanation, readSeconds } from '../explain.js';
import { GAME_MODES, RUN_END_REASONS, VISUAL_SPEED, ANSWER_LOCK_Z, removeAndDispose } from './enginedefs.js';

export var encounterMethods = {

  _dueRetryIds() {
    var done = this.encountersDone;
    return this._retryQueue.filter(function (r) { return r.at <= done; }).map(function (r) { return r.id; });
  },

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

// A study-plan run plays exactly its planned cards, whatever the subject and exam filters say
if (this._modeConfig && Array.isArray(this._modeConfig.planCardIds)) {
  var planIds = {};
  this._modeConfig.planCardIds.forEach(function (id) { planIds[id] = true; });
  var everything = getCardPool({ subjects: [], filters: { exams: [], questionTypes: [], sources: [], years: [], highYieldOnly: false }, includeCustomCards: true, mode: this.mode });
  poolResult = { cards: everything.cards.filter(function (c) { return planIds[c.id]; }), error: everything.error };
}

// A seeded run (daily, friend challenge, Gauntlet, versus) plays the same cards for everyone, so the player's own
// subject and exam filters do not apply. With them, cards missing from the player's pool were skipped and the
// same later card could then be dealt again and again.
if (this.seededCardOrder && !(this._modeConfig && Array.isArray(this._modeConfig.planCardIds))) {
  var everyCard = getCardPool({ subjects: [], filters: { exams: [], questionTypes: [], sources: [], years: [], highYieldOnly: false }, includeCustomCards: true, mode: this.mode });
  if (!everyCard.error && everyCard.cards.length > 0) poolResult = everyCard;
}

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
    // Carry on after the card that was dealt (it can be later than the index when an id was not found)
    this._seededCardIndex = nextSeededIndex(pickResult, this._seededCardIndex);
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
        !(this._rules && this._rules.hazardsOff) &&
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

    // Gates start closer at slow speeds so a question never takes half a minute to arrive:
    // about 16 s away at 1x, the original 60 units from 2x upward.
    var slowFactor = Math.min(1, Math.max(0, (this.baseSpeed - 1.875) / 1.875));
    // (world units: the road moves VISUAL_SPEED times faster than the run's own speed, and starts that much
    // farther away, so the time to reach the gate is the same)
    // (the tutorial's question comes a little nearer so nobody waits long to try the move)
    this._gateSpawnZ = -(this._tutorial ? 20 : 30 + 30 * slowFactor) * VISUAL_SPEED;
    this.gateZ = this._gateSpawnZ;
    for (var g = 0; g < this.gateMeshes.length; g++) removeAndDispose(this.scene, this.gateMeshes[g]);
    var gateTheme = { glow: this.currentSkin.colors.gateGlow, gate: this.currentSkin.colors.gateBase };
    this.gateMeshes = spawnGates(this.scene, this.gates, this.currentLane, gateTheme, this.card && this.card.subj);
    for (var gp = 0; gp < this.gateMeshes.length; gp++) this.gateMeshes[gp].position.z = this.gateZ;
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
    // How long the player has before the answer locks in (used to plan reading the question aloud in time)
    var secondsToLock = Math.max(0, (Math.abs(this._gateSpawnZ) - Math.abs(ANSWER_LOCK_Z) * VISUAL_SPEED) / (Math.max(this.speed, 0.01) * VISUAL_SPEED));
    this._emit('encounter_started', {
      card: card,
      gates: this.gates,
      presentedAnswers: presentedAnswers,
      correctLane: correctLane,
      secondsToLock: secondsToLock
    });
  },

  _resolveEncounter() {
    this.gatesActive = false;
    document.getElementById('rushEl').classList.remove('show');

    var wasRushing = this.rushing;
    this.lastResolvedRushed = wasRushing;
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
    if (this.encountersUntilTransition <= 0 && this._mapPinned) {
      this.encountersUntilTransition = 10;
    } else if (this.encountersUntilTransition <= 0) {
      this.encountersUntilTransition = 10;
      var newSkin = getNextSkin(this.currentSkin, this._mapChanges || 0);
      if (newSkin.name !== this.currentSkin.name) {
        this._mapChanges = (this._mapChanges || 0) + 1;
        this._transitionSkin(newSkin);
      }
    }

    // Monster behavior
    if (this.examMonster && this._monsterEnabled()) {
      var policy = monsterPolicy(this.mode);
      if (this._monsterBehavior) monsterOnAnswer(this._monsterBehavior, ok);
      if (!ok) {
        this.monsterTargetZ -= policy.miss;
      } else {
        this.monsterTargetZ += policy.hit;
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
      this.teachTimer = readSeconds(missExplanation(card, gate.label), 2.0);
      this.waitingForNext = true;
      this.nextEncounterTimer = 1.0;
    } else {
      this.waitingForNext = true;
      this.nextEncounterTimer = 0.05;
    }

    // The tutorial brings the next question itself, and clears the gates once the result has been seen
    if (this._tutorial) {
      this.waitingForNext = false;
      this.teachTimer = 0;
      var selfT = this;
      setTimeout(function () { if (!selfT.gatesActive) selfT._clearGates(); }, 1400);
      this._tut('resolved', { correct: ok });
      return;
    }

    // Challenge completion: a fixed number of seeded encounters
    if ((this.mode === GAME_MODES.CHALLENGE || this.mode === GAME_MODES.TOURNAMENT) &&
        this.encountersDone >= (this._modeConfig.challengeCount || 15)) {
      this.waitingForNext = false;
      var selfC = this;
      setTimeout(function () { selfC._endRun(RUN_END_REASONS.CHALLENGE_COMPLETE); }, 600);
      return;
    }

    // Study-plan run: it ends when the planned cards are done
    if (this._modeConfig && Array.isArray(this._modeConfig.planCardIds) && this.encountersDone >= this._modeConfig.planCardIds.length) {
      this.waitingForNext = false;
      var selfP = this;
      setTimeout(function () { selfP._endRun(RUN_END_REASONS.CHALLENGE_COMPLETE); }, 600);
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

    // Heart spawn logic (ranked leagues make hearts rarer, then take them away)
    var heartEvery = this._leagueRules && typeof this._leagueRules.heartEvery === 'number' ? this._leagueRules.heartEvery : 3;
    if (this.lives === 1 && this.mode !== GAME_MODES.STUDY && heartEvery > 0) {
      this.heartSpawnCounter++;
      if (this.heartSpawnCounter >= heartEvery) {
        this.heartSpawnCounter = 0;
        if (Math.random() < 0.7) {
          this._spawnHeartPickup();
        }
      }
    }
  },
};
