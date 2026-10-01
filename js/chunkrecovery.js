/**
 * chunkrecovery.js — survives a stale cached copy of the app.
 *
 * After an update, an old page can still ask for a script file that no longer exists on the server
 * (the exam simulator, challenges and multiplayer load on demand). Instead of a silent failure, the
 * app reloads once to pick up the new version, and tells the player if that does not help.
 */

var KEY = 'dxChunkReload';

export function isChunkError(err) {
  var msg = String((err && (err.message || err.reason && err.reason.message)) || err || '');
  return /dynamically imported module|Importing a module script failed|Failed to fetch dynamically|error loading dynamically|Unable to preload CSS/i.test(msg);
}

/** Reload once (per 30 s) when a chunk fails to load. Returns true if a reload was started. */
export function recoverFromChunkError(win) {
  win = win || window;
  try {
    var last = Number(win.sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 30000) return false;
    win.sessionStorage.setItem(KEY, String(Date.now()));
  } catch (e) { return false; }
  win.location.reload();
  return true;
}

export function installChunkRecovery(onFail) {
  window.addEventListener('vite:preloadError', function (e) {
    if (e.preventDefault) e.preventDefault();
    if (!recoverFromChunkError() && onFail) onFail();
  });
  window.addEventListener('unhandledrejection', function (e) {
    if (!isChunkError(e)) return;
    if (!recoverFromChunkError() && onFail) onFail();
  });
}
