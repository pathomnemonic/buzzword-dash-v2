/**
 * gates.js — Gate spawning, card selection, and encounter resolution
 *
 * Owned by Agent 2 per ARCHITECTURE.md §30.
 *
 * Implements:
 * - getCardPool(options)       — canonical card-pool request
 * - pickCard(options)          — canonical card-selection contract
 * - createDailyOrder(options)  — deterministic Daily encounter order
 * - spawnGates(...)            — 3D gate mesh spawning
 * - updateGateHighlights(...)  — visual highlight updates
 * - flashGateResult(...)       — correct/wrong flash
 * - resolveStats(...)          — per-card and per-subject stat recording
 *
 * Key architectural rules (ARCHITECTURE.md):
 * - No silent filter fallback: returns structured error if pool is empty.
 * - No mutation of orderedCardIds: uses encounterIndex for lookup.
 * - No direct persistence writes: resolveStats calls storage APIs only.
 * - Deterministic RNG for Daily and multiplayer modes.
 * - Disabled cards and mode-ineligible cards never appear.
 */

import * as THREE from 'three';
import { CARDS, SUBJECTS } from '../cardhub.js';
import { storage } from '../storage.js';
import { customCards } from '../customcards.js';
import { getSubjectStyle } from './subjectstyle.js';
import { roundedBox } from './materials.js';

// ===== CONSTANTS =====

var LANE_X = [-3, 0, 3];

// ===== CARD SCHEMA DEFAULTS =====
// Until cardschema.js (Agent 8) is available, we patch defaults inline.
// Once cardschema.js ships, replace with: import { normalizeCard } from '../cardschema.js';

function patchCardDefaults(c) {
  if (!c) return c;
  if (c.exams === undefined) c.exams = [];
  if (c.baseDifficulty === undefined) c.baseDifficulty = 2;
  if (c.questionType === undefined) c.questionType = 'buzzword_dx';
  if (c.source === undefined) c.source = 'clinical_medicine';
  if (c.tags === undefined) c.tags = c.subj ? [c.subj.toLowerCase()] : [];
  if (c.hx === undefined) c.hx = false;
  if (c.yr === undefined) c.yr = 2;
  if (c.pearls === undefined) c.pearls = c.tp ? [c.tp.split('.')[0]] : [];
  if (c.enabledModes === undefined) c.enabledModes = ['endless', 'study', 'weakness', 'daily', 'versus', 'mp_highscore', 'mp_suddendeath', 'mp_race', 'flashcard'];
  return c;
}

// ===== DETERMINISTIC RNG =====
// Shared with multiplayer.js via identical algorithm.
// xorshift32: deterministic across browsers.

function createSeededRandom(seed) {
  var state = seed | 0;
  if (state === 0) state = 1;
  return function () {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) / 4294967296);
  };
}

function seededShuffle(items, rng) {
  var arr = items.slice();
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(rng() * (i + 1));
    var temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
  }
  return arr;
}

// ===== DAILY SEED =====

function getDailySeed(dateKey) {
  // dateKey is 'YYYY-MM-DD'
  var parts = dateKey.split('-');
  var y = parseInt(parts[0], 10);
  var m = parseInt(parts[1], 10);
  var d = parseInt(parts[2], 10);
  return y * 10000 + m * 100 + d;
}

// ===== CARD POOL BUILDING =====

/**
 * Canonical card-pool request.
 *
 * @param {object} options
 * @param {string[]} options.subjects - empty means all canonical subjects
 * @param {object} options.filters
 * @param {string} options.mode - runner mode ID
 * @param {boolean} options.includeCustomCards - default true
 * @returns {{ cards: object[], cardIds: string[], error: null|{code:string, message:string} }}
 */
