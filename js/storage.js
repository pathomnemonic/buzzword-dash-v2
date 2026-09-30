/**
 * storage.js — Persistence and progression layer
 *
 * Architecture contract: Agent 3
 * Schema version: 2
 *
 * This module is the SOLE owner of localStorage persistence.
 * It exports `storage` and `progression`.
 *
 * Key architectural rules enforced:
 * - `finalizeRun(summary)` is the ONLY way to persist run results (idempotent by runId)
 * - `finalizeFlashcardSession(summary)` is the ONLY way to persist flashcard results (idempotent by sessionId)
 * - Quest claiming is atomic and idempotent
 * - Volume zero persists correctly (nullish coalescing, not ||)
 * - All achievement/quest IDs come from shopdata registry
 * - No engine code may directly reference quest IDs
 * - Legacy API keys are deleted during migration
 * - Schema migrations are ordered and deterministic
 */

// ===== IMPORTS =====
// We import only constants from shopdata — no circular dependency
import { ACHIEVEMENT_IDS, QUEST_IDS, QUESTS } from './game/shopdata.js';

// ===== CONSTANTS =====
var STORAGE_KEY = 'buzzword_dash_v1';
var SCHEMA_VERSION = 2;

// ===== DEFAULT STATE =====
var DEFAULTS = {
  schemaVersion: SCHEMA_VERSION,

  // --- Settings ---
  settings: {
    selectedSubjects: [],
    selectedExams: [],
    selectedQuestionTypes: [],
    selectedSources: [],
    selectedYears: [],
    highYieldOnly: false,

    userSpeed: 1,

    masterVolume: 0.7,
    musicVolume: 0.5,
    sfxVolume: 0.8,
    voiceVolume: 0.7,
    ambientVolume: 0.5,

    musicOn: true,
    ttsEnabled: false,
    hapticsEnabled: true,
    dailyGoal: 20,
    colorblindMode: false,
    glowEffects: true,
    reminders: false,
    reminderHour: 19,
    tipPromptOff: false,
    lastTipPromptAt: 0,
    lastReminderDate: '',
    avatarColors: {},
    reducedMotion: false,
    quality: 'auto',
    perfHint: '',
    nightMode: false,

    speedTimerEnabled: false,
    cardFreshnessWeight: 5
  },

  // --- Progression ---
  progression: {
    coins: 100,
    totalCoinsEarned: 100,
    bestScore: 0,
    bestStreak: 0,
    totalCorrect: 0,
    totalWrong: 0,
    totalEncounters: 0,
    totalPlayTimeMs: 0,
    totalCardsStudied: 0,
    perfectRuns: 0,
    continuesUsed: 0,

    dailyStreak: 0,
    streakShields: 0,
    tournamentTop10Weeks: [],
    lastCompletedDailyDate: null,
    lastLoginDate: null,
    loginStreak: 0,

    achievements: [],
    ownedItems: ['avatar_intern', 'hat_none', 'trail_none', 'gear_none', 'cloth_none', 'monster_classic'],
    equipped: {
      monster: 'monster_classic',
      skin: 'avatar_intern',
      hat: 'hat_none',
      trail: 'trail_none',
      gear: 'gear_none',
      clothing: 'cloth_none'
    },

    questState: {},

    // Multiplayer stats
    multiplayerGamesPlayed: 0,
    multiplayerWins: 0,

    // Flashcard stats
    flashcardSessions: 0,
    flashcardCorrect: 0,
    flashcardWrong: 0,

    // Performance stats
    fastestCorrectAnswerMs: null,
    longestSessionMs: 0
  },

  // --- Cards ---
  cards: {
    cardStats: {},
    subjectStats: {},
    disabledCardIds: [],
    cardReports: []
  },

  // --- Profile ---
  profile: {
    name: '',
    picture: 'avatar_intern',
    visible: false,
    selectedBadges: []
  },

  // --- Social ---
  social: {
    authenticatedUserId: null
  },

  // --- History ---
  history: {
    completedRunIds: [],
    completedFlashcardSessionIds: [],
    recentRuns: [],
    calendarData: {},
    dailyCounts: {},
    weeklyClaims: {},
    examResults: [],
    completedExamIds: []
  },

  // --- Idempotency ---
  idempotency: {
    progressionEventIds: []
  },

  // --- Legacy compat ---
  firstRunComplete: false,
  konamiUsed: false
};

// ===== UTILITIES =====

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Deep merge: for each key in defaults, if the stored value exists and is
 * the same type, keep it; otherwise use the default. For nested objects,
 * recurse. This ensures new fields are always present.
 */
function deepMerge(stored, defaults) {
  if (stored === null || stored === undefined || typeof stored !== 'object' || typeof defaults !== 'object') {
    return deepClone(defaults);
  }
  if (Array.isArray(defaults)) {
    // For arrays, keep stored if it's an array, else use default
    return Array.isArray(stored) ? stored : deepClone(defaults);
  }
  var result = {};
  for (var key in defaults) {
    if (!Object.prototype.hasOwnProperty.call(defaults, key)) continue;
    if (Object.prototype.hasOwnProperty.call(stored, key)) {
      if (typeof defaults[key] === 'object' && defaults[key] !== null && !Array.isArray(defaults[key])) {
        result[key] = deepMerge(stored[key], defaults[key]);
      } else {
        // Keep stored value (preserves zero, false, empty string, empty array)
        result[key] = stored[key];
      }
    } else {
      result[key] = deepClone(defaults[key]);
    }
  }
  return result;
}

