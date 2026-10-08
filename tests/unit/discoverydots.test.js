import { describe, it, expect, beforeEach } from 'vitest';
import { homeDotsNow, markExplored, isExplored, discoveryActive, menuHasNew, MENU_DISCOVERIES, HOME_DISCOVERIES, HOME_DOT_LIMIT, updateDiscoveryDots, discoveryIdFor } from '../../js/discoverydots.js';
import { setDot } from '../../js/attentiondots.js';

function fakeStorage(data) {
  const d = { runsFinished: 1, explored: [], ...data };
  return { get: (k) => d[k], set: (k, v) => { d[k] = v; }, d };
}

describe('discovery dots', () => {
  it('stay away until the player has finished a run', () => {
    const s = fakeStorage({ runsFinished: 0 });
    expect(discoveryActive(s)).toBe(false);
    expect(homeDotsNow(s)).toEqual([]);
    expect(menuHasNew(s, MENU_DISCOVERIES[0])).toBe(false);
  });

  it('every menu and tab has a dot at once, and each goes when it is opened', () => {
    const s = fakeStorage();
    let now = homeDotsNow(s).map((d) => d.id);
    expect(now.length).toBe(HOME_DISCOVERIES.length);
    ['home:filters', 'home:speed', 'home:flashcards', 'home:challenge', 'home:settings', 'tab:stats', 'tab:locker', 'tab:quests', 'tab:profile'].forEach((id) => expect(now, id).toContain(id));
    expect(markExplored(s, 'home:flashcards')).toBe(true);
    expect(markExplored(s, 'home:flashcards')).toBe(false);
    now = homeDotsNow(s).map((d) => d.id);
    expect(now).not.toContain('home:flashcards');
    expect(now.length).toBe(HOME_DISCOVERIES.length - 1);
    expect(isExplored(s, 'home:flashcards')).toBe(true);
  });

  it('start as soon as the how-to-play is over, not only after a first run', () => {
    const fresh = fakeStorage();
    expect(discoveryActive(fresh)).toBe(true); // (fakeStorage is a player who has played)
    const justFinishedTutorial = { get: (k) => ({ firstRunComplete: true, runsFinished: 0, explored: [] }[k]), set() {} };
    expect(discoveryActive(justFinishedTutorial)).toBe(true);
    const brandNew = { get: (k) => ({ firstRunComplete: false, runsFinished: 0, explored: [] }[k]), set() {} };
    expect(discoveryActive(brandNew)).toBe(false);
  });

  it('a menu keeps a dot on its button while any item is unopened, and loses it when all are opened', () => {
    const s = fakeStorage();
    const settings = MENU_DISCOVERIES[0];
    expect(menuHasNew(s, settings)).toBe(true);
    settings.items.forEach((it) => markExplored(s, it.id));
    expect(menuHasNew(s, settings)).toBe(false);
  });

  it('draws dots on the page, and takes them away for opened things', () => {
    document.body.innerHTML = '<button id="homeFlashcardsBtn">F</button><button id="homeChallengeBtn">C</button><button id="settingsBtn">S</button><div id="shopItems"><button role="tab">H</button><button role="tab">T</button></div>';
    const s = fakeStorage();
    updateDiscoveryDots(s, setDot, document);
    expect(document.querySelector('#homeFlashcardsBtn .nav-dot')).toBeTruthy();
    expect(document.querySelector('#settingsBtn .nav-dot')).toBeTruthy();
    expect(document.querySelectorAll('#shopItems [role="tab"] .nav-dot').length).toBe(2);
    markExplored(s, 'home:flashcards');
    updateDiscoveryDots(s, setDot, document);
    expect(document.querySelector('#homeFlashcardsBtn .nav-dot')).toBeNull();
  });

  it('knows what a click opened', () => {
    document.body.innerHTML = '<button id="homeFlashcardsBtn"><span id="inner">x</span></button><div id="shopItems"><button role="tab" id="t0">H</button><button role="tab" id="t2">T</button><button role="tab" id="t3">M</button></div>';
    expect(discoveryIdFor(document.getElementById('inner'))).toBe('home:flashcards');
    expect(discoveryIdFor(document.getElementById('t0'))).toBe('locker:heroes');
    expect(discoveryIdFor(document.getElementById('t3'))).toBe('locker:maps');
    expect(discoveryIdFor(document.body)).toBeNull();
  });
});
