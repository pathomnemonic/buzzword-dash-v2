import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupInput } from '../../js/game/input.js';

function tap(el, t) {
  vi.spyOn(performance, 'now').mockReturnValue(t);
  el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
  el.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
}

describe('double-tap dash can be turned off', () => {
  let el;
  beforeEach(() => { el = document.createElement('div'); document.body.appendChild(el); });

  it('dashes on a double tap by default', () => {
    const rush = vi.fn();
    setupInput(el, { rush }, {});
    tap(el, 1000); tap(el, 1100);
    expect(rush).toHaveBeenCalledTimes(1);
  });

  it('does nothing on a double tap when the setting says button or off', () => {
    const rush = vi.fn();
    let mode = 'button';
    setupInput(el, { rush }, { doubleTap: () => mode === 'double' });
    tap(el, 1000); tap(el, 1100);
    expect(rush).not.toHaveBeenCalled();
    mode = 'double';   // changing the setting takes effect without restarting
    tap(el, 5000); tap(el, 5100);
    expect(rush).toHaveBeenCalledTimes(1);
  });
});