export function getCardPool(options) {
  var subjects = options.subjects;
  var filters = options.filters || {};
  var mode = options.mode || 'endless';
  var includeCustomCards = options.includeCustomCards !== false;

  // If subjects array is empty or not provided, use ALL canonical subjects
  if (!subjects || subjects.length === 0) {
    subjects = SUBJECTS.slice();
  }

  // Gather all cards
  var allCards = CARDS.slice();
  if (includeCustomCards) {
    var customs = customCards.getAll();
    for (var ci = 0; ci < customs.length; ci++) {
      allCards.push(patchCardDefaults(customs[ci]));
    }
  }

  // Get disabled card IDs
  var disabledCardIds = [];
  try {
    disabledCardIds = storage.get('disabledCards') || [];
  } catch (_e) { /* storage unavailable; use default */ }

  var filtered = [];

  for (var i = 0; i < allCards.length; i++) {
    var c = allCards[i];

    // ── Subject filter ──
    if (subjects.indexOf(c.subj) < 0) continue;

    // ── Disabled cards ──
    if (disabledCardIds.indexOf(c.id) >= 0) continue;

    // ── Mode eligibility ──
    if (c.enabledModes && c.enabledModes.length > 0) {
      if (c.enabledModes.indexOf(mode) < 0) continue;
    }

    // ── Exam filter ──
    if (filters.exams && filters.exams.length > 0) {
      if (c.exams && c.exams.length > 0) {
        var examMatch = false;
        for (var ei = 0; ei < filters.exams.length; ei++) {
          if (c.exams.indexOf(filters.exams[ei]) >= 0) {
            examMatch = true;
            break;
          }
        }
        if (!examMatch) continue;
      }
      // Cards without exam tags pass through (backward compat)
    }

    // ── Question type filter ──
    if (filters.questionTypes && filters.questionTypes.length > 0) {
      if (c.questionType && filters.questionTypes.indexOf(c.questionType) < 0) continue;
    }

    // ── Source discipline filter ──
    if (filters.sources && filters.sources.length > 0) {
      if (c.source && filters.sources.indexOf(c.source) < 0) continue;
    }

    // ── Year filter ──
    if (filters.years && filters.years.length > 0) {
      if (c.yr && filters.years.indexOf(c.yr) < 0) continue;
    }

    // ── High-yield only ──
    if (filters.highYieldOnly) {
      if (c.hx !== true) continue;
    }

    filtered.push(c);
  }

  // ── NO SILENT FALLBACK ──
  if (filtered.length === 0) {
    return {
      cards: [],
      cardIds: [],
      error: {
        code: 'NO_MATCHING_CARDS',
        message: 'No cards match the selected subjects and filters. Adjust your filters and try again.'
      }
    };
  }

  var cardIds = [];
  for (var fi = 0; fi < filtered.length; fi++) {
    cardIds.push(filtered[fi].id);
  }

  return {
    cards: filtered,
    cardIds: cardIds,
    error: null
  };
}

// ===== DAILY ORDER =====

/**
 * Create a deterministic Daily encounter order.
 *
 * @param {object} options
 * @param {string} options.dateKey - 'YYYY-MM-DD'
 * @param {string[]} options.eligibleCardIds - ordered array of eligible IDs
 * @param {number} options.count - number of encounters
 * @returns {string[]} immutable array of card IDs (no duplicates when pool >= count)
 */
export function createDailyOrder(options) {
  var dateKey = options.dateKey;
  var eligibleCardIds = options.eligibleCardIds;
  var count = options.count || 15;

  var seed = getDailySeed(dateKey);
  var rng = createSeededRandom(seed);

  // Shuffle eligible IDs deterministically
  var shuffled = seededShuffle(eligibleCardIds, rng);

  // Take up to count (no duplicates since we shuffle the full set)
  var result = shuffled.slice(0, Math.min(count, shuffled.length));

  // Freeze to enforce immutability
  return Object.freeze(result);
}

// ===== CARD SELECTION =====

