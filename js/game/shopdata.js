/**
 * shopdata.js — Shop items, quests, avatar definitions, and achievements
 *
 * ARCHITECTURE CONTRACT (v2.0.0):
 * - Exports canonical ID registries: ACHIEVEMENT_IDS, QUEST_IDS
 * - All achievement unlocking must use ACHIEVEMENT_IDS
 * - All quest definitions must use QUEST_IDS
 * - String literals for achievement or quest IDs outside registries are prohibited
 * - Contains no storage or UI imports
 * - Contains no evaluation side effects
 * - Every ID is unique
 * - Vehicle compatibility declared on every cosmetic item
 * - Achievement-gated cosmetics declare their gating achievement
 * - Quest event mappings declared on every quest
 * - Descriptions and thresholds aligned
 * - Perfect-run achievements evaluate perfectRuns counter
 * - Subject mastery: total >= 50 && correct/total >= 0.8
 */

import { CHARACTER_MODELS, MONSTER_MODELS } from './modelcatalog.js';

// ═══════════════════════════════════════════════════════════
// CANONICAL ID REGISTRIES
// ═══════════════════════════════════════════════════════════

export var ACHIEVEMENT_IDS = Object.freeze({
  // First steps
  FIRST_RUN: 'ach_first_run',
  PERFECT_RUN: 'ach_perfect_run',

  // Streak milestones
  STREAK_10: 'ach_streak_10',
  STREAK_25: 'ach_streak_25',
  STREAK_50: 'ach_streak_50',
  STREAK_100: 'ach_streak_100',

  // Score milestones
  SCORE_1000: 'ach_score_1000',
  SCORE_5000: 'ach_score_5000',
  SCORE_10000: 'ach_score_10000',

  // Coin milestones
  COINS_500: 'ach_coins_500',
  COINS_5000: 'ach_coins_5000',

  // Encounter milestones
  ENCOUNTERS_100: 'ach_encounters_100',
  ENCOUNTERS_500: 'ach_encounters_500',
  ENCOUNTERS_1000: 'ach_encounters_1000',

  // Daily streak milestones
  DAILY_3: 'ach_daily_3',
  DAILY_7: 'ach_daily_7',
  DAILY_30: 'ach_daily_30',

  // Special
  ALL_SUBJECTS: 'ach_all_subjects',
  CUSTOM_CARD: 'ach_custom_card',
  SPEED_MAX: 'ach_speed_max',
  BUY_FIRST: 'ach_buy_first',
  GOLDEN_DOCTOR: 'ach_golden_doctor',

  // Subject mastery (total >= 50 && correct/total >= 0.8)
  MASTER_NEURO: 'ach_master_neuro',
  MASTER_CARDIO: 'ach_master_cardio',
  MASTER_NEPHRO: 'ach_master_nephro',
  MASTER_PSYCH: 'ach_master_psych',
  MASTER_GI: 'ach_master_gi',
  MASTER_PULM: 'ach_master_pulm',
  MASTER_ID: 'ach_master_id',
  MASTER_ENDO: 'ach_master_endo',
  MASTER_HEME: 'ach_master_heme',
  MASTER_RHEUM: 'ach_master_rheum',
  MASTER_OBGYN: 'ach_master_obgyn',
  MASTER_PEDS: 'ach_master_peds',
  MASTER_SURG: 'ach_master_surg',
  MASTER_EM: 'ach_master_em',
  MASTER_MULTI: 'ach_master_multi',

  // Mastery count milestones
  MASTER_1_SUBJECT: 'ach_master_1_subject',
  MASTER_5_SUBJECTS: 'ach_master_5_subjects',
  MASTER_10_SUBJECTS: 'ach_master_10_subjects',
  MASTER_ALL_SUBJECTS: 'ach_master_all_subjects',

  // Speed achievements (decisionMs based)
  FAST_500MS: 'ach_fast_500ms',
  FAST_300MS: 'ach_fast_300ms',

  // Collection achievements
  COLLECT_10: 'ach_collect_10',
  COLLECT_25: 'ach_collect_25',
  COLLECT_50: 'ach_collect_50',

  // Multiplayer achievements
  MP_FIRST: 'ach_mp_first',
  MP_WIN: 'ach_mp_win',
  MP_WIN_5: 'ach_mp_win5',

  // Endurance achievements
  PLAYTIME_30MIN: 'ach_playtime_30min',
  PLAYTIME_1HR: 'ach_playtime_1hr',

  // Cards studied
  STUDIED_500: 'ach_studied_500',
  STUDIED_1000: 'ach_studied_1000',

  // Perfect run count achievements (uses perfectRuns counter)
  PERFECT_10: 'ach_perfect_10',
  PERFECT_50: 'ach_perfect_50',

  // Flashcard achievements
  FLASHCARD_FIRST: 'ach_flashcard_first',
  FLASHCARD_10: 'ach_flashcard_10'
});

export var QUEST_IDS = Object.freeze({
  STREAK_8: 'q_streak8',
  ENCOUNTERS_25: 'q_25enc',
  DAILY: 'q_daily',
  CORRECT_10: 'q_10correct',
  COINS_50: 'q_50coins',
  POWERUPS_3: 'q_3powerups',
  PERFECT_5: 'q_perfect5',
  SPEED_3: 'q_speed3',
  ALL_SUBJECTS_5: 'q_allsubjects',
  JUMP_5: 'q_jump5',
  SLIDE_5: 'q_slide5',
  RUSH_3: 'q_rush3'
});

