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

/**
 * Colors a character can be dressed in. A palette is a list of swatches; "Original" (hex 0) is always
 * offered first and keeps the model's own color. Each character has its own parts and its own palettes.
 */
function swatches(list) {
  return [{ name: 'Original', hex: 0 }].concat(list.map(function (c) { return { name: c[0], hex: c[1] }; }));
}

var SCRUBS = swatches([['Teal', 0x1fa3b5], ['Ceil blue', 0x5bc4dc], ['Navy', 0x2b4a8c], ['Surgical green', 0x2e9e7c], ['Purple', 0x7a4fb5], ['Maroon', 0x9a2f45], ['Pink', 0xe86fa0], ['Black', 0x23262b]]);
var PASTELS = swatches([['Rose', 0xf08aa8], ['Lilac', 0xb08ad8], ['Mint', 0x7fd6b4], ['Sky', 0x7fb8f0], ['Peach', 0xf4a77a], ['Butter', 0xf0d36a]]);
var DARKS = swatches([['Black', 0x1d1f24], ['Charcoal', 0x3b4048], ['Navy', 0x233a6b], ['Forest', 0x2f5a3a], ['Wine', 0x6a2a3a], ['Brown', 0x6a4a2a]]);
var EARTH = swatches([['Olive', 0x5c6b3a], ['Khaki', 0xb59a63], ['Rust', 0xa8502a], ['Sand', 0xd8c28a], ['Slate', 0x56667a], ['Moss', 0x3f6b3a]]);
var BRIGHTS = swatches([['Red', 0xd93030], ['Orange', 0xf08a24], ['Yellow', 0xf2cf2a], ['Lime', 0x8ad03a], ['Blue', 0x2a7ad9], ['Violet', 0x8a4fd9]]);
var HIVIS = swatches([['Hi-vis orange', 0xff6a1a], ['Hi-vis yellow', 0xe8f030], ['Red', 0xd93030], ['Lime', 0x8ad03a], ['Blue', 0x2a7ad9], ['White', 0xf2f2f2]]);
var SAFETY = swatches([['Safety yellow', 0xf2cf2a], ['White', 0xf2f2f2], ['Red', 0xd93030], ['Blue', 0x2a7ad9], ['Orange', 0xf08a24], ['Black', 0x1d1f24]]);
var ROYAL = swatches([['Royal red', 0xb02a3a], ['Royal blue', 0x2a4aa8], ['Emerald', 0x1f8a5a], ['Purple', 0x6a3aa8], ['Black', 0x1d1f24], ['Gold', 0xd4a83a]]);
var METALS = swatches([['Chrome', 0xc8d0d8], ['Gold', 0xd4a83a], ['Copper', 0xb8683a], ['Cobalt', 0x2a5ad9], ['Mint', 0x5ad9b0], ['Pink', 0xe86fa0]]);
var ALIEN = swatches([['Green', 0x4ad05a], ['Violet', 0x9a5ae0], ['Blue', 0x3a8ae0], ['Pink', 0xe86fa0], ['Orange', 0xf08a24], ['Grey', 0x9aa4b0]]);
var ORC = swatches([['Moss', 0x5a7a3a], ['Swamp', 0x3a6b4a], ['Slate', 0x56667a], ['Ember', 0xa8502a], ['Violet', 0x6a4a8a], ['Bone', 0xc8c0a0]]);
var ROBES = swatches([['Midnight', 0x24306a], ['Violet', 0x6a3aa8], ['Crimson', 0xa82a3a], ['Emerald', 0x1f7a5a], ['Teal', 0x1f8a9a], ['Ash', 0x7a808a]]);
var NINJA = swatches([['Black', 0x15161a], ['Crimson', 0xa82a2a], ['Navy', 0x1f2f5a], ['Forest', 0x2a5a3a], ['Violet', 0x4a2a6a], ['Snow', 0xe8eef2]]);
var SKIN_TONES = swatches([['Fair', 0xf3d2b6], ['Light', 0xe6b48c], ['Tan', 0xc98f62], ['Brown', 0xa8734d], ['Deep', 0x6f4630], ['Ebony', 0x4a2e20]]);
var HAIR_COLORS = swatches([['Black', 0x15110f], ['Dark brown', 0x3b2418], ['Auburn', 0x7a3a22], ['Blonde', 0xe0c070], ['Ginger', 0xb4521f], ['Silver', 0xb8bcc4], ['Pink', 0xe86fa0], ['Blue', 0x3a7ae0]]);
// for characters painted as one picture: the whole figure takes the tint, so the choices are light enough to stay readable
var WASH = swatches([['Rose', 0xff9fbd], ['Sky', 0x9fd0ff], ['Mint', 0x9fffcf], ['Sunny', 0xffe58a], ['Peach', 0xffb98a], ['Lilac', 0xcfa8ff], ['Ice', 0xd8f0ff]]);
var SHOES = swatches([['White', 0xf2f2f2], ['Black', 0x1d1f24], ['Pink', 0xe86fa0], ['Sky', 0x7fb8f0], ['Red', 0xd93030]]);

