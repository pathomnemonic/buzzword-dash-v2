/**
 * homefx.js — medical odds and ends flying out of the middle of the screen, behind the menus.
 *
 * Pills, syringes, microbes, brains and the like start tiny at the center and fly outward, growing as
 * they come "toward" you, then fade and start again as something else, in a new direction. It is a
 * cheap CSS animation (transform and opacity only), it sits behind everything, it pauses when the page
 * is hidden, and it stays off for anyone who asked for reduced motion.
 */

/** Widely supported emoji only, so nothing shows up as an empty box on older phones. */
export var FLYER_ICONS = [
  '💊', '💉', '🩺', '🧬', '🧠', '🦠', '🩸', '🧪', '🔬', '🚑', '🩹', '🦴', '🦷', '🌡️', '⚕️', '🧫', '🏥', '❤️'
];

var COUNT = 18;

function between(lo, hi, rand) { return lo + (hi - lo) * rand(); }

/**
 * New random look and path for one flyer.
 * @param {function(): number} rand
 * @returns {{icon: string, dx: number, dy: number, size: number, rot: number, dur: number, end: number}}
 *   dx/dy in vw/vh units (how far it travels), size in px, rot in degrees, dur in seconds, end = final scale
 */
export function randomFlight(rand) {
  rand = rand || Math.random;
  var angle = rand() * Math.PI * 2;
  var far = between(55, 80, rand);
  return {
    icon: FLYER_ICONS[Math.floor(rand() * FLYER_ICONS.length) % FLYER_ICONS.length],
    dx: Math.round(Math.cos(angle) * far),
    dy: Math.round(Math.sin(angle) * far),
    size: Math.round(between(34, 60, rand)),
    rot: Math.round(between(-200, 200, rand)),
    dur: +between(5, 9.5, rand).toFixed(1),
    end: +between(2.4, 4.5, rand).toFixed(1)
  };
}

function apply(el, f) {
  el.textContent = f.icon;
  el.style.setProperty('--dx', f.dx + 'vw');
  el.style.setProperty('--dy', f.dy + 'vh');
  el.style.setProperty('--size', f.size + 'px');
  el.style.setProperty('--rot', f.rot + 'deg');
  el.style.setProperty('--dur', f.dur + 's');
  el.style.setProperty('--end', String(f.end));
}

/**
 * Fill a layer with flyers.
 * @param {HTMLElement} layer
 * @param {{reducedMotion?: boolean, rand?: function(): number, count?: number}} [options]
 * @returns {{stop: function(): void}}
 */
export function mountFlyers(layer, options) {
  options = options || {};
  var rand = options.rand || Math.random;
  while (layer.firstChild) layer.removeChild(layer.firstChild);
  if (options.reducedMotion) return { stop: function () {} };

  var n = options.count || COUNT;
  for (var i = 0; i < n; i++) {
    var el = document.createElement('span');
    el.className = 'flyer';
    el.setAttribute('aria-hidden', 'true');
    apply(el, randomFlight(rand));
    // spread the starting points over a whole cycle so the screen is busy from the first second
    el.style.animationDelay = '-' + (rand() * 9).toFixed(1) + 's';
    // every time it finishes a pass, it comes back as something else, somewhere else
    el.addEventListener('animationiteration', function (e) { apply(e.currentTarget, randomFlight(rand)); });
    layer.appendChild(el);
  }

  function onVisibility() { layer.classList.toggle('paused', document.hidden); }
  document.addEventListener('visibilitychange', onVisibility);
  onVisibility();

  return {
    stop: function () {
      document.removeEventListener('visibilitychange', onVisibility);
      while (layer.firstChild) layer.removeChild(layer.firstChild);
    }
  };
}
