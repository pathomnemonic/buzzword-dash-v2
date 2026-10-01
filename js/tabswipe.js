/**
 * tabswipe.js — swipe left and right to move between the bottom tabs (Stats, Locker, Home, Cards, Profile),
 * with a slim indicator along the top of the tab bar showing where you are.
 */

/**
 * The tab to move to, or null at the ends (no wrap-around).
 * @param {string[]} order tab screen ids, left to right
 * @param {string} current the screen now showing
 * @param {number} dx horizontal movement: negative is a swipe left (go to the next tab)
 * @returns {string|null}
 */
export function nextTab(order, current, dx) {
  var i = order.indexOf(current);
  if (i < 0) return null;
  var j = dx < 0 ? i + 1 : i - 1;
  return j >= 0 && j < order.length ? order[j] : null;
}

/** Is this swipe a deliberate horizontal one (long enough, mostly sideways, quick enough)? */
export function isTabSwipe(dx, dy, ms) {
  return Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 1.6 && ms <= 700;
}

/**
 * @param {object} ui  needs show(screenId, direction)
 * @param {string[]} order
 */
export function initTabSwipe(ui, order) {
  var start = null;
  function blocked(target) {
    if (document.querySelector('.sheet-overlay.active, .tutorial-overlay.active, #multiplayerOverlay.active, #quickReviewOverlay.active, #dailyReward')) return true;
    return !!(target && target.closest && target.closest('input, textarea, select, .subject-scroll, .shop-preview, canvas, [data-no-swipe]'));
  }
  document.addEventListener('touchstart', function (e) {
    var t = e.touches[0];
    start = e.touches.length === 1 && !blocked(e.target) ? { x: t.clientX, y: t.clientY, at: Date.now() } : null;
  }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (!start) return;
    var t = e.changedTouches[0];
    var dx = t.clientX - start.x, dy = t.clientY - start.y, ms = Date.now() - start.at;
    start = null;
    if (!isTabSwipe(dx, dy, ms)) return;
    var active = document.querySelector('.screen.active');
    if (!active) return;
    var to = nextTab(order, active.id, dx);
    if (to) ui.show(to, dx < 0 ? 'from-right' : 'from-left');
  }, { passive: true });
}
