/**
 * profileicons.js — the symbols a player can pick as their profile picture.
 *
 * A choice is stored as "icon:<symbol>". Older saves hold a character id such as "avatar_intern"; those
 * still show the symbol they always did (see iconFor).
 */

export var ICON_GROUPS = [
  { name: 'Medicine', icons: ['🩺', '💉', '💊', '🩸', '🧬', '🦠', '🧪', '🔬', '🩻', '🩹', '🏥', '🚑', '⚕️', '🫀', '🫁', '🧠', '🦴', '🦷', '👁️', '🧫'] },
  { name: 'People', icons: ['👩‍⚕️', '👨‍⚕️', '🧑‍⚕️', '🧑‍🔬', '🧑‍🎓', '🦸', '🦸‍♀️', '🧙', '🧙‍♀️', '🥷', '🧛', '🧟', '🤖', '👽', '👻', '🧑‍🚀'] },
  { name: 'Animals', icons: ['🐶', '🐱', '🦊', '🐼', '🐨', '🦁', '🐯', '🐸', '🐵', '🦉', '🦄', '🐙', '🦈', '🐢', '🦋', '🐝'] },
  { name: 'Cool', icons: ['🔥', '⚡', '🌟', '💎', '👑', '🏆', '🚀', '🎯', '🎮', '🎧', '🕶️', '🛡️', '⚔️', '🌈', '🍀', '☕'] },
  { name: 'Food and fun', icons: ['🍕', '🍔', '🌮', '🍩', '🍪', '🍓', '🥑', '🍉', '🎸', '🎨', '⚽', '🏀', '🏎️', '🛹', '🎲', '🧩'] }
];

/** Every choosable symbol. */
export function allIcons() {
  var out = [];
  ICON_GROUPS.forEach(function (g) { out = out.concat(g.icons); });
  return out;
}

var LEGACY = {
  avatar_intern: '🩺', avatar_attending: '👨‍⚕️', avatar_superhero: '🦸', avatar_robot: '🤖', avatar_wizard: '🧙',
  avatar_zombie: '🧟', avatar_golden: '🏆', avatar_ambulance: '🚑', avatar_racecar: '🏎️', avatar_hearse: '⚰️',
  avatar_nurse: '👩‍⚕️', avatar_surgeon: '🔪', avatar_skeleton: '💀'
};

/** The symbol for a stored profile picture value. */
export function iconFor(picture) {
  if (typeof picture === 'string' && picture.indexOf('icon:') === 0 && picture.length > 5 && picture.length <= 32) return picture.slice(5);
  return LEGACY[picture] || '👤';
}

/** The value to store for a symbol. */
export function iconId(symbol) {
  return 'icon:' + symbol;
}
