import { describe, it, expect, beforeEach, vi } from 'vitest';
import { hexToHsv, hsvToHex, hexString, parseHex, createColorWheel } from '../../js/colorwheel.js';

describe('color math', () => {
  it('turns colors into hue, saturation and brightness and back without drifting', () => {
    [0xff0000, 0x00ff00, 0x0000ff, 0x1fa3b5, 0xe86fa0, 0xf2f2f2, 0x9a2f45, 0x808080, 0xffffff].forEach((hex) => {
      const { h, s, v } = hexToHsv(hex);
      expect(hsvToHex(h, s, v)).toBe(hex);
    });
  });

  it('knows the primary hues', () => {
    expect(hexToHsv(0xff0000).h).toBe(0);
    expect(Math.round(hexToHsv(0x00ff00).h)).toBe(120);
    expect(Math.round(hexToHsv(0x0000ff).h)).toBe(240);
    expect(hsvToHex(60, 1, 1)).toBe(0xffff00);
    expect(hsvToHex(300, 1, 1)).toBe(0xff00ff);
  });

  it('never produces 0, which means "Original" everywhere else', () => {
    expect(hsvToHex(0, 0, 0)).toBe(0x010101);
    expect(parseHex('#000000')).toBe(0x010101);
  });

  it('reads color codes in the usual forms and rejects the rest', () => {
    expect(parseHex('#1fa3b5')).toBe(0x1fa3b5);
    expect(parseHex('1FA3B5')).toBe(0x1fa3b5);
    expect(parseHex(' #f00 ')).toBe(0xff0000);
    ['', 'red', '#12', '#12345', '#1234567', '#gg0000', null, undefined].forEach((bad) => expect(parseHex(bad)).toBeNull());
    expect(hexString(0x1fa3b5)).toBe('#1fa3b5');
    expect(hexString(0x0000ff)).toBe('#0000ff');
  });

  it('wraps hues and clamps saturation and brightness', () => {
    expect(hsvToHex(360, 1, 1)).toBe(hsvToHex(0, 1, 1));
    expect(hsvToHex(-120, 1, 1)).toBe(hsvToHex(240, 1, 1));
    expect(hsvToHex(0, 5, 5)).toBe(0xff0000);
  });
});

describe('the wheel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    HTMLCanvasElement.prototype.getContext = () => null; // jsdom has no canvas; the wheel must still work
  });

  it('shows the starting color in the code field', () => {
    const w = createColorWheel({ hex: 0x9a2f45 });
    expect(w.el.querySelector('.cw-hex').value).toBe('#9a2f45');
    expect(w.el.hasAttribute('data-no-swipe')).toBe(true); // dragging the wheel must not swipe between tabs
  });

  it('typing a code picks that color; a bad code is flagged and picks nothing', () => {
    const onCommit = vi.fn();
    const w = createColorWheel({ hex: 0x9a2f45, onCommit });
    const field = w.el.querySelector('.cw-hex');
    field.value = '#33ccff';
    field.dispatchEvent(new Event('change'));
    expect(onCommit).toHaveBeenLastCalledWith(0x33ccff);
    field.value = '#nope';
    field.dispatchEvent(new Event('change'));
    expect(field.classList.contains('bad')).toBe(true);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('the arrow keys move around the wheel and each press is a choice', () => {
    const onCommit = vi.fn();
    const w = createColorWheel({ hex: 0xff0000, onCommit });
    const canvas = w.el.querySelector('canvas');
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(onCommit).toHaveBeenCalledTimes(1);
    const after = onCommit.mock.calls[0][0];
    expect(hexToHsv(after).h).toBeCloseTo(3, 0);
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));
    expect(hexToHsv(onCommit.mock.calls[1][0]).h).toBeCloseTo(18, 0);
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(onCommit).toHaveBeenCalledTimes(2);
  });

  it('the brightness slider darkens the color and commits when released', () => {
    const onCommit = vi.fn();
    const onInput = vi.fn();
    const w = createColorWheel({ hex: 0xff0000, onCommit, onInput });
    const slider = w.el.querySelector('.cw-bright');
    slider.value = '50';
    slider.dispatchEvent(new Event('input'));
    expect(onInput).toHaveBeenLastCalledWith(0x800000);
    expect(onCommit).not.toHaveBeenCalled();
    slider.dispatchEvent(new Event('change'));
    expect(onCommit).toHaveBeenCalledWith(0x800000);
  });

  it('dragging on the wheel picks by angle and distance from the middle', () => {
    const onCommit = vi.fn();
    const w = createColorWheel({ hex: 0xff0000, onCommit });
    const canvas = w.el.querySelector('canvas');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200 });
    canvas.setPointerCapture = () => {};
    const ev = (type, x, y) => Object.assign(new Event(type, { cancelable: true }), { clientX: x, clientY: y, pointerId: 1 });
    canvas.dispatchEvent(ev('pointerdown', 200, 100)); // far right of the wheel: red, fully saturated
    canvas.dispatchEvent(ev('pointermove', 100, 200)); // straight down: a quarter turn (90 degrees), full saturation
    canvas.dispatchEvent(ev('pointerup', 100, 200));
    expect(onCommit).toHaveBeenCalledTimes(1);
    const { h, s } = hexToHsv(onCommit.mock.calls[0][0]);
    expect(Math.round(h)).toBe(90);
    expect(s).toBeCloseTo(1, 1);
  });
});
