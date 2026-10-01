import { describe, it, expect, beforeEach } from 'vitest';
import { FLYER_ICONS, randomFlight, mountFlyers } from '../../js/homefx.js';

function seeded(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

describe('flying medical objects on the home backdrop', () => {
  beforeEach(() => { document.body.innerHTML = '<div id="bgFlyers"></div>'; });

  it('only uses medical or body objects, and each flight is a new random one', () => {
    expect(FLYER_ICONS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(FLYER_ICONS).size).toBe(FLYER_ICONS.length);
    const rand = seeded(7);
    const flights = Array.from({ length: 200 }, () => randomFlight(rand));
    expect(new Set(flights.map((f) => f.icon)).size).toBeGreaterThan(8);
    flights.forEach((f) => {
      expect(FLYER_ICONS).toContain(f.icon);
      expect(Math.hypot(f.dx, f.dy)).toBeGreaterThan(50);    // they fly well out of the middle
      expect(f.dur).toBeGreaterThanOrEqual(5);
      expect(f.end).toBeGreaterThan(2);                        // and get bigger as they come toward you
    });
    // they go in every direction, not just one
    expect(flights.some((f) => f.dx > 20) && flights.some((f) => f.dx < -20)).toBe(true);
    expect(flights.some((f) => f.dy > 20) && flights.some((f) => f.dy < -20)).toBe(true);
  });

  it('fills the layer with flyers that become something else on each pass', () => {
    const layer = document.getElementById('bgFlyers');
    const handle = mountFlyers(layer, { rand: seeded(3), count: 6 });
    expect(layer.children.length).toBe(6);
    const el = layer.children[0];
    const before = [el.textContent, el.style.getPropertyValue('--dx'), el.style.getPropertyValue('--dy')].join('|');
    for (let i = 0; i < 5; i++) el.dispatchEvent(new Event('animationiteration'));
    expect([el.textContent, el.style.getPropertyValue('--dx'), el.style.getPropertyValue('--dy')].join('|')).not.toBe(before);
    handle.stop();
    expect(layer.children.length).toBe(0);
  });

  it('shows nothing for people who asked for reduced motion', () => {
    const layer = document.getElementById('bgFlyers');
    mountFlyers(layer, { reducedMotion: true });
    expect(layer.children.length).toBe(0);
  });

  it('pauses while the page is hidden', () => {
    const layer = document.getElementById('bgFlyers');
    mountFlyers(layer, { count: 2 });
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(layer.classList.contains('paused')).toBe(true);
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(layer.classList.contains('paused')).toBe(false);
  });
});

describe('where the flying objects show', () => {
  it('only on the Home screen', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('css/arcade.css', 'utf8');
    expect(css).toMatch(/body:not\(\[data-screen="screenHome"\]\) #bgFlyers \{ display: none; \}/);
    expect(readFileSync('index.html', 'utf8')).toMatch(/<body data-screen="screenHome">/);
  });
});
