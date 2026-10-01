/**
 * charactervoices.js — every character cheers when you score and sulks when you miss, like the
 * emotes in a mobile card battler.
 *
 * Each character has a voice (the device's speech engine at its own pitch, speed and, where the
 * device has one, a matching male or female voice) and its own short lines. A speech bubble shows the
 * line, so it still works with the sound off. The pure parts (the lines, picking one) are separate
 * from the browser parts (the bubble, the speech) so they can be tested.
 */

/**
 * @typedef {{name: string, icon: string, pitch: number, rate: number, voice: 'f'|'m'|'x', cheer: string[], sad: string[]}} CharacterVoice
 */

/** @type {Object<string, CharacterVoice>} */
export var VOICES = {
  avatar_intern: {
    name: 'Dr. Dash', icon: '🩺', pitch: 1.0, rate: 1.1, voice: 'm',
    cheer: ['Textbook!', 'Nailed the diagnosis!', 'That is why I read First Aid!', 'Correct, doctor!', 'On the list and off the list!', 'Pimped and survived!'],
    sad: ['Oof. Differential failed.', 'I knew that... I think.', 'Back to the textbook.', 'Missed that one.', 'Add it to the anki pile.', 'That one is on me.']
  },
  avatar_m_nurse: {
    name: 'Dr. Nova', icon: '👩‍⚕️', pitch: 1.25, rate: 1.1, voice: 'f',
    cheer: ['Stable and correct!', 'Right on the money!', 'Calm under pressure!', 'Another save!', 'Exactly what I expected!', 'Code averted!'],
    sad: ['Okay, take a breath.', 'That was not the one.', 'Deep breath. Next case.', 'I will get the next one.', 'Lesson learned.', 'Noted for the chart.']
  },
  avatar_m_paramedic: {
    name: 'Paramedic Pat', icon: '🚑', pitch: 1.05, rate: 1.25, voice: 'x',
    cheer: ['Transport confirmed!', 'Fast and right!', 'First on scene, first to answer!', 'Lights and sirens, baby!', 'Right call!', 'Patient delivered!'],
    sad: ['Wrong turn, dispatch.', 'Ugh, rerouting.', 'Not the right call.', 'We will make it up.', 'That one got away.', 'Back on the road.']
  },
  avatar_m_intern: {
    name: 'Explorer', icon: '🧭', pitch: 1.1, rate: 1.1, voice: 'x',
    cheer: ['Found it!', 'X marks the spot!', 'What a discovery!', 'Onward!', 'The map was right!', 'Easy trail!'],
    sad: ['Wrong trail.', 'We are a bit lost.', 'Hmm, the map lied.', 'Back to the compass.', 'Missed the landmark.', 'Okay, regroup.']
  },
  avatar_m_explorer: {
    name: 'Ranger', icon: '🏹', pitch: 0.85, rate: 1.0, voice: 'm',
    cheer: ['Right on target!', 'Bullseye!', 'Steady aim!', 'Clean shot!', 'Told you.', 'That is how it is done!'],
    sad: ['Missed the mark.', 'The wind took it.', 'Reset and aim again.', 'Not my best shot.', 'Hmm. Off target.', 'Next arrow.']
  },
  avatar_m_adventurer: {
    name: 'Adventurer', icon: '🎒', pitch: 1.15, rate: 1.2, voice: 'x',
    cheer: ['Treasure!', 'Adventure on!', 'Woohoo, yes!', 'Another victory!', 'This is fun!', 'Bring on the next one!'],
    sad: ['Aw, a trap!', 'That did not go to plan.', 'Whoops!', 'Rolled a one.', 'Tough luck.', 'We try again!']
  },
  avatar_m_rogue: {
    name: 'Hooded Rogue', icon: '🗡️', pitch: 0.7, rate: 0.95, voice: 'm',
    cheer: ['Smooth.', 'Too easy.', 'As planned.', 'Nobody saw that coming.', 'Quick and quiet.', 'Mine.'],
    sad: ['Tch. Sloppy.', 'They saw me.', 'That was not the plan.', 'Hmm. Noted.', 'Next time.', 'Shadows, fail me not.']
  },
  avatar_m_scout: {
    name: 'Scout', icon: '🏹', pitch: 1.45, rate: 1.25, voice: 'f',
    cheer: ['Yes yes yes!', 'Got it, got it!', 'Ha, easy!', 'Spotted it first!', 'Faster than the rest!', 'Boom!'],
    sad: ['Aww, so close!', 'Oh no!', 'Wait, really?', 'I was so sure!', 'Okay okay, next!', 'Ouch.']
  },
  avatar_m_zombie: {
    name: 'Zombie', icon: '🧟', pitch: 0.5, rate: 0.7, voice: 'm',
    cheer: ['Braaains... yes!', 'Correct... mmm.', 'Rrrright.', 'Gooood.', 'Uhhh... yes!', 'Brains approve.'],
    sad: ['Grrrh...', 'Uhhh... no.', 'Brains... missed.', 'Aaarrgh.', 'So sad... groan.', 'Nooo... moan.']
  },
  avatar_m_ninja: {
    name: 'Ninja', icon: '🥷', pitch: 0.9, rate: 1.3, voice: 'm',
    cheer: ['Hiyah!', 'Silent victory.', 'Swift as the wind!', 'Flawless.', 'Strike true!', 'Clean cut!'],
    sad: ['Dishonor...', 'A ninja never misses... almost.', 'The shadows laugh.', 'I must train more.', 'Hmph.', 'Failure.']
  },
  avatar_m_skeleton: {
    name: 'Bones', icon: '💀', pitch: 0.65, rate: 1.0, voice: 'm',
    cheer: ['That tickled my funny bone!', 'Right to the marrow!', 'Rattle rattle, yes!', 'Good to the bone!', 'Bone-afide!', 'Rib-bing you, I knew it!'],
    sad: ['I am falling apart.', 'That hurt right in the humerus.', 'Dead wrong.', 'Gonna need a new skull.', 'No guts, no glory.', 'Bone-headed move.']
  },
  avatar_m_orc: {
    name: 'Orc', icon: '🪓', pitch: 0.4, rate: 0.85, voice: 'm',
    cheer: ['Orc smash correct!', 'Me right! Hah!', 'Big brain, big win!', 'Strong! Strong!', 'Ha! Told you!', 'Victory!'],
    sad: ['Orc angry!', 'Grr! Wrong!', 'Me no like that.', 'Smash the question!', 'Argh!', 'Hmph. Bad.']
  },
  avatar_m_wizard: {
    name: 'Archmage', icon: '🧙', pitch: 0.75, rate: 0.95, voice: 'm',
    cheer: ['Magnificent!', 'The spell worked!', 'Abracadabra, correct!', 'As the prophecy foretold.', 'By my beard!', 'Arcane precision!'],
    sad: ['A spell misfired!', 'By my beard, no.', 'The runes were wrong.', 'Fizzle and sizzle.', 'Back to the grimoire.', 'Alas.']
  },
  avatar_m_alien: {
    name: 'Alien', icon: '👽', pitch: 1.7, rate: 1.1, voice: 'x',
    cheer: ['Beep boop, correct!', 'Human knowledge acquired!', 'Fascinating success!', 'Earth is fun!', 'Zorp! Yes!', 'Logical!'],
    sad: ['Error, Earthling.', 'Bleep. Wrong.', 'Fascinating failure.', 'Zorp... no.', 'Humans are hard.', 'Recalculating.']
  },
  avatar_m_robot: {
    name: 'Mecha Bot', icon: '🤖', pitch: 0.6, rate: 1.0, voice: 'x',
    cheer: ['Calculation correct.', 'Beep boop. Success.', 'Optimal result.', 'Processing complete: win.', 'Affirmative.', 'Systems nominal.'],
    sad: ['Error. Error.', 'Does not compute.', 'System fault.', 'Rebooting hope.', 'Incorrect output.', 'Bzzt. No.']
  },
  avatar_m_king: {
    name: 'King', icon: '👑', pitch: 0.8, rate: 0.9, voice: 'm',
    cheer: ['Royally correct!', 'Bow before my knowledge!', 'A decree of victory!', 'The crown approves!', 'As expected of royalty.', 'Magnificent, as always!'],
    sad: ['How dare you, question!', 'A royal blunder.', 'Off with its head!', 'The crown slips.', 'Unacceptable.', 'The court is silent.']
  }
};

