import { describe, it, expect, beforeEach, vi } from 'vitest';
import { homeMethods } from '../../js/uihome.js';
import { storage } from '../../js/storage.js';
import { CARDS } from '../../js/cardhub.js';

const DAY = 86400000;

function makeUi() {
  const ui = Object.assign({}, homeMethods, {
    onStudyPlanRun: vi.fn(), startFlashcardSession: vi.fn(), _showToast: vi.fn(), show: vi.fn(),
    renderHome: vi.fn(), _renderFirstWeek: vi.fn()
  });
  ui.closeSheets = vi.fn();
  return ui;
}

describe('the Today popup on Home', () => {
  beforeEach(() => { localStorage.clear(); storage.data = null; storage.load(); document.body.innerHTML = '<div id="t"></div>'; });

  it('runs the due cards straight from the popup, closing it first', () => {
    const now = Date.now();
    CARDS.slice(0, 30).forEach((c) => { storage.data.cards.cardStats[c.id] = { seen: 3, correct: 2, wrong: 1, lastSeen: now - 5 * DAY, stability: 3, difficulty: 5, lastReview: now - 5 * DAY, due: now - DAY }; });
    const ui = makeUi();
    const el = document.getElementById('t');
    ui._renderToday(el);
    expect(el.textContent).toContain('30 cards due for review');
    expect(el.textContent).not.toContain('Flashcards → Review due cards'); // no more "go somewhere else" instructions
    expect(el.querySelector('.today-next-title').textContent).toBe('Next up: Review 20 due');
    [...el.querySelectorAll('.today-next button')].find((b) => /Run it/.test(b.textContent)).click();
    expect(ui.closeSheets).toHaveBeenCalled();
    expect(ui.onStudyPlanRun).toHaveBeenCalledTimes(1);
    expect(ui.onStudyPlanRun.mock.calls[0][0]).toHaveLength(20);
    [...el.querySelectorAll('.today-next button')].find((b) => /Flashcards/.test(b.textContent)).click();
    expect(ui.startFlashcardSession).toHaveBeenCalledWith(null, expect.any(Array));
  });

  it('still offers the next step when nothing is due', () => {
    const ui = makeUi();
    const el = document.getElementById('t');
    ui._renderToday(el);
    expect(el.textContent).toContain('No reviews due');
    expect(el.querySelector('.today-next-title').textContent).toMatch(/^Next up: /);
  });
});
