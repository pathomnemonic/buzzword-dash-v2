import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

describe('wide-screen side cards', () => {
  let ui;
  beforeEach(async () => {
    localStorage.clear();
    const html = readFileSync('index.html', 'utf8');
    document.body.innerHTML = html.slice(html.indexOf('<body'), html.indexOf('</body>')).replace(/<script[\s\S]*?<\/script>/g, '');
    ({ ui } = await import('../../js/ui.js'));
    ui._sideKeysShown = false;
    ui._sideMap = undefined;
  });

  it('show how the run is going', () => {
    ui.updateSideCards({ correct: 7, wrong: 3, bestStreak: 5, currentSkin: { name: 'Research Lab' } });
    expect(document.getElementById('sideAcc').textContent).toBe('70%');
    expect(document.getElementById('sideAns').textContent).toBe('10');
    expect(document.getElementById('sideBest').textContent).toBe('5');
    expect(document.getElementById('sideMap').textContent).toContain('Research Lab');
  });

  it('start with a dash, not NaN, before the first answer', () => {
    ui.updateSideCards({ correct: 0, wrong: 0, bestStreak: 0 });
    expect(document.getElementById('sideAcc').textContent).toBe('–');
  });

  it('list the keys now in force, and are hidden from screen readers and from small screens', () => {
    ui.renderSideKeys();
    const text = document.getElementById('sideKeyList').textContent;
    expect(text.length).toBeGreaterThan(10);
    expect(document.getElementById('sideRun').getAttribute('aria-hidden')).toBe('true');
    const css = readFileSync('css/arcade.css', 'utf8');
    expect(css).toMatch(/\.side-card \{ display: none; \}/);
  });
});
