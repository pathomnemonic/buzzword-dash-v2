import { describe, it, expect, beforeEach } from 'vitest';
import { storage } from '../../js/storage.js';
import { getKeyBindings, setKey, clearKey, resetKeyBindings, actionForKey, keyLabel, keyProblem, isDefaultBindings, keysPhrase, DEFAULT_KEY_BINDINGS } from '../../js/keybindings.js';
import { setupInput } from '../../js/game/input.js';

describe('key bindings', () => {
  beforeEach(() => { storage.load(); resetKeyBindings(); });

  it('starts with the standard keys, with Ctrl for the Auto-Pilot', () => {
    expect(getKeyBindings().autoPilot).toEqual(['Control']);
    expect(getKeyBindings().rush).toEqual(['Shift', ' ']);
    expect(isDefaultBindings()).toBe(true);
    expect(keyLabel('Control')).toBe('Ctrl');
    expect(keysPhrase('rush')).toBe('Shift or Space');
  });

  it('changes one key, saves only the change, and a key can only do one thing', () => {
    expect(setKey('autoPilot', 0, 'e')).toEqual({ ok: true });
    expect(getKeyBindings().autoPilot).toEqual(['e']);
    const r = setKey('jump', 0, 'e');
    expect(r.tookFrom).toBe('autoPilot');
    expect(getKeyBindings().autoPilot).toEqual([]);
    expect(actionForKey('E')).toBe('jump');
    expect(getKeyBindings().moveLeft).toEqual(DEFAULT_KEY_BINDINGS.moveLeft);
    expect(isDefaultBindings()).toBe(false);
  });

  it('refuses keys the page needs, Escape for anything but pause, and an unknown action', () => {
    expect(setKey('jump', 0, 'Tab').ok).toBe(false);
    expect(setKey('jump', 0, 'Enter').ok).toBe(false);
    expect(setKey('jump', 0, 'Escape').ok).toBe(false);
    expect(keyProblem('pause', 'Escape')).toBe('');
    expect(setKey('fly', 0, 'f').ok).toBe(false);
  });

  it('fills the second slot without moving the first, and can empty a slot', () => {
    setKey('slide', 1, 'x');
    expect(getKeyBindings().slide).toEqual(['ArrowDown', 'x']);
    clearKey('slide', 0);
    expect(getKeyBindings().slide).toEqual(['x']);
  });

  it('survives damaged saved data', () => {
    storage.set('keyBindings', { jump: 'w', rush: [1, null, 'Shift', 'Shift', 'a', 'b'], pause: 5 });
    const b = getKeyBindings();
    expect(b.jump).toEqual([]);
    expect(b.rush).toEqual(['Shift', 'a']);
    expect(b.pause).toEqual([]);
    expect(b.moveLeft).toEqual(['ArrowLeft', 'a']);
  });

  it('the input uses the keys now in force, and Ctrl fires the Auto-Pilot once (not on key repeat)', () => {
    let used = 0; let jumped = 0;
    const el = document.createElement('div');
    const off = setupInput(el, { autoPilot: () => { used++; }, jump: () => { jumped++; } }, { enabled: true, keyBindings: getKeyBindings });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', repeat: true }));
    expect(used).toBe(1);
    setKey('jump', 0, 'j');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'J' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' })); // no longer jumps
    expect(jumped).toBe(1);
    off();
  });
});
