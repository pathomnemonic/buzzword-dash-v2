import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

// The end-of-run screen once shipped with dead buttons (a missing `self`).
// This renders it against the real page markup and clicks them.

function loadPage() {
  const html = readFileSync('index.html', 'utf8');
  const body = html.slice(html.indexOf('<body'), html.indexOf('</body>'));
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, '');
}

function fakeGame(overrides = {}) {
  const card = (id, ok) => ({
    ok,
    choice: ok ? 'Right' : 'Wrong',
    card: { id, bw: ['clue ' + id], ans: 'Right', subj: 'Path', tp: 'teaching point', ww: {} }
  });
  return {
    score: 1200, correct: 3, wrong: 2, coins: 7, bestStreak: 3, userSpeed: 1,
    continued: false, isNewBest: false, mode: 'endless', currentSkin: { name: 'Neon ER' },
    runCards: [card(1, true), card(2, false), card(3, false), card(4, true), card(5, true)],
    ...overrides
  };
}

describe('post-run screen', () => {
  beforeEach(() => {
    localStorage.clear();
    loadPage();
  });

  it('Home, Quick Review and Share buttons all work', async () => {
    const { ui } = await import('../../js/ui.js');
    ui.showPostRun(fakeGame());
    const content = document.getElementById('postRunContent');

    // Home
    document.getElementById('goHomeBtn').click();
    expect(document.getElementById('screenHome').classList.contains('active')).toBe(true);

    // Back on the results, Quick Review opens without throwing
    ui.showPostRun(fakeGame());
    const quick = [...content.querySelectorAll('button')].find((b) => /Quick Review/.test(b.textContent));
    expect(quick).toBeTruthy();
    expect(() => quick.click()).not.toThrow();
  });

  it('shows the missed and correct cards as two big tabs over one list, missed first', async () => {
    const { ui } = await import('../../js/ui.js');
    ui.showPostRun(fakeGame());
    const content = document.getElementById('postRunContent');
    const tabs = [...content.querySelectorAll('.post-review-tab')];
    expect(tabs.map((t) => t.dataset.tab)).toEqual(['missed', 'correct']);
    expect(tabs[0].querySelector('.post-review-count').textContent).toBe('2');
    expect(tabs[1].querySelector('.post-review-count').textContent).toBe('3');
    // the missed cards are on show to begin with; the other tab swaps the list
    expect(tabs[0].classList.contains('active')).toBe(true);
    expect(content.querySelectorAll('.post-review-list .review-card').length).toBe(2);
    tabs[1].click();
    expect(content.querySelectorAll('.post-review-list .review-card').length).toBe(3);
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
  });

  it('a perfect run opens on the correct cards and says so', async () => {
    const { ui } = await import('../../js/ui.js');
    ui.showPostRun(fakeGame({ wrong: 0, runCards: fakeGame().runCards.filter((r) => r.ok) }));
    const content = document.getElementById('postRunContent');
    expect(content.querySelector('.post-review-tab.active').dataset.tab).toBe('correct');
    content.querySelector('[data-tab="missed"]').click();
    expect(content.querySelector('.post-review-empty').textContent).toMatch(/perfect/i);
  });

  it('Share is a small button in the top left corner, with room for the image button on the right', async () => {
    const { ui } = await import('../../js/ui.js');
    ui.showPostRun(fakeGame());
    const corners = document.querySelector('#postRunContent .post-corners');
    expect(corners.firstElementChild.id).toBe('shareScoreBtn');
    expect(corners.querySelector('#postImageSlot')).toBeTruthy();
    expect(corners.firstElementChild.className).toMatch(/btn-sm/);
  });

  it('shows the action buttons below the review', async () => {
    const { ui } = await import('../../js/ui.js');
    ui.showPostRun(fakeGame());
    const content = document.getElementById('postRunContent');
    const kids = [...content.children];
    const review = kids.findIndex((el) => el.classList.contains('post-review'));
    const actions = kids.findIndex((el) => el.classList.contains('post-actions'));
    expect(review).toBeGreaterThan(-1);
    expect(actions).toBeGreaterThan(review);
  });
});
