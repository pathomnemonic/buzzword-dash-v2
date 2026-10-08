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
import { isPremiumItem, PREMIUM_ITEMS } from '../supabase/functions/_shared/premium.js';
import { FEATURES } from './features.js';
import { mapUnlockLevel, legacyMapUnlockLevel } from './game/mapunlocks.js';
import { levelFromXp } from './progress.js';
import { repairData, sanitizeCollections } from './sanity.js';
import { advanceStudyStreak, liveStudyStreak, deriveStreakFromCounts, daysBetween } from './studystreak.js';
import { ACHIEVEMENT_IDS, QUEST_IDS, QUESTS, LOCKER_ITEMS, isArchivedItem, questIdsForDate, pickReplacementQuest, QUEST_SWAP_COST } from './game/shopdata.js';
import * as fsrs from './fsrs.js';
import { CHARACTER_MODELS, RETIRED_CHARACTERS } from './game/modelcatalog.js';

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
    characterVoices: true,     // the runner cheers when you score and sulks when you miss
    hapticsEnabled: true,
    dailyGoal: 20,
    fsrsMigrated: false,       // cards have been moved from the old schedule to FSRS
    targetRetention: 0.9,      // how likely you want to be to remember a card when it comes back (FSRS)
    examDate: '',              // YYYY-MM-DD of the player's exam, for the study plan
    examName: '',
    shareRuns: 'friends',      // who sees the player's runs in the feed: 'friends' or 'private'
    sendDiagnostics: false,    // opt-in anonymous crash and slow-frame reports
    firstWeekOff: false,       // the player hid the first-week checklist
    cardMilestoneSeen: 0,
    dayMilestoneSeen: 0,
    kudosSeenAt: 0,
    colorblindMode: false,
    glowEffects: false,
    ambientParticles: false,  // the soft glowing specks floating across the track (off unless switched on)
    reminders: false,
    reminderHour: 19,
    tipPromptOff: false,
    keyBindings: {},        // keys the player has changed on a computer (see keybindings.js); empty means all defaults
    dashControl: 'auto',    // how to dash: 'auto' (button on phones, double-tap on computers), 'double', 'button' or 'off'
    dashPromptSeen: false,  // asked once, after 3 games, whether to switch the phone default to double-tap
    dashDefaultSeen: false,
    scoreBests: {},       // best score already sent to the leaderboard, by "mode|season" (see scorebest.js)
    promptState: {},      // when the share / rate / account asks were last shown (see prompts.js)
    runsFinished: 0,
    explored: [],   // menus and tabs the player has opened (red "new" dots go away for these; see discoverydots.js)
    firstRunAt: 0,
    lastTipPromptAt: 0,
    lastReminderDate: '',
    avatarColors: {},
    modelColors: {},   // per 3D character: { avatarId: { partKey: hex } }
    reducedMotion: false,
    offlinePackAt: 0,       // when the 'play offline' download last finished (ms)
    dyslexiaFont: false,    // accessibility: OpenDyslexic everywhere
    handedness: 'right',    // accessibility: which side the Dash / Auto-Pilot buttons sit on ('right' | 'left')
    relaxedPace: false,     // accessibility: slower track, no speed-up (single-player runs only; unranked)
    quality: 'auto',
    uiTheme: 'surprise',
    themeSurpriseSeen: false,
    reviewTipSeen: false,   // the first results screen after the tutorial points out the review section
    lockerSeen: [],
    fps30Seen: false,
    glowDefaultSeen: false,
    perfHint: '',
    disabledPowerups: [],
    speedRamp: { on: true, every: 20, step: 0.5 }, // the run speeds up by `step` every `every` questions
    hazardsOff: false,
    monsterOff: false,
    preferredMap: '',
    cameraView: 'default',
    batterySaver: true,        // 30 fps: the game does not need more, and it runs cooler and smoother
    perfStrikes: 0,
    nightMode: false,

    speedTimerEnabled: false,
    cardFreshnessWeight: 8,   // new cards come up much more often than ones already answered
    freshnessDefaultSeen: false,
    achievementsSeen: [],        // badges the player has already been shown (a red dot marks the rest)
    achievementsSeenInit: false,
  },

  // --- Progression ---
  progression: {
    coins: 300, // exactly the cheapest trail (Pills), the one thing the tutorial has a new player buy (never more; see economy.test.js)
    totalCoinsEarned: 100,
    bestScore: 0,
    bestStreak: 0,
    totalCorrect: 0,
    totalWrong: 0,
    totalEncounters: 0,
    totalPlayTimeMs: 0,
    totalCardsStudied: 0,
    autoPilotHints: 0,   // how many times the pick-up tip for Auto-Pilot has been shown (it stops after 10)
    secretsFound: [],    // maps whose hidden secret has been found at least once
    perfectRuns: 0,
    continuesUsed: 0,

    dailyStreak: 0,          // consecutive days the Daily 15 was completed (the Consistent / Dedicated / Committed badges)
    streakShields: 0,        // protect the study streak: one covers a missed day (earned at every 7th day, 3 at most)
    studyStreak: 0,          // consecutive days with at least one card answered: the flame everywhere (see studystreak.js)
    lastStudyDate: null,     // the last day counted in studyStreak, as YYYY-MM-DD
    bestStudyStreak: 0,
    tournamentTop10Weeks: [],
    lastCompletedDailyDate: null,
    lastLoginDate: null,
    bonusCoins: { date: '', coins: 0 },   // coins paid today for right answers in the subject of the day (see progress.js)
    loginStreak: 0,
    xp: 0,
    // One-time migrations: these must be listed here or they are forgotten on the next load
    premiumKept: false, // one-time: premium maps a player had already unlocked by level were kept for them
    proGiftItem: '',  // the item the one-time Pro gift was spent on (js/pro.js proGiftState); empty until it is used
    modelIntroSeen: false,
    monsterDefaultSeen: false,

    achievements: [],
    ownedItems: ['avatar_intern', 'hat_none', 'trail_none', 'gear_none', 'cloth_none', 'monster_classic', 'monster_m_ghost', 'pal_none', 'pal_cat'],
    equipped: {
      monster: 'monster_m_ghost',
      skin: 'avatar_intern',
      hat: 'hat_none',
      trail: 'trail_none',
      gear: 'gear_none',
      clothing: 'cloth_none',
      pal: 'pal_cat'      // the study buddy on the Home screen (companions.js)
    },

    questState: {},
    questPicks: {},

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
    visible: true,
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
    dailyCorrect: {},
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
function sameKind(value, fallback) {
  if (fallback === null || fallback === undefined) return true;
  if (Array.isArray(fallback)) return Array.isArray(value);
  if (typeof fallback === 'number') return typeof value === 'number' && isFinite(value);
  return typeof value === typeof fallback;
}

function deepMerge(stored, defaults) {
  if (stored === null || stored === undefined || typeof stored !== 'object' || typeof defaults !== 'object') {
    return deepClone(defaults);
  }
  if (Array.isArray(defaults)) {
    // For arrays, keep stored if it's an array, else use default
    return Array.isArray(stored) ? stored : deepClone(defaults);
  }
  // A default of {} is a free-form map (card stats, subject stats, calendar...): keep everything
  // that was stored in it. Merging it key by key would drop every entry.
  if (Object.keys(defaults).length === 0) {
    return Array.isArray(stored) ? deepClone(defaults) : stored;
  }
  var result = {};
  for (var key in defaults) {
    if (!Object.prototype.hasOwnProperty.call(defaults, key)) continue;
    if (Object.prototype.hasOwnProperty.call(stored, key)) {
      if (typeof defaults[key] === 'object' && defaults[key] !== null && !Array.isArray(defaults[key])) {
        result[key] = deepMerge(stored[key], defaults[key]);
      } else {
        // Keep stored value (preserves zero, false, empty string, empty array), but only
        // when it has the right type: a damaged or hand-edited save must not brick startup.
        result[key] = sameKind(stored[key], defaults[key]) ? stored[key] : deepClone(defaults[key]);
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
    var requiredItems = ['avatar_intern', 'hat_none', 'trail_none', 'gear_none', 'cloth_none', 'monster_classic', 'monster_m_ghost'];
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
    'ach_collector_50': 'ach_collect_50',
    'ach_mp_first_game': 'ach_mp_first',
    'ach_mp_first_win': 'ach_mp_win',
    'ach_mp_10_wins': 'ach_mp_win5',
    'ach_endurance_30min': 'ach_playtime_30min',
    'ach_endurance_1hr': 'ach_playtime_1hr',
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

/** A "perfect run" needs at least this many right answers (one lucky answer then quitting is not a perfect run). */
var PERFECT_RUN_MIN_CORRECT = 5;

/**
 * A finished run's numbers as the rest of the code may rely on them: finite and never negative, and the list of
 * answers holding only real entries. (The numbers come from the engine, but a bug or a tampered file must not be
 * able to put NaN or a negative coin count into the save.)
 */
function cleanRunSummary(s) {
  var out = Object.assign({}, s || {});
  ['score', 'coinsEarned', 'coinsCollected', 'encountersCompleted', 'correct', 'wrong', 'bestStreak', 'durationMs', 'continuesUsed',
    'rushesUsed', 'powerupsCollected', 'obstaclesJumped', 'obstaclesSlid'].forEach(function (k) {
    var v = Number(out[k]);
    out[k] = isFinite(v) && v > 0 ? v : 0;
  });
  if (out.fastestDecisionMs != null) {
    var f = Number(out.fastestDecisionMs);
    out.fastestDecisionMs = isFinite(f) && f > 0 ? f : null;
  }
  out.encounters = (Array.isArray(out.encounters) ? out.encounters : []).filter(function (e) { return e && typeof e === 'object' && typeof e.cardId === 'string'; });
  if (!Array.isArray(out.subjectsSeen)) out.subjectsSeen = [];
  return out;
}

/** Which badge a subject's mastery earns. */
var SUBJECT_MASTERY_KEYS = {
  'Neurology': 'MASTER_NEURO', 'Cardiology': 'MASTER_CARDIO', 'Nephrology': 'MASTER_NEPHRO',
  'Psychiatry': 'MASTER_PSYCH', 'Gastroenterology': 'MASTER_GI', 'Pulmonology': 'MASTER_PULM',
  'Infectious Disease': 'MASTER_ID', 'Endocrinology': 'MASTER_ENDO', 'Hematology/Oncology': 'MASTER_HEME',
  'Rheumatology': 'MASTER_RHEUM', 'Obstetrics/Gynecology': 'MASTER_OBGYN', 'Pediatrics': 'MASTER_PEDS',
  'Surgery': 'MASTER_SURG', 'Emergency Medicine': 'MASTER_EM', 'Multisystem / Mixed': 'MASTER_MULTI'
};

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
      { event: 'encounter_resolved', questId: QUEST_IDS.ENCOUNTERS_25, increment: 1 },
      { event: 'correct_answer', questId: QUEST_IDS.CORRECT_10, increment: 1 },
      { event: 'coin_collected', questId: QUEST_IDS.COINS_50, increment: 1 },
      { event: 'powerup_collected', questId: QUEST_IDS.POWERUPS_3, increment: 1 },
      { event: 'streak_reached', questId: QUEST_IDS.STREAK_8, increment: 1 },
      { event: 'daily_completed', questId: QUEST_IDS.DAILY, increment: 1 },
      { event: 'rush_used', questId: QUEST_IDS.RUSH_3, increment: 1 },
      { event: 'obstacle_jumped', questId: QUEST_IDS.JUMP_5, increment: 1 },
      { event: 'obstacle_slid', questId: QUEST_IDS.SLIDE_5, increment: 1 }
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
          this._problem('migration', 'v' + (parsed.schemaVersion === undefined ? 1 : parsed.schemaVersion));
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
      this._problem('corrupt', 'load');
      // Keep what was there, so it could still be recovered by hand rather than being overwritten by the fresh save
      try {
        var damaged = localStorage.getItem(STORAGE_KEY);
        if (damaged) localStorage.setItem(STORAGE_KEY + '_damaged', damaged);
      } catch (e2) { /* storage full or unavailable */ }
      this.data = deepClone(DEFAULTS);
    }

    try {
      this._ensureInvariants();
    } catch (e) {
      console.warn('[Storage] Damaged data, using defaults:', e.message);
      this._problem('repaired', 'invariants');
      this.data = deepClone(DEFAULTS);
      this._ensureInvariants();
    }
  }

  /** Remember a saving or loading problem; analytics reads the list (it may start after the load) and the callback. */
  _problem(kind, detail) {
    if (!this.problems) this.problems = [];
    if (this.problems.length < 20) this.problems.push({ kind: kind, detail: String(detail || '') });
    if (typeof this.onProblem === 'function') { try { this.onProblem(kind, detail); } catch (e) { /* ignore */ } }
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn('[Storage] Save failed:', e.message);
      this._problem(/quota/i.test(String(e && (e.name || e.message))) ? 'quota' : 'other', e && e.name);
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

    // Anything with the wrong type or an impossible value (NaN, a negative count, text where a number belongs) goes
    // back to its default, so one bad field cannot break a screen later
    var repaired = repairData(d, DEFAULTS) + sanitizeCollections(d);
    if (repaired) console.warn('[Storage] Repaired ' + repaired + ' damaged field(s)');

    // The study streak is stored now. A save from before that (or one whose streak date was damaged) starts from the
    // days the calendar already shows, so the flame and the calendar agree from the first launch
    var counts = d.history && d.history.dailyCounts;
    if (counts && typeof counts === 'object') {
      var seed = deriveStreakFromCounts(counts, todayKey());
      if (!d.progression.lastStudyDate && !d.progression.studyStreak && seed.streak > 0) {
        d.progression.studyStreak = seed.streak;
        d.progression.lastStudyDate = seed.last;
      }
      d.progression.bestStudyStreak = Math.max(d.progression.bestStudyStreak || 0, d.progression.studyStreak || 0, seed.best);
    }

    // One-time move of every card from the old schedule to FSRS (see fsrs.js), so nobody loses their history
    if (d.cards && d.cards.cardStats && !d.settings.fsrsMigrated) {
      var stats = d.cards.cardStats;
      Object.keys(stats).forEach(function (id) {
        var s = stats[id];
        if (!s || typeof s !== 'object' || !(s.seen > 0) || s.stability > 0) return;
        var m = fsrs.fromLegacy(s);
        if (!m) return;
        s.stability = m.stability;
        s.difficulty = m.difficulty;
        s.lastReview = m.lastReview;
      });
      d.settings.fsrsMigrated = true;
    }

    // Ensure required owned items
    var requiredItems = ['avatar_intern', 'avatar_classic', 'hat_none', 'trail_none', 'gear_none', 'cloth_none', 'monster_classic', 'monster_m_ghost'];
    for (var i = 0; i < requiredItems.length; i++) {
      if (d.progression.ownedItems.indexOf(requiredItems[i]) < 0) {
        d.progression.ownedItems.push(requiredItems[i]);
      }
    }

    // The Intern became an animated 3D model. It can wear hats but not gear or
    // outfits, so players who had dressed the old Intern in those stay on the classic one.
    if (!d.progression.modelIntroSeen) {
      d.progression.modelIntroSeen = true;
      var eq = d.progression.equipped;
      if (eq.skin === 'avatar_intern' && ((eq.gear && eq.gear !== 'gear_none') || (eq.clothing && eq.clothing !== 'cloth_none'))) {
        eq.skin = 'avatar_classic';
      }
    }

    // Duplicate characters were retired (same model in another color). Owners move to the one it
    // duplicated and are refunded: the full price if they already had it, otherwise the difference.
    Object.keys(RETIRED_CHARACTERS).forEach(function (oldId) {
      var info = RETIRED_CHARACTERS[oldId];
      var owned = d.progression.ownedItems;
      var at = owned.indexOf(oldId);
      var wasEquipped = d.progression.equipped.skin === oldId;
      if (at >= 0) {
        owned.splice(at, 1);
        var target = CHARACTER_MODELS.filter(function (m) { return m.id === info.to; })[0];
        var targetPrice = target ? target.price : 0;
        var refund = info.price;
        if (owned.indexOf(info.to) < 0) {
          owned.push(info.to);
          refund = Math.max(0, info.price - targetPrice);
        }
        d.progression.coins = (d.progression.coins || 0) + refund;
      }
      if (wasEquipped) d.progression.equipped.skin = info.to;
    });

    // Scrub color used to be one setting for every medical character; it is now per character and per part
    if (d.settings.scrubColor !== undefined) {
      var oldScrub = d.settings.scrubColor;
      delete d.settings.scrubColor;
      if (oldScrub) {
        d.settings.modelColors = d.settings.modelColors || {};
        d.settings.modelColors.avatar_intern = Object.assign({ pants: oldScrub }, d.settings.modelColors.avatar_intern);
      }
    }
    if (!d.settings.modelColors || typeof d.settings.modelColors !== 'object') d.settings.modelColors = {};

    // Badges the player already had when red dots were introduced count as seen; only new ones get a dot
    if (!d.settings.achievementsSeenInit) {
      d.settings.achievementsSeenInit = true;
      d.settings.achievementsSeen = (d.progression.achievements || []).slice();
    }
    if (!Array.isArray(d.settings.achievementsSeen)) d.settings.achievementsSeen = [];

    // New cards are now favored by default (8, was 5). Players still on the old default move over once;
    // anyone who picked their own number keeps it.
    if (!d.settings.freshnessDefaultSeen) {
      d.settings.freshnessDefaultSeen = true;
      if (d.settings.cardFreshnessWeight === 5) d.settings.cardFreshnessWeight = 8;
    }

    // The colors now change by themselves now and then ("Surprise me"); players left on the old Auto move over once
    if (!d.settings.themeSurpriseSeen) {
      d.settings.themeSurpriseSeen = true;
      if (d.settings.uiTheme === 'auto') d.settings.uiTheme = 'surprise';
    }

    // The dash used to default to the double tap; players who never chose move to Automatic (a button on phones)
    if (!d.settings.dashDefaultSeen) {
      d.settings.dashDefaultSeen = true;
      if (d.settings.dashControl === 'double') d.settings.dashControl = 'auto';
    }

    // 30 fps became the default; switch everyone over once (it can still be turned off)
    if (!d.settings.fps30Seen) {
      d.settings.fps30Seen = true;
      d.settings.batterySaver = true;
    }

    // Character voices are on for everyone, including saves from before they existed
    if (typeof d.settings.characterVoices !== 'boolean') d.settings.characterVoices = true;

    // Glow is now off by default (it is the costliest effect); switch everyone once
    if (!d.settings.glowDefaultSeen) {
      d.settings.glowDefaultSeen = true;
      d.settings.glowEffects = false;
    }

    // Some items became premium (sold for money). Whatever a player already had stays theirs: maps they had already reached
    // by level are written into what they own, once; anything bought with coins is already in that list.
    if (!d.progression.premiumKept) {
      d.progression.premiumKept = true;
      var lvNow = levelFromXp(d.progression.xp || 0).level;
      Object.keys(PREMIUM_ITEMS).forEach(function (id) {
        var at = legacyMapUnlockLevel(id);
        if (at > 0 && lvNow >= at && d.progression.ownedItems.indexOf(id) < 0) d.progression.ownedItems.push(id);
      });
    }

    // The starting monster is now an animated 3D one (the Ghost). Players still on the
    // old round monster are moved over once; the old one stays in the Locker.
    if (!d.progression.monsterDefaultSeen) {
      d.progression.monsterDefaultSeen = true;
      if (!d.progression.equipped.monster || d.progression.equipped.monster === 'monster_classic') {
        d.progression.equipped.monster = 'monster_m_ghost';
      }
    }

    // The original blocky characters and monsters are archived: anyone still wearing one moves to the
    // default (they keep owning it, so bringing the archive back restores it)
    if (isArchivedItem(d.progression.equipped.skin)) d.progression.equipped.skin = 'avatar_intern';
    if (isArchivedItem(d.progression.equipped.monster)) d.progression.equipped.monster = 'monster_m_ghost';

    // Ensure equipped slots exist
    if (!d.progression.equipped.skin) d.progression.equipped.skin = 'avatar_intern';
    if (!d.progression.equipped.hat) d.progression.equipped.hat = 'hat_none';
    if (!d.progression.equipped.trail) d.progression.equipped.trail = 'trail_none';
    if (!d.progression.equipped.gear) d.progression.equipped.gear = 'gear_none';
    if (!d.progression.equipped.clothing) d.progression.equipped.clothing = 'cloth_none';
    // The study buddy: everyone owns the free ones, and a player who never chose wears the cat
    if (!d.progression.equipped.pal) d.progression.equipped.pal = 'pal_cat';
    if (Array.isArray(d.progression.ownedItems)) ['pal_none', 'pal_cat'].forEach(function (id) { if (d.progression.ownedItems.indexOf(id) < 0) d.progression.ownedItems.push(id); });

    // Ensure arrays
    if (!Array.isArray(d.progression.achievements)) d.progression.achievements = [];
    // Maps went into the Locker: someone who had already chosen one as their favorite keeps it
    var fav = d.settings.preferredMap;
    if (fav) {
      var favItem = LOCKER_ITEMS.filter(function (i) { return i.type === 'map' && i.name === fav; })[0];
      if (favItem && d.progression.ownedItems.indexOf(favItem.id) < 0) d.progression.ownedItems.push(favItem.id);
    }

    // Two badges were once stored under ids that are not in the badge list; move them to the real ids
    d.progression.achievements = d.progression.achievements.map(function (id) {
      return id === 'ach_endurance_30min' ? 'ach_playtime_30min' : id === 'ach_endurance_1hr' ? 'ach_playtime_1hr' : id;
    }).filter(function (id, i, arr) { return arr.indexOf(id) === i; });
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
    if (typeof d.progression.questPicks !== 'object' || d.progression.questPicks === null) d.progression.questPicks = {};
    if (typeof d.history.calendarData !== 'object' || d.history.calendarData === null) d.history.calendarData = {};
    if (typeof d.history.dailyCounts !== 'object' || d.history.dailyCounts === null) d.history.dailyCounts = {};
    if (typeof d.history.dailyCorrect !== 'object' || d.history.dailyCorrect === null) d.history.dailyCorrect = {};
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
      case 'xp': return this.data.progression.xp || 0;
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
      case 'xp': this.data.progression.xp = Math.max(0, Math.floor(value) || 0); break;
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

    this.addStudiedToday((summary.correct || 0) + (summary.wrong || 0), summary.correct || 0);
    this.save();
    return { applied: true, duplicate: false };
  }

  // ===== STREAK STATUS & WEEKLY GOAL =====

  /**
   * The study streak as the player should see it: consecutive days with at least one card answered. A streak that
   * lapsed (and no shield can cover the gap) reads as 0.
   */
  getStreakStatus() {
    var p = this.data.progression;
    var live = liveStudyStreak({ streak: p.studyStreak, last: p.lastStudyDate, shields: p.streakShields }, todayKey());
    return {
      streak: live.streak,
      shields: p.streakShields || 0,
      playedToday: live.playedToday,
      atRisk: live.atRisk,
      best: Math.max(p.bestStudyStreak || 0, live.streak)
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

  /** Record a cleared Weekly Gauntlet (the old top-10% badge slot) once per week. @returns {boolean} true if newly earned */
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

  /**
   * Count `count` cards answered today; `correct` (optional) is how many of them were right, for the streak calendar.
   * Answering any card makes today a study day, so the streak and the calendar are one thing.
   * @returns {object|null} what the streak did (see advanceStudyStreak), or null when nothing was counted
   */
  addStudiedToday(count, correct) {
    if (!(count > 0)) return null;
    var counts = this.data.history.dailyCounts;
    var key = todayKey();
    counts[key] = (counts[key] || 0) + count;
    if (correct) {
      var rights = this.data.history.dailyCorrect;
      rights[key] = (rights[key] || 0) + Math.min(correct, count);
    }
    // Keep about three years, so the streak calendar can be paged back
    var keys = Object.keys(counts).sort();
    while (keys.length > 1100) delete counts[keys.shift()];
    var rkeys = Object.keys(this.data.history.dailyCorrect || {}).sort();
    while (rkeys.length > 1100) delete this.data.history.dailyCorrect[rkeys.shift()];
    return this._advanceStudyStreak(key);
  }

  _advanceStudyStreak(today) {
    var p = this.data.progression;
    var r = advanceStudyStreak({ streak: p.studyStreak, last: p.lastStudyDate, shields: p.streakShields, best: p.bestStudyStreak }, today);
    p.studyStreak = r.streak;
    p.lastStudyDate = r.last;
    p.streakShields = r.shields;
    p.bestStudyStreak = r.best;
    return r;
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
    // Dates on which every quest on offer that day was completed
    var result = {};
    var qs = this.data.progression.questState;
    var picks = this.data.progression.questPicks || {};
    for (var dateKey in qs) {
      if (!Object.prototype.hasOwnProperty.call(qs, dateKey)) continue;
      var day = qs[dateKey];
      var ids = Array.isArray(picks[dateKey]) ? picks[dateKey] : Object.keys(day); // days before rotation: every quest tracked
      if (!ids.length) continue;
      var all = ids.every(function (id) { return day[id] && day[id].completed; });
      if (all) result[dateKey] = true;
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
    var lastSeenBefore = s.lastSeen;
    s.lastSeen = Date.now();

    // Spaced-repetition schedule: FSRS, the open algorithm Anki offers (see fsrs.js). A card saved with the old
    // schedule is converted the first time it is reviewed, so nobody loses their history.
    var memory = null;
    if (s.seen > 1) {
      if (s.stability > 0) memory = { stability: s.stability, difficulty: s.difficulty, lastReview: s.lastReview || s.lastSeen };
      else memory = fsrs.fromLegacy({ seen: s.seen - 1, correct: s.correct - (wasCorrect ? 1 : 0), wrong: s.wrong - (wasCorrect ? 0 : 1), interval: s.interval, ease: s.ease, lastSeen: lastSeenBefore });
    }
    var next = fsrs.review(memory, wasCorrect, s.lastSeen, { retention: this.data.settings.targetRetention });
    s.stability = next.stability;
    s.difficulty = next.difficulty;
    s.lastReview = next.lastReview;
    s.interval = next.intervalDays;
    s.due = next.due;

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

  /** The first few times Auto-Pilot is picked up, a tip says how to use it. True (and counted) while that is still due. */
  takeAutoPilotHint() {
    var p = this.data && this.data.progression;
    if (!p) return false;
    var n = Math.max(0, Math.floor(Number(p.autoPilotHints) || 0));
    if (n >= 10) return false;
    p.autoPilotHints = n + 1;
    this.save();
    return true;
  }

  /** Has the hidden secret on this map ever been found? */
  secretFound(mapName) {
    var f = this.data.progression.secretsFound;
    return Array.isArray(f) && f.indexOf(mapName) >= 0;
  }

  /** Remember a found secret. @returns {boolean} true the first time. */
  markSecretFound(mapName) {
    if (!Array.isArray(this.data.progression.secretsFound)) this.data.progression.secretsFound = [];
    var f = this.data.progression.secretsFound;
    if (f.indexOf(mapName) >= 0) return false;
    if (f.length < 100) f.push(mapName);
    this.save();
    return true;
  }

  ownsItem(itemId) {
    if (this.data.progression.ownedItems.indexOf(itemId) >= 0) return true;
    // a map is also yours once you reach the level it unlocks at (see mapunlocks.js)
    var unlock = mapUnlockLevel(itemId);
    return unlock > 0 && levelFromXp(this.data.progression.xp || 0).level >= unlock;
  }

  buyItem(itemId, price) {
    if (FEATURES.backend && isPremiumItem(itemId)) return false; // premium items are sold for real money only (js/pro.js buyPremiumItem)
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

  /** Take the one-time Pro gift: the item becomes yours for free. False when it is already yours or the gift is already spent. */
  claimProGift(itemId) {
    var p = this.data.progression;
    if (!itemId || (FEATURES.backend && isPremiumItem(itemId)) || p.proGiftItem || p.ownedItems.indexOf(itemId) >= 0) return false;
    p.proGiftItem = itemId;
    p.ownedItems.push(itemId);
    this.save();
    return true;
  }

  /** Call after a successful purchase: returns any badges it earned (first purchase, collection sizes). */
  afterPurchase() {
    return this.checkAchievements({ purchased: true });
  }

  /** Call after a custom card is created: returns any badges it earned. */
  afterCustomCardCreated() {
    return this.checkAchievements({ customCardCreated: true });
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

  /** Badges earned that the player has not been shown in their profile yet. */
  getNewAchievementIds() {
    var seen = this.data.settings.achievementsSeen || [];
    return this.data.progression.achievements.filter(function (id) { return seen.indexOf(id) < 0; });
  }

  /** The player has looked at their badges: clear the red dots. */
  markAchievementsSeen() {
    var fresh = this.getNewAchievementIds();
    if (!fresh.length) return false;
    this.data.settings.achievementsSeen = (this.data.settings.achievementsSeen || []).concat(fresh);
    this.save();
    return true;
  }

  /** Today's quests that are finished but whose coins have not been claimed. */
  getClaimableQuestIds(questList) {
    var self = this;
    var today = todayKey();
    return (questList || []).filter(function (q) {
      return self.getQuestProgress(q.id) >= q.target && !self.isQuestClaimed(q.id, today);
    }).map(function (q) { return q.id; });
  }

  /**
   * Rewards from the last few days that were earned but never claimed (the day ended first). They can still be
   * collected: finishing a quest just before midnight must not cost the coins.
   * @returns {Array<{dateKey: string, id: string}>}
   */
  getUnclaimedPastQuests(daysBack) {
    var out = [];
    var picks = this.data.progression.questPicks || {};
    var state = this.data.progression.questState || {};
    for (var back = 1; back <= (daysBack || 3); back++) {
      var key = dayKeyOffset(-back);
      var ids = Array.isArray(picks[key]) ? picks[key] : [];
      var day = state[key] || {};
      for (var i = 0; i < ids.length; i++) {
        var qs = day[ids[i]];
        var def = this._getQuestDef(ids[i]);
        if (qs && def && !qs.claimed && (qs.completed || (qs.progress || 0) >= def.target)) out.push({ dateKey: key, id: ids[i] });
      }
    }
    return out;
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

    if (!this._deferSave) this.save();
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

    var questDef = this._getQuestDef(questId);

    // A quest whose progress reached its target is complete, even if the flag was never set (an older save)
    if (!qs.completed && questDef && (qs.progress || 0) >= questDef.target) {
      qs.completed = true;
      qs.completedAt = qs.completedAt || Date.now();
    }

    // Not completed
    if (!qs.completed) {
      return { success: false, alreadyClaimed: false, reward: 0, newCoinBalance: this.data.progression.coins, error: 'Quest not completed' };
    }

    // Find reward
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
    summary = cleanRunSummary(summary);

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
    if (summary.completed && summary.correct >= PERFECT_RUN_MIN_CORRECT && summary.wrong === 0) {
      p.perfectRuns = (p.perfectRuns || 0) + 1;
    }

    // --- Daily 15 ---
    // Its own streak (the Consistent / Dedicated / Committed badges): the Daily 15 on consecutive days. The study
    // streak that shows on Home is separate and is counted in addStudiedToday.
    if (summary.dailyCompleted) {
      var today = todayKey();
      if (p.lastCompletedDailyDate !== today) {
        var gap = daysBetween(p.lastCompletedDailyDate, today);
        // A last date in the future means the clock is behind it (a trip west, a wrong clock): the streak is kept
        // and nothing more is counted until the calendar catches up
        if (!(gap < 0)) {
          p.dailyStreak = gap === 1 ? (p.dailyStreak || 0) + 1 : 1;
          p.lastCompletedDailyDate = today;
          result.dailyCompleted = true;
        }
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
    var streakStep = this.addStudiedToday(summary.encountersCompleted || 0, summary.correct || 0);
    if (streakStep) {
      if (streakStep.shieldUsed) result.shieldUsed = true;
      if (streakStep.shieldEarned) result.shieldEarned = true;
    }

    // --- Quest progress from run events ---
    var questsBefore = this._completedQuestIds();
    this._processRunQuestProgress(summary);
    result.completedQuestIds = this._completedQuestIds().filter(function (id) { return questsBefore.indexOf(id) < 0; });

    // --- Achievements ---
    result.newlyUnlockedAchievementIds = this._evaluateAchievements(summary);

    // --- Lifetime run count (the recent-runs list is capped) ---
    this.data.settings.runsFinished = (this.data.settings.runsFinished || 0) + 1;
    if (!this.data.settings.firstRunAt) this.data.settings.firstRunAt = Date.now();

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
    this._applyQuestMetrics(this._questMetrics(summary));
  }

  /** Turn a finished run into the numbers quests are measured by (see QUESTS in shopdata.js). */
  _questMetrics(summary) {
    var encounters = Array.isArray(summary.encounters) ? summary.encounters : [];
    var correct = summary.correct || 0;
    var wrong = summary.wrong || 0;
    var answered = correct + wrong;
    var quick = 0;
    var blink = 0;
    encounters.forEach(function (e) {
      if (e && e.correct && typeof e.decisionMs === 'number' && e.decisionMs > 0) {
        if (e.decisionMs < 2000) quick++;
        if (e.decisionMs < 1000) blink++;
      }
    });
    var subjects = {};
    encounters.forEach(function (en) { if (en && en.subject) subjects[en.subject] = true; });
    (summary.subjectsSeen || []).forEach(function (sub) { if (sub) subjects[sub] = true; });
    var finished = (summary.encountersCompleted || 0) > 0;
    var m = {
      encountersCompleted: summary.encountersCompleted || 0,
      correct: correct,
      runs: finished ? 1 : 0,
      score: summary.score || 0,
      bestStreak: summary.bestStreak || 0,
      cleanCorrect: wrong === 0 ? correct : 0,
      accuracyOf10: answered >= 10 ? Math.floor(100 * correct / answered) : 0,
      coinsCollected: summary.coinsCollected || 0,
      powerupsCollected: summary.powerupsCollected || 0,
      rushesUsed: summary.rushesUsed || 0,
      obstaclesJumped: summary.obstaclesJumped || 0,
      obstaclesSlid: summary.obstaclesSlid || 0,
      dodges: (summary.obstaclesJumped || 0) + (summary.obstaclesSlid || 0),
      dailyCompleted: summary.dailyCompleted ? 1 : 0,
      quick: quick,
      blink: blink,
      quickInRun: quick,
      noContinue: summary.continued ? 0 : (summary.encountersCompleted || 0),
      subjects: Object.keys(subjects)
    };
    ['study', 'weakness', 'endless', 'tournament', 'challenge'].forEach(function (mode) {
      m['mode_' + mode] = finished && summary.mode === mode ? 1 : 0;
    });
    return m;
  }

  /** Add measured numbers to every quest in the pool, by how each quest counts them. */
  _applyQuestMetrics(metrics) {
    var self = this;
    this._deferSave = true; // one save at the end instead of one per quest
    try {
      QUESTS.forEach(function (q) {
        var v = metrics[q.metric];
        if (q.agg === 'distinct') {
          if (Array.isArray(v) && v.length) self._addQuestDistinct(q.id, v);
        } else if (q.agg === 'max') {
          self._raiseQuest(q.id, v);
        } else if (Number(v) > 0) {
          self.incrementQuest(q.id, Number(v));
        }
      });
    } finally {
      this._deferSave = false;
    }
    this.save();
  }

  /** The ids of the quests on offer today (kept for the day, so a later update to the pool does not change them). */
  getDailyQuestIds(dateKey) {
    var key = dateKey || todayKey();
    var picks = this.data.progression.questPicks || (this.data.progression.questPicks = {});
    if (!Array.isArray(picks[key])) {
      picks[key] = questIdsForDate(key);
      var keys = Object.keys(picks).sort();
      while (keys.length > 45) delete picks[keys.shift()];
    }
    return picks[key].slice();
  }

  /**
   * Pay to swap one of today's quests for a new one. Not for a quest that is already done, and never for free.
   * @param {string} oldId
   * @param {function(): number} [rand]
   * @returns {{success: boolean, newId?: string, cost?: number, error?: string}}
   */
  swapQuest(oldId, rand) {
    var key = todayKey();
    var ids = this.getDailyQuestIds(key);
    var at = ids.indexOf(oldId);
    if (at < 0) return { success: false, error: 'That quest is not on offer today.' };
    var def = this._getQuestDef(oldId);
    var qs = (this.data.progression.questState[key] || {})[oldId] || {};
    if (qs.completed || qs.claimed || (def && (qs.progress || 0) >= def.target)) return { success: false, error: 'That quest is already done.' };
    if (this.data.progression.coins < QUEST_SWAP_COST) return { success: false, error: 'You need ' + QUEST_SWAP_COST + ' coins to swap a quest.' };
    var self = this;
    var newId = pickReplacementQuest(ids, oldId, function (id) { return self.getQuestProgress(id); }, rand);
    if (!newId) return { success: false, error: 'There is no other quest to swap in.' };
    this.data.progression.coins -= QUEST_SWAP_COST;
    this.data.progression.questPicks[key][at] = newId;
    this.save();
    return { success: true, newId: newId, cost: QUEST_SWAP_COST };
  }

  /** Quest definitions on offer today. */
  getDailyQuests(dateKey) {
    var ids = this.getDailyQuestIds(dateKey);
    return ids.map(function (id) { return QUESTS.filter(function (q) { return q.id === id; })[0]; }).filter(Boolean);
  }

  /** Ids of today's quests that are complete (claimed or not). */
  _completedQuestIds() {
    var day = this.data.progression.questState[todayKey()] || {};
    var offered = this.getDailyQuestIds();
    return Object.keys(day).filter(function (id) { return day[id] && day[id].completed && offered.indexOf(id) >= 0; });
  }

  /** Set a quest's progress to a value if it is higher than what is there (for "in one run" quests). */
  _raiseQuest(questId, value) {
    var v = Number(value) || 0;
    if (!(v > 0)) return;
    var today = todayKey();
    var day = this.data.progression.questState[today] || (this.data.progression.questState[today] = {});
    var qs = day[questId] || (day[questId] = { progress: 0, completed: false, claimed: false, completedAt: null, claimedAt: null });
    if (v > qs.progress) this.incrementQuest(questId, v - qs.progress);
  }

  /** Add names to a quest's set of distinct things seen today; progress is the size of the set. */
  _addQuestDistinct(questId, names) {
    var today = todayKey();
    var day = this.data.progression.questState[today] || (this.data.progression.questState[today] = {});
    var qs = day[questId] || (day[questId] = { progress: 0, completed: false, claimed: false, completedAt: null, claimedAt: null });
    var seen = Array.isArray(qs.seen) ? qs.seen : (qs.seen = []);
    names.forEach(function (n) { if (seen.indexOf(n) < 0) seen.push(n); });
    if (seen.length > qs.progress) this.incrementQuest(questId, seen.length - qs.progress);
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

    // Quests: flashcards seen and known today
    var questsBefore = this._completedQuestIds();
    this._applyQuestMetrics({ flashcards: summary.total || 0, flashcardsKnown: summary.correct || 0, flashcardSessions: (summary.total || 0) > 0 ? 1 : 0 });
    var flashQuests = this._completedQuestIds().filter(function (id) { return questsBefore.indexOf(id) < 0; });

    // Achievements
    var newAchievements = this._evaluateAchievements(null);

    this.save();

    return {
      applied: true,
      duplicate: false,
      newlyUnlockedAchievementIds: newAchievements,
      completedQuestIds: flashQuests
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
    var self = this;
    var A = ACHIEVEMENT_IDS;

    // Every id is read from ACHIEVEMENT_IDS (no string fallbacks: a misspelt name must fail loudly in the
    // achievements test rather than quietly award nothing).
    function award(key, earned) {
      if (earned && self.unlockAchievement(A[key])) newlyUnlocked.push(A[key]);
    }

    // Lifetime totals
    award('FIRST_RUN', p.totalEncounters >= 1);
    award('ENCOUNTERS_100', p.totalEncounters >= 100);
    award('ENCOUNTERS_500', p.totalEncounters >= 500);
    award('ENCOUNTERS_1000', p.totalEncounters >= 1000);
    award('STUDIED_500', p.totalCardsStudied >= 500);
    award('STUDIED_1000', p.totalCardsStudied >= 1000);
    award('DAILY_3', p.dailyStreak >= 3);
    award('DAILY_7', p.dailyStreak >= 7);
    award('DAILY_30', p.dailyStreak >= 30);
    award('STREAK_10', p.bestStreak >= 10);
    award('STREAK_25', p.bestStreak >= 25);
    award('STREAK_50', p.bestStreak >= 50);
    award('STREAK_100', p.bestStreak >= 100);
    award('COINS_500', p.totalCoinsEarned >= 500);
    award('COINS_5000', p.totalCoinsEarned >= 5000);
    award('MP_FIRST', p.multiplayerGamesPlayed >= 1);
    award('MP_WIN', p.multiplayerWins >= 1);
    award('MP_WIN_5', p.multiplayerWins >= 5);
    award('PLAYTIME_30MIN', p.totalPlayTimeMs >= 1800000);
    award('PLAYTIME_1HR', p.totalPlayTimeMs >= 3600000);
    award('PERFECT_10', p.perfectRuns >= 10);
    award('PERFECT_50', p.perfectRuns >= 50);
    // (the two starter study-buddy entries come with the game, so they do not count towards the Collector badges)
    var collected = p.ownedItems.filter(function (id) { return id !== 'pal_none' && id !== 'pal_cat'; }).length;
    award('COLLECT_10', collected >= 10);
    award('COLLECT_25', collected >= 25);
    award('COLLECT_50', collected >= 50);
    award('FLASHCARD_FIRST', (p.flashcardSessions || 0) >= 1);
    award('FLASHCARD_10', (p.flashcardSessions || 0) >= 10);
    award('FAST_500MS', p.fastestCorrectAnswerMs != null && p.fastestCorrectAnswerMs <= 500);
    award('FAST_300MS', p.fastestCorrectAnswerMs != null && p.fastestCorrectAnswerMs <= 300);

    // Subject mastery: 50+ answers and 80%+ correct in a subject
    var ss = this.data.cards.subjectStats || {};
    var touched = 0;
    var mastered = 0;
    Object.keys(ss).forEach(function (subj) {
      var total = (ss[subj].correct || 0) + (ss[subj].wrong || 0);
      if (total > 0) touched++;
      if (total >= 50 && ss[subj].correct / total >= 0.8) {
        mastered++;
        if (SUBJECT_MASTERY_KEYS[subj]) award(SUBJECT_MASTERY_KEYS[subj], true);
      }
    });
    award('ALL_SUBJECTS', touched >= 15);
    award('MASTER_1_SUBJECT', mastered >= 1);
    award('MASTER_5_SUBJECTS', mastered >= 5);
    award('MASTER_10_SUBJECTS', mastered >= 10);
    award('MASTER_ALL_SUBJECTS', mastered >= 15);

    // Things that happen at one moment (a purchase, a new custom card)
    if (runData && runData.purchased) award('BUY_FIRST', true);
    if (runData && runData.customCardCreated) award('CUSTOM_CARD', true);

    // Run-specific checks
    if (runData && runData.score !== undefined) {
      award('SCORE_1000', (runData.score || 0) >= 5000);
      award('SCORE_5000', (runData.score || 0) >= 15000);
      award('SCORE_10000', (runData.score || 0) >= 30000);
      award('PERFECT_RUN', !!runData.completed && runData.correct >= PERFECT_RUN_MIN_CORRECT && runData.wrong === 0);
      award('GOLDEN_DOCTOR', runData.correct >= 20 && runData.wrong === 0);
      award('SPEED_MAX', !!runData.completed && (runData.userSpeed || 0) >= 10);
      if (runData.fastestDecisionMs != null) {
        award('FAST_500MS', runData.fastestDecisionMs <= 500);
        award('FAST_300MS', runData.fastestDecisionMs <= 300);
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
        studyStreak: this.getStreakStatus().streak,
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
      return { ok: false, error: 'This is not a Dx Dash backup.' };
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

// Two tabs (or a tab and an installed copy) share one save. When another one saves, take its data instead of
// keeping the old copy in memory, or the next save from this one would wipe what the other just did.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', function (e) {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      var incoming = JSON.parse(e.newValue);
      if (!incoming || incoming.schemaVersion !== SCHEMA_VERSION) return;
      storageInstance.data = deepMerge(incoming, DEFAULTS);
      storageInstance._ensureInvariants();
      document.dispatchEvent(new CustomEvent('dx:data-refreshed'));
    } catch (err) { /* a half-written or foreign value: keep what we have */ }
  });
}

export { storageInstance as storage, progression, DEFAULTS as STORAGE_DEFAULTS };