// ═══════════════════════════════════════════════════════════
// VEHICLE TYPES
// ═══════════════════════════════════════════════════════════

var VEHICLE_TYPES = Object.freeze({
  AMBULANCE: 'ambulance',
  RACECAR: 'racecar',
  HEARSE: 'hearse'
});

// ═══════════════════════════════════════════════════════════
// COMPATIBILITY HELPERS
// ═══════════════════════════════════════════════════════════

var COMPAT_HUMANOID_ONLY = Object.freeze({
  humanoid: true,
  vehicle: false,
  vehicleTypes: []
});

var COMPAT_ALL = Object.freeze({
  humanoid: true,
  vehicle: true,
  vehicleTypes: [VEHICLE_TYPES.AMBULANCE, VEHICLE_TYPES.RACECAR, VEHICLE_TYPES.HEARSE]
});

// ═══════════════════════════════════════════════════════════
// AVATARS
// ═══════════════════════════════════════════════════════════

export var AVATARS = [
  {
    id: "avatar_intern",
    name: "Intern",
    desc: "Eager and ready to learn",
    price: 0,
    bodyColor: 0x2288dd,
    pantsColor: 0x1a5599,
    shoeColor: 0xff3333,
    skinColor: 0xffccaa,
    hairColor: 0x332211,
    scale: 1.0,
    legSpeed: 1.0,
    armSwing: 1.0,
    icon: "🩺"
  },
  {
    id: "avatar_attending",
    name: "Attending",
    desc: "White coat authority",
    price: 1500,
    bodyColor: 0xe8e8f0,
    pantsColor: 0x334455,
    shoeColor: 0x222222,
    skinColor: 0xffccaa,
    hairColor: 0x221100,
    scale: 1.05,
    legSpeed: 0.9,
    armSwing: 0.8,
    icon: "👨‍⚕️"
  },
  {
    id: "avatar_superhero",
    name: "Superhero Doc",
    desc: "Saves lives AND the world",
    price: 3000,
    bodyColor: 0xdd2222,
    pantsColor: 0x1a1a88,
    shoeColor: 0xffcc00,
    skinColor: 0xffccaa,
    hairColor: 0x111111,
    scale: 1.1,
    legSpeed: 1.2,
    armSwing: 1.3,
    hasCape: true,
    capeColor: 0xdd2222,
    icon: "🦸"
  },
  {
    id: "avatar_robot",
    name: "Robot Medic",
    desc: "Beep boop. Diagnosing...",
    price: 4000,
    bodyColor: 0x888899,
    pantsColor: 0x666677,
    shoeColor: 0x44aaff,
    skinColor: 0xccccdd,
    hairColor: 0x555566,
    scale: 1.0,
    legSpeed: 1.1,
    armSwing: 0.7,
    hasAntenna: true,
    glowColor: 0x44aaff,
    icon: "🤖"
  },
  {
    id: "avatar_wizard",
    name: "Wizard Healer",
    desc: "Ancient medical arts",
    price: 5000,
    bodyColor: 0x6622aa,
    pantsColor: 0x441188,
    shoeColor: 0x886633,
    skinColor: 0xffccaa,
    hairColor: 0xcccccc,
    scale: 1.0,
    legSpeed: 0.85,
    armSwing: 1.1,
    hasWizardHat: true,
    hatColor: 0x6622aa,
    icon: "🧙"
  },
  {
    id: "avatar_zombie",
    name: "Zombie Resident",
    desc: "36 hours on call...",
    price: 2500,
    bodyColor: 0x448844,
    pantsColor: 0x336633,
    shoeColor: 0x554433,
    skinColor: 0x88bb88,
    hairColor: 0x333322,
    scale: 1.0,
    legSpeed: 1.3,
    armSwing: 1.4,
    icon: "🧟"
  },
  {
    id: "avatar_golden",
    name: "Golden Doctor",
    desc: "Flawless diagnostician — 0 wrong, 20+ correct in one run",
    price: 0,
    bodyColor: 0xffd700,
    pantsColor: 0xdaa520,
    shoeColor: 0xff8c00,
    skinColor: 0xffe4b5,
    hairColor: 0xb8860b,
    scale: 1.08,
    legSpeed: 1.0,
    armSwing: 1.0,
    icon: "🏆",
    hidden: true,
    gatedBy: ACHIEVEMENT_IDS.GOLDEN_DOCTOR
  },
  // Vehicle avatars
  {
    id: "avatar_ambulance",
    name: "Ambulance",
    desc: "Wee-woo wee-woo! Rush to the rescue",
    price: 6000,
    isVehicle: true,
    vehicleType: VEHICLE_TYPES.AMBULANCE,
    bodyColor: 0xf0f0f0,
    pantsColor: 0xdddddd,
    shoeColor: 0x333333,
    skinColor: 0xf0f0f0,
    hairColor: 0xff2222,
    scale: 1.3,
    legSpeed: 1.0,
    armSwing: 0.0,
    icon: "🚑"
  },
  {
    id: "avatar_racecar",
    name: "Race Car",
    desc: "Speed through your boards!",
    price: 7000,
    isVehicle: true,
    vehicleType: VEHICLE_TYPES.RACECAR,
    bodyColor: 0xdd2222,
    pantsColor: 0x222222,
    shoeColor: 0x333333,
    skinColor: 0xdd2222,
    hairColor: 0xffffff,
    scale: 1.2,
    legSpeed: 1.0,
    armSwing: 0.0,
    icon: "🏎️"
  },
  {
    id: "avatar_hearse",
    name: "Hearse",
    desc: "For when the boards go wrong...",
    price: 8000,
    isVehicle: true,
    vehicleType: VEHICLE_TYPES.HEARSE,
    bodyColor: 0x222222,
    pantsColor: 0x111111,
    shoeColor: 0x333333,
    skinColor: 0x222222,
    hairColor: 0x6622aa,
    scale: 1.3,
    legSpeed: 0.8,
    armSwing: 0.0,
    glowColor: 0x8844cc,
    icon: "⚰️"
  },
  // Additional character avatars
  {
    id: "avatar_nurse",
    name: "Nurse",
    desc: "The backbone of healthcare",
    price: 2000,
    bodyColor: 0xffffff,
    pantsColor: 0xffffff,
    shoeColor: 0xffffff,
    skinColor: 0xffccaa,
    hairColor: 0x553322,
    hairStyle: "ponytail",
    scale: 1.0,
    legSpeed: 1.0,
    armSwing: 1.0,
    icon: "👩‍⚕️"
  },
  {
    id: "avatar_surgeon",
    name: "Surgeon",
    desc: "Scrubbed in and ready",
    price: 3500,
    bodyColor: 0x338855,
    pantsColor: 0x226644,
    shoeColor: 0x44aa66,
    skinColor: 0xffccaa,
    hairColor: 0x221100,
    scale: 1.0,
    legSpeed: 0.95,
    armSwing: 0.9,
    icon: "🔪"
  },
  {
    id: "avatar_skeleton",
    name: "Skeleton",
    desc: "Study anatomy from the inside",
    price: 4000,
    bodyColor: 0xeeeedd,
    pantsColor: 0xddddcc,
    shoeColor: 0xccccbb,
    skinColor: 0xeeeedd,
    hairColor: 0xeeeedd,
    scale: 0.95,
    legSpeed: 1.1,
    armSwing: 1.2,
    icon: "💀"
  }
];

