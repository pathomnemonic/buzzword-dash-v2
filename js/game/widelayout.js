/**
 * widelayout.js — the landscape tablet and desktop layout.
 *
 * On a wide landscape screen the stat bar, question and answers sit in a column on the left, and the track fills the rest of
 * the window instead of running under a strip of text. The page does it with CSS (the same query as below, in
 * css/arcade.css); the 3D view only has to slide the track over so it is centered in the part of the screen the column
 * leaves free. A phone, or a tablet held upright, keeps the layout it has always had.
 */

/** Wide and landscape enough for a side column. Keep in step with the same query in css/arcade.css. */
export var WIDE_QUERY = '(min-width: 1000px) and (min-height: 600px) and (min-aspect-ratio: 4/3)';

/** Width of the left column in pixels (also in css/arcade.css as --wide-panel). */
export var WIDE_PANEL_PX = 380;

/** Is the wide layout on right now? */
export function isWideLayout(win) {
  win = win || (typeof window !== 'undefined' ? window : null);
  return !!(win && typeof win.matchMedia === 'function' && win.matchMedia(WIDE_QUERY).matches);
}

/** How far (pixels) the track moves right so it is centered between the column and the right edge. */
export function trackShiftPx(win) {
  return isWideLayout(win) ? Math.round(WIDE_PANEL_PX / 2) : 0;
}

/** Point a camera's view at the free part of the screen (or back at all of it). */
export function applyTrackShift(camera, width, height, win) {
  if (!camera) return;
  var shift = trackShiftPx(win);
  if (shift) camera.setViewOffset(width, height, -shift, 0, width, height);
  else if (camera.view && camera.view.enabled) camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
