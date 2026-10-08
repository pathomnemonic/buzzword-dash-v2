/**
 * tourdata.js — the steps of the spotlight tour that ends the tutorial (see tour.js).
 *
 * The tour walks through the real interface: Home, then the Stats, Locker, Quests and Profile tabs. Every
 * step names the element it highlights, so a change to the page that removes one just turns that step into a
 * plain card with a Next button.
 */

import { storage } from './storage.js';
import { proLive } from './pro.js';
import { LOCKER_ITEMS } from './game/shopdata.js';
import { FEATURES } from './features.js';

function q(selector) { return function () { return document.querySelector(selector); }; }

function tab(screenId) { return '#bottomNav [data-screen="' + screenId + '"]'; }

/** The Locker's trail rows, as { row, buy, equip, owned, price }. */
function trailRows() {
  var rows = document.querySelectorAll('#shopItems .shop-item');
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (!row.querySelector('[data-prevslot="trail"]')) continue;
    var buy = row.querySelector('.btn-gold');
    var equip = null;
    var buttons = row.querySelectorAll('button');
    for (var b = 0; b < buttons.length; b++) if (/^\s*Equip\s*$/.test(buttons[b].textContent)) equip = buttons[b];
    var price = buy ? Number(String(buy.textContent).replace(/[^0-9]/g, '')) : 0;
    out.push({ row: row, buy: buy, equip: equip, price: price });
  }
  return out;
}

/** The one trail the tour teaches with: the cheapest trail in the Locker, always the same one, so nobody spends coins on a different item each time. */
var CHEAPEST_TRAIL = LOCKER_ITEMS.filter(function (i) { return i.type === 'trail' && i.price > 0; }).sort(function (a, b) { return a.price - b.price; })[0];
export var TOUR_TRAIL_ID = CHEAPEST_TRAIL.id;
export var TOUR_TRAIL_NAME = CHEAPEST_TRAIL.name;

/** The tour trail's row in the Locker, as { row, buy, equip, eye } (any part may be null). */
function tourTrailRow() {
  var rows = trailRows();
  for (var i = 0; i < rows.length; i++) {
    var eye = rows[i].row.querySelector('[data-preview="' + TOUR_TRAIL_ID + '"]');
    if (eye) return { row: rows[i].row, buy: rows[i].buy, equip: rows[i].equip, eye: eye, price: rows[i].price };
  }
  return null;
}

function tourTrailOwned() { return storage.ownsItem(TOUR_TRAIL_ID); }

/** The buy button of the tour trail, but only while it is not yet owned and the player can pay for it. */
export function affordableTrailButton() {
  if (tourTrailOwned()) return null;
  var r = tourTrailRow();
  return r && r.buy && r.price > 0 && r.price <= (storage.get('coins') || 0) ? r.buy : null;
}

function equipTrailButton() {
  var r = tourTrailRow();
  return r && r.equip ? r.equip : null;
}

/** The tour trail's preview eye, for a player who cannot (or no longer needs to) buy it. */
function trailEyeButton() {
  var r = tourTrailRow();
  return r ? r.eye : null;
}

function trailEquipped() {
  var eq = storage.get('equipped') || {};
  return !!eq.trail && eq.trail !== 'trail_none';
}

function lockerTabButton(label) {
  return function () {
    var tabs = document.querySelectorAll('#shopItems [role="tab"]');
    for (var i = 0; i < tabs.length; i++) if (tabs[i].textContent.indexOf(label) >= 0) return tabs[i];
    return null;
  };
}


/** Close a pop-up sheet the way its own Close button does. */
function closeSheet(selector) {
  return function () {
    var btn = document.querySelector(selector + ' .sheet-close');
    if (btn) btn.click();
    else { var el = document.querySelector(selector); if (el) el.classList.remove('active'); }
  };
}

/** The Filters pop-up's folded sections, closed again (so every look starts from the same place). */
function collapseFilterSections() {
  var sections = document.querySelectorAll('#filtersSheet .collapsible-section');
  for (var i = 0; i < sections.length; i++) {
    var body = sections[i].querySelector('.collapsible-body');
    var toggle = sections[i].querySelector('.collapsible-toggle');
    if (body && toggle && !body.hidden && getComputedStyle(body).display !== 'none') toggle.click();
  }
}

/** The "More filters" fold-out in the Filters pop-up. */
function advancedToggle() { return document.querySelector('#advancedFilterContainer .collapsible-toggle'); }

function closeVersus() {
  var btn = document.getElementById('mpCloseBtn');
  if (btn) btn.click();
}


/**
 * @param {object} ctx
 * @param {object} ctx.ui the interface (for opening Home)
 * @returns {object[]} steps for startTour()
 */
