/**
 * native.js — the parts of the app that only exist inside the iOS/Android wrapper.
 *
 * On the web everything here is a harmless no-op. Native plugins are loaded on
 * demand so the website does not download them.
 */

import { Capacitor } from '@capacitor/core';

/** True inside the installed iOS/Android app (false in a browser). */
export function isNative() {
  try {
    return !!(Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());
  } catch (e) {
    return false;
  }
}

/** The custom URL scheme email links use to reopen the app (see AndroidManifest.xml). */
export var APP_SCHEME = 'com.pathomnemonic.buzzworddash';

/** Where Supabase email links (confirm, reset) should send the player back to. */
export function getAuthRedirectUrl() {
  if (isNative()) return APP_SCHEME + '://auth';
  return window.location.origin + window.location.pathname;
}

/**
 * Pull session tokens out of a deep link such as
 * com.pathomnemonic.buzzworddash://auth#access_token=...&refresh_token=...&type=recovery
 * @param {string} url
 * @returns {{accessToken: string, refreshToken: string, type: string, code: string}|null}
 */
export function parseAuthLink(url) {
  if (typeof url !== 'string' || url.indexOf(APP_SCHEME + '://') !== 0) return null;
  var rest = url.slice((APP_SCHEME + '://').length);
  var params = {};
  var mark = rest.search(/[?#]/);
  if (mark >= 0) {
    rest.slice(mark + 1).split(/[&#?]/).forEach(function (pair) {
      if (!pair) return;
      var eq = pair.indexOf('=');
      var key = eq < 0 ? pair : pair.slice(0, eq);
      var value = eq < 0 ? '' : pair.slice(eq + 1);
      try { params[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' ')); } catch (e) { params[key] = value; }
    });
  }
  if (!params.access_token && !params.code) return null;
  return {
    accessToken: params.access_token || '',
    refreshToken: params.refresh_token || '',
    type: params.type || '',
    code: params.code || ''
  };
}

/**
 * Turn a vibration pattern (ms) into a native haptic tap.
 * @param {number|number[]} pattern
 */
export function nativeHaptic(pattern) {
  if (!isNative()) return;
  var total = Array.isArray(pattern) ? pattern.reduce(function (a, b) { return a + b; }, 0) : pattern;
  import('@capacitor/haptics').then(function (mod) {
    var style = total >= 150 ? mod.ImpactStyle.Heavy : (total >= 40 ? mod.ImpactStyle.Medium : mod.ImpactStyle.Light);
    return mod.Haptics.impact({ style: style });
  }).catch(function () { /* haptics are best-effort */ });
}

/**
 * Wire the app to the phone: back button, leaving the app, status bar,
 * splash screen and email deep links. Does nothing in a browser.
 * @param {object} handlers
 * @param {function(): boolean} handlers.onBack return true if the press was handled
 * @param {function()} handlers.onBackground called when the app goes to the background
 * @param {function(string)} handlers.onDeepLink called with a URL that opened the app
 */
export function initNative(handlers) {
  if (!isNative()) return Promise.resolve(false);
  document.body.classList.add('native-app');

  return Promise.all([
    import('@capacitor/app'),
    import('@capacitor/status-bar'),
    import('@capacitor/splash-screen')
  ]).then(function (mods) {
    var App = mods[0].App;
    var StatusBar = mods[1].StatusBar;
    var Style = mods[1].Style;
    var SplashScreen = mods[2].SplashScreen;

    App.addListener('backButton', function () {
      var handled = false;
      try { handled = !!handlers.onBack(); } catch (e) { handled = false; }
      if (!handled) App.exitApp();
    });
    App.addListener('appStateChange', function (state) {
      if (!state.isActive) handlers.onBackground();
    });
    App.addListener('appUrlOpen', function (event) {
      if (event && event.url) handlers.onDeepLink(event.url);
    });
    // The app may have been launched by an email link
    App.getLaunchUrl().then(function (launch) {
      if (launch && launch.url) handlers.onDeepLink(launch.url);
    }).catch(function () {});

    StatusBar.setStyle({ style: Style.Dark }).catch(function () {});
    StatusBar.setBackgroundColor({ color: '#0b1020' }).catch(function () {});
    return SplashScreen.hide().catch(function () {});
  }).then(function () { return true; }).catch(function () { return false; });
}
