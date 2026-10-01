/**
 * modelcatalog.js — the animated 3D characters and monsters.
 *
 * All models are by Quaternius, released CC0 (public domain), and were
 * downloaded from poly.pizza. See README "Credits". Paths are relative to the
 * site base (public/models/...).
 *
 * Characters become avatars (shop type "skin"); monsters become exam monsters
 * (shop type "monster"). `flying` monsters hover above the runner, the rest
 * stalk along the ground behind them.
 */

export var CHARACTER_MODELS = [
  // The medical staff come first: they are the stars of the game
  { id: 'avatar_intern', name: 'Dr. Dash', desc: 'White coat, teal scrubs, runs the list', file: 'characters/doctor.glb', price: 0, icon: '🩺', color: 0x1fa3b5, scrub: ['LightBlue'] },
  { id: 'avatar_m_resident', name: 'Resident Rey', desc: 'On call since Tuesday', file: 'characters/resident.glb', price: 400, icon: '😴', color: 0x2b4a8c, scrub: ['White', 'LightBlue'] },
  { id: 'avatar_m_nurse', name: 'Nurse Nova', desc: 'Keeps the whole ward running', file: 'characters/nurse.glb', price: 600, icon: '👩‍⚕️', color: 0x5bc4dc, scrub: ['White', 'Orange'] },
  { id: 'avatar_m_paramedic', name: 'Paramedic Pat', desc: 'First on scene, fastest on foot', file: 'characters/paramedic.glb', price: 800, icon: '🚑', color: 0xd93030 },
  { id: 'avatar_m_surgeon', name: 'Surgeon Sage', desc: 'Steady hands, quick feet', file: 'characters/surgeon.glb', price: 1000, icon: '🥽', color: 0x2e9e7c, scrub: ['White', 'LightBlue'] },
  { id: 'avatar_m_intern', name: 'Eager Intern', desc: 'Eager and ready to learn', file: 'characters/explorer.glb', price: 300, icon: '🧭', color: 0x2288dd },
  { id: 'avatar_m_explorer', name: 'Ranger', desc: 'One eye on the chart, one on the exit', file: 'characters/matt.glb', price: 800, icon: '🧭', color: 0xc9a06a },
  { id: 'avatar_m_adventurer', name: 'Adventurer', desc: 'Runs toward the unknown', file: 'characters/adventurer.glb', price: 1200, icon: '🎒', color: 0x8a6a3a },
  { id: 'avatar_m_rogue', name: 'Hooded Rogue', desc: 'Sneaks past every distractor', file: 'characters/hooded.glb', price: 1500, icon: '🗡️', color: 0x55506a },
  { id: 'avatar_m_zombie', name: 'Night-Shift Zombie', desc: 'Has not slept since intern year', file: 'characters/zombie.glb', price: 2000, icon: '🧟', color: 0x6a9a5a },
  { id: 'avatar_m_ninja', name: 'Ninja Resident', desc: 'Silent, swift, board certified', file: 'characters/ninja.glb', price: 2500, icon: '🥷', color: 0x333344 },
  { id: 'avatar_m_skeleton', name: 'Bones', desc: 'Knows every anatomy landmark', file: 'characters/skeleton.glb', price: 2500, icon: '💀', color: 0xe8e4d0 },
  { id: 'avatar_m_orc', name: 'Orc Orderly', desc: 'Lifts patients and spirits', file: 'characters/orc.glb', price: 2500, icon: '🪓', color: 0x5a7a3a },
  { id: 'avatar_m_wizard', name: 'Archmage', desc: 'Casts differential diagnoses', file: 'characters/wizard.glb', price: 3000, icon: '🧙', color: 0x6a3aa8 },
  { id: 'avatar_m_alien', name: 'Visiting Alien', desc: 'Here to observe human medicine', file: 'characters/alien.glb', price: 3500, icon: '👽', color: 0x7ad07a },
  { id: 'avatar_m_robot', name: 'Mecha Medic', desc: 'Runs on caffeine and coolant', file: 'characters/robot.glb', price: 3500, icon: '🤖', color: 0xaab4c4 },
  { id: 'avatar_m_king', name: 'Chief of Medicine', desc: 'The crown of the department', file: 'characters/king.glb', price: 5000, icon: '👑', color: 0xd4a83a }
];

/** Colors a player can dress their medical character's scrubs in (0 keeps the character's own). */
export var SCRUB_COLORS = [
  { name: 'Original', hex: 0 },
  { name: 'Teal', hex: 0x1fa3b5 },
  { name: 'Ceil blue', hex: 0x5bc4dc },
  { name: 'Navy', hex: 0x2b4a8c },
  { name: 'Surgical green', hex: 0x2e9e7c },
  { name: 'Purple', hex: 0x7a4fb5 },
  { name: 'Maroon', hex: 0x9a2f45 },
  { name: 'Pink', hex: 0xe86fa0 },
  { name: 'Black', hex: 0x23262b }
];

export var MONSTER_MODELS = [
  { id: 'monster_m_ghost', name: 'Ghost of Boards Past', file: 'monsters/ghost.glb', price: 0, icon: '👻', color: 0x9aa8ff, flying: true },
  { id: 'monster_m_skull', name: 'Flying Skull', file: 'monsters/skull.glb', price: 3000, icon: '☠️', color: 0xe8e4d0, flying: true },
  { id: 'monster_m_yeti', name: 'Snowy Specialist', file: 'monsters/yeti.glb', price: 3500, icon: '🦍', color: 0xdfe8f0, flying: false },
  { id: 'monster_m_brute', name: 'Brute Force', file: 'monsters/brute.glb', price: 4000, icon: '👹', color: 0x8a5a4a, flying: false },
  { id: 'monster_m_demon', name: 'Imp of Differentials', file: 'monsters/demon.glb', price: 4500, icon: '😈', color: 0xcc3344, flying: false },
  { id: 'monster_m_dragon', name: 'Dragon Lecturer', file: 'monsters/dragon.glb', price: 7500, icon: '🐉', color: 0x44aa66, flying: true }
];

var MONSTER_BY_ID = {};
MONSTER_MODELS.forEach(function (m) { MONSTER_BY_ID[m.id] = m; });

/** @returns {object|null} catalog entry for a monster id, if it is a 3D model */
export function getMonsterModel(id) {
  return MONSTER_BY_ID[id] || null;
}

/** Public URL for a catalog file. */
export function modelUrl(file) {
  var base = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
  return base + 'models/' + file;
}