// ═══════════════════════════════════════════════════════════
// SHOP ITEMS
// ═══════════════════════════════════════════════════════════

export var SHOP_ITEMS = [
  // --- Skins (avatars) ---
  { id: "avatar_intern", name: "Intern", price: 0, type: "skin", color: 0x2288dd, icon: "🩺", compatibility: COMPAT_ALL },
  { id: "avatar_attending", name: "Attending", price: 1500, type: "skin", color: 0xe8e8f0, icon: "👨‍⚕️", compatibility: COMPAT_ALL },
  { id: "avatar_superhero", name: "Superhero Doc", price: 3000, type: "skin", color: 0xdd2222, icon: "🦸", compatibility: COMPAT_ALL },
  { id: "avatar_robot", name: "Robot Medic", price: 4000, type: "skin", color: 0x888899, icon: "🤖", compatibility: COMPAT_ALL },
  { id: "avatar_wizard", name: "Wizard Healer", price: 5000, type: "skin", color: 0x6622aa, icon: "🧙", compatibility: COMPAT_ALL },
  { id: "avatar_zombie", name: "Zombie Resident", price: 2500, type: "skin", color: 0x448844, icon: "🧟", compatibility: COMPAT_ALL },
  { id: "avatar_golden", name: "Golden Doctor", price: 0, type: "skin", color: 0xffd700, icon: "🏆", hidden: true, gatedBy: ACHIEVEMENT_IDS.GOLDEN_DOCTOR, compatibility: COMPAT_ALL },
  { id: "avatar_ambulance", name: "Ambulance", price: 6000, type: "skin", color: 0xf0f0f0, icon: "🚑", compatibility: COMPAT_ALL },
  { id: "avatar_racecar", name: "Race Car", price: 7000, type: "skin", color: 0xdd2222, icon: "🏎️", compatibility: COMPAT_ALL },
  { id: "avatar_hearse", name: "Hearse", price: 8000, type: "skin", color: 0x222222, icon: "⚰️", compatibility: COMPAT_ALL },
  { id: "avatar_nurse", name: "Nurse", price: 2000, type: "skin", color: 0xffffff, icon: "👩‍⚕️", compatibility: COMPAT_ALL },
  { id: "avatar_surgeon", name: "Surgeon", price: 3500, type: "skin", color: 0x338855, icon: "🔪", compatibility: COMPAT_ALL },
  { id: "avatar_skeleton", name: "Skeleton", price: 4000, type: "skin", color: 0xeeeedd, icon: "💀", compatibility: COMPAT_ALL },

  // --- Exam monsters ---
  { id: "monster_classic", name: "Exam Monster", price: 0, type: "monster", color: 0x220044, icon: "👾", compatibility: COMPAT_ALL },
  { id: "monster_wraith", name: "Pager Wraith", price: 3000, type: "monster", color: 0x33ccff, icon: "👻", compatibility: COMPAT_ALL },
  { id: "monster_golem", name: "Textbook Golem", price: 5000, type: "monster", color: 0xffaa33, icon: "📚", compatibility: COMPAT_ALL },
  { id: "monster_kraken", name: "Caffeine Kraken", price: 7000, type: "monster", color: 0xff7733, icon: "☕", compatibility: COMPAT_ALL },

  // --- Hats (humanoid only) ---
  { id: "hat_none", name: "No Hat", price: 0, type: "hat", color: null, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "hat_cap", name: "Scrub Cap", price: 800, type: "hat", color: 0x40c4ff, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "hat_headlamp", name: "Headlamp", price: 1200, type: "hat", color: 0xffd740, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "hat_crown", name: "Golden Crown", price: 5000, type: "hat", color: 0xffd700, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "hat_halo", name: "Halo", price: 3500, type: "hat", color: 0xffffaa, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "hat_viking", name: "Viking Helmet", price: 2500, type: "hat", color: 0x886644, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "hat_party", name: "Party Hat", price: 1000, type: "hat", color: 0xff44aa, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "hat_chef", name: "Chef Hat", price: 1500, type: "hat", color: 0xffffff, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "hat_graduation", name: "Graduation Cap", price: 2000, type: "hat", color: 0x111111, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "hat_headmirror", name: "Head Mirror", price: 1000, type: "hat", color: 0xcccccc, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "hat_bandana", name: "Bandana", price: 600, type: "hat", color: 0xff4444, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "hat_tophat", name: "Top Hat", price: 3000, type: "hat", color: 0x111111, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "hat_beanie", name: "Beanie", price: 400, type: "hat", color: 0x4466aa, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "hat_cowboy", name: "Cowboy Hat", price: 1500, type: "hat", color: 0x886644, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "hat_tiara", name: "Tiara", price: 4000, type: "hat", color: 0xffd700, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "hat_propeller", name: "Propeller Hat", price: 800, type: "hat", color: 0xff4488, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "hat_catears", name: "Cat Ears", price: 1200, type: "hat", color: 0xffaacc, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "hat_sunglasses", name: "Sunglasses", price: 700, type: "hat", color: 0x111111, compatibility: COMPAT_HUMANOID_ONLY },

  // --- Trails (all avatars) ---
  { id: "trail_none", name: "No Trail", price: 0, type: "trail", color: null, compatibility: COMPAT_ALL },
  { id: "trail_ekg", name: "EKG Line", price: 2000, type: "trail", color: 0x00ff44, compatibility: COMPAT_ALL },
  { id: "trail_neural", name: "Neural Sparks", price: 2500, type: "trail", color: 0xaa44ff, compatibility: COMPAT_ALL },
  { id: "trail_blood", name: "Blood Cells", price: 2000, type: "trail", color: 0xff2222, compatibility: COMPAT_ALL },
  { id: "trail_dna", name: "DNA Helix", price: 3000, type: "trail", color: 0x4488ff, compatibility: COMPAT_ALL },
  { id: "trail_fire", name: "Fire Trail", price: 3500, type: "trail", color: 0xff8800, compatibility: COMPAT_ALL },
  { id: "trail_rainbow", name: "Rainbow", price: 4000, type: "trail", color: 0xff44ff, compatibility: COMPAT_ALL },
  { id: "trail_confetti", name: "Confetti", price: 3000, type: "trail", color: 0xff4444, compatibility: COMPAT_ALL },
  { id: "trail_hearts", name: "Hearts", price: 2500, type: "trail", color: 0xff4488, compatibility: COMPAT_ALL },
  { id: "trail_lightning", name: "Lightning", price: 3500, type: "trail", color: 0xffff44, compatibility: COMPAT_ALL },
  { id: "trail_bubbles", name: "Bubbles", price: 2000, type: "trail", color: 0x88ddff, compatibility: COMPAT_ALL },
  { id: "trail_music", name: "Music Notes", price: 2500, type: "trail", color: 0xff88ff, compatibility: COMPAT_ALL },
  { id: "trail_pills", name: "Pill Trail", price: 1500, type: "trail", color: 0xff4444, compatibility: COMPAT_ALL },

  // --- Gear (humanoid only) ---
  { id: "gear_none", name: "No Gear", price: 0, type: "gear", color: null, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "gear_steth", name: "Stethoscope", price: 1000, type: "gear", color: 0x888888, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "gear_clip", name: "Clipboard", price: 800, type: "gear", color: 0x8d6e3f, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "gear_syringe", name: "Syringe", price: 1200, type: "gear", color: 0x44aaff, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "gear_defib", name: "Defib Paddles", price: 2500, type: "gear", color: 0xff4444, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "gear_hammer", name: "Reflex Hammer", price: 1500, type: "gear", color: 0xcc6622, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "gear_mask", name: "Surgical Mask", price: 600, type: "gear", color: 0x88ccdd, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "gear_coffee", name: "Coffee Cup", price: 500, type: "gear", color: 0x8B4513, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "gear_textbook", name: "Medical Textbook", price: 700, type: "gear", color: 0x2255aa, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "gear_badge", name: "Hospital Badge", price: 300, type: "gear", color: 0xffffff, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "gear_wings", name: "Angel Wings", price: 5000, type: "gear", color: 0xffffff, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "gear_backpack", name: "Backpack", price: 1500, type: "gear", color: 0x44aa44, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "gear_shield_item", name: "Shield", price: 2500, type: "gear", color: 0x4488ff, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "gear_katana", name: "Bone Saw", price: 3000, type: "gear", color: 0xcccccc, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "gear_pager", name: "Pager", price: 500, type: "gear", color: 0x333344, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "gear_ivbag", name: "IV Bag Backpack", price: 1800, type: "gear", color: 0x99ddff, compatibility: COMPAT_HUMANOID_ONLY },

  // --- Clothing (humanoid only) ---
  { id: "cloth_none", name: "No Clothing", price: 0, type: "clothing", color: null, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "cloth_scrubs", name: "Medical Scrubs", price: 500, type: "clothing", color: 0x4488cc, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "cloth_labcoat", name: "Lab Coat", price: 1000, type: "clothing", color: 0xffffff, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "cloth_surgical_gown", name: "Surgical Gown", price: 800, type: "clothing", color: 0x44aa77, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "cloth_hawaiian", name: "Hawaiian Shirt", price: 1500, type: "clothing", color: 0xff6644, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "cloth_tuxedo", name: "Tuxedo", price: 3000, type: "clothing", color: 0x111111, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "cloth_jersey", name: "Sports Jersey", price: 1200, type: "clothing", color: 0xff2222, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "cloth_armor", name: "Body Armor", price: 4000, type: "clothing", color: 0x666677, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "cloth_cape_red", name: "Red Cape", price: 2000, type: "clothing", color: 0xdd2222, compatibility: COMPAT_HUMANOID_ONLY },
  { id: "cloth_cape_rainbow", name: "Rainbow Cape", price: 5000, type: "clothing", color: 0xff44ff, compatibility: COMPAT_HUMANOID_ONLY }
];


