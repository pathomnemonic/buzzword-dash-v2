/**
 * colorwheel.js — a full color wheel for choosing a character's colors.
 *
 * A hue/saturation wheel, a brightness slider and a hex field, so any color can be picked (not just
 * the swatches each character comes with). Colors are plain 0xRRGGBB numbers, as the rest of the game
 * uses them. 0 means "Original" elsewhere, so a pure black pick is stored as 0x010101.
 *
 * The wheel can be dragged or moved with the arrow keys, and the brightness slider and hex field are
 * there for anyone who would rather not use the wheel.
 */

import { createElement } from './dom.js';

var SIZE = 200;

/** @returns {{h: number, s: number, v: number}} h in degrees (0-360), s and v in 0-1 */
export function hexToHsv(hex) {
  var r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255;
  var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  var h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h: h, s: max === 0 ? 0 : d / max, v: max };
}

/** @returns {number} 0xRRGGBB (never 0: pure black becomes 0x010101, because 0 means "Original") */
export function hsvToHex(h, s, v) {
  h = ((h % 360) + 360) % 360;
  s = Math.min(1, Math.max(0, s));
  v = Math.min(1, Math.max(0, v));
  var c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  var r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  var out = (Math.round((r + m) * 255) << 16) | (Math.round((g + m) * 255) << 8) | Math.round((b + m) * 255);
  return out === 0 ? 0x010101 : out;
}

/** '#rrggbb' for a color number. */
export function hexString(n) {
  return '#' + ('000000' + n.toString(16)).slice(-6);
}

/** A color number from '#rrggbb', 'rrggbb' or '#rgb' (anything else gives null). */
export function parseHex(text) {
  var t = String(text || '').trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(t)) t = t.charAt(0) + t.charAt(0) + t.charAt(1) + t.charAt(1) + t.charAt(2) + t.charAt(2);
  if (!/^[0-9a-fA-F]{6}$/.test(t)) return null;
  var n = parseInt(t, 16);
  return n === 0 ? 0x010101 : n;
}

