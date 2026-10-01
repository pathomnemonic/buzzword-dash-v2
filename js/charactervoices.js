/**
 * charactervoices.js — every character cheers when you score and sulks when you miss, like the
 * emotes in a mobile card battler.
 *
 * Each character has a voice (the device's speech engine at its own pitch, speed and, where the
 * device has one, a matching male or female voice) and its own short lines. The lines are only spoken,
 * never shown. The pure parts (the lines, picking one) are separate from the browser part (the speech).
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
var voiceCache = null;

/** Names that hint at a female or male voice on the common speech engines. */
var FEMALE_HINT = /female|woman|samantha|karen|moira|tessa|victoria|zira|susan|hazel|fiona|serena|aria|jenny|sonia|libby|joanna|salli|kendra|kimberly|ivy|allison|ava|nicky|olivia|emma|amy|natasha|clara|michelle/i;
var MALE_HINT = /\bmale\b|\bman\b|daniel|alex|fred|david|mark|george|oliver|rishi|guy|ryan|brian|matthew|justin|joey|russell|arthur|james|thomas|eric|christopher|roger|davis|tony|liam/i;
/** Voices that sound like a person rather than a speech synthesizer: neural, "natural", premium or Siri voices. */
var NATURAL_HINT = /natural|neural|online|premium|enhanced|siri|studio|wavenet|journey|polyglot/i;

/** Rate a voice: more natural sounding is better, a voice stored on the device is better than a robotic default. */
export function voiceQuality(voice) {
  var score = 0;
  if (NATURAL_HINT.test(voice.name)) score += 10;
  if (/google/i.test(voice.name)) score += 4;
  if (/^en[-_](US|GB|AU|CA|IE|ZA|IN)/i.test(voice.lang || '')) score += 1;
  if (/espeak|festival|flite|compact|robot/i.test(voice.name)) score -= 20;
  return score;
}

function hash(str) {
  var h = 0;
  for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

/** The English voices this device has, best sounding first, or an empty list. */
function englishVoices() {
  if (voiceCache && voiceCache.length) return voiceCache;
  if (typeof window === 'undefined' || !window.speechSynthesis || !window.speechSynthesis.getVoices) return [];
  voiceCache = window.speechSynthesis.getVoices()
    .filter(function (v) { return /^en/i.test(v.lang || ''); })
    .sort(function (a, b) { return voiceQuality(b) - voiceQuality(a); });
  return voiceCache;
}

if (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.addEventListener) {
  // Phones load their voices a moment after the page does
  window.speechSynthesis.addEventListener('voiceschanged', function () { voiceCache = null; });
}

/**
 * Pick the best-sounding voice that fits the character, and a different one for each character when the
 * device has several. Returns null when the device offers no choice (it then uses its default voice).
 * @param {CharacterVoice} profile
 * @param {string} [avatarId] used to give every character a different voice from the same pool
 * @returns {SpeechSynthesisVoice|null}
 */
export function chooseVoice(profile, avatarId) {
  var voices = englishVoices();
  if (!voices.length) return null;
  var hint = profile.voice === 'f' ? FEMALE_HINT : (profile.voice === 'm' ? MALE_HINT : null);
  var fitting = hint ? voices.filter(function (v) { return hint.test(v.name); }) : voices;
  if (!fitting.length) fitting = voices;
  // Only the better half of the fitting voices, so nobody gets stuck with the worst one
  var best = fitting.filter(function (v) { return voiceQuality(v) >= voiceQuality(fitting[0]) - 3; });
  return best[hash(avatarId || profile.name) % best.length];
}

/**
 * Say a line out loud in the character's voice (nothing is shown on screen).
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
  if (options.speak && options.volume > 0 && typeof window !== 'undefined' && window.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined') {
    var u = new SpeechSynthesisUtterance(text);
    var voice = chooseVoice(profile, avatarId);
    if (voice) u.voice = voice;
    // A sad line comes out a little lower and slower, a cheer a little higher and quicker. The range is kept
    // narrow on purpose: stretched pitch and speed are what make a speech engine sound robotic.
    var natural = !!voice && voiceQuality(voice) >= 10;
    var spread = natural ? 0.5 : 0.35; // how much of the character's own pitch to use (a natural voice has its own character)
    var pitch = 1 + (profile.pitch - 1) * spread;
    u.pitch = Math.max(0.8, Math.min(1.3, pitch * (key === 'sad' ? 0.94 : 1.05)));
    u.rate = Math.max(0.9, Math.min(1.2, (1 + (profile.rate - 1) * 0.5) * (key === 'sad' ? 0.92 : 1.03)));
    u.lang = (voice && voice.lang) || 'en-US';
    u.volume = Math.max(0, Math.min(1, options.volume));
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }
  return text;
}
