/**
 * errors.js — Centralized error reporting and user-facing error display
 *
 * Exports:
 *   reportError(error, context)
 *   showUserError(message, options)
 *   requireSupabaseSuccess(queryPromise)
 *
 * Per Section 17 of the architecture contract [2].
 */

/**
 * Report an error to the console with structured context.
 * In production this could forward to a remote error-tracking service.
 *
 * @param {Error|string} error
 * @param {object} [context]
 * @param {string} [context.system]       - e.g. 'audio', 'multiplayer', 'leaderboard'
 * @param {string} [context.operation]    - e.g. 'submitScore', 'joinGame'
 * @param {string} [context.runId]
 * @param {string} [context.sessionId]
 * @param {string} [context.matchId]
 * @param {boolean} [context.recoverable]
 * @param {object} [context.metadata]
 */
export function reportError(error, context = {}) {
  var msg = error instanceof Error ? error.message : String(error);
  var stack = error instanceof Error ? error.stack : undefined;

  console.error(
    '[Dx Dash]' +
      (context.system ? ' [' + context.system + ']' : '') +
      (context.operation ? ' ' + context.operation + ':' : '') +
      ' ' + msg
  );

  if (stack) {
    console.error(stack);
  }

  if (context.metadata) {
    console.error('  metadata:', context.metadata);
  }

  sendRemote(msg, stack, context);
}

/* ---- optional remote error tracking ----
 * Off unless VITE_ERROR_ENDPOINT is set at build time. Sends only the message, a trimmed stack, the
 * system/operation tags and the app version; no account, score or card data. At most MAX_REMOTE
 * distinct reports per page load, so a render loop cannot flood the endpoint. */
var MAX_REMOTE = 10;
var remoteSent = 0;
var remoteSeen = {};

function remoteEndpoint() {
  try { return (import.meta.env && import.meta.env.VITE_ERROR_ENDPOINT) || ''; } catch (e) { return ''; }
}

/** Build the payload that would be sent, or null when it should be dropped. Exported for tests. */
export function buildRemotePayload(msg, stack, context) {
  context = context || {};
  var key = (context.system || '') + '|' + (context.operation || '') + '|' + msg;
  if (remoteSeen[key] || remoteSent >= MAX_REMOTE) return null;
  remoteSeen[key] = true;
  remoteSent++;
  return {
    message: String(msg).slice(0, 300),
    stack: stack ? String(stack).slice(0, 1500) : undefined,
    system: context.system,
    operation: context.operation,
    version: (typeof __APP_VERSION__ !== 'undefined') ? __APP_VERSION__ : undefined,
    ts: Date.now()
  };
}

/** Reset the per-page-load limits (tests). */
export function resetRemoteLimits() { remoteSent = 0; remoteSeen = {}; }

var _diagnosticsSink = null;

/**
 * Where opt-in reports go (a function taking {kind, message, system, operation, version}). The caller decides
 * whether the player switched reports on; nothing is sent while no sink is set.
 */
export function setDiagnosticsSink(fn) { _diagnosticsSink = typeof fn === 'function' ? fn : null; }

/** A report that is not an error: the game ran slowly on this device. */
export function reportPerformance(info) {
  if (!_diagnosticsSink) return;
  var key = 'perf|' + (info && info.tier);
  if (remoteSeen[key]) return;
  remoteSeen[key] = true;
  try { _diagnosticsSink({ kind: 'perf', message: 'slow frames', system: 'render', operation: String((info && info.operation) || 'frame-rate'), tier: info && info.tier, version: (typeof __APP_VERSION__ !== 'undefined') ? __APP_VERSION__ : undefined }); } catch (e) { /* reporting must never throw */ }
}

function sendRemote(msg, stack, context) {
  var payload = buildRemotePayload(msg, stack, context);
  if (_diagnosticsSink && payload) {
    try { _diagnosticsSink({ kind: 'error', message: payload.message, system: payload.system, operation: payload.operation, version: payload.version }); } catch (e) { /* reporting must never throw */ }
  }
  var url = remoteEndpoint();
  if (!url) return;
  if (!payload) return;
  try {
    var body = JSON.stringify(payload);
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) navigator.sendBeacon(url, body);
    else if (typeof fetch === 'function') fetch(url, { method: 'POST', body: body, keepalive: true, mode: 'no-cors' });
  } catch (e) { /* reporting must never throw */ }
}

