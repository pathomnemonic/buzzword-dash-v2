import { describe, it, expect } from 'vitest';
import { zoomFor, MAX_ZOOM } from '../../js/fitscreen.js';

describe('scaling a one-page screen to the room it has', () => {
  it('grows by the room available, never below 1 and never past the cap', () => {
    expect(zoomFor(500, 600)).toBeCloseTo(1.2, 5);
    expect(zoomFor(500, 480)).toBe(1);          // does not fit: stays normal (and scrolls)
    expect(zoomFor(300, 2000)).toBe(MAX_ZOOM);  // huge screen: capped
    expect(zoomFor(0, 600)).toBe(1);
    expect(zoomFor(500, 0)).toBe(1);
    expect(zoomFor(NaN, 600)).toBe(1);
    expect(zoomFor(100, 1000, 2)).toBe(2);
  });
});

describe('opening a section does not make the screen shrink', () => {
  it('keeps the size the screen had when the content no longer fits, and goes back to normal for a screen that never fitted', async () => {
    const { fitScreen } = await import('../../js/fitscreen.js');
    document.body.innerHTML = '<div id="screenStats" class="active"><div class="screen-scroll"><div id="c">x</div></div></div>';
    const screen = document.getElementById('screenStats');
    const scroll = screen.querySelector('.screen-scroll');
    scroll.style.padding = '0px';
    // jsdom has no layout: fake the measurements the function reads
    Object.defineProperty(scroll, 'clientHeight', { get: () => 800, configurable: true });
    Object.defineProperty(scroll, 'clientWidth', { get: () => 1000, configurable: true });
    Object.defineProperty(scroll, 'scrollHeight', { get: () => 800, configurable: true });
    let contentHeight = 400;
    const wrapHeight = () => contentHeight;
    const proto = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () { return this.classList && this.classList.contains('fit-zoom') ? { height: wrapHeight() * (parseFloat(this.style.zoom) || 1), width: 0, top: 0, left: 0, right: 0, bottom: 0 } : proto.call(this); };
    try {
      const closed = fitScreen(screen);
      expect(closed).toBeGreaterThan(1.3);
      contentHeight = 1400; // a section was opened: more than fits
      const open = fitScreen(screen);
      expect(open).toBeCloseTo(closed, 2);
      expect(screen.querySelector('.fit-zoom').style.zoom).toBe(String(Math.round(closed * 1000) / 1000));
      // a screen that never fitted has nothing to keep
      const other = document.createElement('div');
      other.id = 'screenQuests'; other.className = 'active';
      other.innerHTML = '<div class="screen-scroll"><div>y</div></div>';
      document.body.appendChild(other);
      const s2 = other.querySelector('.screen-scroll');
      s2.style.padding = '0px';
      Object.defineProperty(s2, 'clientHeight', { get: () => 800, configurable: true });
      Object.defineProperty(s2, 'clientWidth', { get: () => 1000, configurable: true });
      expect(fitScreen(other)).toBe(1);
    } finally {
      Element.prototype.getBoundingClientRect = proto;
    }
  });
});
