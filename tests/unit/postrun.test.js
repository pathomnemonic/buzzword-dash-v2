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

  it('shows two big buttons for the missed and correct cards, with nothing expanded until asked', async () => {
    const { ui } = await import('../../js/ui.js');
    ui.showPostRun(fakeGame());
    const content = document.getElementById('postRunContent');
    const buttons = [...content.querySelectorAll('.post-review-open')];
    expect(buttons.map((t) => t.dataset.tab)).toEqual(['missed', 'correct']);
    expect(buttons[0].querySelector('.post-review-count').textContent).toBe('2');
    expect(buttons[1].querySelector('.post-review-count').textContent).toBe('3');
    // no cards on the page itself, and the pop-up is closed
    expect(content.querySelectorAll('.review-card').length).toBe(0);
    expect(document.getElementById('reviewOverlay').classList.contains('active')).toBe(false);
  });

  it('a button opens the full-screen pop-up on its own cards; the tabs inside swap the list; close puts it away', async () => {
    const { ui } = await import('../../js/ui.js');
    ui.showPostRun(fakeGame());
    const content = document.getElementById('postRunContent');
    const overlay = document.getElementById('reviewOverlay');
    content.querySelector('.post-review-open[data-tab="missed"]').click();
    expect(overlay.classList.contains('active')).toBe(true);
    expect(overlay.querySelectorAll('.review-card').length).toBe(2);
    expect(document.getElementById('reviewFullTitle').textContent).toMatch(/missed/i);
    expect(overlay.querySelector('.review-flag')).toBeTruthy();
    overlay.querySelector('[role="tab"][data-tab="correct"]').click();
    expect(overlay.querySelectorAll('.review-card').length).toBe(3);
    expect(overlay.querySelector('[data-tab="correct"]').getAttribute('aria-selected')).toBe('true');
    document.getElementById('reviewFullClose').click();
    expect(overlay.classList.contains('active')).toBe(false);
    // the other button opens straight onto the correct cards
    content.querySelector('.post-review-open[data-tab="correct"]').click();
    expect(overlay.querySelectorAll('.review-card').length).toBe(3);
  });

  it('a perfect run says so in the missed pop-up', async () => {
    const { ui } = await import('../../js/ui.js');
    ui.showPostRun(fakeGame({ wrong: 0, runCards: fakeGame().runCards.filter((r) => r.ok) }));
    const content = document.getElementById('postRunContent');
    content.querySelector('.post-review-open[data-tab="missed"]').click();
    expect(document.getElementById('reviewOverlay').querySelector('.post-review-empty').textContent).toMatch(/perfect/i);
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
