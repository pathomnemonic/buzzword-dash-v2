/**
 * nativebackup.js — a second copy of the save in the phone's own file storage.
 *
 * Inside the phone apps the game's data lives in the web view's browser storage, which the operating system may clear
 * when space runs low, and which "Clear storage" in the phone's settings erases. A file in the app's data folder survives
 * both, so the save is also written there (a few seconds after it changes, never a smaller save over a fuller one). When
 * the game starts empty and a fuller copy is in that file, it is offered back through the normal "Restore your progress?"
 * question (see storage.js recoverable). On the website none of this does anything.
 */

import { isNative } from './native.js';

var FILE = 'dxdash-save.json';
var DELAY_MS = 4000;
var _timer = null;
var _pending = null;
var _best = -1; // how full the copy in the file is (so a smaller save never replaces it)

/** How much play a save holds (the same measure storage.js uses). */
export function saveWeight(json) {
  try {
    var p = (JSON.parse(json).progression) || {};
    return (Number(p.totalEncounters) || 0) * 1e6 + (Number(p.totalCoinsEarned) || 0) * 10 + (Number(p.bestScore) > 0 ? 1 : 0);
  } catch (e) { return 0; }
}

function fs() { return import('@capacitor/filesystem'); }

/** The text in the backup file, or null when there is none (or this is not a phone app). */
export async function readNativeBackup() {
  if (!isNative()) return null;
  try {
    var m = await fs();
    var res = await m.Filesystem.readFile({ path: FILE, directory: m.Directory.Data, encoding: m.Encoding.UTF8 });
    var text = typeof res.data === 'string' ? res.data : '';
    if (text) _best = Math.max(_best, saveWeight(text));
    return text || null;
  } catch (e) { return null; }
}

async function write(json) {
  try {
    var weight = saveWeight(json);
    if (weight <= 0) return;
    if (_best < 0) { await readNativeBackup(); }
    if (weight < _best) return;
    var m = await fs();
    await m.Filesystem.writeFile({ path: FILE, data: json, directory: m.Directory.Data, encoding: m.Encoding.UTF8 });
    _best = weight;
  } catch (e) { /* best effort: the browser copy is still there */ }
}

/** Note that the save changed; it is written a few seconds later (the last one wins). */
export function scheduleNativeBackup(json) {
  if (!isNative()) return;
  _pending = json;
  clearTimeout(_timer);
  _timer = setTimeout(function () { var j = _pending; _pending = null; write(j); }, DELAY_MS);
}

/** Write any waiting copy now (the app is going to the background). */
export function flushNativeBackup() {
  if (!isNative() || _pending === null) return Promise.resolve();
  clearTimeout(_timer);
  var j = _pending;
  _pending = null;
  return write(j);
}

/** The player reset their progress on purpose: forget the file too. */
export async function clearNativeBackup() {
  _best = -1;
  _pending = null;
  clearTimeout(_timer);
  if (!isNative()) return;
  try { var m = await fs(); await m.Filesystem.deleteFile({ path: FILE, directory: m.Directory.Data }); } catch (e) { /* none there */ }
}

/** Tests: forget what was learned about the file. */
export function resetNativeBackupForTest() { _best = -1; _pending = null; clearTimeout(_timer); }
