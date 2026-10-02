/**
 * interleave.js — mixing subjects within a study session.
 *
 * Studying one subject for a long stretch feels productive, but switching between subjects makes the memory
 * stronger (it is a well-studied effect called interleaving). Given a list of cards, this reorders them so the same
 * subject does not come twice in a row whenever another subject is still available, while keeping the original
 * order as much as possible otherwise.
 */

/**
 * @param {{subj?: string}[]} cards
 * @returns {object[]} the same cards, reordered
 */
export function spreadBySubject(cards) {
  var rest = cards.slice();
  var out = [];
  var last = null;
  while (rest.length) {
    var idx = -1;
    for (var i = 0; i < rest.length; i++) {
      if (rest[i].subj !== last) { idx = i; break; }
    }
    if (idx < 0) idx = 0; // only one subject left
    var card = rest.splice(idx, 1)[0];
    out.push(card);
    last = card.subj;
  }
  return out;
}