// ═══════════════════════════════════════════════════════════
// ANIMATED 3D MODELS (see modelcatalog.js)
// The Intern is now a real animated model. The original blocky Intern stays
// available as "Classic Intern" because only it can wear hats, gear and outfits.
// ═══════════════════════════════════════════════════════════

(function registerModels() {
  var intern = AVATARS[0];
  AVATARS.push(Object.assign({}, intern, {
    id: "avatar_classic",
    name: "Classic Intern",
    desc: "The original blocky intern. Works with every hat, gear and outfit"
  }));
  SHOP_ITEMS.push({ id: "avatar_classic", name: "Classic Intern", price: 0, type: "skin", color: 0x2288dd, icon: "🩺", compatibility: COMPAT_ALL });

  CHARACTER_MODELS.forEach(function (m) {
    if (m.id === "avatar_intern") {
      intern.isModel = true;
      intern.modelUrl = "models/" + m.file;
      intern.name = m.name;
      intern.desc = m.desc;
      intern.bodyColor = m.color;
      intern.parts = m.parts || [];
      return;
    }
    AVATARS.push({
      id: m.id,
      name: m.name,
      desc: m.desc,
      price: m.price,
      // Stand-in colors used until the 3D model has finished loading
      bodyColor: m.color,
      pantsColor: 0x334455,
      shoeColor: 0x222233,
      skinColor: 0xe0b090,
      hairColor: 0x332211,
      scale: 1.0,
      legSpeed: 1.0,
      armSwing: 1.0,
      isModel: true,
      parts: m.parts || [],
      modelUrl: "models/" + m.file,
      icon: m.icon
    });
    SHOP_ITEMS.push({ id: m.id, name: m.name, price: m.price, type: "skin", color: m.color, icon: m.icon, compatibility: COMPAT_HUMANOID_ONLY });
  });

  MONSTER_MODELS.forEach(function (m) {
    SHOP_ITEMS.push({ id: m.id, name: m.name, price: m.price, type: "monster", color: m.color, icon: m.icon, compatibility: COMPAT_ALL });
  });
})();

