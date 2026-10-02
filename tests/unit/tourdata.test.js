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

  it('walks Home first, with a section each for Versus, Flashcards and Challenge, then the tabs', () => {
    const order = ids();
    ['coins', 'play', 'filters', 'speed', 'versus-btn', 'versus', 'flashcards-btn', 'flashcards', 'challenge-btn', 'ch-study', 'ch-weakness', 'ch-daily', 'ch-gauntlet', 'ch-friend', 'ch-exam', 'friends', 'settings', 'stats-tab', 'locker-tab', 'quests-tab', 'profile-tab', 'back-home'].forEach((id) => expect(order, id).toContain(id));
    expect(order.indexOf('versus-btn')).toBeLessThan(order.indexOf('flashcards-btn'));
    expect(order.indexOf('flashcards-btn')).toBeLessThan(order.indexOf('challenge-btn'));
    expect(order.indexOf('ch-exam')).toBeLessThan(order.indexOf('stats-tab'));
  });

  it('every pop-up section is opened by pressing its real button, and closed again when it is left', () => {
    const byId = Object.fromEntries(steps.map((s) => [s.id, s]));
    ['versus-btn', 'flashcards-btn', 'challenge-btn'].forEach((id) => expect(byId[id].press, id).toBe('pass'));
    expect(typeof byId.versus.after).toBe('function');
    expect(typeof byId.flashcards.after).toBe('function');
    expect(typeof byId['ch-exam'].after).toBe('function');
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
    expect(missing.filter((id) => !['versus', 'profile'].includes(id))).toEqual([]);
  });

  it('each step says what it is: a title and some text', () => {
    steps.forEach((s) => { expect(s.title.length, s.id).toBeGreaterThan(2); expect(s.text.length, s.id).toBeGreaterThan(8); });
  });
});
