import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';

function loadPage() {
  const html = readFileSync('index.html', 'utf8');
  const body = html.slice(html.indexOf('<body'), html.indexOf('</body>'));
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, '');
}

describe('vibration setting', () => {
  beforeEach(() => { localStorage.clear(); loadPage(); });

  it('is offered on a device that can vibrate, and switching it off stops the buzzing', async () => {
    navigator.vibrate = vi.fn(() => true);
    const { storage } = await import('../../js/storage.js');
    storage.load();
    const { audio } = await import('../../js/audio.js');
    const { ui } = await import('../../js/ui.js');
    ui._settingsSection = 'sound';
    ui.renderSettings();
    const row = document.querySelector('[data-setting="hapticsEnabled"]');
    expect(row).toBeTruthy();
    const toggle = row.querySelector('[role="switch"]');
    expect(toggle.getAttribute('aria-checked')).toBe('true');

    // off: the saved setting changes, the audio engine follows, and no buzz comes out
    document.dispatchEvent(new Event('pointerdown'));
    toggle.click();
    expect(storage.get('hapticsEnabled')).toBe(false);
    navigator.vibrate.mockClear();
    audio._vibrate(50);
    expect(navigator.vibrate).not.toHaveBeenCalled();

    // on again: a short buzz confirms it
    toggle.click();
    expect(storage.get('hapticsEnabled')).toBe(true);
    audio._vibrate(50);
    expect(navigator.vibrate).toHaveBeenCalled();
  });

  it('is not shown where the device cannot vibrate at all', async () => {
    delete navigator.vibrate;
    const { storage } = await import('../../js/storage.js');
    storage.load();
    const { ui } = await import('../../js/ui.js');
    ui._settingsSection = 'sound';
    ui.renderSettings();
    expect(document.querySelector('[data-setting="hapticsEnabled"]')).toBeNull();
  });
});