/** Used when a character has no entry. */
export var DEFAULT_VOICE = VOICES.avatar_intern;

/** @returns {CharacterVoice} the voice profile for a character id */
export function voiceFor(avatarId) {
  return VOICES[avatarId] || DEFAULT_VOICE;
}

/**
 * Pick a line for a moment, never the same one twice in a row.
 * @param {string} avatarId
 * @param {'cheer'|'sad'} kind
 * @param {{rand?: function(): number, last?: string}} [options]
 * @returns {string}
 */
export function pickLine(avatarId, kind, options) {
  options = options || {};
  var rand = options.rand || Math.random;
  var pool = voiceFor(avatarId)[kind === 'sad' ? 'sad' : 'cheer'];
  var choices = pool.length > 1 ? pool.filter(function (l) { return l !== options.last; }) : pool;
  return choices[Math.floor(rand() * choices.length) % choices.length];
}

// ─────────────────────────────────────────────────────────────
// The browser parts
// ─────────────────────────────────────────────────────────────

var MIN_GAP_MS = 700;
var lastSpoken = { cheer: '', sad: '' };
var lastAt = 0;
var bubbleTimer = null;
var voiceCache = null;

/** Names that hint at a female or male voice on the common speech engines. */
var FEMALE_HINT = /female|woman|samantha|karen|moira|tessa|victoria|zira|susan|hazel|fiona|serena|google uk english female|aria|jenny/i;
var MALE_HINT = /\bmale\b|\bman\b|daniel|alex|fred|david|mark|george|oliver|rishi|google uk english male|guy|ryan/i;

