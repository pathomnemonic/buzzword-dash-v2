/**
 * tour.js — a spotlight tour of the real interface.
 *
 * The screen is dimmed except for one highlighted element. A card next to it explains what it is, and the
 * player moves on by pressing the highlighted element itself (the way most games teach their menus). Some
 * steps let the press go through (a tab opens its screen, a buy button buys), others only count it (PLAY
 * must not start a run in the middle of the tour). A step with nothing to press, or whose element is not on
 * screen, has a Next button instead, so the tour can never get stuck. It can be skipped at any time.
 *
 * A step: {
 *   id, title, text,
 *   target: '#css-selector' | function(): Element|null,
 *   press:  'pass'   the press goes through to the element, then the tour moves on
 *           'count'  the press only moves the tour on (the element does nothing)
 *           'next'   no press: a Next button (default when there is no target)
 *   before(ctx), after(ctx), skipIf(ctx)
 * }
 */

var PAD = 6;            // space around the highlighted element
var CARD_GAP = 12;      // space between the highlight and the card
var EDGE = 12;          // the card stays this far from the screen edges
var ADVANCE_MS = 260;   // after a pass-through press, let the app react before moving on

var _tour = null;

export function isTourOpen() { return !!_tour; }
export function skipTour() { if (_tour) _tour.finish('skipped'); }

/**
 * Where the card goes: below the highlight if it fits, otherwise above it, otherwise at the screen's middle.
 * @param {{left: number, top: number, width: number, height: number}|null} hole the highlighted rectangle
 * @param {{width: number, height: number}} card
 * @param {{width: number, height: number}} view
 * @returns {{left: number, top: number, side: 'below'|'above'|'middle'}}
 */
export function placeCard(hole, card, view) {
  var left;
  var cw = Math.min(card.width, view.width - 2 * EDGE);
  if (!hole) {
    return { left: Math.max(EDGE, (view.width - cw) / 2), top: Math.max(EDGE, (view.height - card.height) / 2), side: 'middle' };
  }
  left = hole.left + hole.width / 2 - cw / 2;
  left = Math.max(EDGE, Math.min(left, view.width - cw - EDGE));
  var below = hole.top + hole.height + CARD_GAP;
  if (below + card.height <= view.height - EDGE) return { left: left, top: below, side: 'below' };
  var above = hole.top - CARD_GAP - card.height;
  if (above >= EDGE) return { left: left, top: above, side: 'above' };
  // The highlight is tall (most of the screen): the card sits over its lower part instead
  return { left: left, top: Math.max(EDGE, view.height - card.height - EDGE), side: 'middle' };
}

/** The four dim rectangles around a hole (top, bottom, left, right), covering everything else. */
export function shieldRects(hole, view) {
  if (!hole) return [{ left: 0, top: 0, width: view.width, height: view.height }, null, null, null].filter(Boolean);
  var top = Math.max(0, hole.top);
  var bottom = Math.min(view.height, hole.top + hole.height);
  var left = Math.max(0, hole.left);
  var right = Math.min(view.width, hole.left + hole.width);
  return [
    { left: 0, top: 0, width: view.width, height: top },
    { left: 0, top: bottom, width: view.width, height: Math.max(0, view.height - bottom) },
    { left: 0, top: top, width: left, height: Math.max(0, bottom - top) },
    { left: right, top: top, width: Math.max(0, view.width - right), height: Math.max(0, bottom - top) }
  ];
}

function isVisible(el) {
  if (!el || !el.getBoundingClientRect) return false;
  var r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  var style = window.getComputedStyle ? window.getComputedStyle(el) : null;
  return !(style && (style.visibility === 'hidden' || style.display === 'none'));
}

/**
 * Run the tour.
 * @param {object} opts
 * @param {object[]} opts.steps
 * @param {object} [opts.ctx] passed to each step's before/after/skipIf
 * @param {function(): void} [opts.requestClose] called when the player presses × or Escape (to ask before leaving);
 *   without it the tour just closes
 * @param {function({completed: boolean, skipped: boolean}): void} [opts.onClose]
 * @returns {boolean} false if a tour is already open
 */