/**
 * The animated 3D characters. `parts` are the pieces of a character a player can recolor (each part
 * is one or more of the model's materials), with a palette that suits that piece. Characters whose
 * model is a single painted texture (Rural Rex, Stat Sadie, Decaffeinated Dana, Femur Freda) get one part that tints the whole figure.
 * Names stay plain where the model is not a medical character.
 */
export var CHARACTER_MODELS = [
  { id: 'avatar_intern', name: 'Pager Pete', desc: 'Teal scrubs, runs the list', file: 'characters/doctor.glb', price: 0, icon: '🩺', color: 0x1fa3b5,
    parts: [
      { key: 'top', label: 'Scrub top', materials: ['LightBrown'], palette: SCRUBS },
      { key: 'pants', label: 'Scrub pants', materials: ['LightBlue'], palette: SCRUBS },
      { key: 'skin', label: 'Skin', materials: ['Skin', 'Skin_Darker'], palette: SKIN_TONES },
      { key: 'hair', label: 'Hair', materials: ['Hair'], palette: HAIR_COLORS }
    ] },
  { id: 'avatar_m_nurse', name: 'Dr. Dash', desc: 'Emergency medicine: calm in every code', file: 'characters/nurse.glb', price: 1250, icon: '👩‍⚕️', color: 0x5bc4dc,
    parts: [
      { key: 'top', label: 'Scrub top', materials: ['White'], palette: PASTELS },
      { key: 'pants', label: 'Scrub pants', materials: ['Orange'], palette: PASTELS },
      { key: 'shoes', label: 'Shoes', materials: ['Grey'], palette: SHOES },
      { key: 'skin', label: 'Skin', materials: ['Skin'], palette: SKIN_TONES },
      { key: 'hair', label: 'Hair', materials: ['Hair_Blond', 'Hair_Brown'], palette: HAIR_COLORS }
    ] },
  { id: 'avatar_m_paramedic', name: 'Paramedic Pat', desc: 'First on scene, fastest on foot', file: 'characters/paramedic.glb', price: 1700, icon: '🚑', color: 0xd93030,
    parts: [
      { key: 'helmet', label: 'Helmet', materials: ['Worker_Yellow'], palette: SAFETY },
      { key: 'vest', label: 'Vest', materials: ['Worker_Vest'], palette: HIVIS },
      { key: 'pants', label: 'Pants', materials: ['Brown'], palette: DARKS },
      { key: 'skin', label: 'Skin', materials: ['Skin'], palette: SKIN_TONES }
    ] },
  { id: 'avatar_m_intern', name: 'Field Medic Finn', desc: 'Always up for a trek', file: 'characters/explorer.glb', price: 850, icon: '🧭', color: 0x2288dd,
    parts: [
      { key: 'shirt', label: 'Shirt', materials: ['Shirt'], palette: BRIGHTS },
      { key: 'sleeves', label: 'Sleeves', materials: ['UnderShirt'], palette: EARTH },
      { key: 'pants', label: 'Pants', materials: ['Pants'], palette: EARTH },
      { key: 'boots', label: 'Boots', materials: ['Boots'], palette: DARKS },
      { key: 'skin', label: 'Skin', materials: ['Skin'], palette: SKIN_TONES },
      { key: 'hair', label: 'Hair', materials: ['Hair'], palette: HAIR_COLORS }
    ] },
  { id: 'avatar_m_explorer', name: 'Rural Rex', desc: 'Sharp eyes, steady stride', file: 'characters/matt.glb', price: 2100, icon: '🏹', color: 0xc9a06a,
    parts: [
      { key: 'tint', label: 'Field wash', materials: ['Atlas'], palette: WASH }
    ] },
  { id: 'avatar_m_adventurer', name: 'Locum Lou', desc: 'Runs toward the unknown', file: 'characters/adventurer.glb', price: 2650, icon: '🎒', color: 0x8a6a3a,
    parts: [
      { key: 'shirt', label: 'Shirt', materials: ['Green'], palette: BRIGHTS },
      { key: 'pants', label: 'Pants', materials: ['Brown'], palette: EARTH },
      { key: 'pack', label: 'Backpack', materials: ['LightGreen'], palette: HIVIS },
      { key: 'skin', label: 'Skin', materials: ['Skin'], palette: SKIN_TONES },
      { key: 'hair', label: 'Hair', materials: ['Hair'], palette: HAIR_COLORS }
    ] },
  { id: 'avatar_m_rogue', name: 'Dark-Room Dex', desc: 'Quick, quiet and a little shady', file: 'characters/hooded.glb', price: 3200, icon: '🗡️', color: 0x55506a,
    parts: [
      { key: 'cloak', label: 'Hood & cloak', materials: ['DarkBrown'], palette: ROBES },
      { key: 'pants', label: 'Pants', materials: ['Black'], palette: DARKS },
      { key: 'tunic', label: 'Tunic & boots', materials: ['LightBrown'], palette: EARTH },
      { key: 'skin', label: 'Skin', materials: ['Skin'], palette: SKIN_TONES }
    ] },
  { id: 'avatar_m_scout', name: 'Stat Sadie', desc: 'Light on her feet, quick with a smile', file: 'characters/scout.glb', price: 3850, icon: '🏹', color: 0x3fa98a,
    parts: [
      { key: 'tint', label: 'Scout wash', materials: ['rogue_texture'], palette: WASH }
    ] },
  { id: 'avatar_m_zombie', name: 'Decaffeinated Dana', desc: 'Shuffles along at its own pace', file: 'characters/zombie.glb', price: 4550, icon: '🧟', color: 0x6a9a5a,
    parts: [
      { key: 'tint', label: 'Ghoul wash', materials: ['Atlas'], palette: WASH }
    ] },
  { id: 'avatar_m_ninja', name: 'Night-Shift Nico', desc: 'Silent and swift', file: 'characters/ninja.glb', price: 5250, icon: '🥷', color: 0x333344,
    parts: [
      { key: 'outfit', label: 'Outfit', materials: ['Ninja_Main'], palette: NINJA },
      { key: 'sash', label: 'Sash', materials: ['Belt'], palette: BRIGHTS }
    ] },
  { id: 'avatar_m_skeleton', name: 'Femur Freda', desc: 'Rattles along with a spring in its step', file: 'characters/skeleton.glb', price: 5950, icon: '💀', color: 0xe8e4d0,
    parts: [
      { key: 'tint', label: 'Bone wash', materials: ['Atlas.003', 'Material.002'], palette: WASH }
    ] },
  { id: 'avatar_m_orc', name: 'Gurney Greta', desc: 'Big, green and unbothered', file: 'characters/orc.glb', price: 5950, icon: '🪓', color: 0x5a7a3a,
    parts: [
      { key: 'skin', label: 'Skin', materials: ['Orc_Main'], palette: ORC },
      { key: 'belt', label: 'Belt', materials: ['Belt'], palette: EARTH },
      { key: 'mohawk', label: 'Mohawk', materials: ['Orc_Hair'], palette: BRIGHTS }
    ] },
  { id: 'avatar_m_wizard', name: 'Pharmacist Pip', desc: 'Conjures a spell or two', file: 'characters/wizard.glb', price: 7000, icon: '🧙', color: 0x6a3aa8,
    parts: [
      { key: 'robe', label: 'Robe & hat', materials: ['Wizard_Main'], palette: ROBES },
      { key: 'trim', label: 'Trim', materials: ['Wizard_Secondary'], palette: METALS }
    ] },
  { id: 'avatar_m_alien', name: 'Anatomy Abby', desc: 'Here to observe the humans', file: 'characters/alien.glb', price: 8050, icon: '👽', color: 0x7ad07a,
    parts: [
      { key: 'skin', label: 'Skin', materials: ['Main'], palette: ALIEN },
      { key: 'stripe', label: 'Stripe', materials: ['Stripe'], palette: BRIGHTS }
    ] },
  { id: 'avatar_m_robot', name: 'MRI Mo', desc: 'Runs on caffeine and coolant', file: 'characters/robot.glb', price: 8050, icon: '🤖', color: 0xaab4c4,
    parts: [
      { key: 'body', label: 'Body', materials: ['Main'], palette: METALS },
      { key: 'trim', label: 'Trim', materials: ['Grey'], palette: BRIGHTS }
    ] },
  { id: 'avatar_m_hooded', name: 'Cath-Lab Cass', desc: 'In, through the artery, out again', file: 'characters/rogue-hooded.glb', price: 5600, icon: '🥷', color: 0x3fa98a,
    parts: [
      { key: 'hood', label: 'Hood', materials: ['Head'], palette: NINJA, flat: true },
      { key: 'skin', label: 'Skin', materials: ['Face'], palette: SKIN_TONES },
      { key: 'cape', label: 'Cape', materials: ['Cape'], palette: NINJA },
      { key: 'body', label: 'Jacket', materials: ['Body'], palette: SCRUBS },
      { key: 'arms', label: 'Sleeves', materials: ['Arms'], palette: SCRUBS },
      { key: 'legs', label: 'Trousers', materials: ['Legs'], palette: DARKS }
    ] },
  { id: 'avatar_m_barbarian', name: 'Triage Bruno', desc: 'Sorts the chaos, loudly', file: 'characters/barbarian.glb', price: 4200, icon: '🪖', color: 0xa8502a,
    parts: [
      { key: 'headwear', label: 'Helmet', materials: ['Headwear'], palette: EARTH },
      { key: 'cape', label: 'Cape', materials: ['Cape'], palette: DARKS },
      { key: 'body', label: 'Vest', materials: ['Body'], palette: HIVIS },
      { key: 'arms', label: 'Arms', materials: ['Arms'], palette: HIVIS },
      { key: 'legs', label: 'Legs', materials: ['Legs'], palette: DARKS },
      { key: 'skin', label: 'Skin', materials: ['Face'], palette: SKIN_TONES },
      { key: 'hair', label: 'Hair', materials: ['Head'], palette: HAIR_COLORS, flat: true }
    ] },
  { id: 'avatar_m_knight', name: 'Dame Suture', desc: 'Steady hands, shining armor', file: 'characters/knight.glb', price: 6300, icon: '🛡️', color: 0x9aa4b0,
    parts: [
      { key: 'headwear', label: 'Helmet', materials: ['Headwear'], palette: METALS },
      { key: 'cape', label: 'Cape', materials: ['Cape'], palette: ROYAL },
      { key: 'body', label: 'Armor', materials: ['Body'], palette: METALS },
      { key: 'arms', label: 'Arms', materials: ['Arms'], palette: METALS },
      { key: 'legs', label: 'Legs', materials: ['Legs'], palette: DARKS },
      { key: 'skin', label: 'Skin', materials: ['Face'], palette: SKIN_TONES }
    ] },
  { id: 'avatar_m_mage', name: 'Professor Pathos', desc: 'Reads the slides nobody else can', file: 'characters/mage.glb', price: 7650, icon: '🔮', color: 0x6a3aa8,
    parts: [
      { key: 'headwear', label: 'Hat', materials: ['Headwear'], palette: ROBES },
      { key: 'cape', label: 'Cape', materials: ['Cape'], palette: ROBES },
      { key: 'body', label: 'Robe', materials: ['Body'], palette: ROBES },
      { key: 'arms', label: 'Arms', materials: ['Arms'], palette: ROBES },
      { key: 'legs', label: 'Legs', materials: ['Legs'], palette: DARKS },
      { key: 'skin', label: 'Skin', materials: ['Face'], palette: SKIN_TONES },
      { key: 'hair', label: 'Hair', materials: ['Head'], palette: HAIR_COLORS, flat: true }
    ] },
  { id: 'avatar_m_king', name: 'Attending Arthur', desc: 'The crown suits him', file: 'characters/king.glb', price: 11200, icon: '👑', color: 0xd4a83a,
    parts: [
      { key: 'tunic', label: 'Tunic & boots', materials: ['Metal'], palette: ROYAL },
      { key: 'trousers', label: 'Trousers', materials: ['DarkBrown'], palette: DARKS },
      { key: 'sleeves', label: 'Sleeves', materials: ['Blue'], palette: ROYAL },
      { key: 'skin', label: 'Skin', materials: ['Skin'], palette: SKIN_TONES },
      { key: 'hair', label: 'Hair & beard', materials: ['Hair_White'], palette: HAIR_COLORS },
      { key: 'crown', label: 'Crown', materials: ['Gold'], palette: METALS }
    ] }
];

