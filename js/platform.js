/**
 * platform.js — copy, share and save-a-file that work in a browser AND inside the phone app.
 *
 * The app's web view lacks things a browser has (sharing sheets, blob downloads, sometimes the clipboard), so every
 * screen goes through here rather than calling navigator.share / navigator.clipboard / <a download> directly.
 * A test (platformaudit.test.js) fails if a screen goes back to the raw calls.
 */

import { isNative } from './native.js';

var _testPlugins = null;

/** Tests inject fake native plugins: { Share, Filesystem }. Pass null to clear. */
export function setPlatformPluginsForTest(p) { _testPlugins = p; }

function loadShare() {
  if (_testPlugins && _testPlugins.Share) return Promise.resolve(_testPlugins.Share);
  if (!isNative()) return Promise.resolve(null);
  return import('@capacitor/share').then(function (m) { return m.Share || null; }).catch(function () { return null; });
}

function loadFilesystem() {
  if (_testPlugins && _testPlugins.Filesystem) return Promise.resolve(_testPlugins);
  if (!isNative()) return Promise.resolve(null);
  return import('@capacitor/filesystem').then(function (m) { return { Filesystem: m.Filesystem, Directory: m.Directory }; }).catch(function () { return null; });
}

/** Copy text. Resolves true if it was copied, false if the device would not allow it. */
export function copyText(text) {
  var viaClipboard = (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText)
    ? navigator.clipboard.writeText(text).then(function () { return true; }, function () { return false; })
    : Promise.resolve(false);
  return viaClipboard.then(function (ok) {
    if (ok) return true;
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      var done = document.execCommand && document.execCommand('copy');
      document.body.removeChild(ta);
      return !!done;
    } catch (e) {
      return false;
    }
  });
}

/** Can this device open a share sheet at all? */
export function canShareNatively() {
  return !!(_testPlugins && _testPlugins.Share) || isNative() || (typeof navigator !== 'undefined' && !!navigator.share);
}

/**
 * Share text and/or a link. @returns {Promise<'shared'|'copied'|'failed'>} ('copied' when it had to fall back
 * to the clipboard). Cancelling the sheet counts as 'shared' (nothing went wrong).
 */
export function shareText(opts) {
  var title = opts.title || '';
  var text = opts.text || '';
  var url = opts.url || '';
  return loadShare().then(function (Share) {
    if (Share) {
      return Share.share({ title: title, text: text, url: url || undefined, dialogTitle: title || undefined }).then(
        function () { return 'shared'; },
        function (e) { return /cancel|abort/i.test(String(e && (e.message || e.name))) ? 'shared' : 'failed'; }
      );
    }
    if (typeof navigator !== 'undefined' && navigator.share) {
      return navigator.share({ title: title, text: text, url: url || undefined }).then(
        function () { return 'shared'; },
        function (e) { return e && e.name === 'AbortError' ? 'shared' : 'failed'; }
      );
    }
    return 'failed';
  }).then(function (result) {
    if (result !== 'failed') return result;
    return copyText([text, url].filter(Boolean).join(' ')).then(function (ok) { return ok ? 'copied' : 'failed'; });
  });
}

function toBase64(blob) {
  return new Promise(function (resolve, reject) {
    var r = new FileReader();
    r.onload = function () { resolve(String(r.result).split(',')[1] || ''); };
    r.onerror = function () { reject(r.error); };
    r.readAsDataURL(blob);
  });
}

/**
 * Save a file for the user. In a browser it downloads; in the phone app it writes the file to the app's cache and
 * opens the share sheet so the user can put it in Files, Drive, email... (a blob download does nothing there).
 * @param {Blob} blob
 * @param {string} filename
 * @returns {Promise<'downloaded'|'shared'|'failed'>}
 */
export function saveFile(blob, filename) {
  return loadFilesystem().then(function (fs) {
    var nativeShare = (fs && fs.Filesystem) ? loadShare() : Promise.resolve(null);
    return nativeShare.then(function (Share) {
      if (fs && fs.Filesystem && Share) {
        return toBase64(blob).then(function (data) {
          return fs.Filesystem.writeFile({ path: filename, data: data, directory: fs.Directory ? fs.Directory.Cache : 'CACHE' });
        }).then(function (res) {
          return Share.share({ title: filename, files: [res.uri], dialogTitle: 'Save ' + filename });
        }).then(function () { return 'shared'; }, function (e) {
          return /cancel|abort/i.test(String(e && (e.message || e.name))) ? 'shared' : 'failed';
        });
      }
      try {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        return 'downloaded';
      } catch (e) {
        return 'failed';
      }
    });
  });
}

function loadLauncher() {
  if (_testPlugins && _testPlugins.AppLauncher) return Promise.resolve(_testPlugins.AppLauncher);
  if (!isNative()) return Promise.resolve(null);
  return import('@capacitor/app-launcher').then(function (m) { return m.AppLauncher || null; }).catch(function () { return null; });
}

/**
 * Open a link outside the game: a web page in the browser, or a store page (market://, itms-apps://) in the store
 * app. In the phone app the system is asked to open it, so it never replaces the game itself.
 * @returns {Promise<boolean>} true when something was opened
 */
export function openUrl(url) {
  return loadLauncher().then(function (launcher) {
    if (launcher) {
      return launcher.openUrl({ url: url }).then(function (res) { return !res || res.completed !== false; }, function () { return false; });
    }
    try { return !!window.open(url, '_blank', 'noopener,noreferrer') || true; } catch (e) { return false; }
  });
}

/** Open a web page. (Fire and forget; use openUrl when you need to know whether it worked.) */
export function openExternal(url) {
  openUrl(url);
  return true;
}
