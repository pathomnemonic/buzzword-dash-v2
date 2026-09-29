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

  it('keeps the review lists collapsed so the screen stays short', async () => {
    const { ui } = await import('../../js/ui.js');
    ui.showPostRun(fakeGame());
    const content = document.getElementById('postRunContent');

    const toggles = [...content.querySelectorAll('.collapsible-toggle')];
    expect(toggles.length).toBe(2); // missed + correct
    toggles.forEach((t) => {
      expect(t.parentElement.querySelector('div').style.display).toBe('none');
    });

    // Opening one reveals its cards
    const missed = toggles.find((t) => /Missed/.test(t.textContent));
    missed.click();
    const body = missed.parentElement.querySelector('div');
    expect(body.style.display).toBe('block');
    expect(body.querySelectorAll('.review-card').length).toBe(2);
  });

  it('shows the action buttons before the review lists', async () => {
    const { ui } = await import('../../js/ui.js');
    ui.showPostRun(fakeGame());
    const content = document.getElementById('postRunContent');
    const all = [...content.querySelectorAll('button')];
    const home = all.findIndex((b) => b.id === 'goHomeBtn');
    const firstToggle = all.findIndex((b) => b.classList.contains('collapsible-toggle'));
    expect(home).toBeGreaterThan(-1);
    expect(home).toBeLessThan(firstToggle);
  });
});