export function buildTourSteps(ctx) {
  // Pro is only mentioned while it can be bought (or is owned): a quiet word on the way past, never a sales stop
  var live = proLive();
  var pro = function (text) { return live ? ' ' + text : ''; };
  return [
    { id: 'home', title: 'Welcome home', text: 'This is the Home screen. Let\'s look around. Tap each highlighted spot to go on.',
      target: null, press: 'next',
      before: function () { if (ctx && ctx.ui) ctx.ui.show('screenHome'); } },
    { id: 'coins', title: 'Coins and best score', target: '#homeCoinsDisplay', press: 'count',
      text: '🪙 Coins come from runs, quests and the daily reward. ⭐ is your best score, which climbs as you run and jumps with every right answer. You start with a balance to spend in the Locker in a minute.' },
    { id: 'filters', title: 'Filters', target: '#filtersBtn', press: 'pass', hint: 'Tap Filters to look inside',
      text: 'Choose which questions you get. Everything is switched on to begin with, so you see every question. Open it and we will look at each filter.' },
    { id: 'filters-subjects', title: 'Subjects', target: '#subjectToggle', press: 'pass', hint: 'Tap Subjects to open it',
      before: collapseFilterSections,
      text: 'Pick the subjects you want to study: cardiology this week, renal the next. Open it.' },
    { id: 'filters-subjects-list', title: 'Switch subjects on and off', target: '#subjectBody', press: 'next',
      text: 'Tap a subject to switch it on or off, or use Select All and Deselect All. Subjects you have mastered get a star.' + pro('Free covers a sample of every subject (300 cards); Pro opens the whole bank of 3,010.') },
    { id: 'filters-exam', title: 'Exam filter', target: '#examFilterToggle', press: 'pass', hint: 'Tap Exam Filter to open it',
      skipIf: function () { return !document.getElementById('examFilterToggle'); },
      text: 'Studying for a particular exam? Narrow the questions to the ones that exam covers. Open it.' },
    { id: 'filters-exam-body', title: 'Pick your exam', target: '#examFilterContainer', press: 'next',
      skipIf: function () { return !document.getElementById('examFilterToggle'); },
      text: 'Choose your exam here and only its questions come up. Leave it empty to get everything.' },
    { id: 'filters-advanced', title: 'More filters', target: advancedToggle, press: 'pass', hint: 'Tap to open it',
      skipIf: function () { return !advancedToggle(); },
      text: 'A few more ways to shape your questions. Open it.' },
    { id: 'filters-advanced-body', title: 'Type, year and high-yield', target: '#advancedFilterContainer', press: 'next',
      skipIf: function () { return !advancedToggle(); },
      after: function () { collapseFilterSections(); closeSheet('#filtersSheet')(); },
      text: 'Question type picks what is asked (diagnosis, treatment, mechanism, lab and more). Year matches your stage of training. High-yield only keeps to the questions that come up most. Leave them empty to see it all.' },
    { id: 'speed', title: 'Speed', target: '#speedBtn', press: 'pass', hint: 'Tap Speed to open the dial',
      text: 'This sets how fast the track runs. Open it and have a go with the dial.' },
    { id: 'speed-dial', title: 'Set your pace', target: '.speed-dial', press: 'next', interactive: true,
      after: closeSheet('#speedSheet'),
      text: 'Slide it! Right is faster and scores more points for every correct answer. Left is slower and calmer, with more time to think. 1× is the normal pace; if you are new, or tired, slide it left. (Runs slower than 1× are practice: they are not ranked on leaderboards.) You can change it any time before a run.' },
    // Each way to play gets its own short section: press its button, see what is inside, close it
    { id: 'versus-btn', title: 'Versus', target: '#multiplayerBtn', press: 'pass', hint: 'Tap Versus to look inside',
      text: 'Race a friend live, with the same questions at the same moment. Open it.' },
    { id: 'versus', title: 'Racing a friend', target: '#mpContent', press: 'next',
      after: closeVersus,
      text: 'Host Game makes a five-letter room code; your friend types it under Join Game. Then you pick a mode: highest score, Sudden Death (first miss loses) or a race to a number of right answers.' },

    { id: 'flashcards-btn', title: 'Flashcards', target: '#homeFlashcardsBtn', press: 'pass', hint: 'Tap Flashcards to look inside',
      text: 'Calm study with no runner and no lives. Open it.' },
    { id: 'flashcards', title: 'Choose your cards', target: '#flashcardsList', press: 'next',
      after: closeSheet('#flashcardsSheet'),
      text: 'Study your subjects, review the cards that are due (timed by FSRS, the same spaced-repetition algorithm Anki uses), drill the ones you miss, or meet new ones. Flip them yourself or listen hands-free. Browse cards and My cards (your own, or imported from Anki) are here too.' + pro('(Cards I miss, Browse cards, My cards and importing are Pro.)') },

    { id: 'challenge-btn', title: 'Challenge', target: '#homeChallengeBtn', press: 'count',
      text: 'Every other way to play lives here: Study (relaxed, no lives lost), Weakness (drills what you miss), the Daily 15, the Weekly Gauntlet, friend challenges and the Exam Sim.' + pro('Study, Weakness and the Exam Sim are Pro, and so are two of the three Versus modes. A small gold PRO tag marks anything Pro opens up.') + ' Have a look when you are ready.' },

    { id: 'friends', title: 'Friends', target: '#leaderboardBtn', press: 'count',
      text: 'Add friends, see their highlights in the feed and make private study groups with a shared weekly goal. It needs a free account (the profile button beside it).' },
    { id: 'settings', title: 'Settings', target: '#settingsBtn', press: 'count',
      text: 'Sound, colors, camera, controls and game rules live here. You can replay this tour any time from Settings, then About, then How to play.' },
    !live ? null : { id: 'pro', title: 'Dx Dash Pro', target: '#homeProBanner', press: 'next',
      skipIf: function () { var b = document.getElementById('homeProBanner'); return !b || b.hidden; },
      text: '⚡ Playing is complete without it. Pro is for when you want more: 10× more cards (3,010 instead of 300), every explanation, detailed stats, Cards I miss, Browse cards, My cards, Anki import and offline play, plus one free Locker item of your choice. Every new account gets a free 7-day trial, so you can try it all. Tap this button any time to see what is inside.' },

    { id: 'stats-tab', title: 'Stats', target: tab('screenStats'), press: 'pass',
      text: 'Now the tabs along the bottom. Open Stats.' },
    { id: 'stats', title: 'How you are doing', target: '#screenStats .perf-hero', press: 'next',
      text: 'Your accuracy by subject, your weakest topics and your recent runs. Use it to decide what to drill next.' + pro('(Subjects, Weakest concepts and your exam date are part of Pro: look for the gold 🔒.)') },

    { id: 'locker-tab', title: 'Locker', target: tab('screenShop'), press: 'pass',
      text: 'Next, the Locker, where your coins go.' },
    { id: 'locker', title: 'Your hero', target: '#characterPreviewContainer', press: 'next', interactive: true,
      text: 'Everything you pick shows up in this display: your hero, its colors, trails and monsters. Drag it to spin your hero around. Under it are the tabs, and what you are wearing, with Change colors for heroes that can be recolored.' + pro('Paying Pro members also pick any one item free: look for the green 🎁 FREE button.') },
    { id: 'extras-tab', title: 'Trails', target: lockerTabButton('Trails'), press: 'pass',
      text: 'The Locker starts folded so it fits one screen: tap a tab to open its list, and tap it again to fold it away. Trails stream behind your runner. (Heroes are the characters, Maps are new worlds to run in, and Monsters chase you when you slip.) Open Trails.' },
    // The tour always uses the cheapest trail. It never hands out coins: a new player starts with enough for it, and a
    // player who has done the tour before (or spent the coins) is taken through the same steps in a way that fits.
    { id: 'buy', title: 'Your first trail', target: affordableTrailButton, press: 'pass', hint: 'Tap to buy it',
      skipIf: function () { return !affordableTrailButton(); },
      text: 'You started with some coins, so here is a trail to unlock: the ' + TOUR_TRAIL_NAME + '. Tap its price to buy it. (Tapping a row, or the eye, previews any trail or monster up in the display first.)' },
    { id: 'preview', title: 'Try a trail', target: trailEyeButton, press: 'pass', hint: 'Tap the eye',
      skipIf: function () { return tourTrailOwned() || !!affordableTrailButton() || !trailEyeButton(); },
      after: function (ctx) { ctx.previewedTrail = true; },
      text: 'Trails cost coins, which you earn by running. Tap the eye to see the ' + TOUR_TRAIL_NAME + ' behind your runner before you save up for it.' },
    { id: 'equip', title: 'Wear it', target: equipTrailButton, press: 'pass', hint: 'Tap Equip',
      skipIf: function () { return !equipTrailButton(); },
      text: 'It is yours. Equip it to run with it.' },
    { id: 'look', title: 'Looking good', target: '#characterPreviewContainer', press: 'next',
      skipIf: function (ctx) { return !trailEquipped() && !(ctx && ctx.previewedTrail); },
      text: 'There it is, streaming behind your runner. Monsters and characters work the same way: tap them to see them here.' },

    { id: 'quests-tab', title: 'Quests', target: tab('screenQuests'), press: 'pass',
      text: 'Now Quests.' },
    { id: 'quests', title: 'Daily quests', target: '#screenQuests h2', press: 'next',
      text: 'Six small goals, new every day. Finish them as you play, then claim the coins here.' },

    { id: 'profile-tab', title: 'Profile', target: tab('screenProfile'), press: 'pass',
      text: 'And your Profile.' },
    { id: 'profile', title: 'Your profile', target: '#profileContent', press: 'next',
      text: 'Your name and picture, and your numbers. Make your profile visible so friends can find you. The rows underneath open when you tap them: Account (to save your progress with a free account), your study streak calendar and your badges.' },

    { id: 'back-home', title: 'Back to Home', target: tab('screenHome'), press: 'pass',
      text: 'That is everything. Tap Home to finish.' }
  ].filter(Boolean).filter(function (s) {
    // (Versus and Friends need the backend: a build without one has neither button, so the tour skips them)
    return FEATURES.backend || (s.id !== 'versus-btn' && s.id !== 'versus' && s.id !== 'friends');
  }).map(function (s) {
    if (typeof s.target === 'string') s.target = q(s.target);
    return s;
  });
}