/** The English voices this device has, or an empty list. */
function englishVoices() {
  if (voiceCache && voiceCache.length) return voiceCache;
  if (typeof window === 'undefined' || !window.speechSynthesis || !window.speechSynthesis.getVoices) return [];
  voiceCache = window.speechSynthesis.getVoices().filter(function (v) { return /^en/i.test(v.lang || ''); });
  return voiceCache;
}

/** @returns {SpeechSynthesisVoice|null} a voice that fits the character, when the device has a choice */
export function chooseVoice(profile) {
  var voices = englishVoices();
  if (!voices.length || profile.voice === 'x') return null;
  var hint = profile.voice === 'f' ? FEMALE_HINT : MALE_HINT;
  for (var i = 0; i < voices.length; i++) if (hint.test(voices[i].name)) return voices[i];
  return null;
}

function showBubble(profile, text, kind) {
  var bubble = document.getElementById('charBubble');
  if (!bubble) {
    bubble = document.createElement('div');
    bubble.id = 'charBubble';
    bubble.setAttribute('role', 'status');
    bubble.setAttribute('aria-live', 'polite');
    document.body.appendChild(bubble);
  }
  bubble.textContent = '';
  var who = document.createElement('span');
  who.className = 'char-bubble-who';
  who.textContent = profile.icon + ' ' + profile.name;
  var line = document.createElement('span');
  line.className = 'char-bubble-line';
  line.textContent = text;
  bubble.appendChild(who);
  bubble.appendChild(line);
  bubble.className = 'show ' + (kind === 'sad' ? 'sad' : 'happy');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(function () { bubble.className = ''; }, 1700);
}

/**
 * Say a line: a speech bubble, and the character's voice unless sound is off.
 * @param {string} avatarId the equipped character
 * @param {'cheer'|'sad'} kind
 * @param {{speak: boolean, volume: number}} options speak: use the device voice; volume: 0 to 1
 * @returns {string|null} the line, or null when it was too soon after the last one
 */
export function say(avatarId, kind, options) {
  options = options || { speak: true, volume: 0.7 };
  var now = Date.now();
  if (now - lastAt < MIN_GAP_MS) return null;
  lastAt = now;
  var profile = voiceFor(avatarId);
  var key = kind === 'sad' ? 'sad' : 'cheer';
  var text = pickLine(avatarId, key, { last: lastSpoken[key] });
  lastSpoken[key] = text;
  if (typeof document !== 'undefined') showBubble(profile, text, key);
  if (options.speak && options.volume > 0 && typeof window !== 'undefined' && window.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined') {
    var u = new SpeechSynthesisUtterance(text);
    var voice = chooseVoice(profile);
    if (voice) u.voice = voice;
    // A sad line comes out lower and slower, a cheer higher and quicker
    u.pitch = Math.max(0.1, Math.min(2, profile.pitch * (key === 'sad' ? 0.85 : 1.1)));
    u.rate = Math.max(0.5, Math.min(2, profile.rate * (key === 'sad' ? 0.85 : 1.05)));
    u.volume = Math.max(0, Math.min(1, options.volume));
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }
  return text;
}
