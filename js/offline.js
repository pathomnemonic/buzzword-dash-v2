/**
 * offline.js — knowing when the device has no connection, and saying so kindly.
 *
 * Studying, runs, flashcards and the saved cards all work offline. Friends, the feed, Versus and cloud save need
 * a connection, so they say so instead of showing an endless "Connecting…".
 */

export var OFFLINE_NOTICE = 'Offline: running and studying still work. Friends, Versus and cloud save will catch up when you are back online.';
export var BACK_ONLINE_NOTICE = 'Back online.';
export var NEEDS_CONNECTION = 'You are offline. This needs a connection: try again when you are back online.';

export function isOnline(nav) {
  nav = nav || (typeof navigator !== 'undefined' ? navigator : {});
  return nav.onLine !== false;
}

/**
 * Tell the caller when the connection goes and comes back.
 * @param {function(string)} notify shows a short message
 * @param {Window} [win]
 * @returns {function(): void} stop watching
 */
export function watchConnection(notify, win) {
  win = win || (typeof window !== 'undefined' ? window : null);
  if (!win) return function () {};
  function off() { notify(OFFLINE_NOTICE); }
  function on() { notify(BACK_ONLINE_NOTICE); }
  win.addEventListener('offline', off);
  win.addEventListener('online', on);
  return function () { win.removeEventListener('offline', off); win.removeEventListener('online', on); };
}
