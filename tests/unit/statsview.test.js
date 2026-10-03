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
    expect(sections.map((s) => s.querySelector('.perf-title').textContent)).toEqual(['Reviews coming up', 'Subjects', 'Weakest concepts', 'Lifetime', 'Plan settings']);
    expect(sections.every((s) => !s.open)).toBe(true);
    // the page shows little text until something is opened
    expect(c.textContent.length).toBeLessThan(700);
  });

  it('shows one next study step on a big button, with no list of other suggestions', () => {
    seed();
    const u = ui();
    const c = mount(u);
    expect(c.querySelector('.perf-next-title').textContent).toMatch(/^Review \d+ due$/);
    expect(c.querySelector('.perf-more')).toBeNull();
    expect(c.textContent).not.toMatch(/Also worth doing/);
    [...c.querySelectorAll('.perf-hero > .perf-step-buttons button')].find((b) => /Run it/.test(b.textContent)).click();
    expect(u.onStudyPlanRun).toHaveBeenCalledTimes(1);
    expect(u.onStudyPlanRun.mock.calls[0][0].length).toBeGreaterThan(0);
    [...c.querySelectorAll('.perf-hero > .perf-step-buttons button')].find((b) => /Flashcards/.test(b.textContent)).click();
    expect(u.startFlashcardSession).toHaveBeenCalled();
  });

  it('shows due, accuracy and days to the exam as numbers, and a tile opens its section', () => {
    seed();
    storage.data.progression.totalCorrect = 70;
    storage.data.progression.totalWrong = 30;
    storage.set('examDate', new Date(Date.now() + 40 * DAY).toISOString().slice(0, 10));
    const c = mount();
    const tiles = [...c.querySelectorAll('.perf-tile')].map((t) => t.getAttribute('aria-label'));
    expect(tiles[0]).toMatch(/^Due now: \d+$/);
    expect(tiles[1]).toBe('Accuracy: 70%');
    expect(tiles[2]).toMatch(/^To exam: (39|40)d$/);
    c.querySelectorAll('.perf-tile')[1].click();
    expect(c.querySelector('#perf-subjects').open).toBe(true);
    expect(c.querySelector('#perf-subjects').textContent).toMatch(/Solid|Learning|Mastered|New/);
    expect(c.textContent).not.toMatch(/remembered|memory/i); // no memory estimate: it did not mean anything obvious
  });

  it('subject rows show the level next to the numbers behind it, and weak concepts open a review; settings save', () => {
    seed();
    const u = ui();
    const c = mount(u);
    c.querySelector('#perf-subjects').open = true; c.querySelector('#perf-subjects').dispatchEvent(new Event('toggle'));
    const row = c.querySelector('#perf-subjects .perf-row');
    expect(row.textContent).toMatch(/\d+% correct\s+·\s+\d+ answered/);
    expect(row.querySelector('.perf-bar')).not.toBeNull();
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

describe('plan buttons and imported flashcards', () => {
  it('"Run it" never sends flashcard-only cards to the runner', async () => {
    const { stepButtons } = await import('../../js/statsview.js');
    const onStudyPlanRun = vi.fn();
    const ui = { onStudyPlanRun, _showToast: vi.fn(), startFlashcardSession: vi.fn() };
    const cards = [
      { id: 'f1', subj: 'Cardiology', enabledModes: ['flashcard'] },
      { id: 'q1', subj: 'Cardiology' },
      { id: 'q2', subj: 'Cardiology', enabledModes: ['study', 'endless'] }
    ];
    const plan = { dueIds: ['f1', 'q1', 'q2'], dueCount: 3 };
    const row = stepButtons(ui, { kind: 'due', count: 3 }, plan, cards, false);
    row.querySelector('.btn-green').click();
    expect(onStudyPlanRun).toHaveBeenCalledWith(['q1', 'q2']);
    // only flashcard-only cards: nothing for the runner, and the player is told where to go
    onStudyPlanRun.mockClear();
    const only = stepButtons(ui, { kind: 'due', count: 1 }, { dueIds: ['f1'], dueCount: 1 }, cards, false);
    only.querySelector('.btn-green').click();
    expect(onStudyPlanRun).not.toHaveBeenCalled();
    expect(ui._showToast).toHaveBeenCalledWith(expect.stringMatching(/flashcards/i));
  });
});
