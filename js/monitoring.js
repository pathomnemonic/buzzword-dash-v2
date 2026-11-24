/**
 * monitoring.js: the two optional services that watch the live site for problems, and nothing else.
 *
 *   Sentry   crash reports.            Only for a player who switched on Settings > "Help fix problems".
 *   PostHog  page views and errors.    Only for a player who agreed to anonymous usage statistics.
 *
 * Neither loads, and nothing is sent, for anyone else: the SDKs are fetched only after the matching consent, and each
 * checks the consent again before it sends. Both are tagged app=dx-dash (PostHog's project is shared with other apps).
 *
 * main.js starts this only in a production build that is not the capture build, so it is absent from the dev server, the
 * tests and the screenshot mode (and not even bundled in a build made with VITE_FEATURE_CAPTURE=1).
 */

import { addReportListener } from './errors.js';

export var APP_TAG = 'dx-dash';
// These two are public client keys (they ship in the page by design); neither is a secret.
export var SENTRY_DSN = 'https://59a5f60d35ccde8fe9ad9c87e634c19f@o4512486931169280.ingest.us.sentry.io/4512486939623424';
export var POSTHOG_KEY = 'phc_kWmx5oVY3FreyoD2myh2jTYZKyuDXYsLHBGkvCq3yyYY';
export var POSTHOG_HOST = 'https://us.i.posthog.com';

/** An address without the part after # (a challenge link carries a name and scores there) or ?, so no personal text leaves the page. */
export function scrubUrl(url) {
  try {
    var u = new URL(String(url), 'https://example.invalid');
    return (url && /^https?:/i.test(url) ? u.origin : '') + u.pathname;
  } catch (e) { return ''; }
}

/** The Sentry event with everything personal taken out; null drops it (the player turned reports off). */
export function cleanSentryEvent(event, allowed) {
  if (!allowed()) return null;
  event.user = undefined;
  if (event.request) event.request = { url: scrubUrl(event.request.url) };
  event.breadcrumbs = undefined;
  event.tags = Object.assign({}, event.tags, { app: APP_TAG });
  return event;
}

/** The PostHog event with the app tag and a scrubbed address; null drops it. */
export function cleanPosthogEvent(cp, allowed) {
  if (!allowed() || !cp) return null;
  cp.properties = Object.assign({}, cp.properties, { app: APP_TAG });
  if (cp.properties.$current_url) cp.properties.$current_url = scrubUrl(cp.properties.$current_url) + (cp.properties.screen ? '#' + cp.properties.screen : '');
  return cp;
}

var sentry = null;
var posthog = null;
var stopListening = null;

function release() { return (typeof __APP_VERSION__ !== 'undefined') ? __APP_VERSION__ : undefined; }

function startSentry(storage) {
  if (sentry) return;
  sentry = import('@sentry/browser').then(function (mod) {
    mod.init({
      dsn: SENTRY_DSN,
      environment: 'production',
      release: release(),
      sendDefaultPii: false,
      defaultIntegrations: false,
      integrations: [mod.linkedErrorsIntegration(), mod.dedupeIntegration()], // (errors reach us through reportError, which already catches the page's own)
      tracesSampleRate: 0,
      maxBreadcrumbs: 0,
      beforeSend: function (event) { return cleanSentryEvent(event, function () { return !!storage.get('sendDiagnostics'); }); }
    });
    mod.setTag('app', APP_TAG);
    return mod;
  }).catch(function () { sentry = null; return null; });
}

function startPosthog(analytics, currentScreen) {
  if (posthog) return;
  posthog = import('posthog-js/dist/module.no-external').then(function (mod) {
    var ph = mod.default || mod.posthog;
    ph.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      autocapture: false,
      capture_pageview: false,       // page views are sent by hand, one per screen
      capture_pageleave: false,
      capture_exceptions: false,     // errors are sent by hand from reportError
      disable_session_recording: true,
      disable_surveys: true,
      advanced_disable_flags: true,
      disable_external_dependency_loading: true,
      person_profiles: 'never',
      persistence: 'localStorage',
      ip: false,
      before_send: function (cp) { return cleanPosthogEvent(cp, function () { return analytics.consentState() === 'granted'; }); }
    });
    ph.register({ app: APP_TAG });
    ph.capture('$pageview', { $current_url: window.location.pathname, screen: currentScreen() });
    return ph;
  }).catch(function () { posthog = null; return null; });
}

/**
 * @param {{storage: any, analytics: any}} deps
 */
export function startMonitoring(deps) {
  var storage = deps.storage, analytics = deps.analytics;
  var screen = function () { return document.body.getAttribute('data-screen') || 'screenHome'; };

  function syncSentry() { if (storage.get('sendDiagnostics')) startSentry(storage); }
  function syncPosthog() {
    if (analytics.consentState() === 'granted') startPosthog(analytics, screen);
    else if (posthog) posthog.then(function (ph) { if (ph) ph.opt_out_capturing(); });
  }
  syncSentry();
  syncPosthog();
  document.addEventListener('dx:diagnostics-changed', syncSentry);
  analytics.on(function (type) { if (type === 'consent') { syncPosthog(); if (posthog) posthog.then(function (ph) { if (ph && analytics.consentState() === 'granted') ph.opt_in_capturing(); }); } });

  // one page view per screen the player opens
  var last = screen();
  new MutationObserver(function () {
    var now = screen();
    if (now === last) return;
    last = now;
    if (posthog && analytics.consentState() === 'granted') posthog.then(function (ph) { if (ph) ph.capture('$pageview', { $current_url: window.location.pathname, screen: now }); });
  }).observe(document.body, { attributes: true, attributeFilter: ['data-screen'] });

  // every error the app reports goes to whichever services are on
  stopListening = addReportListener(function (error, context) {
    var tags = { system: context.system || '', operation: context.operation || '' };
    if (sentry && storage.get('sendDiagnostics')) sentry.then(function (mod) { if (mod) mod.captureException(error, { tags: tags }); });
    if (posthog && analytics.consentState() === 'granted') posthog.then(function (ph) { if (ph) ph.captureException(error, tags); });
  });
}

export function stopMonitoring() { if (stopListening) { stopListening(); stopListening = null; } }
