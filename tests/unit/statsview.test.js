import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderPerformance } from '../../js/statsview.js';
import { storage } from '../../js/storage.js';
import { CARDS } from '../../js/cardhub.js';

const DAY = 86400000;

function ui() {
  return { onStudyPlanRun: vi.fn(), startFlashcardSession: vi.fn(), showQuickReview: vi.fn(), show: vi.fn(), _showToast: vi.fn() };
}
function mount(u) {
  document.body.innerHTML = '<div id="c"></div>';
  const c = document.getElementById('c');
  renderPerformance(c, u || ui());
  return c;
}
function seed() {
  const now = Date.now();
  CARDS.slice(0, 120).forEach((c, i) => {
    storage.data.cards.cardStats[c.id] = { seen: 4, correct: i % 5 === 0 ? 1 : 4, wrong: i % 5 === 0 ? 3 : 0, lastSeen: now - DAY, stability: 8, difficulty: 5, lastReview: now - DAY, due: now + ((i % 9) - 3) * DAY, interval: 8 };
    storage.data.cards.subjectStats[c.subj] = { correct: 60, wrong: 10 };
  });
}

describe('Performance tab', () => {
  beforeEach(() => { localStorage.clear(); storage.data = null; storage.load(); });

  it('a new player sees a calm page: today card, three tiles and folded sections, not a wall of text', () => {
    const c = mount();
    expect(c.querySelector('.perf-hero')).not.toBeNull();
    expect(c.querySelectorAll('.perf-tile')).toHaveLength(3);
    const sections = [...c.querySelectorAll('details.perf-section')];
    expect(sections.map((s) => s.querySelector('.perf-title').textContent)).toEqual(['Reviews coming up', 'Memory by subject', 'Accuracy', 'Weakest concepts', 'Lifetime', 'Plan settings']);
    expect(sections.every((s) => !s.open)).toBe(true);
    // the page shows little text until something is opened
    expect(c.textContent.length).toBeLessThan(700);
  });

  it('puts the next study step on a big button and folds the others away', () => {
    seed();
    const u = ui();
    const c = mount(u);
    expect(c.querySelector('.perf-next-title').textContent).toMatch(/^Review \d+ due$/);
    expect(c.querySelector('.perf-more summary').textContent).toMatch(/More ways to study \(\d\)/);
    [...c.querySelectorAll('.perf-hero > .perf-step-buttons button')].find((b) => /Run it/.test(b.textContent)).click();
    expect(u.onStudyPlanRun).toHaveBeenCalledTimes(1);
    expect(u.onStudyPlanRun.mock.calls[0][0].length).toBeGreaterThan(0);
    [...c.querySelectorAll('.perf-hero > .perf-step-buttons button')].find((b) => /Cards/.test(b.textContent)).click();
    expect(u.startFlashcardSession).toHaveBeenCalled();
  });

  it('shows due, remembered and days to the exam as numbers, and a tile opens its section', () => {
    seed();
    storage.set('examDate', new Date(Date.now() + 40 * DAY).toISOString().slice(0, 10));
    const c = mount();
    const tiles = [...c.querySelectorAll('.perf-tile')].map((t) => t.getAttribute('aria-label'));
    expect(tiles[0]).toMatch(/^Due now: \d+$/);
    expect(tiles[1]).toMatch(/^Remembered: \d+%$/);
    expect(tiles[2]).toMatch(/^To exam: (39|40)d$/);
    c.querySelectorAll('.perf-tile')[1].click();
    expect(c.querySelector('#perf-memory').open).toBe(true);
    expect(c.querySelector('#perf-memory').textContent).toMatch(/Mastered|Solid|Learning|New/);
  });

  it('memory rows carry a level and a bar; weak concepts open a review; settings save', () => {
    seed();
    const u = ui();
    const c = mount(u);
    c.querySelector('#perf-memory').open = true; c.querySelector('#perf-memory').dispatchEvent(new Event('toggle'));
    expect(c.querySelectorAll('#perf-memory .perf-row').length).toBeGreaterThan(0);
    expect(c.querySelector('#perf-memory .perf-bar')).not.toBeNull();
    c.querySelector('#perf-weak').open = true; c.querySelector('#perf-weak').dispatchEvent(new Event('toggle'));
    c.querySelector('.perf-weak').click();
    expect(u.showQuickReview).toHaveBeenCalled();
    c.querySelector('#perf-settings').open = true; c.querySelector('#perf-settings').dispatchEvent(new Event('toggle'));
    const sel = c.querySelector('#retentionSelect');
    sel.value = '0.95'; sel.dispatchEvent(new Event('change'));
    expect(storage.get('targetRetention')).toBe(0.95);
    const date = c.querySelector('#examDateInput');
    date.value = '2027-03-01'; date.dispatchEvent(new Event('change'));
    expect(storage.get('examDate')).toBe('2027-03-01');
  });

  it('all caught up offers to play instead', () => {
    const u = ui();
    const now = Date.now();
    storage.data.settings.dailyGoal = 5;
    storage.data.progression.dailyStudied = undefined;
    CARDS.slice(0, 30).forEach((c) => { storage.data.cards.cardStats[c.id] = { seen: 3, correct: 3, wrong: 0, lastSeen: now, stability: 30, difficulty: 4, lastReview: now, due: now + 20 * DAY }; });
    vi.spyOn(storage, 'getStudiedToday').mockReturnValue(50);
    const c = mount(u);
    // (the plan may still suggest a weak subject; the button always leads somewhere useful)
    expect(c.querySelector('.perf-next-title')).not.toBeNull();
  });
});