// ═══════════════════════════════════════════════════════════
// QUESTS
// Each quest declares its event mapping so storage can
// evaluate progress without the engine referencing quest IDs.
// ═══════════════════════════════════════════════════════════

export var QUESTS = [
  {
    id: QUEST_IDS.STREAK_8,
    title: "Hot Streak",
    desc: "8 correct in one run",
    target: 8,
    reward: 500,
    eventMapping: { event: 'streak_reached', filter: { minStreak: 8 } }
  },
  {
    id: QUEST_IDS.ENCOUNTERS_25,
    title: "Marathon",
    desc: "25 total encounters in one day",
    target: 25,
    reward: 600,
    eventMapping: { event: 'encounter_resolved', accumulate: true }
  },
  {
    id: QUEST_IDS.DAILY,
    title: "Daily Rounds",
    desc: "Complete a daily round",
    target: 1,
    reward: 800,
    eventMapping: { event: 'daily_completed' }
  },
  {
    id: QUEST_IDS.CORRECT_10,
    title: "Sharp Mind",
    desc: "10 correct answers in one day",
    target: 10,
    reward: 400,
    eventMapping: { event: 'correct_answer', accumulate: true }
  },
  {
    id: QUEST_IDS.COINS_50,
    title: "Coin Collector",
    desc: "Collect 100 coins in one run",
    target: 100,
    reward: 500,
    eventMapping: { event: 'coin_collected', accumulate: true }
  },
  {
    id: QUEST_IDS.POWERUPS_3,
    title: "Powered Up",
    desc: "Collect 3 power-ups in one run",
    target: 3,
    reward: 700,
    eventMapping: { event: 'powerup_collected', accumulate: true }
  },
  {
    id: QUEST_IDS.PERFECT_5,
    title: "Perfect Five",
    desc: "Get 5 correct in a row without mistakes",
    target: 5,
    reward: 400,
    eventMapping: { event: 'streak_reached', filter: { minStreak: 5 } }
  },
  {
    id: QUEST_IDS.SPEED_3,
    title: "Speed Round",
    desc: "Answer 3 cards in under 2 seconds each",
    target: 3,
    reward: 600,
    eventMapping: { event: 'correct_answer', filter: { maxDecisionMs: 2000 }, accumulate: true }
  },
  {
    id: QUEST_IDS.ALL_SUBJECTS_5,
    title: "Well-Rounded",
    desc: "Answer cards from 5 different subjects",
    target: 5,
    reward: 800,
    eventMapping: { event: 'encounter_resolved', countDistinct: 'subject' }
  },
  {
    id: QUEST_IDS.JUMP_5,
    title: "Parkour Pro",
    desc: "Jump over 5 obstacles in one run",
    target: 5,
    reward: 300,
    eventMapping: { event: 'obstacle_jumped', accumulate: true }
  },
  {
    id: QUEST_IDS.SLIDE_5,
    title: "Limbo Master",
    desc: "Slide under 5 obstacles in one run",
    target: 5,
    reward: 300,
    eventMapping: { event: 'obstacle_slid', accumulate: true }
  },
  {
    id: QUEST_IDS.RUSH_3,
    title: "Rush Hour",
    desc: "Rush through 3 gates in one run",
    target: 3,
    reward: 500,
    eventMapping: { event: 'rush_used', accumulate: true }
  }
];