/**
 * Canonical card-selection contract.
 *
 * @param {object} options
 * @param {object[]} options.pool - eligible card objects
 * @param {string[]} options.recentIds - recently used card IDs
 * @param {string} options.mode
 * @param {number} options.encounterIndex
 * @param {string[]|null} options.orderedCardIds - immutable; uses encounterIndex, never shifted
 * @param {object} options.selectionState - { recentQuestionTypes: string[], recentSubjects: string[] }
 * @param {function} options.rng - () => number [0,1) — deterministic for competitive, Math.random for solo
 * @returns {{ card: object|null, orderedIndex: number|null, error: null|{code:string, message:string} }}
 */
export function pickCard(options) {
  var pool = options.pool;
  var recentIds = options.recentIds || [];
  var mode = options.mode || 'endless';
  var encounterIndex = options.encounterIndex || 0;
  var orderedCardIds = options.orderedCardIds || null;
  var selectionState = options.selectionState || { recentQuestionTypes: [], recentSubjects: [] };
  var rng = options.rng || Math.random;
  var retryIds = options.retryIds || [];

  if (!pool || pool.length === 0) {
    return {
      card: null,
      orderedIndex: null,
      error: {
        code: 'NO_MATCHING_CARDS',
        message: 'Card pool is empty. Cannot pick a card.'
      }
    };
  }

  // ── Ordered selection (Daily, multiplayer) ──
  if (orderedCardIds && orderedCardIds.length > 0) {
    // Use encounterIndex — NEVER shift or mutate orderedCardIds

    // Walk from encounterIndex forward to find a valid card in the pool
    for (var oi = encounterIndex; oi < orderedCardIds.length; oi++) {
      var targetId = orderedCardIds[oi];

      // Look up in pool (not outside it)
      var found = null;
      for (var pi = 0; pi < pool.length; pi++) {
        if (pool[pi].id === targetId) {
          found = pool[pi];
          break;
        }
      }

      if (found) {
        return {
          card: patchCardDefaults(found),
          orderedIndex: oi,
          error: null
        };
      }
    }

    // Ordered IDs exhausted — fall through to weighted selection
  }

  // ── Weakness mode: prefer poorly-performing cards ──
  var effectivePool = pool;
  if (mode === 'weakness') {
    var weakCards = pool.filter(function (c) {
      var s = storage.getCardStat(c.id);
      return s.wrong > 0 || (s.seen > 0 && s.correct / s.seen < 0.7);
    });
    if (weakCards.length >= 3) {
      effectivePool = weakCards;
    }
  }

  // ── Remediation: a card missed earlier in this run comes back ──
  if (retryIds.length > 0 && mode !== 'daily') {
    for (var qi = 0; qi < retryIds.length; qi++) {
      for (var qp = 0; qp < effectivePool.length; qp++) {
        if (effectivePool[qp].id === retryIds[qi]) {
          return { card: patchCardDefaults(effectivePool[qp]), orderedIndex: null, error: null, wasRetry: true };
        }
      }
    }
  }

  // ── Adaptive weighted selection ──
  var now = Date.now();

  // Answers shown recently (duplicate cards for the same diagnosis are
  // legitimate extra practice, but shouldn't appear back to back).
  var recentAnswers = {};
  for (var ra = 0; ra < effectivePool.length; ra++) {
    if (recentIds.indexOf(effectivePool[ra].id) >= 0) recentAnswers[effectivePool[ra].ans] = true;
  }

  // Configurable card freshness weight
  var freshnessWeight = 8;
  try {
    var storedWeight = storage.get('cardFreshnessWeight');
    if (storedWeight && typeof storedWeight === 'number' && storedWeight > 0) {
      freshnessWeight = storedWeight;
    }
  } catch (_e) { /* storage unavailable; use default */ }

  // Variety enforcement state
  var recentTypes = selectionState.recentQuestionTypes || [];
  var recentSubjects = selectionState.recentSubjects || [];

  // Check if last 3 were same question type
  var avoidType = null;
  if (recentTypes.length >= 3 &&
      recentTypes[0] === recentTypes[1] &&
      recentTypes[1] === recentTypes[2]) {
    avoidType = recentTypes[0];
  }

  // Check if last 3 were same subject (only when multiple subjects selected)
  var avoidSubject = null;
  var subjectCount = 0;
  var subjectsSeen = {};
  for (var si = 0; si < effectivePool.length; si++) {
    if (!subjectsSeen[effectivePool[si].subj]) {
      subjectsSeen[effectivePool[si].subj] = true;
      subjectCount++;
    }
  }
  if (subjectCount > 1 && recentSubjects.length >= 3 &&
      recentSubjects[0] === recentSubjects[1] &&
      recentSubjects[1] === recentSubjects[2]) {
    avoidSubject = recentSubjects[0];
  }

  var weighted = [];
  for (var wi = 0; wi < effectivePool.length; wi++) {
    var c = effectivePool[wi];
    var s = storage.getCardStat(c.id);
    var w = 10;

    // ── Accuracy-based weighting ──
    if (s.seen > 0) {
      var accuracy = s.correct / s.seen;
      if (accuracy < 0.3) w *= 4;
      else if (accuracy < 0.5) w *= 3;
      else if (accuracy < 0.7) w *= 1.5;
      else if (accuracy > 0.9 && s.seen > 5) w *= 0.2;
      else if (accuracy > 0.8 && s.seen > 3) w *= 0.5;
    }

    // ── Recent card penalty ──
    if (recentIds.indexOf(c.id) >= 0) {
      w *= 0.02;
    } else if (recentAnswers[c.ans]) {
      w *= 0.05;
    }

    // ── Spaced repetition schedule (due cards first, not-yet-due cards later) ──
    if (typeof s.due === 'number' && s.seen > 0) {
      if (now >= s.due) {
        var overdueDays = Math.min(7, (now - s.due) / (24 * 60 * 60 * 1000));
        w *= 2.5 * (1 + overdueDays * 0.3);
      } else {
        w *= 0.25;
      }
    } else if (s.lastSeen > 0) {
      var hoursSince = (now - s.lastSeen) / (1000 * 60 * 60);
      if (hoursSince < 0.5) w *= 0.3;
      else if (hoursSince < 2) w *= 0.6;
      else if (hoursSince > 168) w *= 2.5;
      else if (hoursSince > 72) w *= 1.8;
      else if (hoursSince > 24) w *= 1.3;
    } else {
      w *= 1.5;
    }

    // ── Unseen card freshness boost ──
    if (s.seen === 0) {
      w *= freshnessWeight;
    }

    // ── baseDifficulty scaling during a run ──
    if (c.baseDifficulty) {
      if (encounterIndex < 6) {
        // Early: boost easy, penalize hard
        if (c.baseDifficulty === 1) w *= 1.5;
        else if (c.baseDifficulty === 3) w *= 0.5;
      } else if (encounterIndex >= 16) {
        // Late: boost hard, slight penalty for easy
        if (c.baseDifficulty === 3) w *= 1.8;
        else if (c.baseDifficulty === 1) w *= 0.7;
      }
    }

    // ── Question type variety enforcement ──
    if (avoidType && c.questionType === avoidType) {
      w *= 0.3;
    }

    // ── Subject rotation ──
    if (avoidSubject && c.subj === avoidSubject) {
      w *= 0.4;
    }

    weighted.push({ card: c, weight: Math.max(w, 0.01) });
  }

  // ── Weighted random selection using supplied RNG ──
  var total = 0;
  for (var ti = 0; ti < weighted.length; ti++) total += weighted[ti].weight;

  var r = rng() * total;
  for (var ri = 0; ri < weighted.length; ri++) {
    r -= weighted[ri].weight;
    if (r <= 0) {
      return {
        card: patchCardDefaults(weighted[ri].card),
        orderedIndex: null,
        error: null
      };
    }
  }

  // Fallback (floating point edge)
  return {
    card: patchCardDefaults(weighted[weighted.length - 1].card),
    orderedIndex: null,
    error: null
  };
}

