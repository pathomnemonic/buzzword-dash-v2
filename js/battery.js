/**
 * battery.js — go easier on a phone that is nearly flat.
 *
 * Where the browser reports it (Chrome and Android browsers), a battery at 20% or lower that is not charging makes
 * "Auto" graphics step down one tier, which means lower resolution and fewer effects. It goes back as soon as
 * the phone is plugged in or recharged. A player who picked a graphics level by hand is never overridden.
 */

export var LOW_LEVEL = 0.2;

var _low = false;

export function isLowBattery() { return _low; }

/** Whether a reading means "save power". */
export function isBatteryLow(level, charging) {
  return typeof level === 'number' && level <= LOW_LEVEL && !charging;
}

/** Start watching. Returns a promise that resolves when the first reading is in (or at once if unsupported). */
export function watchBattery(nav) {
  nav = nav || (typeof navigator !== 'undefined' ? navigator : {});
  if (typeof nav.getBattery !== 'function') return Promise.resolve(false);
  return nav.getBattery().then(function (b) {
    function update() { _low = isBatteryLow(b.level, b.charging); }
    update();
    ['levelchange', 'chargingchange'].forEach(function (ev) { b.addEventListener(ev, update); });
    return true;
  }).catch(function () { return false; });
}

/** For tests. */
export function setLowBatteryForTest(value) { _low = !!value; }