function drawWheel(canvas, v) {
  var ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx) return;
  var img = ctx.createImageData(SIZE, SIZE);
  var radius = SIZE / 2;
  for (var y = 0; y < SIZE; y++) {
    for (var x = 0; x < SIZE; x++) {
      var dx = x + 0.5 - radius, dy = y + 0.5 - radius;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var i = (y * SIZE + x) * 4;
      if (dist > radius) { img.data[i + 3] = 0; continue; }
      var hue = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
      var hex = hsvToHex(hue, dist / radius, v);
      img.data[i] = (hex >> 16) & 255;
      img.data[i + 1] = (hex >> 8) & 255;
      img.data[i + 2] = hex & 255;
      // a soft edge so the circle does not look jagged
      img.data[i + 3] = dist > radius - 1 ? Math.round(255 * (radius - dist)) : 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * @param {object} opts
 * @param {number} [opts.hex] the starting color
 * @param {function(number): void} [opts.onInput] while dragging (for a live preview)
 * @param {function(number): void} [opts.onCommit] when a color is chosen (pointer released, slider or field changed, key pressed)
 * @returns {{el: HTMLElement, setHex: function(number): void}}
 */
export function createColorWheel(opts) {
  opts = opts || {};
  var hsv = hexToHsv(opts.hex || 0x1fa3b5);
  var el = createElement('div', { className: 'color-wheel', attributes: { 'data-no-swipe': '' } });

  var stage = createElement('div', { className: 'cw-stage' });
  var canvas = createElement('canvas', {
    className: 'cw-canvas',
    attributes: { width: String(SIZE), height: String(SIZE), tabindex: '0', role: 'application', 'aria-label': 'Color wheel. Arrow keys change the color; Shift with the arrows moves in bigger steps.' }
  });
  var marker = createElement('div', { className: 'cw-marker', attributes: { 'aria-hidden': 'true' } });
  stage.appendChild(canvas);
  stage.appendChild(marker);
  el.appendChild(stage);

  var side = createElement('div', { className: 'cw-side' });
  var bright = createElement('input', { className: 'cw-bright', attributes: { type: 'range', min: '0', max: '100', step: '1', 'aria-label': 'Brightness' } });
  var field = createElement('input', { className: 'cw-hex', attributes: { type: 'text', maxlength: '7', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Color code, for example #1fa3b5' } });
  var preview = createElement('div', { className: 'cw-preview', attributes: { 'aria-hidden': 'true' } });
  side.appendChild(createElement('div', { className: 'cw-label', text: 'Brightness' }));
  side.appendChild(bright);
  side.appendChild(createElement('div', { className: 'cw-label', text: 'Color code' }));
  var row = createElement('div', { className: 'cw-row' });
  row.appendChild(preview);
  row.appendChild(field);
  side.appendChild(row);
  el.appendChild(side);

  function current() { return hsvToHex(hsv.h, hsv.s, hsv.v); }

  function paint(redraw) {
    var hex = current();
    if (redraw) drawWheel(canvas, hsv.v);
    var rad = hsv.h * Math.PI / 180;
    marker.style.left = (50 + 50 * hsv.s * Math.cos(rad)) + '%';
    marker.style.top = (50 + 50 * hsv.s * Math.sin(rad)) + '%';
    marker.style.background = hexString(hex);
    preview.style.background = hexString(hex);
    bright.value = String(Math.round(hsv.v * 100));
    bright.style.setProperty('--cw-color', hexString(hsvToHex(hsv.h, hsv.s, 1)));
    if (document.activeElement !== field) field.value = hexString(hex);
  }

  function input() { if (opts.onInput) opts.onInput(current()); }
  function commit() { if (opts.onCommit) opts.onCommit(current()); }

  // ---- the wheel: drag, or arrow keys ----
  var dragging = false;
  function fromPointer(e) {
    var box = canvas.getBoundingClientRect();
    var dx = e.clientX - (box.left + box.width / 2), dy = e.clientY - (box.top + box.height / 2);
    var r = Math.min(1, Math.sqrt(dx * dx + dy * dy) / (box.width / 2));
    hsv.h = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
    hsv.s = r;
    paint(false);
    input();
  }
  canvas.addEventListener('pointerdown', function (e) {
    dragging = true;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* best effort */ }
    fromPointer(e);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', function (e) { if (dragging) fromPointer(e); });
  function release() { if (dragging) { dragging = false; commit(); } }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('keydown', function (e) {
    var step = e.shiftKey ? 15 : 3;
    var handled = true;
    if (e.key === 'ArrowLeft') hsv.h = (hsv.h - step + 360) % 360;
    else if (e.key === 'ArrowRight') hsv.h = (hsv.h + step) % 360;
    else if (e.key === 'ArrowUp') hsv.s = Math.min(1, hsv.s + step / 100);
    else if (e.key === 'ArrowDown') hsv.s = Math.max(0, hsv.s - step / 100);
    else handled = false;
    if (!handled) return;
    e.preventDefault();
    paint(false);
    input();
    commit();
  });

  // ---- brightness and the code ----
  bright.addEventListener('input', function () {
    hsv.v = Math.max(0.02, Number(bright.value) / 100);
    paint(true);
    input();
  });
  bright.addEventListener('change', commit);
  field.addEventListener('input', function () {
    var n = parseHex(field.value);
    if (n === null) return;
    hsv = hexToHsv(n);
    paint(true);
    field.classList.remove('bad');
    input();
  });
  field.addEventListener('change', function () {
    var n = parseHex(field.value);
    if (n === null) { field.classList.add('bad'); return; }
    hsv = hexToHsv(n);
    field.classList.remove('bad');
    paint(true);
    commit();
  });

  paint(true);

  return {
    el: el,
    setHex: function (hex) {
      if (!hex) return;
      hsv = hexToHsv(hex);
      paint(true);
    }
  };
}