export function startTour(opts) {
  if (_tour) return false;
  var steps = (opts.steps || []).slice();
  var ctx = opts.ctx || {};
  var index = -1;
  var closed = false;
  var frame = null;
  var advanceTimer = null;
  var current = null;
  var targetEl = null;
  var internal = false;   // true while a step's own before/after hook runs (they click things on the tour's behalf)

  var root = document.createElement('div');
  root.id = 'tourOverlay';
  root.className = 'tour';
  root.setAttribute('data-no-swipe', '');
  var shields = [];
  for (var i = 0; i < 4; i++) {
    var s = document.createElement('div');
    s.className = 'tour-shield';
    s.setAttribute('data-no-swipe', '');
    root.appendChild(s);
    shields.push(s);
  }
  var ring = document.createElement('div');
  ring.className = 'tour-ring';
  ring.setAttribute('aria-hidden', 'true');
  root.appendChild(ring);
  var card = document.createElement('div');
  card.className = 'tour-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'App tour');
  root.appendChild(card);
  document.body.appendChild(root);

  function resolveTarget(step) {
    if (!step || !step.target) return null;
    var el = typeof step.target === 'function' ? step.target(ctx) : document.querySelector(step.target);
    return isVisible(el) ? el : null;
  }

  function view() { return { width: window.innerWidth || document.documentElement.clientWidth, height: window.innerHeight || document.documentElement.clientHeight }; }

  function paint() {
    frame = null;
    if (closed || !current) return;
    var el = resolveTarget(current);
    var changed = el !== targetEl;
    targetEl = el;
    var hole = null;
    if (el) {
      var r = el.getBoundingClientRect();
      hole = { left: r.left - PAD, top: r.top - PAD, width: r.width + 2 * PAD, height: r.height + 2 * PAD };
    }
    var v = view();
    var rects = shieldRects(hole, v);
    for (var k = 0; k < shields.length; k++) {
      var rect = rects[k];
      var sh = shields[k];
      if (!rect) { sh.style.display = 'none'; continue; }
      sh.style.display = '';
      sh.style.left = rect.left + 'px';
      sh.style.top = rect.top + 'px';
      sh.style.width = rect.width + 'px';
      sh.style.height = rect.height + 'px';
    }
    if (hole) {
      ring.style.display = '';
      ring.style.left = hole.left + 'px';
      ring.style.top = hole.top + 'px';
      ring.style.width = hole.width + 'px';
      ring.style.height = hole.height + 'px';
    } else {
      ring.style.display = 'none';
    }
    var pos = placeCard(hole, { width: card.offsetWidth || 300, height: card.offsetHeight || 150 }, v);
    card.style.left = pos.left + 'px';
    card.style.top = pos.top + 'px';
    card.setAttribute('data-side', pos.side);
    // the element can appear after the step starts (a screen still drawing): offer or withdraw Next to match
    if (changed) renderCard();
    schedule();
  }

  function schedule() {
    if (closed) return;
    if (frame === null) frame = window.requestAnimationFrame(paint);
  }

  function pressMode() {
    if (!current) return 'next';
    if (!targetEl) return 'next';
    return current.press === 'pass' || current.press === 'count' ? current.press : 'next';
  }

  function renderCard() {
    while (card.firstChild) card.removeChild(card.firstChild);
    var count = document.createElement('div');
    count.className = 'tut-count';
    count.textContent = 'Tour ' + Math.min(index + 1, steps.length) + ' of ' + steps.length;
    card.appendChild(count);
    var h = document.createElement('h2');
    h.textContent = current.title;
    card.appendChild(h);
    var p = document.createElement('p');
    p.className = 'tut-text';
    p.textContent = current.text;
    card.appendChild(p);

    var mode = pressMode();
    if (mode !== 'next') {
      var hint = document.createElement('div');
      hint.className = 'tour-hint';
      hint.textContent = '👆 ' + (current.hint || 'Tap the highlighted spot');
      card.appendChild(hint);
    }
    var buttons = document.createElement('div');
    buttons.className = 'tut-buttons';
    if (mode === 'next') {
      var nextBtn = document.createElement('button');
      nextBtn.type = 'button';
      nextBtn.className = 'btn btn-primary btn-sm';
      nextBtn.id = 'tourNextBtn';
      nextBtn.textContent = index === steps.length - 1 ? 'Finish' : 'Next';
      nextBtn.addEventListener('click', function () { advance(); });
      buttons.appendChild(nextBtn);
    }
    card.appendChild(buttons);
    // A small × in the corner (no Skip button); the caller can ask "are you sure?" first
    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'tut-x';
    x.id = 'tourCloseBtn';
    x.setAttribute('aria-label', 'Close the tutorial');
    x.textContent = '×';
    x.addEventListener('click', function () { requestClose(); });
    card.appendChild(x);
    if (mode === 'next') { var nb = card.querySelector('#tourNextBtn'); if (nb) nb.focus(); }
    else if (targetEl && typeof targetEl.focus === 'function') { try { targetEl.focus({ preventScroll: true }); } catch (e) { /* best effort */ } }
  }

  function show(i) {
    // find the next step that applies
    while (i < steps.length && steps[i].skipIf && steps[i].skipIf(ctx)) i++;
    if (i >= steps.length) { finish('completed'); return; }
    index = i;
    current = steps[i];
    targetEl = null;
    if (current.before) { internal = true; try { current.before(ctx); } finally { internal = false; } }
    // give the screen a moment to draw whatever the step just opened, then find the element
    if (frame !== null) { window.cancelAnimationFrame(frame); frame = null; }
    targetEl = resolveTarget(current);
    if (targetEl && targetEl.scrollIntoView) { try { targetEl.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e) { /* best effort */ } }
    renderCard();
    schedule();
  }

  function advance() {
    if (closed || !current) return;
    var leaving = current;
    clearTimeout(advanceTimer);
    advanceTimer = setTimeout(function () {
      advanceTimer = null;
      if (closed) return;
      if (leaving.after) { internal = true; try { leaving.after(ctx); } finally { internal = false; } }
      show(index + 1);
    }, leaving.press === 'pass' && targetEl ? ADVANCE_MS : 0);
  }

  // What the player may press: the card, the highlighted spot, and the "Exit the tutorial?" question that the × opens
  function inBounds(el) {
    if (root.contains(el) || (targetEl && targetEl.contains(el))) return true;
    return !!(el.closest && el.closest('#tutExitConfirm'));
  }

  // A press on the highlighted element: count it (and swallow it) or let it through, then move on
  function onPress(e) {
    if (closed || !current || internal) return;
    // Anything outside the highlighted spot and the card is out of bounds. The dim shields stop taps and clicks;
    // this also stops a press that arrives by the keyboard (Tab to a button behind the tour, then Enter or Space)
    if (e.target && !inBounds(e.target)) {
      if (e.type === 'click' || e.type === 'keydown') { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); }
      return;
    }
    if (!targetEl) return;
    if (!targetEl.contains(e.target)) return;
    var mode = pressMode();
    if (mode === 'next') return;
    if (e.type === 'click') {
      if (mode === 'count') { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); }
      advance();
    } else if (mode === 'count') {
      // the earlier events of a press (pointerdown, mousedown, touchstart) must not reach the element either
      e.stopPropagation();
    }
  }
  var pressEvents = ['pointerdown', 'mousedown', 'touchstart', 'pointerup', 'mouseup', 'touchend', 'click'];
  pressEvents.forEach(function (t) { document.addEventListener(t, onPress, true); });

  function requestClose() {
    if (closed) return;
    if (opts.requestClose) opts.requestClose(); else finish('skipped');
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); requestClose(); return; }
    // Enter and Space only act on the highlighted spot or the card's own buttons, never on something behind the tour
    if ((e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') && e.target && e.target !== document.body && !inBounds(e.target)) {
      e.preventDefault(); e.stopPropagation();
    }
  }
  document.addEventListener('keydown', onKey, true);
  function onResize() { schedule(); }
  window.addEventListener('resize', onResize);

  function finish(result) {
    if (closed) return;
    closed = true;
    clearTimeout(advanceTimer);
    if (frame !== null) window.cancelAnimationFrame(frame);
    pressEvents.forEach(function (t) { document.removeEventListener(t, onPress, true); });
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    if (root.parentNode) root.parentNode.removeChild(root);
    _tour = null;
    if (opts.onClose) opts.onClose({ completed: result === 'completed', skipped: result === 'skipped' });
  }

  _tour = { finish: finish };
  root.classList.add('active');
  show(0);
  return true;
}