/**
 * Characters that were retired because they were the same model as another one in a different color
 * (Dr. Dash, Resident Rey and Surgeon Sage were one mesh) or the same kind of robot. Players who owned
 * one are moved to the character it duplicated, and refunded.
 */
export var RETIRED_CHARACTERS = {
  avatar_m_resident: { to: 'avatar_intern', price: 400 },
  avatar_m_surgeon: { to: 'avatar_intern', price: 1000 },
  avatar_robopro: { to: 'avatar_m_robot', price: 9000 },
  // The six Classic women doctors were replaced by Dr. Dash (a full 3D character) with skin and hair choices
  avatar_dr_maya: { to: 'avatar_m_nurse', price: 1500 },
  avatar_dr_lin: { to: 'avatar_m_nurse', price: 2000 },
  avatar_dr_amara: { to: 'avatar_m_nurse', price: 2500 },
  avatar_dr_sofia: { to: 'avatar_m_nurse', price: 2800 },
  avatar_dr_zuri: { to: 'avatar_m_nurse', price: 3000 },
  avatar_dr_priya: { to: 'avatar_m_nurse', price: 3500 }
};

/** The recolorable parts of a character, or [] */
export function getCharacterParts(id) {
  for (var i = 0; i < CHARACTER_MODELS.length; i++) {
    if (CHARACTER_MODELS[i].id === id) return CHARACTER_MODELS[i].parts || [];
  }
  return [];
}

export var MONSTER_MODELS = [
  { id: 'monster_m_ghost', name: 'Ghost of Boards Past', file: 'monsters/ghost.glb', price: 0, icon: '👻', color: 0x9aa8ff, flying: true },
  { id: 'monster_m_skull', name: 'Flying Skull', file: 'monsters/skull.glb', price: 1550, icon: '☠️', color: 0xe8e4d0, flying: true },
  { id: 'monster_m_yeti', name: 'Snowy Specialist', file: 'monsters/yeti.glb', price: 2250, icon: '🦍', color: 0xdfe8f0, flying: false },
  { id: 'monster_m_brute', name: 'Brute Force', file: 'monsters/brute.glb', price: 3150, icon: '👹', color: 0x8a5a4a, flying: false },
  { id: 'monster_m_demon', name: 'Imp of Differentials', file: 'monsters/demon.glb', price: 4200, icon: '😈', color: 0xcc3344, flying: false },
  { id: 'monster_m_dragon', name: 'Dragon Lecturer', file: 'monsters/dragon.glb', price: 7700, icon: '🐉', color: 0x44aa66, flying: true }
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
