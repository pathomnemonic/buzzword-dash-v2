/**
 * context.js — what kind of device and install an event came from, gathered once per session.
 *
 * Everything is bucketed on purpose: a screen size rounded to the nearest 40 pixels, memory in a few steps, the browser
 * family and a major version rather than the full user-agent string. Together they say "a mid-range Android phone on
 * Chrome 120, in portrait" without being able to single anyone out. No advertising ID, no IP address, no
 * precise location.
 */

function pick(v, fallback) { return v === undefined || v === null || v === '' ? fallback : v; }

/** Round to the nearest step: 393 with step 40 is 400. */
export function bucket(n, step) {
  n = Number(n);
  if (!isFinite(n) || n <= 0) return 0;
  return Math.round(n / step) * step;
}

/** Browser family and major version from a user-agent string. */
export function parseBrowser(ua) {
  ua = String(ua || '');
  var m;
  if ((m = /\bEdg(?:e|A|iOS)?\/(\d+)/.exec(ua))) return { name: 'edge', major: Number(m[1]) };
  if ((m = /\bOPR\/(\d+)/.exec(ua))) return { name: 'opera', major: Number(m[1]) };
  if ((m = /\bSamsungBrowser\/(\d+)/.exec(ua))) return { name: 'samsung', major: Number(m[1]) };
  if ((m = /\bFirefox\/(\d+)|\bFxiOS\/(\d+)/.exec(ua))) return { name: 'firefox', major: Number(m[1] || m[2]) };
  if ((m = /\bCriOS\/(\d+)/.exec(ua))) return { name: 'chrome', major: Number(m[1]) };
  if ((m = /\bChrome\/(\d+)/.exec(ua))) return { name: /; wv\)|Version\/\d/.test(ua) && /Android/.test(ua) ? 'webview' : 'chrome', major: Number(m[1]) };
  if ((m = /\bVersion\/(\d+).*Safari/.exec(ua))) return { name: 'safari', major: Number(m[1]) };
  return { name: 'other', major: 0 };
}

/** Operating system family and major version. */
export function parseOS(ua) {
  ua = String(ua || '');
  var m;
  if ((m = /Android (\d+)/.exec(ua))) return { name: 'android', major: Number(m[1]) };
  if ((m = /(?:iPhone|iPad|iPod).*? OS (\d+)[_\d]*/.exec(ua))) return { name: 'ios', major: Number(m[1]) };
  if (/Macintosh/.test(ua) && /Mobile\//.test(ua)) return { name: 'ios', major: 0 };
  if ((m = /Windows NT (\d+)/.exec(ua))) return { name: 'windows', major: Number(m[1]) };
  if (/Mac OS X/.test(ua)) return { name: 'macos', major: 0 };
  if (/CrOS/.test(ua)) return { name: 'chromeos', major: 0 };
  if (/Linux/.test(ua)) return { name: 'linux', major: 0 };
  return { name: 'other', major: 0 };
}

/** Phone, tablet or desktop from the screen and the pointer. */
export function formFactor(width, height, touch) {
  var short = Math.min(width || 0, height || 0);
  var long = Math.max(width || 0, height || 0);
  if (!touch) return 'desktop';
  if (short >= 600 || long >= 1000) return 'tablet';
  return 'phone';
}

function connectionType(nav) {
  var c = nav && (nav.connection || nav.mozConnection || nav.webkitConnection);
  if (!c) return 'unknown';
  if (c.type === 'wifi' || c.type === 'ethernet') return 'wifi';
  var e = c.effectiveType;
  return e === 'slow-2g' || e === '2g' || e === '3g' || e === '4g' ? e : 'unknown';
}

/**
 * Gather the session context.
 * @param {{win?: object, nav?: object, platform?: string, version?: string, build?: string, tier?: string, standalone?: boolean, webgl2?: boolean}} [env]
 */
export function collectContext(env) {
  env = env || {};
  var win = env.win || (typeof window !== 'undefined' ? window : {});
  var nav = env.nav || (typeof navigator !== 'undefined' ? navigator : {});
  var ua = nav.userAgent || '';
  var screen = win.screen || {};
  var width = win.innerWidth || screen.width || 0;
  var height = win.innerHeight || screen.height || 0;
  var touch = (nav.maxTouchPoints || 0) > 0;
  var browser = parseBrowser(ua);
  var os = parseOS(ua);
  var standalone = typeof env.standalone === 'boolean' ? env.standalone
    : !!((win.matchMedia && win.matchMedia('(display-mode: standalone)').matches) || nav.standalone);
  var mem = Number(nav.deviceMemory) || 0;
  var cores = Number(nav.hardwareConcurrency) || 0;
  var tzOffset = 0;
  try { tzOffset = -new Date().getTimezoneOffset() / 60; } catch (e) { /* no clock */ }
  var language = String(pick(nav.language, 'und')).slice(0, 12);

  return {
    platform: env.platform || 'web',
    version: String(pick(env.version, '')).slice(0, 20),
    build: String(pick(env.build, '')).slice(0, 20),
    os: os.name,
    os_major: os.major,
    browser: browser.name,
    browser_major: browser.major,
    form: formFactor(width, height, touch),
    screen_w: bucket(Math.max(width, screen.width || 0) || width, 40),
    screen_h: bucket(Math.max(height, screen.height || 0) || height, 40),
    dpr: Math.round((win.devicePixelRatio || 1) * 2) / 2,
    portrait: height > width,
    touch: touch,
    standalone: standalone,
    language: language,
    tz_offset: tzOffset,
    memory_gb: mem ? Math.min(8, mem) : 0,
    cores: cores ? Math.min(16, cores) : 0,
    connection: connectionType(nav),
    save_data: !!(nav.connection && nav.connection.saveData),
    online: nav.onLine !== false,
    tier: env.tier || '',
    dark: !!(win.matchMedia && win.matchMedia('(prefers-color-scheme: dark)').matches),
    reduced_motion: !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches),
    webgl2: !!env.webgl2
  };
}

/** The context as short, flat strings (for grouping). */
export function contextLabels(ctx) {
  return {
    device: ctx.form + '/' + ctx.os + '/' + ctx.browser,
    screen: ctx.screen_w + 'x' + ctx.screen_h
  };
}