// ═══════════════════════════════════════════════════════════
// ACHIEVEMENTS
// Each achievement uses ACHIEVEMENT_IDS for its id.
// Descriptions are aligned with evaluation thresholds.
// ═══════════════════════════════════════════════════════════

export var ACHIEVEMENTS = [
  // --- First steps ---
  { id: ACHIEVEMENT_IDS.FIRST_RUN, name: "First Steps", desc: "Complete your first run (1+ encounters)", icon: "🏃", condition: "totalEncounters >= 1" },
  { id: ACHIEVEMENT_IDS.PERFECT_RUN, name: "Perfect Run", desc: "Complete a run with 100% accuracy and at least 1 correct", icon: "💯", condition: "completed && correct > 0 && wrong === 0" },

  // --- Streak milestones ---
  { id: ACHIEVEMENT_IDS.STREAK_10, name: "On Fire", desc: "Reach a 10-card streak", icon: "🔥", condition: "bestStreak >= 10" },
  { id: ACHIEVEMENT_IDS.STREAK_25, name: "Unstoppable", desc: "Reach a 25-card streak", icon: "⚡", condition: "bestStreak >= 25" },
  { id: ACHIEVEMENT_IDS.STREAK_50, name: "Legendary", desc: "Reach a 50-card streak", icon: "👑", condition: "bestStreak >= 50" },
  { id: ACHIEVEMENT_IDS.STREAK_100, name: "Mythical", desc: "Reach a 100-card streak", icon: "🌟", condition: "bestStreak >= 100" },

  // --- Score milestones ---
  { id: ACHIEVEMENT_IDS.SCORE_1000, name: "Rising Star", desc: "Score 1,000 points in one run", icon: "⭐", condition: "score >= 1000" },
  { id: ACHIEVEMENT_IDS.SCORE_5000, name: "High Achiever", desc: "Score 5,000 points in one run", icon: "🌟", condition: "score >= 5000" },
  { id: ACHIEVEMENT_IDS.SCORE_10000, name: "Board Certified", desc: "Score 10,000 points in one run", icon: "🏆", condition: "score >= 10000" },

  // --- Coin milestones ---
  { id: ACHIEVEMENT_IDS.COINS_500, name: "Piggy Bank", desc: "Earn 500 total coins across all runs", icon: "🪙", condition: "totalCoinsEarned >= 500" },
  { id: ACHIEVEMENT_IDS.COINS_5000, name: "Wealthy Doc", desc: "Earn 5,000 total coins across all runs", icon: "💰", condition: "totalCoinsEarned >= 5000" },

  // --- Encounter milestones ---
  { id: ACHIEVEMENT_IDS.ENCOUNTERS_100, name: "Seasoned", desc: "Answer 100 total cards", icon: "📚", condition: "totalEncounters >= 100" },
  { id: ACHIEVEMENT_IDS.ENCOUNTERS_500, name: "Veteran", desc: "Answer 500 total cards", icon: "🎖️", condition: "totalEncounters >= 500" },
  { id: ACHIEVEMENT_IDS.ENCOUNTERS_1000, name: "Grand Master", desc: "Answer 1,000 total cards", icon: "🏅", condition: "totalEncounters >= 1000" },

  // --- Daily streak milestones ---
  { id: ACHIEVEMENT_IDS.DAILY_3, name: "Consistent", desc: "Complete 3 consecutive daily rounds", icon: "📅", condition: "dailyStreak >= 3" },
  { id: ACHIEVEMENT_IDS.DAILY_7, name: "Dedicated", desc: "Complete 7 consecutive daily rounds", icon: "🗓️", condition: "dailyStreak >= 7" },
  { id: ACHIEVEMENT_IDS.DAILY_30, name: "Committed", desc: "Complete 30 consecutive daily rounds", icon: "💪", condition: "dailyStreak >= 30" },

  // --- Special achievements ---
  { id: ACHIEVEMENT_IDS.ALL_SUBJECTS, name: "Renaissance Doc", desc: "Answer cards from all 15 subjects", icon: "🌍", condition: "subjectsTouched >= 15" },
  { id: ACHIEVEMENT_IDS.CUSTOM_CARD, name: "Card Creator", desc: "Create your first custom card", icon: "📝", condition: "customCardCreated" },
  { id: ACHIEVEMENT_IDS.SPEED_MAX, name: "Speed Demon", desc: "Complete a run at speed 10", icon: "🏎️", condition: "userSpeed >= 10" },
  { id: ACHIEVEMENT_IDS.BUY_FIRST, name: "Shopper", desc: "Buy your first item from the Locker", icon: "🛍️", condition: "firstPurchase" },
  { id: ACHIEVEMENT_IDS.GOLDEN_DOCTOR, name: "Golden Doctor", desc: "Perfect run with 20+ correct answers (0 wrong, 20+ correct)", icon: "✨", condition: "completed && wrong === 0 && correct >= 20" },

  // --- Subject mastery (total >= 50 && correct/total >= 0.8) ---
  { id: ACHIEVEMENT_IDS.MASTER_NEURO, name: "Neuro Master", desc: "80%+ accuracy in Neurology (50+ cards answered)", icon: "🧠", condition: "subjectMastery:Neurology" },
  { id: ACHIEVEMENT_IDS.MASTER_CARDIO, name: "Cardio Master", desc: "80%+ accuracy in Cardiology (50+ cards answered)", icon: "❤️", condition: "subjectMastery:Cardiology" },
  { id: ACHIEVEMENT_IDS.MASTER_NEPHRO, name: "Nephro Master", desc: "80%+ accuracy in Nephrology (50+ cards answered)", icon: "🫘", condition: "subjectMastery:Nephrology" },
  { id: ACHIEVEMENT_IDS.MASTER_PSYCH, name: "Psych Master", desc: "80%+ accuracy in Psychiatry (50+ cards answered)", icon: "🧩", condition: "subjectMastery:Psychiatry" },
  { id: ACHIEVEMENT_IDS.MASTER_GI, name: "GI Master", desc: "80%+ accuracy in Gastroenterology (50+ cards answered)", icon: "🫁", condition: "subjectMastery:Gastroenterology" },
  { id: ACHIEVEMENT_IDS.MASTER_PULM, name: "Pulm Master", desc: "80%+ accuracy in Pulmonology (50+ cards answered)", icon: "💨", condition: "subjectMastery:Pulmonology" },
  { id: ACHIEVEMENT_IDS.MASTER_ID, name: "ID Master", desc: "80%+ accuracy in Infectious Disease (50+ cards answered)", icon: "🦠", condition: "subjectMastery:Infectious Disease" },
  { id: ACHIEVEMENT_IDS.MASTER_ENDO, name: "Endo Master", desc: "80%+ accuracy in Endocrinology (50+ cards answered)", icon: "🦋", condition: "subjectMastery:Endocrinology" },
  { id: ACHIEVEMENT_IDS.MASTER_HEME, name: "Heme Master", desc: "80%+ accuracy in Hematology/Oncology (50+ cards answered)", icon: "🩸", condition: "subjectMastery:Hematology/Oncology" },
  { id: ACHIEVEMENT_IDS.MASTER_RHEUM, name: "Rheum Master", desc: "80%+ accuracy in Rheumatology (50+ cards answered)", icon: "🦴", condition: "subjectMastery:Rheumatology" },
  { id: ACHIEVEMENT_IDS.MASTER_OBGYN, name: "OB/GYN Master", desc: "80%+ accuracy in Obstetrics/Gynecology (50+ cards answered)", icon: "👶", condition: "subjectMastery:Obstetrics/Gynecology" },
  { id: ACHIEVEMENT_IDS.MASTER_PEDS, name: "Peds Master", desc: "80%+ accuracy in Pediatrics (50+ cards answered)", icon: "🧒", condition: "subjectMastery:Pediatrics" },
  { id: ACHIEVEMENT_IDS.MASTER_SURG, name: "Surgery Master", desc: "80%+ accuracy in Surgery (50+ cards answered)", icon: "🔪", condition: "subjectMastery:Surgery" },
  { id: ACHIEVEMENT_IDS.MASTER_EM, name: "EM Master", desc: "80%+ accuracy in Emergency Medicine (50+ cards answered)", icon: "🚨", condition: "subjectMastery:Emergency Medicine" },
  { id: ACHIEVEMENT_IDS.MASTER_MULTI, name: "Multi Master", desc: "80%+ accuracy in Multisystem / Mixed (50+ cards answered)", icon: "🔬", condition: "subjectMastery:Multisystem / Mixed" },

  // --- Mastery count milestones ---
  { id: ACHIEVEMENT_IDS.MASTER_1_SUBJECT, name: "Specialist", desc: "Achieve mastery in 1 subject (50+ cards, 80%+ accuracy)", icon: "🎓", condition: "masteredSubjects >= 1" },
  { id: ACHIEVEMENT_IDS.MASTER_5_SUBJECTS, name: "Polymath", desc: "Achieve mastery in 5 subjects", icon: "📖", condition: "masteredSubjects >= 5" },
  { id: ACHIEVEMENT_IDS.MASTER_10_SUBJECTS, name: "Expert", desc: "Achieve mastery in 10 subjects", icon: "🧑‍🎓", condition: "masteredSubjects >= 10" },
  { id: ACHIEVEMENT_IDS.MASTER_ALL_SUBJECTS, name: "Complete Master", desc: "Achieve mastery in all 15 subjects", icon: "👨‍⚕️", condition: "masteredSubjects >= 15" },

  // --- Speed achievements (uses decisionMs, correct answer only, player-controlled) ---
  { id: ACHIEVEMENT_IDS.FAST_500MS, name: "Quick Draw", desc: "Answer correctly in under 500ms", icon: "⚡", condition: "fastestCorrectAnswer < 500" },
  { id: ACHIEVEMENT_IDS.FAST_300MS, name: "Lightning Reflexes", desc: "Answer correctly in under 300ms", icon: "🌩️", condition: "fastestCorrectAnswer < 300" },

  // --- Collection achievements ---
  { id: ACHIEVEMENT_IDS.COLLECT_10, name: "Collector", desc: "Own 10 items from the Locker", icon: "🎒", condition: "ownedItems >= 10" },
  { id: ACHIEVEMENT_IDS.COLLECT_25, name: "Hoarder", desc: "Own 25 items from the Locker", icon: "🏪", condition: "ownedItems >= 25" },
  { id: ACHIEVEMENT_IDS.COLLECT_50, name: "Completionist", desc: "Own 50 items from the Locker", icon: "💎", condition: "ownedItems >= 50" },

  // --- Multiplayer achievements ---
  { id: ACHIEVEMENT_IDS.MP_FIRST, name: "Challenger", desc: "Play your first multiplayer match", icon: "🎮", condition: "multiplayerGamesPlayed >= 1" },
  { id: ACHIEVEMENT_IDS.MP_WIN, name: "Victor", desc: "Win a multiplayer match", icon: "🥇", condition: "multiplayerWins >= 1" },
  { id: ACHIEVEMENT_IDS.MP_WIN_5, name: "Dominant", desc: "Win 5 multiplayer matches", icon: "🏆", condition: "multiplayerWins >= 5" },

  // --- Endurance achievements ---
  { id: ACHIEVEMENT_IDS.PLAYTIME_30MIN, name: "Marathon Runner", desc: "Play for 30 minutes total", icon: "⏱️", condition: "totalPlayTimeMs >= 1800000" },
  { id: ACHIEVEMENT_IDS.PLAYTIME_1HR, name: "Iron Will", desc: "Play for 1 hour total", icon: "🕐", condition: "totalPlayTimeMs >= 3600000" },

  // --- Cards studied ---
  { id: ACHIEVEMENT_IDS.STUDIED_500, name: "Scholar", desc: "Study 500 total cards across all modes", icon: "📚", condition: "totalCardsStudied >= 500" },
  { id: ACHIEVEMENT_IDS.STUDIED_1000, name: "Professor", desc: "Study 1,000 total cards across all modes", icon: "🎓", condition: "totalCardsStudied >= 1000" },

  // --- Perfect run count achievements (uses perfectRuns counter, NOT lifetime correct) ---
  { id: ACHIEVEMENT_IDS.PERFECT_10, name: "Sharpshooter", desc: "Complete 10 perfect runs (0 wrong, 1+ correct each)", icon: "🎯", condition: "perfectRuns >= 10" },
  { id: ACHIEVEMENT_IDS.PERFECT_50, name: "Flawless", desc: "Complete 50 perfect runs", icon: "💫", condition: "perfectRuns >= 50" },

  // --- Flashcard achievements ---
  { id: ACHIEVEMENT_IDS.FLASHCARD_FIRST, name: "Flashcard Student", desc: "Complete your first flashcard session", icon: "📖", condition: "flashcardSessions >= 1" },
  { id: ACHIEVEMENT_IDS.FLASHCARD_10, name: "Flashcard Regular", desc: "Complete 10 flashcard sessions", icon: "📝", condition: "flashcardSessions >= 10" }
];

// ═══════════════════════════════════════════════════════════
// CONTINUE COST
// ═══════════════════════════════════════════════════════════

export var CONTINUE_COST = 50;
