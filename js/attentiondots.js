/**
 * attentiondots.js — red dots for things that are waiting for the player.
 *
 *   profile: badges earned but not yet looked at
 *   quests:  finished quests whose coins have not been claimed
 *   weekly:  the weekly goal is met and its coins are unclaimed
 *
 * (The Locker has its own dot, for items that just became affordable; see lockerdots.js.) A dot stays
 * until the player has seen the thing, so each new item asks for attention once.
 */

/**
 * @param {object} storage
 * @param {Array<{id: string, target: number}>} quests today's quest list
 * @returns {{profile: number, quests: number, weekly: boolean}}
 */
export function computeAttention(storage, quests) {
  var week = storage.getWeeklyProgress();
  return {
    profile: storage.getNewAchievementIds().length,
    quests: storage.getClaimableQuestIds(quests).length,
    weekly: week.daysMet >= week.target && !week.claimed
  };
}

/** Put a red dot on an element (or take it away). Safe to call every time. */
export function setDot(el, on, label) {
  if (!el) return;
  var dot = el.querySelector(':scope > .nav-dot');
  if (on) {
    if (!dot) {
      dot = document.createElement('span');
      dot.className = 'nav-dot';
      el.classList.add('has-dot');
      el.appendChild(dot);
    }
    if (label) dot.setAttribute('aria-label', label);
  } else if (dot) {
    dot.remove();
    el.classList.remove('has-dot');
  }
}

/**
 * Refresh every attention dot on the page.
 * @returns {{profile: number, quests: number, weekly: boolean}}
 */
export function updateAttentionDots(storage, quests, doc) {
  doc = doc || document;
  var a = computeAttention(storage, quests);
  var q = function (sel) { return doc.querySelector(sel); };
  var profileLabel = a.profile === 1 ? 'You have a new badge' : 'You have ' + a.profile + ' new badges';
  setDot(q('#profileBtn'), a.profile > 0, profileLabel);
  setDot(q('#profileCornerBtn'), a.profile > 0, profileLabel);
  setDot(q('#questBtn'), a.quests > 0, a.quests === 1 ? 'A quest reward is waiting' : a.quests + ' quest rewards are waiting');
  setDot(q('#studyGoal'), a.weekly, 'Your weekly goal reward is waiting');
  return a;
}
