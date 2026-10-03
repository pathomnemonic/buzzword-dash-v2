import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Open every screen for a brand-new player and for a veteran with lots of history, and look for the tell-tale signs
 * of a rendering bug in the visible text: "undefined", "NaN", "[object Object]", "Infinity", or an exception.
 */

function loadPage() {
  const html = readFileSync('index.html', 'utf8');
  const body = html.slice(html.indexOf('<body'), html.indexOf('</body>'));
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, '');
}

const SCREENS = ['screenStats', 'screenShop', 'screenQuests', 'screenProfile', 'screenSettings', 'screenMyCards', 'screenCardBrowser', 'screenHome'];
const BAD = /\bundefined\b|\bNaN\b|\[object Object\]|\bInfinity\b|\bnull\b/;

function run(i, o) {
  return Object.assign({
    runId: 'veteran' + i, mode: ['endless', 'study', 'weakness', 'daily'][i % 4], completed: true, score: 500 + i * 130, coinsEarned: 30, coinsCollected: 25,
    encountersCompleted: 8, correct: 6, wrong: 2, bestStreak: 4 + (i % 5), durationMs: 90000, subjectsSeen: ['Neurology'], rushesUsed: i % 3,
    powerupsCollected: i % 4, obstaclesJumped: 3, obstaclesSlid: 2, dailyCompleted: i % 4 === 3, fastestDecisionMs: 700 + i,
    encounters: Array.from({ length: 8 }, (_, k) => ({ cardId: 'c' + String(1 + ((i * 8 + k) % 200)).padStart(3, '0'), subject: ['Cardiology', 'Neurology', 'Pediatrics', 'Surgery'][k % 4], correct: k % 4 !== 0, decisionMs: 600 + k * 200 }))
  }, o);
}

async function visibleText(id) {
  const el = document.getElementById(id);
  return el.innerText !== undefined ? el.innerText : el.textContent;
}

for (const profile of ['a brand-new player', 'a veteran']) {
  describe('screens for ' + profile, () => {
    beforeEach(() => { localStorage.clear(); loadPage(); });

    it('render without errors or broken text', async () => {
      const { storage } = await import('../../js/storage.js');
      storage.load();
      if (profile === 'a veteran') {
        for (let i = 0; i < 40; i++) storage.finalizeRun(run(i));
        for (let i = 0; i < 5; i++) storage.finalizeFlashcardSession({ sessionId: 'f' + i, total: 12, correct: 9, wrong: 3, durationMs: 60000, cardResults: [{ cardId: 'c00' + (i + 1), rating: 'correct' }, { cardId: 'c01' + i, rating: 'wrong' }] });
        storage.set('coins', 90000);
        storage.set('examDate', new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10));
        storage.checkAchievements(null);
      }
      const { ui } = await import('../../js/ui.js');
      const problems = [];
      for (const id of SCREENS) {
        try {
          ui.show(id);
        } catch (e) {
          problems.push(id + ' threw ' + e.message);
          continue;
        }
        const text = await visibleText(id);
        if (text.replace(/\s+/g, ' ').trim().length < 20) problems.push(id + ' is empty');
        const hit = BAD.exec(text);
        if (hit) problems.push(id + ': "' + text.slice(Math.max(0, hit.index - 30), hit.index + 30).replace(/\s+/g, ' ') + '"');
      }
      expect(problems).toEqual([]);
    });
  });
}
