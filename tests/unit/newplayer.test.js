import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { pushTitleTap, titleTapsUnlock, TITLE_TAPS_NEEDED, TITLE_TAPS_WITHIN_MS } from '../../js/ui.js';

describe('the 100,000-coin secret (20 quick taps on the title)', () => {
  const run = (times) => times.reduce((taps, t) => pushTitleTap(taps, t), []);

  it('unlocks on 20 taps inside the window', () => {
    const times = Array.from({ length: 20 }, (_, i) => 1000 + i * 300); // a tap every 0.3 s
    expect(titleTapsUnlock(run(times))).toBe(true);
  });

  it('does not unlock one tap short', () => {
    const times = Array.from({ length: 19 }, (_, i) => 1000 + i * 300);
    expect(titleTapsUnlock(run(times))).toBe(false);
  });

  it('taps minutes apart never add up, however many there are', () => {
    const minutesApart = Array.from({ length: 200 }, (_, i) => i * 120000);
    expect(titleTapsUnlock(run(minutesApart))).toBe(false);
  });

  it('a slow, steady tap (every 1.5 s, which the old rule allowed) no longer unlocks it', () => {
    const slow = Array.from({ length: 40 }, (_, i) => i * 1500);
    expect(titleTapsUnlock(run(slow))).toBe(false);
  });

  it('a few stray taps long ago do not count towards a later burst', () => {
    const stray = [0, 5000, 600000];
    const burst = Array.from({ length: 20 }, (_, i) => 600000 + 1000 + i * 250);
    expect(titleTapsUnlock(run(stray.concat(burst)))).toBe(true);
    const burstShort = Array.from({ length: 17 }, (_, i) => 600000 + 1000 + i * 250);
    expect(titleTapsUnlock(run(stray.concat(burstShort)))).toBe(false);
  });

  it('the rule is 20 taps in 8 seconds', () => {
    expect(TITLE_TAPS_NEEDED).toBe(20);
    expect(TITLE_TAPS_WITHIN_MS).toBe(8000);
  });
});

describe('a new player starts with every question on', () => {
  let ui, storage;
  beforeEach(async () => {
    localStorage.clear();
    const html = readFileSync('index.html', 'utf8');
    document.body.innerHTML = html.slice(html.indexOf('<body'), html.indexOf('</body>')).replace(/<script[\s\S]*?<\/script>/g, '');
    ({ ui } = await import('../../js/ui.js'));
    ({ storage } = await import('../../js/storage.js'));
    storage.load();
  });

  it('no filter is set, so nothing is held back', () => {
    ['selectedSubjects', 'selectedExams', 'selectedQuestionTypes', 'selectedSources', 'selectedYears'].forEach((k) => expect(storage.get(k)).toEqual([]));
    expect(storage.get('highYieldOnly')).toBe(false);
  });

  it('every subject, exam, question-type and year chip shows as on, and the Home summary says all subjects', () => {
    ui.renderSubjects();
    ui.renderExamFilter();
    ui.renderAdvancedFilters();
    ui._renderFiltersSummary();
    const chips = [...document.querySelectorAll('.subject-chip')];
    expect(chips.length).toBeGreaterThan(20);
    expect(chips.every((c) => c.classList.contains('selected'))).toBe(true);
    expect(document.getElementById('filtersSummary').textContent).toBe('All subjects');
    expect(document.getElementById('activeFilterCount').textContent).toBe('');
  });

  it('tapping a chip narrows to it, tapping another adds it, and turning the last off returns to everything', () => {
    ui.renderAdvancedFilters();
    const chip = (id) => document.querySelector(`[data-qtype="${id}"]`);
    chip('lab_dx').click();
    expect(storage.get('selectedQuestionTypes')).toEqual(['lab_dx']);
    expect(chip('lab_dx').classList.contains('selected')).toBe(true);
    expect(chip('pharm').classList.contains('selected')).toBe(false);
    chip('pharm').click();
    expect(storage.get('selectedQuestionTypes')).toEqual(['lab_dx', 'pharm']);
    chip('lab_dx').click();
    chip('pharm').click();
    expect(storage.get('selectedQuestionTypes')).toEqual([]);
    expect([...document.querySelectorAll('[data-qtype]')].every((c) => c.classList.contains('selected'))).toBe(true);
  });
});

describe('a new player can afford a first trail', () => {
  it('starts with enough coins for the cheapest trail, and the Home screen starts at the same number', async () => {
    localStorage.clear();
    const { storage } = await import('../../js/storage.js');
    const { SHOP_ITEMS } = await import('../../js/game/shopdata.js');
    storage.load();
    const cheapest = Math.min(...SHOP_ITEMS.filter((i) => i.type === 'trail' && i.price > 0).map((i) => i.price));
    expect(storage.get('coins')).toBeGreaterThanOrEqual(cheapest);
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain('<span id="homeCoins">' + storage.get('coins') + '</span>');
  });

  it('a saved game keeps its own balance', async () => {
    localStorage.clear();
    const { storage } = await import('../../js/storage.js');
    storage.load();
    storage.set('coins', 37);
    storage.save();
    storage.load();
    expect(storage.get('coins')).toBe(37);
  });
});
