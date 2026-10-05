import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildTourSteps } from '../../js/tourdata.js';

describe('the tour steps', () => {
  let steps;
  beforeEach(() => {
    const html = readFileSync('index.html', 'utf8');
    document.body.innerHTML = html.slice(html.indexOf('<body'), html.indexOf('</body>')).replace(/<script[\s\S]*?<\/script>/g, '');
    steps = buildTourSteps({ ui: { show() {} } });
  });
  const ids = () => steps.map((s) => s.id);

  it('walks Home first, with a section each for Versus and Flashcards, one line on Challenge (no PLAY lesson, no mode-by-mode walk), then the tabs', () => {
    const order = ids();
    ['coins', 'filters', 'speed', 'versus-btn', 'versus', 'flashcards-btn', 'flashcards', 'challenge-btn', 'friends', 'settings', 'stats-tab', 'locker-tab', 'quests-tab', 'profile-tab', 'back-home'].forEach((id) => expect(order, id).toContain(id));
    expect(order.indexOf('versus-btn')).toBeLessThan(order.indexOf('flashcards-btn'));
    expect(order.indexOf('flashcards-btn')).toBeLessThan(order.indexOf('challenge-btn'));
    ['play', 'ch-study', 'ch-weakness', 'ch-daily', 'ch-gauntlet', 'ch-friend', 'ch-exam'].forEach((id) => expect(order, id).not.toContain(id));
    expect(order.indexOf('challenge-btn')).toBeLessThan(order.indexOf('stats-tab'));
  });

  it('every pop-up section is opened by pressing its real button, and closed again when it is left', () => {
    const byId = Object.fromEntries(steps.map((s) => [s.id, s]));
    ['versus-btn', 'flashcards-btn'].forEach((id) => expect(byId[id].press, id).toBe('pass'));
    expect(byId['challenge-btn'].press).toBe('count'); // it is only pointed at, not opened
    expect(typeof byId.versus.after).toBe('function');
    expect(typeof byId.flashcards.after).toBe('function');
    // closing really closes
    const sheet = document.getElementById('flashcardsSheet');
    sheet.classList.add('active');
    sheet.querySelector('.sheet-close').addEventListener('click', () => sheet.classList.remove('active'));
    byId.flashcards.after();
    expect(sheet.classList.contains('active')).toBe(false);
  });

  it('every fixed target exists on the page, so no step falls back to a plain card by mistake', () => {
    const missing = steps.filter((s) => typeof s.target === 'function').filter((s) => {
      // the Locker's rows and tab buttons are drawn later; everything else is in the page already
      return !['extras-tab', 'buy', 'equip'].includes(s.id) && !s.target();
    }).map((s) => s.id);
    // screens drawn on demand (the multiplayer panel, the profile body) are empty until opened
    expect(missing.filter((id) => !['versus', 'profile', 'stats', 'preview'].includes(id))).toEqual([]);
  });

  it('each step says what it is: a title and some text', () => {
    steps.forEach((s) => { expect(s.title.length, s.id).toBeGreaterThan(2); expect(s.text.length, s.id).toBeGreaterThan(8); });
  });
});

describe('the tour always teaches with the EKG Line, and never hands out coins', () => {
  let storage, ui, steps;
  beforeEach(async () => {
    localStorage.clear();
    const html = readFileSync('index.html', 'utf8');
    document.body.innerHTML = html.slice(html.indexOf('<body'), html.indexOf('</body>')).replace(/<script[\s\S]*?<\/script>/g, '');
    ({ storage } = await import('../../js/storage.js'));
    storage.load();
    ({ ui } = await import('../../js/ui.js'));
    steps = buildTourSteps({ ui: { show() {} } });
    ui._lockerTab = 'trails';
    ui.renderShop();
  });
  const step = (id) => steps.find((s) => s.id === id);
  const applies = (id, ctx = {}) => !(step(id).skipIf && step(id).skipIf(ctx));
  const rowOf = (el) => el.closest('.shop-item').textContent;

  it('a new player is walked through buying the EKG Line (not the cheapest thing they can afford)', () => {
    expect(storage.get('coins')).toBe(500);
    expect(applies('buy')).toBe(true);
    expect(rowOf(step('buy').target())).toMatch(/EKG Line/);
    expect(applies('preview')).toBe(false);
    // a cheaper trail exists, and is not chosen
    expect(rowOf(step('buy').target())).not.toMatch(/Pill Trail/);
  });

  it('having bought it, the tour moves on to wearing it, and a second run buys nothing more', () => {
    step('buy').target().click();
    expect(storage.ownsItem('trail_ekg')).toBe(true);
    const coinsAfter = storage.get('coins');
    ui.renderShop();
    expect(applies('buy')).toBe(false);
    // buying wears it at once, so there is nothing left to equip
    expect(storage.get('equipped').trail).toBe('trail_ekg');
    expect(applies('equip')).toBe(false);
    ui.renderShop();
    // the tour again: nothing to buy, nothing to equip, the display step still makes sense, and no coins appear or go
    expect(applies('buy')).toBe(false);
    expect(applies('equip')).toBe(false);
    expect(applies('preview')).toBe(false);
    expect(applies('look')).toBe(true);
    expect(storage.get('coins')).toBe(coinsAfter);
  });

  it('someone who owns it but wears something else is not pushed to equip or buy again', () => {
    storage.data.progression.ownedItems.push('trail_ekg');
    ui.renderShop();
    expect(applies('buy')).toBe(false);
    expect(applies('preview')).toBe(false);
    expect(applies('equip')).toBe(true); // it can be worn, and the step offers exactly that
    expect(applies('look')).toBe(false);  // but with nothing worn there is nothing to look at
  });

  it('a player who cannot afford it is shown how to preview it instead, and gets no coins', () => {
    storage.set('coins', 50);
    ui.renderShop();
    expect(applies('buy')).toBe(false);
    expect(applies('preview')).toBe(true);
    expect(step('preview').target().getAttribute('aria-label')).toMatch(/EKG Line/);
    expect(applies('look', {})).toBe(false);
    expect(applies('look', { previewedTrail: true })).toBe(true);
    expect(storage.get('coins')).toBe(50);
  });

  it('the tour code never adds coins', () => {
    const src = readFileSync('js/tourdata.js', 'utf8') + readFileSync('js/tour.js', 'utf8') + readFileSync('js/tutorialrun.js', 'utf8');
    expect(src).not.toMatch(/addCoins|\.coins\s*\+=|set\('coins'/);
  });
});