// ===== GATE SPAWNING =====

var _iconTextures = {};

function getSubjectIconTexture(subject) {
  var key = subject || '';
  if (_iconTextures[key]) return _iconTextures[key];
  var canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  var ctx = canvas.getContext('2d');
  ctx.font = '96px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(getSubjectStyle(subject).icon, 64, 70);
  var texture = new THREE.CanvasTexture(canvas);
  _iconTextures[key] = texture;
  return texture;
}

export function spawnGates(scene, gates, currentLane, theme, subject) {
  var meshes = [];
  var accent = subject ? getSubjectStyle(subject).color : (theme.glow || 0x18ffff);
  for (var j = 0; j < 3; j++) {
    var group = new THREE.Group();

    var frame = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 3, 0.2),
      new THREE.MeshBasicMaterial({
        color: j === currentLane ? 0x2244aa : 0x111833,
        transparent: true,
        opacity: 0.7
      })
    );
    group.add(frame);

    // Metal frame with a glowing accent (lit, so it reads as a real structure)
    var frameMetal = new THREE.MeshStandardMaterial({
      color: 0x9aa4b8, metalness: 0.85, roughness: 0.3,
      emissive: accent, emissiveIntensity: 0.5, envMapIntensity: 1.3
    });

    var topBar = new THREE.Mesh(roundedBox(3.0, 0.16, 0.3, 2), frameMetal);
    topBar.position.set(0, 1.56, 0);
    group.add(topBar);

    var botBar = new THREE.Mesh(roundedBox(3.0, 0.16, 0.3, 2), frameMetal);
    botBar.position.set(0, -1.56, 0);
    group.add(botBar);

    for (var sx = -1; sx <= 1; sx += 2) {
      var pillar = new THREE.Mesh(roundedBox(0.2, 3.2, 0.3, 2), frameMetal);
      pillar.position.set(sx * 1.5, 0, 0);
      group.add(pillar);
    }

    // Subject icon: a faint watermark so the topic reads at a glance and is
    // not conveyed by color alone.
    if (subject) {
      var icon = new THREE.Mesh(
        new THREE.PlaneGeometry(1.5, 1.5),
        new THREE.MeshBasicMaterial({ map: getSubjectIconTexture(subject), transparent: true, opacity: 0.55, depthWrite: false })
      );
      icon.position.set(0, 0, 0.13);
      group.add(icon);
    }

    group.position.set(LANE_X[j], 1.5, -60);
    scene.add(group);
    meshes.push(group);
  }
  return meshes;
}

