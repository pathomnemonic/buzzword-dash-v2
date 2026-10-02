/**
 * explain.js — "why not that one?" after a miss.
 *
 * Most cards carry a short reason for each wrong answer (the `ww` field). After a miss the teaching line used to
 * show only the teaching point for the right answer; now it also says why the answer the player ran into is wrong,
 * which is what actually fixes the mistake. Pure functions so they are tested directly.
 */

/** The reason the chosen answer is wrong, or '' when the card has none (or the choice was the right answer). */
export function whyNot(card, choice) {
  if (!card || !card.ww || !choice || choice === card.ans) return '';
  var why = card.ww[choice];
  return typeof why === 'string' ? why.trim() : '';
}

/** What the teaching line says after a wrong answer: why the choice is wrong, then the teaching point. */
export function missExplanation(card, choice) {
  var why = whyNot(card, choice);
  var parts = [];
  if (why) parts.push('Not ' + choice + ': ' + why.replace(/\.*$/, '') + '.');
  if (card && card.tp) parts.push(card.tp);
  return parts.join(' ');
}

/** Seconds to leave a teaching line up: a short read for a short line, up to six seconds for a long one. */
export function readSeconds(text, min) {
  var words = String(text || '').split(/\s+/).filter(Boolean).length;
  return Math.max(min || 2, Math.min(6, 1.2 + words / 3.2));
}
