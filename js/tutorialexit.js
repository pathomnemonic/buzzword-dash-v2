/**
 * tutorialexit.js — the "are you sure?" box shown when someone tries to close the tutorial.
 *
 * The tutorial has no Skip button: each of its pop-ups has a small × in the corner, and pressing it (or Escape,
 * or the Android back button) asks first, because the tutorial is where a new player learns the game.
 * It is the same box over the practice run, the spotlight tour and the plain pages.
 */

var _open = null;

/** True while the box is showing. */
export function isExitConfirmOpen() {
  return !!_open;
}

/** Close the box without leaving (Escape, back). */
export function dismissExitConfirm() {
  if (_open) _open.stay();
}

/**
 * @param {{onExit: function(): void, onStay?: function(): void}} opts
 * @returns {boolean} false when the box is already showing
 */
export function confirmExitTutorial(opts) {
  if (_open) return false;
  var overlay = document.createElement('div');
  overlay.id = 'tutExitConfirm';
  overlay.className = 'tut-exit';
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'tutExitTitle');
  overlay.setAttribute('data-no-swipe', '');

  var box = document.createElement('div');
  box.className = 'tut-exit-box';
  var h = document.createElement('h2');
  h.id = 'tutExitTitle';
  h.textContent = 'Exit the tutorial?';
  var p = document.createElement('p');
  p.textContent = 'You can open it again any time with "How to play" on the Home screen.';
  var buttons = document.createElement('div');
  buttons.className = 'tut-buttons';
  var stay = document.createElement('button');
  stay.type = 'button';
  stay.id = 'tutExitStay';
  stay.className = 'btn btn-primary btn-sm';
  stay.textContent = 'Keep going';
  var exit = document.createElement('button');
  exit.type = 'button';
  exit.id = 'tutExitYes';
  exit.className = 'btn btn-outline btn-sm';
  exit.textContent = 'Exit tutorial';
  buttons.appendChild(stay);
  buttons.appendChild(exit);
  box.appendChild(h);
  box.appendChild(p);
  box.appendChild(buttons);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  function close() {
    document.removeEventListener('keydown', onKey, true);
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    _open = null;
  }
  function stayFn() { close(); if (opts.onStay) opts.onStay(); }
  function exitFn() { close(); opts.onExit(); }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stayFn(); }
  }
  stay.addEventListener('click', stayFn);
  exit.addEventListener('click', exitFn);
  document.addEventListener('keydown', onKey, true);
  _open = { stay: stayFn };
  stay.focus();
  return true;
}