/** Route uncaught errors and unhandled rejections through reportError. */
export function installGlobalErrorHandlers(win) {
  win = win || window;
  win.addEventListener('error', function (e) {
    reportError(e.error || e.message || 'Uncaught error', { system: 'window', operation: 'error' });
  });
  win.addEventListener('unhandledrejection', function (e) {
    reportError(e.reason || 'Unhandled rejection', { system: 'window', operation: 'unhandledrejection' });
  });
}

/**
 * Display a user-facing error message as a transient overlay.
 *
 * @param {string} message        - Plain-text message (safe to display)
 * @param {object} [options]
 * @param {string} [options.title]
 * @param {boolean} [options.recoverable]
 * @param {string} [options.actionLabel]
 * @param {function} [options.onAction]
 * @param {number} [options.durationMs]  - Auto-dismiss after this many ms (default 5000)
 * @param {boolean} [options.info]       - Neutral styling for notices that are not failures
 */
export function showUserError(message, options = {}) {
  var durationMs = options.durationMs != null ? options.durationMs : 5000;

  var accent = options.info ? 'var(--accent, #00e5ff)' : 'var(--accent-red, #ff3355)';
  var overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;top:12%;left:50%;transform:translateX(-50%);' +
    'z-index:50;max-width:340px;width:90%;padding:18px 22px;' +
    'background:rgba(10,5,30,0.95);border:2px solid ' + accent + ';' +
    'border-radius:16px;color:#fff;font-size:13px;font-weight:700;' +
    'text-align:center;pointer-events:auto;backdrop-filter:blur(8px);' +
    'box-shadow:0 4px 24px rgba(255,51,85,0.25);transition:opacity 0.4s ease;';

  var html = '';
  if (options.title) {
    html += '<div style="font-size:16px;margin-bottom:6px;color:' + accent + '">' +
      escapeText(options.title) + '</div>';
  }
  html += '<div>' + escapeText(message) + '</div>';

  overlay.innerHTML = html;

  if (options.actionLabel && typeof options.onAction === 'function') {
    var btn = document.createElement('button');
    btn.textContent = options.actionLabel;
    btn.style.cssText =
      'margin-top:10px;padding:8px 16px;border:none;border-radius:10px;' +
      'background:' + accent + ';color:#fff;font-size:12px;' +
      'font-weight:800;cursor:pointer;';
    btn.addEventListener('click', function () {
      options.onAction();
      dismiss();
    });
    overlay.appendChild(btn);
  }

  document.body.appendChild(overlay);

  function dismiss() {
    overlay.style.opacity = '0';
    setTimeout(function () {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, 400);
  }

  if (durationMs > 0) {
    setTimeout(dismiss, durationMs);
  }
}

/**
 * Wrap a Supabase query promise so that resolved `{ error }` values
 * throw instead of being silently ignored.
 *
 * Supabase client methods resolve (never reject) with `{ data, error }`.
 * Relying only on `.catch()` is prohibited per Section 17.3 [2].
 *
 * @param {Promise<{data: any, error: any}>} queryPromise
 * @returns {Promise<any>} The `data` value on success.
 * @throws {Error} If the resolved object carries a truthy `error`.
 */
export async function requireSupabaseSuccess(queryPromise) {
  var result;
  try {
    result = await queryPromise;
  } catch (networkError) {
    // True network / transport failure (rare with Supabase client)
    throw new Error(
      'Supabase request failed: ' +
        (networkError && networkError.message ? networkError.message : String(networkError))
    );
  }

  if (result && result.error) {
    var msg = result.error.message || result.error.code || JSON.stringify(result.error);
    throw new Error('Supabase error: ' + msg);
  }

  return result ? result.data : undefined;
}

/* ---- internal helpers ---- */

function escapeText(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
