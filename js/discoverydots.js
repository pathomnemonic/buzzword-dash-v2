/**
 * discoverydots.js — red dots on the menus the player has never opened, so there is always something to try.
 *
 * Unlike attentiondots.js (things waiting to be claimed), these say "there is something here you have not seen".
 * A dot goes away for good the first time the player opens that thing, and that first opening shows a short lesson
 * (lessons.js). The how-to-play only covers the run and Home, so after it every menu has a dot:
 *   - nothing shows until the how-to-play is over (finished or left) or a run has been played,
 *   - a menu that has been opened shows a dot on each of its own unopened items (Settings sections, Locker tabs),
 *     and the button that opens that menu keeps a dot while any of them is unopened.
 */

import { FEATURES } from './features.js';

/** Things on Home and the tab bar, most worth trying first. (Versus and Friends need the backend, so a build without one has neither.) */
export var HOME_DISCOVERIES = [
  { id: 'home:filters', selector: '#filtersBtn', label: 'Filters: choose your questions' },
  { id: 'home:speed', selector: '#speedBtn', label: 'Speed: faster runs score more' },
  { id: 'home:flashcards', selector: '#homeFlashcardsBtn', label: 'Flashcards: try them' },
  { id: 'home:challenge', selector: '#homeChallengeBtn', label: 'Challenge modes: try one' },
  { id: 'home:versus', selector: '#multiplayerBtn', label: 'Versus: race a friend' },
  { id: 'home:friends', selector: '#leaderboardBtn', label: 'Friends: see what they are up to' },
  { id: 'home:settings', selector: '#settingsBtn', label: 'Settings: sound, controls and rules' },
  { id: 'tab:stats', selector: '.nav-item[data-screen="screenStats"]', label: 'Stats: see how you are doing' },
  { id: 'tab:locker', selector: '.nav-item[data-screen="screenShop"]', label: 'Locker: spend your coins' },
  { id: 'tab:quests', selector: '.nav-item[data-screen="screenQuests"]', label: 'Quests: daily goals' },
  { id: 'tab:profile', selector: '.nav-item[data-screen="screenProfile"]', label: 'Profile: your name and badges' }
].filter(function (d) { return FEATURES.backend || (d.id !== 'home:versus' && d.id !== 'home:friends'); });
/** Every one of them shows a dot from the start: the how-to-play only covers the run and Home, the rest teach themselves from their dot. */
export var HOME_DOT_LIMIT = 99;

/** Menus whose items each get their own dot while the menu is open. `parent` is the button that opens the menu. */
export var MENU_DISCOVERIES = [
  { prefix: 'settings:', parent: '#settingsBtn', parentLabel: 'Settings has sections you have not opened', items: [
    { id: 'settings:keys', selector: '.settings-card[data-section="keys"]', label: 'New: choose your keyboard keys' },
    { id: 'settings:look', selector: '.settings-card[data-section="look"]', label: 'Look and performance' },
    { id: 'settings:rules', selector: '.settings-card[data-section="rules"]', label: 'Your rules' },
    { id: 'settings:study', selector: '.settings-card[data-section="study"]', label: 'Study settings' }
  ] },
  { prefix: 'locker:', parent: '.nav-item[data-screen="screenShop"]', parentLabel: 'The Locker has tabs you have not opened', items: [
    { id: 'locker:heroes', tab: 0, label: 'Heroes' },
    { id: 'locker:trails', tab: 1, label: 'Trails' },
    { id: 'locker:maps', tab: 2, label: 'Maps' },
    { id: 'locker:monsters', tab: 3, label: 'Monsters' }
  ] }
];

export function isExplored(storage, id) {
  var list = storage.get('explored');
  return Array.isArray(list) && list.indexOf(id) >= 0;
}

/** Remember that the player has opened something. Returns true when that was news. */
export function markExplored(storage, id) {
  var list = storage.get('explored');
  list = Array.isArray(list) ? list.slice() : [];
  if (list.indexOf(id) >= 0) return false;
  list.push(id);
  storage.set('explored', list);
  return true;
}

/** Dots start once the how-to-play is over (finished or left) or the player has played a run. */
export function discoveryActive(storage) {
  return !!storage.get('firstRunComplete') || (storage.get('runsFinished') || 0) >= 1;
}

/** The Home / tab-bar discoveries that should show a dot right now. */
export function homeDotsNow(storage) {
  if (!discoveryActive(storage)) return [];
  return HOME_DISCOVERIES.filter(function (d) { return !isExplored(storage, d.id); }).slice(0, HOME_DOT_LIMIT);
}

/** Does this menu still have an unopened item? */
export function menuHasNew(storage, menu) {
  return discoveryActive(storage) && menu.items.some(function (it) { return !isExplored(storage, it.id); });
}

/**
 * Draw every discovery dot. `setDot` is attentiondots.setDot (passed in so this file stays free of DOM imports).
 * Items inside a menu are only dotted when that menu is on screen; the button that opens the menu is dotted whenever
 * the menu has something unopened.
 */
export function updateDiscoveryDots(storage, setDot, doc) {
  doc = doc || document;
  var q = function (sel) { return doc.querySelector(sel); };
  var showing = homeDotsNow(storage);
  HOME_DISCOVERIES.forEach(function (d) {
    setDot(q(d.selector), showing.some(function (s) { return s.id === d.id; }), d.label, 'discovery');
  });
  MENU_DISCOVERIES.forEach(function (menu) {
    // (a button can be both the thing that opens a menu and a Home discovery of its own: the Settings button, the Locker tab)
    var own = showing.some(function (d) { return d.selector === menu.parent; });
    setDot(q(menu.parent), own || menuHasNew(storage, menu), menu.parentLabel, 'discovery');
    menu.items.forEach(function (it) {
      var el = it.selector ? q(it.selector) : (doc.querySelectorAll('#shopItems [role="tab"]')[it.tab] || null);
      if (el) setDot(el, discoveryActive(storage) && !isExplored(storage, it.id), it.label, 'discovery');
    });
  });
}

/** Which discovery does a click on this element open? (Used to mark it explored.) */
export function discoveryIdFor(target) {
  if (!target || !target.closest) return null;
  for (var i = 0; i < HOME_DISCOVERIES.length; i++) if (target.closest(HOME_DISCOVERIES[i].selector)) return HOME_DISCOVERIES[i].id;
  for (var m = 0; m < MENU_DISCOVERIES.length; m++) {
    var items = MENU_DISCOVERIES[m].items;
    for (var j = 0; j < items.length; j++) {
      if (items[j].selector && target.closest(items[j].selector)) return items[j].id;
      if (items[j].tab !== undefined) {
        var tab = target.closest('#shopItems [role="tab"]');
        if (tab) {
          var tabs = tab.parentElement.querySelectorAll('[role="tab"]');
          for (var t = 0; t < tabs.length; t++) if (tabs[t] === tab && t === items[j].tab) return items[j].id;
        }
      }
    }
  }
  return null;
}
