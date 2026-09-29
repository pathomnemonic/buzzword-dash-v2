/**
 * subjectstyle.js — icon and accent color for each subject.
 *
 * Used for gate art in the runner, the weak-spot dashboard and the exam
 * report. Every subject has both an icon and a color so the cue never depends
 * on color alone (colorblind-safe).
 */

var STYLES = {
  'Neurology': { icon: '🧠', color: 0xc77dff },
  'Cardiology': { icon: '❤️', color: 0xff4d6d },
  'Nephrology': { icon: '💧', color: 0x4cc9f0 },
  'Psychiatry': { icon: '💭', color: 0x9d8cff },
  'Gastroenterology': { icon: '🍽️', color: 0xffb703 },
  'Pulmonology': { icon: '🫁', color: 0x80ed99 },
  'Infectious Disease': { icon: '🦠', color: 0x9ef01a },
  'Endocrinology': { icon: '⚗️', color: 0xf72585 },
  'Hematology/Oncology': { icon: '🩸', color: 0xe63946 },
  'Rheumatology': { icon: '🦴', color: 0xf4a261 },
  'Obstetrics/Gynecology': { icon: '🤰', color: 0xff8fab },
  'Pediatrics': { icon: '🧸', color: 0xffd166 },
  'Surgery': { icon: '🔪', color: 0xadb5bd },
  'Emergency Medicine': { icon: '🚑', color: 0xff6b35 },
  'Multisystem / Mixed': { icon: '🧬', color: 0x18ffff }
};

var FALLBACK = { icon: '🩺', color: 0x18ffff };

/**
 * @param {string} subject
 * @returns {{icon: string, color: number}}
 */
export function getSubjectStyle(subject) {
  return STYLES[subject] || FALLBACK;
}

/** CSS hex string (#rrggbb) for a subject color. */
export function getSubjectCssColor(subject) {
  var hex = getSubjectStyle(subject).color;
  return '#' + ('000000' + hex.toString(16)).slice(-6);
}

export var SUBJECT_STYLES = STYLES;
