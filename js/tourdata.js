/**
 * tourdata.js — the steps of the spotlight tour that ends the tutorial (see tour.js).
 *
 * The tour walks through the real interface: Home, then the Stats, Locker, Quests and Profile tabs. Every
 * step names the element it highlights, so a change to the page that removes one just turns that step into a
 * plain card with a Next button.
 */

import { storage } from './storage.js';

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

/** The cheapest trail the player can afford to buy right now, as its buy button (or null). */
export function affordableTrailButton() {
  var coins = storage.get('coins') || 0;
  var best = null;
  trailRows().forEach(function (r) {
    if (r.buy && r.price > 0 && r.price <= coins && (!best || r.price < best.price)) best = r;
  });
  return best ? best.buy : null;
}

function equipTrailButton() {
  var rows = trailRows();
  for (var i = 0; i < rows.length; i++) if (rows[i].equip) return rows[i].equip;
  return null;
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

/**
 * @param {object} ctx
 * @param {object} ctx.ui the interface (for opening Home)
 * @returns {object[]} steps for startTour()
 */
export function buildTourSteps(ctx) {
  return [
    { id: 'home', title: 'Welcome home', text: 'This is the Home screen. Let\'s look around. Tap each highlighted spot to go on.',
      target: null, press: 'next',
      before: function () { if (ctx && ctx.ui) ctx.ui.show('screenHome'); } },
    { id: 'coins', title: 'Coins and best score', target: '#homeCoinsDisplay', press: 'count',
      text: '🪙 Coins come from runs, quests and the daily reward. ⭐ is your best score. You have a starting balance to spend in the Locker in a minute.' },
    { id: 'play', title: 'PLAY', target: '.btn-play', press: 'count',
      text: 'Starts an endless run: read the clue, run into the right gate, jump and slide past obstacles, dash for bonus points. You have three lives. (It will not start now.)' },
    { id: 'filters', title: 'Filters', target: '#filtersBtn', press: 'count',
      text: 'Choose subjects, exams and question types. Everything is switched on to begin with, so you will see every question.' },
    { id: 'speed', title: 'Speed', target: '#speedBtn', press: 'count',
      text: 'Faster runs score more points for every correct answer. Start at 1× and turn it up as you get confident.' },
    { id: 'ways', title: 'More ways to play', target: '.mode-row', press: 'count',
      text: '🎮 Versus races a friend live. 🃏 Flashcards is calm study with no obstacles. 🏁 Challenge has Study, Weakness drills, the Daily 15, the Weekly Gauntlet, challenges from friends and the timed Exam Sim.' },
    { id: 'friends', title: 'Friends', target: '#leaderboardBtn', press: 'count',
      text: 'Add friends, see their highlights in the feed and make private study groups with a shared weekly goal. It needs a free account (the profile button beside it).' },
    { id: 'settings', title: 'Settings', target: '#settingsBtn', press: 'count',
      text: 'Sound, colors, camera, controls and game rules live here. You can replay this tour any time from Settings, then About, then How to play.' },

    { id: 'stats-tab', title: 'Stats', target: tab('screenStats'), press: 'pass',
      text: 'Now the tabs along the bottom. Open Stats.' },
    { id: 'stats', title: 'How you are doing', target: '#screenStats h2', press: 'next',
      text: 'Your accuracy by subject, your weakest topics and your recent runs. Use it to decide what to drill next.' },

    { id: 'locker-tab', title: 'Locker', target: tab('screenShop'), press: 'pass',
      text: 'Next, the Locker, where your coins go.' },
    { id: 'locker', title: 'Your runner', target: '#characterPreviewContainer', press: 'next',
      text: 'Everything you pick shows up in this display: your character, its colors, trails and monsters. Drag it to spin your runner around.' },
    { id: 'extras-tab', title: 'Trails and monsters', target: lockerTabButton('Trails'), press: 'pass',
      text: 'Trails stream behind your runner, and monsters are what chase you when you slip. Open this tab.' },
    { id: 'buy', title: 'Your first trail', target: affordableTrailButton, press: 'pass', hint: 'Tap to buy it',
      skipIf: function () { return !affordableTrailButton(); },
      text: 'You started with some coins, so here is one to unlock. Tap its price to buy it. (Tapping a row, or the eye, previews any trail or monster up in the display first.)' },
    { id: 'equip', title: 'Wear it', target: equipTrailButton, press: 'pass', hint: 'Tap Equip',
      skipIf: function () { return !equipTrailButton(); },
      text: 'It is yours. Equip it to run with it.' },
    { id: 'look', title: 'Looking good', target: '#characterPreviewContainer', press: 'next',
      skipIf: function () { return !trailEquipped(); },
      text: 'There it is, streaming behind your runner. Monsters and characters work the same way: tap them to see them here.' },

    { id: 'quests-tab', title: 'Quests', target: tab('screenQuests'), press: 'pass',
      text: 'Now Quests.' },
    { id: 'quests', title: 'Daily quests', target: '#screenQuests h2', press: 'next',
      text: 'Small goals that reset every day. Finish them and claim the coins here.' },

    { id: 'profile-tab', title: 'Profile', target: tab('screenProfile'), press: 'pass',
      text: 'And your Profile.' },
    { id: 'profile', title: 'Your profile', target: '#screenProfile .screen-scroll > *', press: 'next',
      text: 'Your name and picture, your study streak calendar and your badges. Make your profile visible so friends can find you.' },

    { id: 'back-home', title: 'Back to Home', target: tab('screenHome'), press: 'pass',
      text: 'That is everything. Tap Home to finish.' }
  ].map(function (s) {
    if (typeof s.target === 'string') s.target = q(s.target);
    return s;
  });
}
