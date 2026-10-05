import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Auto-Pilot pick-up tip', () => {
  let ui; let storage;
  beforeEach(async () => {
    localStorage.clear();
    const html = readFileSync('index.html', 'utf8');
    document.body.innerHTML = html.slice(html.indexOf('<body'), html.indexOf('</body>')).replace(/<script[\s\S]*?<\/script>/g, '');
    ({ ui } = await import('../../js/ui.js'));
    ({ storage } = await import('../../js/storage.js'));
    storage.load();
  });

  it('says how to use it with the key now in force, for the first ten pick-ups only', () => {
    for (let i = 0; i < 10; i++) {
      const hint = ui.showAutoPilotHint();
      expect(hint, 'pick-up ' + (i + 1)).not.toBeNull();
      expect(hint.textContent).toMatch(/Auto-Pilot ready: (Press .*Ctrl|Tap the 🤖)/);
    }
    expect(ui.showAutoPilotHint()).toBeNull();
    expect(storage.data.progression.autoPilotHints).toBe(10);
  });

  it('follows a key the player chose, and the count survives a reload', () => {
    storage.set('keyBindings', { autoPilot: ['q'] });
    const hint = ui.showAutoPilotHint();
    if (!/Tap the/.test(hint.textContent)) expect(hint.textContent).toContain('Press Q');
    storage.save();
    storage.load();
    expect(storage.data.progression.autoPilotHints).toBe(1);
  });

  it('only one tip is on screen at a time', () => {
    ui.showAutoPilotHint();
    ui.showAutoPilotHint();
    expect(document.querySelectorAll('#autoPilotHint').length).toBe(1);
  });
});