function localDateKey(date) {
  var y = date.getFullYear();
  var m = String(date.getMonth() + 1).padStart(2, '0');
  var d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

function todayKey() {
  return localDateKey(new Date());
}

/** Local date key for `offset` days from today (negative = past). */
function dayKeyOffset(offset) {
  var d = new Date();
  d.setDate(d.getDate() + offset);
  return localDateKey(d);
}

/** The seven local date keys (Monday..Sunday) of the week containing today. */
function currentWeekKeys() {
  var d = new Date();
  var mondayOffset = -((d.getDay() + 6) % 7);
  var keys = [];
  for (var i = 0; i < 7; i++) keys.push(dayKeyOffset(mondayOffset + i));
  return keys;
}

function yesterdayKey() {
  var d = new Date();
  d.setDate(d.getDate() - 1);
  return localDateKey(d);
}

// ===== LEGACY MIGRATION =====

/**
 * Migrate from schema version 1 (or unversioned) to schema version 2.
 * Maps old flat structure to new nested structure.
 */
function migrateFromV1(old) {
  var data = deepClone(DEFAULTS);

  // --- Settings ---
  if (Array.isArray(old.selectedSubjects)) data.settings.selectedSubjects = old.selectedSubjects;
  if (Array.isArray(old.selectedExams)) data.settings.selectedExams = old.selectedExams;
  if (Array.isArray(old.selectedQuestionTypes)) data.settings.selectedQuestionTypes = old.selectedQuestionTypes;
  if (Array.isArray(old.selectedSources)) data.settings.selectedSources = old.selectedSources;
  if (Array.isArray(old.selectedYears)) data.settings.selectedYears = old.selectedYears;
  if (typeof old.highYieldOnly === 'boolean') data.settings.highYieldOnly = old.highYieldOnly;
  if (typeof old.userSpeed === 'number') data.settings.userSpeed = old.userSpeed;

  // Volume: use nullish coalescing to preserve zero
  data.settings.masterVolume = old.masterVolume ?? DEFAULTS.settings.masterVolume;
  data.settings.musicVolume = old.musicVolume ?? DEFAULTS.settings.musicVolume;
  data.settings.sfxVolume = old.sfxVolume ?? DEFAULTS.settings.sfxVolume;

  if (typeof old.musicOn === 'boolean') data.settings.musicOn = old.musicOn;
  if (typeof old.ttsEnabled === 'boolean') data.settings.ttsEnabled = old.ttsEnabled;
  if (typeof old.nightMode === 'boolean') data.settings.nightMode = old.nightMode;
  if (typeof old.reducedMotion === 'boolean') data.settings.reducedMotion = old.reducedMotion;
  if (typeof old.speedTimerEnabled === 'boolean') data.settings.speedTimerEnabled = old.speedTimerEnabled;
  if (typeof old.cardFreshnessWeight === 'number') data.settings.cardFreshnessWeight = old.cardFreshnessWeight;

  // --- Progression ---
  if (typeof old.coins === 'number') data.progression.coins = old.coins;
  if (typeof old.totalCoins === 'number') data.progression.totalCoinsEarned = old.totalCoins;
  if (typeof old.bestScore === 'number') data.progression.bestScore = old.bestScore;
  if (typeof old.bestStreak === 'number') data.progression.bestStreak = old.bestStreak;
  if (typeof old.totalCorrect === 'number') data.progression.totalCorrect = old.totalCorrect;
  if (typeof old.totalWrong === 'number') data.progression.totalWrong = old.totalWrong;
  if (typeof old.totalEncounters === 'number') data.progression.totalEncounters = old.totalEncounters;
  if (typeof old.continuesUsed === 'number') data.progression.continuesUsed = old.continuesUsed;
  if (typeof old.dailyStreak === 'number') data.progression.dailyStreak = old.dailyStreak;

  // Play time: old was in seconds, new is in ms
  if (typeof old.totalPlayTime === 'number') data.progression.totalPlayTimeMs = old.totalPlayTime * 1000;
  if (typeof old.totalCardsStudied === 'number') data.progression.totalCardsStudied = old.totalCardsStudied;

  // Login
  if (old.lastLoginDate) data.progression.lastLoginDate = old.lastLoginDate;
  if (typeof old.loginStreak === 'number') data.progression.loginStreak = old.loginStreak;

  // Daily: map old field names
  if (old.lastDaily) data.progression.lastCompletedDailyDate = old.lastDaily;

  // Achievements: repair IDs
  if (Array.isArray(old.achievements)) {
    data.progression.achievements = repairAchievementIds(old.achievements);
  }

  // Owned items
  if (Array.isArray(old.ownedItems)) {
    data.progression.ownedItems = old.ownedItems.slice();
    // Ensure defaults are present
    var requiredItems = ['avatar_intern', 'hat_none', 'trail_none', 'gear_none', 'cloth_none', 'monster_classic'];
    for (var ri = 0; ri < requiredItems.length; ri++) {
      if (data.progression.ownedItems.indexOf(requiredItems[ri]) < 0) {
        data.progression.ownedItems.push(requiredItems[ri]);
      }
    }
  }

  // Equipped
  if (old.equipped && typeof old.equipped === 'object') {
    data.progression.equipped.skin = old.equipped.skin || 'avatar_intern';
    data.progression.equipped.hat = old.equipped.hat || 'hat_none';
    data.progression.equipped.trail = old.equipped.trail || 'trail_none';
    data.progression.equipped.gear = old.equipped.gear || 'gear_none';
    data.progression.equipped.clothing = old.equipped.clothing || 'cloth_none';
  }

  // Quest state: migrate old flat questProgress to new format
  if (old.questProgress && typeof old.questProgress === 'object') {
    var today = todayKey();
    var migratedQuests = {};
    for (var qId in old.questProgress) {
      if (Object.prototype.hasOwnProperty.call(old.questProgress, qId)) {
        migratedQuests[qId] = {
          progress: old.questProgress[qId],
          completed: false,
          claimed: false,
          completedAt: null,
          claimedAt: null
        };
      }
    }
    data.progression.questState[today] = migratedQuests;
  }

  // Multiplayer stats
  if (typeof old.multiplayerGamesPlayed === 'number') data.progression.multiplayerGamesPlayed = old.multiplayerGamesPlayed;
  if (typeof old.multiplayerWins === 'number') data.progression.multiplayerWins = old.multiplayerWins;

  // Flashcard stats
  if (typeof old.flashcardSessions === 'number') data.progression.flashcardSessions = old.flashcardSessions;
  if (typeof old.flashcardCorrect === 'number') data.progression.flashcardCorrect = old.flashcardCorrect;
  if (typeof old.flashcardWrong === 'number') data.progression.flashcardWrong = old.flashcardWrong;

  // Performance
  if (typeof old.fastestCorrectAnswer === 'number' && old.fastestCorrectAnswer < 99999) {
    data.progression.fastestCorrectAnswerMs = old.fastestCorrectAnswer;
  }
  if (typeof old.longestSession === 'number') data.progression.longestSessionMs = old.longestSession * 1000;

  // --- Cards ---
  if (old.cardStats && typeof old.cardStats === 'object') data.cards.cardStats = old.cardStats;
  if (old.subjectStats && typeof old.subjectStats === 'object') data.cards.subjectStats = old.subjectStats;
  if (Array.isArray(old.disabledCards)) data.cards.disabledCardIds = old.disabledCards;
  if (Array.isArray(old.cardReports)) data.cards.cardReports = old.cardReports;

  // --- Profile ---
  if (typeof old.profileName === 'string') data.profile.name = old.profileName;
  if (typeof old.profilePicture === 'string') data.profile.picture = old.profilePicture;
  if (typeof old.profileVisible === 'boolean') data.profile.visible = old.profileVisible;
  if (Array.isArray(old.selectedBadges)) data.profile.selectedBadges = old.selectedBadges;

  // --- History ---
  if (old.calendarData && typeof old.calendarData === 'object') data.history.calendarData = old.calendarData;

  // --- Legacy flags ---
  if (typeof old.firstRunComplete === 'boolean') data.firstRunComplete = old.firstRunComplete;
  if (typeof old.konamiUsed === 'boolean') data.konamiUsed = old.konamiUsed;

  // --- DELETE legacy API keys ---
  // old.ankiApiKey is intentionally NOT migrated

  // --- DELETE legacy fields ---
  // old.leaderboardPlayerId — not migrated (use auth)
  // old.friendsList — not migrated (use auth)

  return data;
}

/**
 * Repair achievement IDs from legacy saves.
 * Maps old inconsistent IDs to canonical ones from ACHIEVEMENT_IDS.
 */
function repairAchievementIds(oldAchievements) {
  if (!ACHIEVEMENT_IDS) return oldAchievements;

  // Build a set of all valid canonical IDs
  var validIds = {};
  for (var key in ACHIEVEMENT_IDS) {
    if (Object.prototype.hasOwnProperty.call(ACHIEVEMENT_IDS, key)) {
      validIds[ACHIEVEMENT_IDS[key]] = true;
    }
  }

  // Known legacy mappings
  var legacyMap = {
    'ach_speed_500ms': 'ach_fast_500ms',
    'ach_speed_300ms': 'ach_fast_300ms',
    'ach_collector_10': 'ach_collect_10',
    'ach_collector_25': 'ach_collect_25',
    'ach_collector_50': 'ach_collect_all',
    'ach_mp_first_game': 'ach_mp_first',
    'ach_mp_first_win': 'ach_mp_win',
    'ach_mp_10_wins': 'ach_mp_win5',
    'ach_playtime_30min': 'ach_endurance_30min',
    'ach_playtime_1hr': 'ach_endurance_1hr',
    'ach_studied_500': 'ach_encounters_500',
    'ach_studied_1000': 'ach_encounters_1000',
    'ach_flashcard_first': 'ach_flashcard_first',
    'ach_flashcard_10': 'ach_flashcard_10',
    'ach_perfect_10': 'ach_perfect_10',
    'ach_perfect_50': 'ach_perfect_50',
    'ach_master_1_subject': 'ach_master_1_subject',
    'ach_master_5_subjects': 'ach_master_5_subjects',
    'ach_master_10_subjects': 'ach_master_10_subjects',
    'ach_master_all_subjects': 'ach_master_all_subjects'
  };

  var result = [];
  var seen = {};

  for (var i = 0; i < oldAchievements.length; i++) {
    var id = oldAchievements[i];
    // Try legacy mapping first
    if (legacyMap[id]) {
      id = legacyMap[id];
    }
    // Only keep if it's a valid canonical ID and not a duplicate
    if (validIds[id] && !seen[id]) {
      result.push(id);
      seen[id] = true;
    } else if (!validIds[id]) {
      // Keep unknown IDs that might be from shopdata we haven't mapped
      // This is conservative — better to keep than lose
      if (!seen[id]) {
        result.push(id);
        seen[id] = true;
      }
    }
  }

  return result;
}

// ===== QUEST EVENT MAPPING =====

/**
 * Maps progression event types to quest progress increments.
 * The engine never references quest IDs directly — it emits events,
 * and this mapping translates them to quest progress.
 */
var QUEST_EVENT_MAP = null;

function getQuestEventMap() {
  if (QUEST_EVENT_MAP) return QUEST_EVENT_MAP;

  // Build map from QUESTS definitions if they have eventType
  // Fallback: hardcode the mappings based on known quest structure
  QUEST_EVENT_MAP = {};

  if (QUEST_IDS) {
    // Map progression event names to quest IDs and increments
    // These map from semantic event types to the quest they advance
    var mappings = [
      { event: 'encounter_resolved', questId: QUEST_IDS.MARATHON, increment: 1 },
      { event: 'correct_answer', questId: QUEST_IDS.SHARP_MIND, increment: 1 },
      { event: 'coin_collected', questId: QUEST_IDS.COIN_COLLECTOR, increment: 1 },
      { event: 'powerup_collected', questId: QUEST_IDS.POWERED_UP, increment: 1 },
      { event: 'streak_reached', questId: QUEST_IDS.HOT_STREAK, increment: 1 },
      { event: 'daily_completed', questId: QUEST_IDS.DAILY_ROUNDS, increment: 1 },
      { event: 'rush_used', questId: QUEST_IDS.RUSH_HOUR, increment: 1 },
      { event: 'obstacle_jumped', questId: QUEST_IDS.PARKOUR_PRO, increment: 1 },
      { event: 'obstacle_slid', questId: QUEST_IDS.LIMBO_MASTER, increment: 1 }
    ];

    for (var i = 0; i < mappings.length; i++) {
      var m = mappings[i];
      if (m.questId) {
        if (!QUEST_EVENT_MAP[m.event]) {
          QUEST_EVENT_MAP[m.event] = [];
        }
        QUEST_EVENT_MAP[m.event].push({ questId: m.questId, increment: m.increment });
      }
    }
  }

  return QUEST_EVENT_MAP;
}

// ===== STORAGE CLASS =====

class Storage {
  constructor() {
    this.data = null;
  }

  // --- Core load/save ---

  load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);

        // Check schema version
        if (parsed.schemaVersion === SCHEMA_VERSION) {
          // Same version: deep merge with defaults to pick up any new fields
          this.data = deepMerge(parsed, DEFAULTS);
        } else if (parsed.schemaVersion === undefined || parsed.schemaVersion < SCHEMA_VERSION) {
          // Legacy data: migrate
          if (parsed.schemaVersion === undefined && parsed.coins !== undefined) {
            // V1 flat format
            this.data = migrateFromV1(parsed);
          } else {
            // Unknown older version — attempt merge with defaults
            this.data = deepMerge(parsed, DEFAULTS);
          }
          this.data.schemaVersion = SCHEMA_VERSION;
          this.save();
        } else {
          // Future version — use defaults rather than corrupt
          console.warn('[Storage] Future schema version detected, using defaults');
          this.data = deepClone(DEFAULTS);
          // Don't save — preserve the future data in case of downgrade
        }
      } else {
        this.data = deepClone(DEFAULTS);
      }
    } catch (e) {
      console.warn('[Storage] Corrupt data, using defaults:', e.message);
      this.data = deepClone(DEFAULTS);
    }

    this._ensureInvariants();
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn('[Storage] Save failed:', e.message);
    }
    // Lets cloud sync notice changes without storage knowing about it.
    if (typeof this.onChange === 'function') {
      try { this.onChange(); } catch (e) { /* a listener must never break saving */ }
    }
  }

  /**
   * Ensure data invariants after load/migration.
   */
  _ensureInvariants() {
    var d = this.data;
    if (!d) return;

    // Ensure required owned items
    var requiredItems = ['avatar_intern', 'avatar_classic', 'hat_none', 'trail_none', 'gear_none', 'cloth_none', 'monster_classic'];
    for (var i = 0; i < requiredItems.length; i++) {
      if (d.progression.ownedItems.indexOf(requiredItems[i]) < 0) {
        d.progression.ownedItems.push(requiredItems[i]);
      }
    }

    // The Intern became an animated 3D model, which cannot wear hats, gear or
    // outfits. Players who had dressed the old Intern stay on the classic one.
    if (!d.progression.modelIntroSeen) {
      d.progression.modelIntroSeen = true;
      var eq = d.progression.equipped;
      if (eq.skin === 'avatar_intern' && ((eq.hat && eq.hat !== 'hat_none') || (eq.gear && eq.gear !== 'gear_none') || (eq.clothing && eq.clothing !== 'cloth_none'))) {
        eq.skin = 'avatar_classic';
      }
    }

    // Ensure equipped slots exist
    if (!d.progression.equipped.skin) d.progression.equipped.skin = 'avatar_intern';
    if (!d.progression.equipped.hat) d.progression.equipped.hat = 'hat_none';
    if (!d.progression.equipped.trail) d.progression.equipped.trail = 'trail_none';
    if (!d.progression.equipped.gear) d.progression.equipped.gear = 'gear_none';
    if (!d.progression.equipped.clothing) d.progression.equipped.clothing = 'cloth_none';

    // Ensure arrays
    if (!Array.isArray(d.progression.achievements)) d.progression.achievements = [];
    if (!Array.isArray(d.progression.ownedItems)) d.progression.ownedItems = [];
    if (!Array.isArray(d.cards.disabledCardIds)) d.cards.disabledCardIds = [];
    if (!Array.isArray(d.cards.cardReports)) d.cards.cardReports = [];
    if (!Array.isArray(d.profile.selectedBadges)) d.profile.selectedBadges = [];
    if (!Array.isArray(d.history.completedRunIds)) d.history.completedRunIds = [];
    if (!Array.isArray(d.history.completedFlashcardSessionIds)) d.history.completedFlashcardSessionIds = [];
    if (!Array.isArray(d.idempotency.progressionEventIds)) d.idempotency.progressionEventIds = [];

    // Ensure objects
    if (typeof d.cards.cardStats !== 'object' || d.cards.cardStats === null) d.cards.cardStats = {};
    if (typeof d.cards.subjectStats !== 'object' || d.cards.subjectStats === null) d.cards.subjectStats = {};
    if (typeof d.progression.questState !== 'object' || d.progression.questState === null) d.progression.questState = {};
    if (typeof d.history.calendarData !== 'object' || d.history.calendarData === null) d.history.calendarData = {};
    if (typeof d.history.dailyCounts !== 'object' || d.history.dailyCounts === null) d.history.dailyCounts = {};
    if (typeof d.history.weeklyClaims !== 'object' || d.history.weeklyClaims === null) d.history.weeklyClaims = {};
    if (!Array.isArray(d.history.examResults)) d.history.examResults = [];
    if (!Array.isArray(d.history.completedExamIds)) d.history.completedExamIds = [];
  }

  // --- Generic getters/setters (backward compat layer) ---
  // These provide a flat access pattern for code that hasn't been
  // migrated to the new nested structure yet.

  get(key) {
    if (!this.data) this.load();

    // Settings
    if (key in this.data.settings) return this.data.settings[key];
    // Progression
    if (key in this.data.progression) return this.data.progression[key];
    // Cards
    if (key in this.data.cards) return this.data.cards[key];
    // Profile
    if (key in this.data.profile) return this.data.profile[key];
    // History
    if (key in this.data.history) return this.data.history[key];
    // Top-level legacy
    if (key in this.data) return this.data[key];

    // Compatibility aliases
    switch (key) {
      case 'coins': return this.data.progression.coins;
      case 'totalCoins': return this.data.progression.totalCoinsEarned;
      case 'bestScore': return this.data.progression.bestScore;
      case 'bestStreak': return this.data.progression.bestStreak;
      case 'totalCorrect': return this.data.progression.totalCorrect;
      case 'totalWrong': return this.data.progression.totalWrong;
      case 'totalEncounters': return this.data.progression.totalEncounters;
      case 'dailyStreak': return this.data.progression.dailyStreak;
      case 'dailyDone': return this._isDailyDone();
      case 'lastDaily': return this.data.progression.lastCompletedDailyDate;
      case 'ownedItems': return this.data.progression.ownedItems;
      case 'equipped': return this.data.progression.equipped;
      case 'achievements': return this.data.progression.achievements;
      case 'cardStats': return this.data.cards.cardStats;
      case 'subjectStats': return this.data.cards.subjectStats;
      case 'disabledCards': return this.data.cards.disabledCardIds;
      case 'cardReports': return this.data.cards.cardReports;
      case 'profileName': return this.data.profile.name;
      case 'profilePicture': return this.data.profile.picture;
      case 'profileVisible': return this.data.profile.visible;
      case 'selectedBadges': return this.data.profile.selectedBadges;
      case 'calendarData': return this.data.history.calendarData;
      case 'examResults': return this.data.history.examResults;
      case 'questCompletionDates': return this._getQuestCompletionDates();
      case 'totalPlayTime': return Math.round(this.data.progression.totalPlayTimeMs / 1000);
      case 'totalCardsStudied': return this.data.progression.totalCardsStudied;
      case 'fastestCorrectAnswer': return this.data.progression.fastestCorrectAnswerMs ?? 99999;
      case 'longestSession': return Math.round(this.data.progression.longestSessionMs / 1000);
      case 'lastLoginDate': return this.data.progression.lastLoginDate;
      case 'loginStreak': return this.data.progression.loginStreak;
      case 'multiplayerGamesPlayed': return this.data.progression.multiplayerGamesPlayed;
      case 'multiplayerWins': return this.data.progression.multiplayerWins;
      case 'flashcardSessions': return this.data.progression.flashcardSessions;
      case 'flashcardCorrect': return this.data.progression.flashcardCorrect;
      case 'flashcardWrong': return this.data.progression.flashcardWrong;
      case 'perfectRuns': return this.data.progression.perfectRuns;
      case 'continuesUsed': return this.data.progression.continuesUsed;
      case 'flags': return []; // Legacy — deprecated
      case 'questProgress': return this._getLegacyQuestProgress();
      default: return undefined;
    }
  }

  set(key, value) {
    if (!this.data) this.load();

    // Settings
    if (key in this.data.settings) { this.data.settings[key] = value; this.save(); return; }
    // Progression
    if (key in this.data.progression) { this.data.progression[key] = value; this.save(); return; }

    // Compatibility aliases
    switch (key) {
      case 'coins': this.data.progression.coins = value; break;
      case 'totalCoins': this.data.progression.totalCoinsEarned = value; break;
      case 'bestScore': this.data.progression.bestScore = value; break;
      case 'bestStreak': this.data.progression.bestStreak = value; break;
      case 'totalCorrect': this.data.progression.totalCorrect = value; break;
      case 'totalWrong': this.data.progression.totalWrong = value; break;
      case 'totalEncounters': this.data.progression.totalEncounters = value; break;
      case 'dailyStreak': this.data.progression.dailyStreak = value; break;
      case 'dailyDone':
        if (value === true) {
          this.data.progression.lastCompletedDailyDate = todayKey();
        }
        break;
      case 'lastDaily': this.data.progression.lastCompletedDailyDate = value; break;
      case 'ownedItems': this.data.progression.ownedItems = value; break;
      case 'equipped': this.data.progression.equipped = value; break;
      case 'achievements': this.data.progression.achievements = value; break;
      case 'cardStats': this.data.cards.cardStats = value; break;
      case 'subjectStats': this.data.cards.subjectStats = value; break;
      case 'disabledCards': this.data.cards.disabledCardIds = value; break;
      case 'cardReports': this.data.cards.cardReports = value; break;
      case 'profileName': this.data.profile.name = String(value || '').slice(0, 30); break;
      case 'profilePicture': this.data.profile.picture = value; break;
      case 'profileVisible': this.data.profile.visible = !!value; break;
      case 'selectedBadges': this.data.profile.selectedBadges = value; break;
      case 'calendarData': this.data.history.calendarData = value; break;
      case 'lastLoginDate': this.data.progression.lastLoginDate = value; break;
      case 'loginStreak': this.data.progression.loginStreak = value; break;
      case 'totalPlayTime': this.data.progression.totalPlayTimeMs = (value || 0) * 1000; break;
      case 'totalCardsStudied': this.data.progression.totalCardsStudied = value; break;
      case 'multiplayerGamesPlayed': this.data.progression.multiplayerGamesPlayed = value; break;
      case 'multiplayerWins': this.data.progression.multiplayerWins = value; break;
      case 'flashcardSessions': this.data.progression.flashcardSessions = value; break;
      case 'flashcardCorrect': this.data.progression.flashcardCorrect = value; break;
      case 'flashcardWrong': this.data.progression.flashcardWrong = value; break;
      case 'questProgress': /* ignore legacy writes */ break;
      case 'firstRunComplete': this.data.firstRunComplete = value; break;
      case 'konamiUsed': this.data.konamiUsed = value; break;
      default:
        // Store at top level for any unknown keys (backward compat)
        this.data[key] = value;
        break;
    }
    this.save();
  }

  // ===== EXAM SIMULATION =====

  /**
   * Persist a finished exam. Idempotent by examId.
   * Updates per-card and per-subject stats (feeding spaced repetition) and
   * keeps the last 20 results for the history line on the setup screen.
   */
  finalizeExamSession(summary) {
    if (!this.data) this.load();
    var h = this.data.history;
    if (h.completedExamIds.indexOf(summary.examId) >= 0) return { applied: false, duplicate: true };

    (summary.cardResults || []).forEach(function (r) {
      if (!r.answered || !r.cardId) return;
      this.updateCardStat(r.cardId, !!r.correct);
      if (r.subject) this.updateSubjectStat(r.subject, !!r.correct);
    }, this);

    h.examResults.push({
      examId: summary.examId,
      date: summary.date,
      total: summary.total,
      correct: summary.correct,
      accuracy: summary.accuracy,
      durationSec: summary.durationSec,
      bySubject: summary.bySubject
    });
    if (h.examResults.length > 20) h.examResults = h.examResults.slice(-20);
    h.completedExamIds.push(summary.examId);
    if (h.completedExamIds.length > 100) h.completedExamIds = h.completedExamIds.slice(-100);

    this.addStudiedToday((summary.correct || 0) + (summary.wrong || 0));
    this.save();
    return { applied: true, duplicate: false };
  }

  // ===== STREAK STATUS & WEEKLY GOAL =====

  /**
   * Current daily-challenge streak as the player should see it: a streak that
   * lapsed (no shield available) reads as 0.
   */
  getStreakStatus() {
    var p = this.data.progression;
    var last = p.lastCompletedDailyDate;
    var streak = p.dailyStreak || 0;
    var live = last === todayKey() || last === yesterdayKey() ||
      (last === dayKeyOffset(-2) && (p.streakShields || 0) > 0);
    return {
      streak: live ? streak : 0,
      shields: p.streakShields || 0,
      playedToday: last === todayKey()
    };
  }

  /** Days this week (Mon-Sun) on which the daily card goal was met. */
  getWeeklyProgress() {
    var goal = this.data.settings.dailyGoal || 20;
    var counts = this.data.history.dailyCounts;
    var keys = currentWeekKeys();
    var days = keys.filter(function (k) { return (counts[k] || 0) >= goal; }).length;
    return {
      weekKey: keys[0],
      daysMet: days,
      target: 5,
      reward: 250,
      claimed: !!this.data.history.weeklyClaims[keys[0]]
    };
  }

  /** Claim the weekly goal reward once per week. */
  claimWeeklyGoal() {
    var w = this.getWeeklyProgress();
    if (w.claimed) return { success: false, error: 'Already claimed this week.' };
    if (w.daysMet < w.target) return { success: false, error: 'Goal not met yet.' };
    this.data.history.weeklyClaims[w.weekKey] = true;
    this.data.progression.coins += w.reward;
    this.data.progression.totalCoinsEarned += w.reward;
    var keys = Object.keys(this.data.history.weeklyClaims).sort();
    while (keys.length > 12) delete this.data.history.weeklyClaims[keys.shift()];
    this.save();
    return { success: true, reward: w.reward };
  }

  /** Cards studied so far this local week (Mon-Sun); used for group goals. */
  getWeeklyCards() {
    var counts = this.data.history.dailyCounts;
    return currentWeekKeys().reduce(function (sum, k) { return sum + (counts[k] || 0); }, 0);
  }

  /** Record a top-10% weekly tournament finish once per week. @returns {boolean} true if newly earned */
  recordTournamentTop10(weekKey) {
    var list = this.data.progression.tournamentTop10Weeks;
    if (!Array.isArray(list)) list = this.data.progression.tournamentTop10Weeks = [];
    if (list.indexOf(weekKey) >= 0) return false;
    list.push(weekKey);
    this.save();
    return true;
  }

  getTodayKey() {
    return todayKey();
  }

  // ===== DAILY STUDY GOAL =====

  addStudiedToday(count) {
    if (!count) return;
    var counts = this.data.history.dailyCounts;
    var key = todayKey();
    counts[key] = (counts[key] || 0) + count;
    // Keep ~90 days
    var keys = Object.keys(counts).sort();
    while (keys.length > 90) delete counts[keys.shift()];
  }

  getStudiedToday() {
    return this.data.history.dailyCounts[todayKey()] || 0;
  }

  // ===== DAILY HELPERS =====

  _isDailyDone() {
    return this.data.progression.lastCompletedDailyDate === todayKey();
  }

  checkDailyReset() {
    if (!this.data) this.load();
    // Quest state is per-day, so no explicit reset needed.
    // The legacy dailyDone is now date-based.
  }

  _getQuestCompletionDates() {
    // Derive from quest state: dates where all quests were completed
    var result = {};
    var qs = this.data.progression.questState;
    for (var dateKey in qs) {
      if (!Object.prototype.hasOwnProperty.call(qs, dateKey)) continue;
      var allComplete = true;
      var hasQuests = false;
      for (var qId in qs[dateKey]) {
        if (Object.prototype.hasOwnProperty.call(qs[dateKey], qId)) {
          hasQuests = true;
          if (!qs[dateKey][qId].completed) {
            allComplete = false;
            break;
          }
        }
      }
      if (hasQuests && allComplete) {
        result[dateKey] = true;
      }
    }
    return result;
  }

  _getLegacyQuestProgress() {
    // Return flat quest progress for today (backward compat)
    var today = todayKey();
    var todayState = this.data.progression.questState[today];
    if (!todayState) return {};
    var result = {};
    for (var qId in todayState) {
      if (Object.prototype.hasOwnProperty.call(todayState, qId)) {
        result[qId] = todayState[qId].progress || 0;
      }
    }
    return result;
  }

  // ===== CARD STATS =====

  getCardStat(cardId) {
    var stats = this.data.cards.cardStats;
    return stats[cardId] || { seen: 0, correct: 0, wrong: 0, lastSeen: 0 };
  }

  updateCardStat(cardId, wasCorrect) {
    var stats = this.data.cards.cardStats;
    var s = stats[cardId] || { seen: 0, correct: 0, wrong: 0, lastSeen: 0 };
    s.seen++;
    if (wasCorrect) s.correct++;
    else s.wrong++;
    s.lastSeen = Date.now();

    // Spaced-repetition schedule (SM-2 style). Correct answers push the next
    // review further out; a miss brings the card back within minutes.
    var DAY = 24 * 60 * 60 * 1000;
    var ease = typeof s.ease === 'number' ? s.ease : 2.5;
    var reps = s.reps || 0;
    var interval = s.interval || 0; // days
    if (wasCorrect) {
      reps++;
      interval = reps === 1 ? 1 : reps === 2 ? 3 : Math.round(interval * ease);
      ease = Math.min(3, ease + 0.05);
      s.due = s.lastSeen + interval * DAY;
    } else {
      reps = 0;
      interval = 0;
      ease = Math.max(1.3, ease - 0.2);
      s.due = s.lastSeen + 10 * 60 * 1000;
    }
    s.ease = ease;
    s.reps = reps;
    s.interval = interval;

    stats[cardId] = s;
    this.save();
  }

  /**
   * Count cards that have been studied before and are due for review now.
   * @param {string[]} [cardIds] - restrict to these ids (default: all tracked)
   */
  getDueCount(cardIds) {
    var stats = this.data.cards.cardStats;
    var now = Date.now();
    var ids = cardIds || Object.keys(stats);
    var due = 0;
    for (var i = 0; i < ids.length; i++) {
      var s = stats[ids[i]];
      if (s && s.seen > 0 && typeof s.due === 'number' && s.due <= now) due++;
    }
    return due;
  }

  // ===== SUBJECT STATS =====

  getSubjectStat(subject) {
    var stats = this.data.cards.subjectStats;
    return stats[subject] || { correct: 0, wrong: 0 };
  }

  updateSubjectStat(subject, wasCorrect) {
    var stats = this.data.cards.subjectStats;
    var s = stats[subject] || { correct: 0, wrong: 0 };
    if (wasCorrect) s.correct++;
    else s.wrong++;
    stats[subject] = s;
    this.save();
  }

  // ===== SHOP =====

  ownsItem(itemId) {
    return this.data.progression.ownedItems.indexOf(itemId) >= 0;
  }

  buyItem(itemId, price) {
    var coins = this.data.progression.coins;
    if (coins < price) return false;
    this.data.progression.coins = coins - price;
    var owned = this.data.progression.ownedItems;
    if (owned.indexOf(itemId) < 0) {
      owned.push(itemId);
    }
    this.save();
    return true;
  }

  equipItem(itemId, slot) {
    var eq = this.data.progression.equipped;
    eq[slot] = itemId;
    this.save();
  }

  // ===== COINS =====

  addCoins(amount) {
    if (typeof amount !== 'number' || amount <= 0) return;
    this.data.progression.coins += amount;
    this.data.progression.totalCoinsEarned += amount;
    this.save();
  }

  spendCoins(amount) {
    if (this.data.progression.coins < amount) return false;
    this.data.progression.coins -= amount;
    this.save();
    return true;
  }

  // ===== ACHIEVEMENTS =====

  hasAchievement(achId) {
    return this.data.progression.achievements.indexOf(achId) >= 0;
  }

  unlockAchievement(achId) {
    if (this.hasAchievement(achId)) return false;
    this.data.progression.achievements.push(achId);
    this.save();
    return true;
  }

  getAchievementCount() {
    return this.data.progression.achievements.length;
  }

  // ===== QUEST PROGRESS =====

  getQuestProgress(questId) {
    var today = todayKey();
    var todayState = this.data.progression.questState[today];
    if (!todayState || !todayState[questId]) return 0;
    return todayState[questId].progress || 0;
  }

  /** Whether a quest's reward was already claimed on the given day. */
  isQuestClaimed(questId, dateKey) {
    var day = this.data.progression.questState[dateKey || todayKey()];
    return !!(day && day[questId] && day[questId].claimed);
  }

  /**
   * Increment quest progress for today. Used by backward-compat code.
   * Preferred path: use progression.recordEvent() instead.
   */
  incrementQuest(questId, amount) {
    var today = todayKey();
    if (!this.data.progression.questState[today]) {
      this.data.progression.questState[today] = {};
    }
    var qs = this.data.progression.questState[today];
    if (!qs[questId]) {
      qs[questId] = { progress: 0, completed: false, claimed: false, completedAt: null, claimedAt: null };
    }
    qs[questId].progress += (amount || 1);

    // Check completion
    var questDef = this._getQuestDef(questId);
    if (questDef && qs[questId].progress >= questDef.target && !qs[questId].completed) {
      qs[questId].completed = true;
      qs[questId].completedAt = Date.now();
    }

    this.save();
  }

  _getQuestDef(questId) {
    if (!QUESTS) return null;
    for (var i = 0; i < QUESTS.length; i++) {
      if (QUESTS[i].id === questId) return QUESTS[i];
    }
    return null;
  }

  /**
   * Claim a completed quest reward. Atomic and idempotent.
   */
  claimQuest(questId, dateKey) {
    if (!dateKey) dateKey = todayKey();
    var dayState = this.data.progression.questState[dateKey];
    if (!dayState || !dayState[questId]) {
      return { success: false, alreadyClaimed: false, reward: 0, newCoinBalance: this.data.progression.coins, error: 'Quest not found for this date' };
    }

    var qs = dayState[questId];

    // Already claimed — idempotent
    if (qs.claimed) {
      return { success: false, alreadyClaimed: true, reward: 0, newCoinBalance: this.data.progression.coins, error: null };
    }

    // Not completed
    if (!qs.completed) {
      return { success: false, alreadyClaimed: false, reward: 0, newCoinBalance: this.data.progression.coins, error: 'Quest not completed' };
    }

    // Find reward
    var questDef = this._getQuestDef(questId);
    var reward = questDef ? questDef.reward : 0;

    // Atomic claim
    qs.claimed = true;
    qs.claimedAt = Date.now();
    this.data.progression.coins += reward;
    this.data.progression.totalCoinsEarned += reward;
    this.save();

    return { success: true, alreadyClaimed: false, reward: reward, newCoinBalance: this.data.progression.coins, error: null };
  }

  // ===== CARD MANAGEMENT =====

  isCardDisabled(cardId) {
    return this.data.cards.disabledCardIds.indexOf(cardId) >= 0;
  }

  toggleCardDisabled(cardId) {
    var disabled = this.data.cards.disabledCardIds;
    var idx = disabled.indexOf(cardId);
    if (idx >= 0) {
      disabled.splice(idx, 1);
    } else {
      disabled.push(cardId);
    }
    this.save();
  }

  enableCard(cardId) {
    var disabled = this.data.cards.disabledCardIds;
    var idx = disabled.indexOf(cardId);
    if (idx >= 0) {
      disabled.splice(idx, 1);
      this.save();
    }
  }

  disableCard(cardId) {
    var disabled = this.data.cards.disabledCardIds;
    if (disabled.indexOf(cardId) < 0) {
      disabled.push(cardId);
      this.save();
    }
  }

  addCardReport(cardId, reason, text) {
    this.data.cards.cardReports.push({
      cardId: cardId,
      reason: reason || 'other',
      text: text || '',
      date: Date.now()
    });
    this.save();
  }

  getCardReports() {
    return this.data.cards.cardReports;
  }

  clearCardReports() {
    this.data.cards.cardReports = [];
    this.save();
  }

  // ===== RUN FINALIZATION (idempotent by runId) =====

  /**
   * The ONLY way to persist completed run results.
   * Idempotent by summary.runId.
   *
   * @param {object} summary - Canonical run summary from engine
   * @returns {object} { applied, duplicate, newlyUnlockedAchievementIds, completedQuestIds, dailyCompleted, newBestScore, newBestStreak }
   */
  finalizeRun(summary) {
    if (!this.data) this.load();

    var runId = summary.runId;

    // Idempotency check
    if (this.data.history.completedRunIds.indexOf(runId) >= 0) {
      return {
        applied: false,
        duplicate: true,
        newlyUnlockedAchievementIds: [],
        completedQuestIds: [],
        dailyCompleted: false,
        newBestScore: false,
        newBestStreak: false
      };
    }

    var p = this.data.progression;
    var result = {
      applied: true,
      duplicate: false,
      newlyUnlockedAchievementIds: [],
      completedQuestIds: [],
      dailyCompleted: false,
      newBestScore: false,
      newBestStreak: false
    };

    // --- Core stats ---
    p.totalEncounters += summary.encountersCompleted || 0;
    p.totalCorrect += summary.correct || 0;
    p.totalWrong += summary.wrong || 0;
    p.totalCardsStudied += summary.encountersCompleted || 0;
    p.totalPlayTimeMs += summary.durationMs || 0;

    // Coins
    // coinsEarned is the run's full total; coinsCollected (pickups) is a subset of it.
    var totalCoins = summary.coinsEarned || 0;
    p.coins += totalCoins;
    p.totalCoinsEarned += totalCoins;

    // Best score (maximum only)
    if ((summary.score || 0) > p.bestScore) {
      p.bestScore = summary.score;
      result.newBestScore = true;
    }

    // Best streak (maximum only)
    if ((summary.bestStreak || 0) > p.bestStreak) {
      p.bestStreak = summary.bestStreak;
      result.newBestStreak = true;
    }

    // Continues
    p.continuesUsed += summary.continuesUsed || 0;

    // Longest session
    if ((summary.durationMs || 0) > p.longestSessionMs) {
      p.longestSessionMs = summary.durationMs;
    }

    // Fastest correct answer
    if (summary.fastestDecisionMs != null && summary.fastestDecisionMs > 0) {
      if (p.fastestCorrectAnswerMs === null || summary.fastestDecisionMs < p.fastestCorrectAnswerMs) {
        p.fastestCorrectAnswerMs = summary.fastestDecisionMs;
      }
    }

    // Perfect runs
    if (summary.completed && summary.correct > 0 && summary.wrong === 0) {
      p.perfectRuns = (p.perfectRuns || 0) + 1;
    }

    // --- Daily ---
    if (summary.dailyCompleted) {
      var today = todayKey();
      var yesterday = yesterdayKey();

      if (p.lastCompletedDailyDate !== today) {
        if (p.lastCompletedDailyDate === yesterday) {
          p.dailyStreak++;
        } else if (p.lastCompletedDailyDate === dayKeyOffset(-2) && (p.streakShields || 0) > 0 && p.dailyStreak > 0) {
          // Missed exactly one day: a streak shield keeps the streak alive.
          p.streakShields--;
          p.dailyStreak++;
          result.shieldUsed = true;
        } else {
          p.dailyStreak = 1;
        }
        // Earn a shield for every 7-day streak (max 3 banked).
        if (p.dailyStreak > 0 && p.dailyStreak % 7 === 0) {
          p.streakShields = Math.min(3, (p.streakShields || 0) + 1);
          result.shieldEarned = true;
        }
        p.lastCompletedDailyDate = today;
        result.dailyCompleted = true;
      }
    }

    // --- Multiplayer ---
    if (summary.multiplayer && summary.multiplayer.matchId) {
      p.multiplayerGamesPlayed++;
      if (summary.multiplayer.result === 'win') {
        p.multiplayerWins++;
      }
    }

    // --- Per-encounter card/subject stats ---
    if (summary.encounters && Array.isArray(summary.encounters)) {
      for (var ei = 0; ei < summary.encounters.length; ei++) {
        var enc = summary.encounters[ei];
        this.updateCardStat(enc.cardId, enc.correct);
        if (enc.subject) {
          this.updateSubjectStat(enc.subject, enc.correct);
        }
      }
    }

    // --- Calendar ---
    if (summary.encountersCompleted > 0) {
      var calKey = todayKey();
      var total = summary.correct + summary.wrong;
      var acc = total > 0 ? Math.round(summary.correct / total * 100) : 0;
      this.data.history.calendarData[calKey] = acc;
    }
    this.addStudiedToday(summary.encountersCompleted || 0);

    // --- Quest progress from run events ---
    this._processRunQuestProgress(summary);

    // --- Achievements ---
    result.newlyUnlockedAchievementIds = this._evaluateAchievements(summary);

    // --- Store recent run ---
    this.data.history.recentRuns.push({
      runId: runId,
      mode: summary.mode,
      score: summary.score,
      correct: summary.correct,
      wrong: summary.wrong,
      bestStreak: summary.bestStreak,
      date: Date.now()
    });
    // Keep only last 50
    if (this.data.history.recentRuns.length > 50) {
      this.data.history.recentRuns = this.data.history.recentRuns.slice(-50);
    }

    // --- Mark as completed ---
    this.data.history.completedRunIds.push(runId);
    // Cap idempotency list
    if (this.data.history.completedRunIds.length > 200) {
      this.data.history.completedRunIds = this.data.history.completedRunIds.slice(-200);
    }

    this.save();
    return result;
  }

  /**
   * Process quest progress derived from run summary.
   */
  _processRunQuestProgress(summary) {
    var today = todayKey();
    if (!this.data.progression.questState[today]) {
      this.data.progression.questState[today] = {};
    }

    // Encounters
    if (summary.encountersCompleted > 0) {
      this.incrementQuest(QUEST_IDS ? QUEST_IDS.MARATHON : 'q_25enc', summary.encountersCompleted);
    }

    // Correct answers
    if (summary.correct > 0) {
      this.incrementQuest(QUEST_IDS ? QUEST_IDS.SHARP_MIND : 'q_10correct', summary.correct);
    }

    // Best streak in this run
    if (summary.bestStreak >= 8) {
      this.incrementQuest(QUEST_IDS ? QUEST_IDS.HOT_STREAK : 'q_streak8', 1);
    }

    // Coins collected
    if (summary.coinsCollected > 0) {
      this.incrementQuest(QUEST_IDS ? QUEST_IDS.COIN_COLLECTOR : 'q_50coins', summary.coinsCollected);
    }

    // Power-ups collected
    if (summary.powerupsCollected > 0) {
      this.incrementQuest(QUEST_IDS ? QUEST_IDS.POWERED_UP : 'q_3powerups', summary.powerupsCollected);
    }

    // Rushes used
    if (summary.rushesUsed > 0) {
      this.incrementQuest(QUEST_IDS ? QUEST_IDS.RUSH_HOUR : 'q_rush3', summary.rushesUsed);
    }

    // Obstacles jumped/slid
    if (summary.obstaclesJumped > 0) {
      this.incrementQuest(QUEST_IDS ? QUEST_IDS.PARKOUR_PRO : 'q_jump5', summary.obstaclesJumped);
    }
    if (summary.obstaclesSlid > 0) {
      this.incrementQuest(QUEST_IDS ? QUEST_IDS.LIMBO_MASTER : 'q_slide5', summary.obstaclesSlid);
    }

    // Daily completed
    if (summary.dailyCompleted) {
      this.incrementQuest(QUEST_IDS ? QUEST_IDS.DAILY_ROUNDS : 'q_daily', 1);
    }
  }

  // ===== FLASHCARD FINALIZATION (idempotent by sessionId) =====

  /**
   * The ONLY way to persist flashcard session results.
   * Idempotent by summary.sessionId.
   *
   * @param {object} summary - Flashcard session summary
   * @returns {object} { applied, duplicate, newlyUnlockedAchievementIds, completedQuestIds }
   */
  finalizeFlashcardSession(summary) {
    if (!this.data) this.load();

    var sessionId = summary.sessionId;

    // Idempotency check
    if (this.data.history.completedFlashcardSessionIds.indexOf(sessionId) >= 0) {
      return {
        applied: false,
        duplicate: true,
        newlyUnlockedAchievementIds: [],
        completedQuestIds: []
      };
    }

    var p = this.data.progression;

    // Stats
    p.flashcardSessions++;
    p.flashcardCorrect += summary.correct || 0;
    p.flashcardWrong += summary.wrong || 0;
    p.totalCardsStudied += summary.total || 0;
    p.totalPlayTimeMs += summary.durationMs || 0;

    // Per-card stats
    if (summary.cardResults && Array.isArray(summary.cardResults)) {
      for (var i = 0; i < summary.cardResults.length; i++) {
        var cr = summary.cardResults[i];
        if (cr.cardId) {
          this.updateCardStat(cr.cardId, cr.rating === 'correct');
        }
      }
    }

    // Mark as completed
    this.data.history.completedFlashcardSessionIds.push(sessionId);
    if (this.data.history.completedFlashcardSessionIds.length > 200) {
      this.data.history.completedFlashcardSessionIds = this.data.history.completedFlashcardSessionIds.slice(-200);
    }

    this.addStudiedToday(summary.total || 0);

    // Achievements
    var newAchievements = this._evaluateAchievements(null);

    this.save();

    return {
      applied: true,
      duplicate: false,
      newlyUnlockedAchievementIds: newAchievements,
      completedQuestIds: []
    };
  }

  // ===== ACHIEVEMENT EVALUATION =====

  /**
   * Evaluate all achievements based on current state and optional run summary.
   * @param {object|null} runData - Optional run summary for run-specific checks
   * @returns {string[]} Newly unlocked achievement IDs
   */
  _evaluateAchievements(runData) {
    var newlyUnlocked = [];
    var p = this.data.progression;

    // Helper
    var self = this;
    function tryUnlock(achId) {
      if (self.unlockAchievement(achId)) {
        newlyUnlocked.push(achId);
      }
    }

    // Use ACHIEVEMENT_IDS if available, fall back to string literals
    var A = ACHIEVEMENT_IDS || {};

    // Total encounters
    if (p.totalEncounters >= 1) tryUnlock(A.FIRST_RUN || 'ach_first_run');
    if (p.totalEncounters >= 100) tryUnlock(A.ENCOUNTERS_100 || 'ach_encounters_100');
    if (p.totalEncounters >= 500) tryUnlock(A.ENCOUNTERS_500 || 'ach_encounters_500');
    if (p.totalEncounters >= 1000) tryUnlock(A.ENCOUNTERS_1000 || 'ach_encounters_1000');

    // Daily streak
    if (p.dailyStreak >= 3) tryUnlock(A.DAILY_3 || 'ach_daily_3');
    if (p.dailyStreak >= 7) tryUnlock(A.DAILY_7 || 'ach_daily_7');
    if (p.dailyStreak >= 30) tryUnlock(A.DAILY_30 || 'ach_daily_30');

    // Best streak
    if (p.bestStreak >= 10) tryUnlock(A.STREAK_10 || 'ach_streak_10');
    if (p.bestStreak >= 25) tryUnlock(A.STREAK_25 || 'ach_streak_25');
    if (p.bestStreak >= 50) tryUnlock(A.STREAK_50 || 'ach_streak_50');
    if (p.bestStreak >= 100) tryUnlock(A.STREAK_100 || 'ach_streak_100');

    // Coins
    if (p.totalCoinsEarned >= 500) tryUnlock(A.COINS_500 || 'ach_coins_500');
    if (p.totalCoinsEarned >= 5000) tryUnlock(A.COINS_5000 || 'ach_coins_5000');

    // Multiplayer
    if (p.multiplayerGamesPlayed >= 1) tryUnlock(A.MP_FIRST || 'ach_mp_first');
    if (p.multiplayerWins >= 1) tryUnlock(A.MP_WIN || 'ach_mp_win');
    if (p.multiplayerWins >= 5) tryUnlock(A.MP_WIN5 || 'ach_mp_win5');

    // Play time
    if (p.totalPlayTimeMs >= 1800000) tryUnlock(A.ENDURANCE_30MIN || 'ach_endurance_30min');
    if (p.totalPlayTimeMs >= 3600000) tryUnlock(A.ENDURANCE_1HR || 'ach_endurance_1hr');

    // Perfect runs
    if (p.perfectRuns >= 10) tryUnlock(A.PERFECT_10 || 'ach_perfect_10');
    if (p.perfectRuns >= 50) tryUnlock(A.PERFECT_50 || 'ach_perfect_50');

    // Collection
    if (p.ownedItems.length >= 10) tryUnlock(A.COLLECT_10 || 'ach_collect_10');
    if (p.ownedItems.length >= 25) tryUnlock(A.COLLECT_25 || 'ach_collect_25');

    // Speed achievements
    if (p.fastestCorrectAnswerMs != null && p.fastestCorrectAnswerMs <= 500) tryUnlock(A.FAST_500MS || 'ach_fast_500ms');
    if (p.fastestCorrectAnswerMs != null && p.fastestCorrectAnswerMs <= 300) tryUnlock(A.FAST_300MS || 'ach_fast_300ms');

    // Subject mastery: 50+ answers, 80%+ accuracy
    var ss = this.data.cards.subjectStats;
    var subjectCount = 0;
    for (var subjKey in ss) {
      if (!Object.prototype.hasOwnProperty.call(ss, subjKey)) continue;
      var subjStat = ss[subjKey];
      var subjTotal = subjStat.correct + subjStat.wrong;
      if (subjTotal > 0) subjectCount++;
    }

    if (subjectCount >= 15) tryUnlock(A.ALL_SUBJECTS || 'ach_all_subjects');

    // Run-specific checks
    if (runData) {
      if ((runData.score || 0) >= 1000) tryUnlock(A.SCORE_1000 || 'ach_score_1000');
      if ((runData.score || 0) >= 5000) tryUnlock(A.SCORE_5000 || 'ach_score_5000');
      if ((runData.score || 0) >= 10000) tryUnlock(A.SCORE_10000 || 'ach_score_10000');

      if (runData.completed && runData.correct > 0 && runData.wrong === 0) {
        tryUnlock(A.PERFECT_RUN || 'ach_perfect_run');
      }

      if (runData.correct >= 20 && runData.wrong === 0) {
        tryUnlock(A.GOLDEN_DOCTOR || 'ach_golden_doctor');
      }

      // Speed achievements from run data
      if (runData.fastestDecisionMs != null) {
        if (runData.fastestDecisionMs <= 500) tryUnlock(A.FAST_500MS || 'ach_fast_500ms');
        if (runData.fastestDecisionMs <= 300) tryUnlock(A.FAST_300MS || 'ach_fast_300ms');
      }
    }

    return newlyUnlocked;
  }

  /**
   * Public-facing checkAchievements for backward compat.
   * @param {object|null} runData
   * @returns {string[]} Newly unlocked achievement IDs
   */
  checkAchievements(runData) {
    if (!this.data) this.load();
    var result = this._evaluateAchievements(runData);
    if (result.length > 0) this.save();
    return result;
  }

  // ===== PROFILE =====

  getProfile() {
    return {
      name: this.data.profile.name,
      picture: this.data.profile.picture,
      visible: this.data.profile.visible,
      badges: this.data.profile.selectedBadges,
      stats: {
        totalCards: this.data.progression.totalCardsStudied,
        totalCorrect: this.data.progression.totalCorrect,
        totalWrong: this.data.progression.totalWrong,
        bestScore: this.data.progression.bestScore,
        bestStreak: this.data.progression.bestStreak,
        playTime: Math.round(this.data.progression.totalPlayTimeMs / 1000),
        dailyStreak: this.data.progression.dailyStreak,
        achievements: this.data.progression.achievements.length,
        coins: this.data.progression.totalCoinsEarned,
        flashcardSessions: this.data.progression.flashcardSessions,
        multiplayerWins: this.data.progression.multiplayerWins,
        fastestAnswer: this.data.progression.fastestCorrectAnswerMs ?? 99999
      }
    };
  }

  setProfileName(name) {
    this.data.profile.name = String(name || '').slice(0, 30);
    this.save();
  }

  setProfilePicture(skinId) {
    if (this.ownsItem(skinId)) {
      this.data.profile.picture = skinId;
      this.save();
    }
  }

  setProfileVisible(visible) {
    this.data.profile.visible = !!visible;
    this.save();
  }

  setProfileBadges(badgeIds) {
    if (!Array.isArray(badgeIds)) return;
    var achievements = this.data.progression.achievements;
    var validBadges = badgeIds.filter(function(id) {
      return achievements.indexOf(id) >= 0;
    }).slice(0, 6);
    this.data.profile.selectedBadges = validBadges;
    this.save();
  }

  // ===== PLAY TIME TRACKING =====

  addPlayTime(seconds) {
    if (typeof seconds !== 'number' || seconds <= 0) return;
    this.data.progression.totalPlayTimeMs += Math.round(seconds * 1000);
    if (seconds * 1000 > this.data.progression.longestSessionMs) {
      this.data.progression.longestSessionMs = Math.round(seconds * 1000);
    }
    this.save();
  }

  addCardsStudied(count) {
    if (typeof count !== 'number' || count <= 0) return;
    this.data.progression.totalCardsStudied += count;
    this.save();
  }

  // ===== QUEST COMPLETION DATE TRACKING =====

  markQuestsComplete(dateKey) {
    // No-op: quest completion is derived from quest state
    // Kept for backward compat
  }

  areQuestsComplete(dateKey) {
    var dates = this._getQuestCompletionDates();
    return !!dates[dateKey];
  }

  // ===== FLASHCARD STATS (backward compat) =====

  recordFlashcardSession(correct, wrong) {
    this.data.progression.flashcardSessions++;
    this.data.progression.flashcardCorrect += (correct || 0);
    this.data.progression.flashcardWrong += (wrong || 0);
    this.save();
  }

  getFlashcardStats() {
    var c = this.data.progression.flashcardCorrect;
    var w = this.data.progression.flashcardWrong;
    var t = c + w;
    return {
      sessions: this.data.progression.flashcardSessions,
      correct: c,
      wrong: w,
      total: t,
      accuracy: t > 0 ? Math.round(c / t * 100) : 0
    };
  }

  // ===== MULTIPLAYER STATS =====

  recordMultiplayerGame(won) {
    this.data.progression.multiplayerGamesPlayed++;
    if (won) this.data.progression.multiplayerWins++;
    this.save();
  }

  getMultiplayerStats() {
    var games = this.data.progression.multiplayerGamesPlayed;
    var wins = this.data.progression.multiplayerWins;
    return {
      gamesPlayed: games,
      wins: wins,
      losses: games - wins,
      winRate: games > 0 ? Math.round(wins / games * 100) : 0
    };
  }

  // ===== FASTEST ANSWER =====

  recordFastestAnswer(ms) {
    if (typeof ms !== 'number' || ms <= 0) return;
    var current = this.data.progression.fastestCorrectAnswerMs;
    if (current === null || ms < current) {
      this.data.progression.fastestCorrectAnswerMs = Math.round(ms);
      this.save();
    }
  }

  // ===== FILTER HELPERS =====

  getSelectedExams() {
    return this.data.settings.selectedExams;
  }

  setSelectedExams(exams) {
    if (!Array.isArray(exams)) return;
    this.data.settings.selectedExams = exams;
    this.save();
  }

  toggleExamFilter(examId) {
    var exams = this.data.settings.selectedExams;
    var idx = exams.indexOf(examId);
    if (idx >= 0) exams.splice(idx, 1);
    else exams.push(examId);
    this.save();
  }

  toggleArrayItem(key, value) {
    var arr = this.get(key);
    if (!Array.isArray(arr)) arr = [];
    var idx = arr.indexOf(value);
    if (idx >= 0) arr.splice(idx, 1);
    else arr.push(value);
    this.set(key, arr);
    return arr;
  }

  clearFilter(key) {
    this.set(key, []);
  }

  toggleQuestionTypeFilter(type) {
    return this.toggleArrayItem('selectedQuestionTypes', type);
  }

  toggleSourceFilter(source) {
    return this.toggleArrayItem('selectedSources', source);
  }

  toggleYearFilter(year) {
    return this.toggleArrayItem('selectedYears', year);
  }

  // ===== BACKUP / RESTORE =====

  /**
   * Serialize all saved progress for download.
   * @returns {string} JSON text
   */
  exportBackup() {
    return JSON.stringify({
      app: 'buzzword-dash',
      exportedAt: new Date().toISOString(),
      data: this.data
    }, null, 2);
  }

  /**
   * Replace local progress with a save that came from the player's cloud
   * account. Does not trigger the change listener (this is not a new edit).
   * @param {object} data - a save object (same shape as exportBackup().data)
   * @returns {{ok: boolean, error?: string}}
   */
  applyRemoteData(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { ok: false, error: 'The cloud save is not valid.' };
    }
    if (typeof data.schemaVersion !== 'number' || data.schemaVersion > SCHEMA_VERSION) {
      return { ok: false, error: 'The cloud save is from a newer version of the game. Refresh and try again.' };
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      return { ok: false, error: 'Could not write to local storage.' };
    }
    this.load();
    return { ok: true };
  }

  /**
   * Replace saved progress with a previously exported backup.
   * @param {string} text - JSON from exportBackup()
   * @returns {{ok: boolean, error?: string}}
   */
  importBackup(text) {
    var parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return { ok: false, error: 'File is not valid JSON.' };
    }
    var data = parsed && parsed.app === 'buzzword-dash' ? parsed.data : null;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { ok: false, error: 'This is not a Buzzword Dash backup.' };
    }
    if (typeof data.schemaVersion !== 'number' || data.schemaVersion > SCHEMA_VERSION) {
      return { ok: false, error: 'Backup is from an incompatible version.' };
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      return { ok: false, error: 'Could not write to local storage.' };
    }
    this.load();
    return { ok: true };
  }

  // ===== RESET =====

  /**
   * Reset by scope.
   * @param {string} scope - 'progress' | 'settings' | 'custom_cards' | 'identity' | 'all_local'
   */
  reset(scope) {
    if (!scope) scope = 'all_local';

    switch (scope) {
      case 'progress':
        this.data.progression = deepClone(DEFAULTS.progression);
        this.data.cards = deepClone(DEFAULTS.cards);
        this.data.history = deepClone(DEFAULTS.history);
        this.data.idempotency = deepClone(DEFAULTS.idempotency);
        break;

      case 'settings':
        this.data.settings = deepClone(DEFAULTS.settings);
        break;

      case 'custom_cards':
        // Custom cards are in their own localStorage key, handled by customcards.js
        // But we clear disabled card IDs that might reference them
        this.data.cards.disabledCardIds = [];
        break;

      case 'identity':
        this.data.profile = deepClone(DEFAULTS.profile);
        this.data.social = deepClone(DEFAULTS.social);
        break;

      case 'all_local':
        this.data = deepClone(DEFAULTS);
        // Also clear custom cards storage
        try { localStorage.removeItem('buzzword_dash_custom_cards'); } catch (e) { /* best-effort */ }
        break;
    }

    this.save();
  }
}

// ===== PROGRESSION EVENT SYSTEM =====

/**
 * Progression event recorder. Maps semantic events to quest/achievement progress.
 * The engine calls this instead of referencing quest IDs directly.
 */
var progression = {
  /**
   * Record a progression event.
   * @param {string} type - Event type (e.g., 'correct_answer', 'coin_collected')
   * @param {object} payload - Event payload with eventId, runId, etc.
   */
  recordEvent: function(type, payload) {
    if (!payload || !payload.eventId) return;

    // Idempotency by eventId
    var ids = storageInstance.data.idempotency.progressionEventIds;
    if (ids.indexOf(payload.eventId) >= 0) return;
    ids.push(payload.eventId);
    // Cap
    if (ids.length > 500) {
      storageInstance.data.idempotency.progressionEventIds = ids.slice(-500);
    }

    // Map event to quest progress
    var map = getQuestEventMap();
    var mappings = map[type];
    if (mappings) {
      for (var i = 0; i < mappings.length; i++) {
        storageInstance.incrementQuest(mappings[i].questId, mappings[i].increment);
      }
    }

    storageInstance.save();
  }
};

// ===== SINGLETON =====

var storageInstance = new Storage();

export { storageInstance as storage, progression };