// ===== GATE HIGHLIGHTS =====

export function updateGateHighlights(gateMeshes, currentLane) {
  for (var i = 0; i < gateMeshes.length; i++) {
    var frame = gateMeshes[i].children[0];
    if (i === currentLane) {
      frame.material.color.setHex(0x2244aa);
      frame.material.opacity = 0.8;
    } else {
      frame.material.color.setHex(0x111833);
      frame.material.opacity = 0.5;
    }
  }
}

// ===== GATE RESULT FLASH =====

export function flashGateResult(gateMeshes, gates, currentLane) {
  for (var i = 0; i < gateMeshes.length; i++) {
    if (gates[i].correct) {
      gateMeshes[i].children[0].material.color.setHex(storage.get('colorblindMode') ? 0x0072b2 : 0x00cc55);
    } else if (i === currentLane) {
      gateMeshes[i].children[0].material.color.setHex(storage.get('colorblindMode') ? 0xe69f00 : 0xcc0000);
    }
  }
}

// ===== STAT RESOLUTION =====
// This is the ONLY place per-card and per-subject stats are updated
// during gameplay. The engine calls this; it does NOT directly persist
// run-level totals (those go through storage.finalizeRun).

export function resolveStats() {
  // Deprecated no-op. Runner statistics (per-card, per-subject and totals) are
  // persisted only by storage.finalizeRun(summary), which is idempotent by runId.
}
