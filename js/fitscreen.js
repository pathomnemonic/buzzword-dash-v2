/**
 * fitscreen.js — one-page screens use the whole screen.
 *
 * Stats, Quests, Profile and the folded Locker are laid out to fit one phone screen without scrolling. On a bigger
 * screen that would leave small text and empty space, so each of them is scaled up (CSS `zoom`) by exactly as much as
 * still fits: more room, bigger everything, and still no scrolling. When a screen has more than fits (a section is
 * open, a long list), it goes back to normal size and scrolls as usual.
 *
 * The scale is never below 1 and never above MAX_ZOOM, so text never gets silly on a very big monitor.
 */

export var MAX_ZOOM = 1.45;
/** Scaled up, the content still gets at least this many CSS pixels of width, so a narrow phone is not squeezed. */
export var MIN_EFFECTIVE_WIDTH = 300;
var SCREENS = ['screenStats', 'screenQuests', 'screenProfile', 'screenShop'];
var STEPS = 4;

/**
 * The biggest scale (1 to max) at which content that is `heightAtOne` tall at scale 1 still fits in `available`.
 * Content height grows about in proportion to the scale (a little faster, since text wraps), so this just
 * divides and the caller re-checks.
 */
export function zoomFor(heightAtOne, available, max) {
  if (!(heightAtOne > 0) || !(available > 0)) return 1;
  var f = available / heightAtOne;
  return Math.max(1, Math.min(max || MAX_ZOOM, f));
}

function wrapperOf(screen) {
  var scroll = screen.querySelector('.screen-scroll');
  if (!scroll) return null;
  var w = scroll.querySelector(':scope > .fit-zoom');
  if (!w) {
    w = document.createElement('div');
    w.className = 'fit-zoom';
    while (scroll.firstChild) w.appendChild(scroll.firstChild);
    scroll.appendChild(w);
  }
  return { scroll: scroll, wrap: w };
}

/** Fit one screen. Returns the zoom that was applied. */
export function fitScreen(screen) {
  var parts = wrapperOf(screen);
  if (!parts || !screen.classList.contains('active')) return 1;
  var scroll = parts.scroll;
  var wrap = parts.wrap;
  var cs = getComputedStyle(scroll);
  var avail = scroll.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  wrap.style.zoom = '1';
  var h = wrap.getBoundingClientRect().height;
  var widthCap0 = Math.max(1, scroll.clientWidth / MIN_EFFECTIVE_WIDTH);
  if (!(h > 0) || h > avail) {
    // More than fits (a section was opened, a long list): it scrolls. It keeps the size it had a moment ago, so opening a
    // dropdown does not make the whole screen suddenly shrink; a screen that never fitted just stays at normal size.
    var keep = Math.max(1, Math.min(Number(screen._fitZoom) || 1, widthCap0));
    wrap.style.zoom = String(Math.round(keep * 1000) / 1000);
    return keep;
  }
  var widthCap = Math.max(1, scroll.clientWidth / MIN_EFFECTIVE_WIDTH);
  var f = zoomFor(h, avail * 0.965, Math.min(MAX_ZOOM, widthCap));
  for (var i = 0; i < STEPS && f > 1.01; i++) {
    wrap.style.zoom = String(f);
    var now = wrap.getBoundingClientRect().height;
    if (now <= avail * 0.97) break;
    f = Math.max(1, f * (avail / now) * 0.97);
  }
  if (f <= 1.01) { wrap.style.zoom = '1'; screen._fitZoom = 1; return 1; }
  wrap.style.zoom = String(Math.round(f * 1000) / 1000);
  // the real test: the scroll area itself must not overflow (margins, sticky parts and rounding can add a few pixels)
  for (var k = 0; k < 5 && scroll.scrollHeight > scroll.clientHeight && f > 1; k++) {
    f = Math.max(1, f * (scroll.clientHeight / scroll.scrollHeight) * 0.99);
    wrap.style.zoom = String(Math.round(f * 1000) / 1000);
  }
  if (f <= 1.01) { wrap.style.zoom = '1'; screen._fitZoom = 1; return 1; }
  screen._fitZoom = f;
  return f;
}

var timer = null;
function schedule() {
  if (timer) return;
  timer = setTimeout(function () {
    timer = null;
    SCREENS.forEach(function (id) { var s = document.getElementById(id); if (s && s.classList.contains('active')) fitScreen(s); });
    // once more a moment later: fonts, images and slide-in animations can change the height after the first look
    setTimeout(function () { SCREENS.forEach(function (id) { var s = document.getElementById(id); if (s && s.classList.contains('active')) fitScreen(s); }); }, 350);
  }, 60);
}

/** Start keeping the one-page screens fitted: on show, on resize and when their content changes. */
export function mountFitScreens() {
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  document.addEventListener('dx:screen-shown', schedule);
  document.addEventListener('dx:attention-changed', schedule);
  if (typeof MutationObserver === 'function') {
    var busy = false;
    var mo = new MutationObserver(function () { if (!busy) schedule(); });
    SCREENS.forEach(function (id) {
      var s = document.getElementById(id);
      if (s) mo.observe(s, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'class', 'hidden'] });
    });
    // (changing the zoom only touches a style attribute, which is not watched, so this cannot loop)
    void busy;
  }
  schedule();
}
