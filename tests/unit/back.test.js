import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Back buttons and the Android back button', () => {
  let ui;
  beforeEach(async () => {
    localStorage.clear();
    const html = readFileSync('index.html', 'utf8');
    document.body.innerHTML = html.slice(html.indexOf('<body'), html.indexOf('</body>')).replace(/<script[\s\S]*?<\/script>/g, '');
    ({ ui } = await import('../../js/ui.js'));
    (await import('../../js/storage.js')).storage.load();
    ui._addBackButtons();
  });
  const active = () => document.querySelector('.screen.active').id;

  it('every screen except Home and the results screen has a Back button', () => {
    document.querySelectorAll('.screen').forEach((s) => {
      const has = !!s.querySelector('.back-btn');
      expect(has, s.id).toBe(s.id !== 'screenHome' && s.id !== 'screenPostRun');
    });
  });

  it('does not add a second button when called again', () => {
    ui._addBackButtons();
    expect(document.querySelectorAll('#screenStats .back-btn').length).toBe(1);
  });

  it('Back goes Home from a tab or a page, and says there is nothing behind Home', () => {
    ['screenStats', 'screenSettings', 'screenLeaderboard', 'screenCardBrowser', 'screenFlashcard'].forEach((id) => {
      ui.show(id);
      expect(ui.goBack()).toBe(true);
      expect(active()).toBe('screenHome');
    });
    expect(ui.goBack()).toBe(false);
  });

  it('the card editor and import/export go back to My cards', () => {
    ui.show('screenCardEditor');
    ui.goBack();
    expect(active()).toBe('screenMyCards');
    ui.show('screenImportExport');
    ui.goBack();
    expect(active()).toBe('screenMyCards');
  });

  it('inside a settings section, Back returns to the list of sections first', () => {
    ui.show('screenSettings');
    ui._settingsSection = 'sound';
    ui.renderSettings();
    ui.goBack();
    expect(active()).toBe('screenSettings');
    expect(ui._settingsSection).toBeNull();
    ui.goBack();
    expect(active()).toBe('screenHome');
  });

  it('the on-screen button does the same as goBack', () => {
    ui.show('screenQuests');
    document.querySelector('#screenQuests .back-btn').click();
    expect(active()).toBe('screenHome');
  });
});
