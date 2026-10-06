/**
 * tourdata.js — the steps of the spotlight tour that ends the tutorial (see tour.js).
 *
 * The tour walks through the real interface: Home, then the Stats, Locker, Quests and Profile tabs. Every
 * step names the element it highlights, so a change to the page that removes one just turns that step into a
 * plain card with a Next button.
 */

import { storage } from './storage.js';
import { proLive } from './pro.js';

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

/** The one trail the tour teaches with. It is always this one, so nobody spends coins on a different item each time. */
export var TOUR_TRAIL_ID = 'trail_ekg';

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
      text: '🪙 Coins come from runs, quests and the daily reward. ⭐ is your best score. You start with a balance to spend in the Locker in a minute.' },
    { id: 'filters', title: 'Filters', target: '#filtersBtn', press: 'count',
      text: 'Choose subjects, exams and question types. Everything is switched on to begin with, so you will see every question.' },
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
      text: 'Host Game makes a five-letter room code; your friend types it under Join Game. Then you pick a mode: highest score, Sudden Death (first miss loses) or a race to a number of right answers. Signed-in players can also find a ranked match and earn trophies.' },

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
      text: '⚡ Playing is complete without it. Pro is for when you want more: 10× more cards (3,010 instead of 300), every explanation, detailed stats, Cards I miss, Browse cards, My cards, Anki import and offline play, plus one free Locker item of your choice every month. Every new account gets a free 7-day trial, so you can try it all. Tap this button any time to see what is inside.' },

    { id: 'stats-tab', title: 'Stats', target: tab('screenStats'), press: 'pass',
      text: 'Now the tabs along the bottom. Open Stats.' },
    { id: 'stats', title: 'How you are doing', target: '#screenStats .perf-hero', press: 'next',
      text: 'Your accuracy by subject, your weakest topics and your recent runs. Use it to decide what to drill next.' + pro('(Subjects, Weakest concepts and your exam date are part of Pro: look for the gold 🔒.)') },

    { id: 'locker-tab', title: 'Locker', target: tab('screenShop'), press: 'pass',
      text: 'Next, the Locker, where your coins go.' },
    { id: 'locker', title: 'Your hero', target: '#characterPreviewContainer', press: 'next', interactive: true,
      text: 'Everything you pick shows up in this display: your hero, its colors, trails and monsters. Drag it to spin your hero around. Under it are the tabs, and what you are wearing, with Change colors for heroes that can be recolored.' + pro('Pro members also pick any one item free every month: look for the green 🎁 FREE button.') },
    { id: 'extras-tab', title: 'Trails', target: lockerTabButton('Trails'), press: 'pass',
      text: 'The Locker starts folded so it fits one screen: tap a tab to open its list, and tap it again to fold it away. Trails stream behind your runner. (Heroes are the characters, Maps are new worlds to run in, and Monsters chase you when you slip.) Open Trails.' },
    // The tour always uses the EKG Line. It never hands out coins: a new player starts with enough for it, and a
    // player who has done the tour before (or spent the coins) is taken through the same steps in a way that fits.
    { id: 'buy', title: 'Your first trail', target: affordableTrailButton, press: 'pass', hint: 'Tap to buy it',
      skipIf: function () { return !affordableTrailButton(); },
      text: 'You started with some coins, so here is a trail to unlock: the EKG Line. Tap its price to buy it. (Tapping a row, or the eye, previews any trail or monster up in the display first.)' },
    { id: 'preview', title: 'Try a trail', target: trailEyeButton, press: 'pass', hint: 'Tap the eye',
      skipIf: function () { return tourTrailOwned() || !!affordableTrailButton() || !trailEyeButton(); },
      after: function (ctx) { ctx.previewedTrail = true; },
      text: 'Trails cost coins, which you earn by running. Tap the eye to see the EKG Line behind your runner before you save up for it.' },
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
  ].filter(Boolean).map(function (s) {
    if (typeof s.target === 'string') s.target = q(s.target);
    return s;
  });
}
