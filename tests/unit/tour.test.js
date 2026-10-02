import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startTour, skipTour, isTourOpen, placeCard, shieldRects } from '../../js/tour.js';

const VIEW = { width: 400, height: 800 };

describe('where the card and the dimming go', () => {
  it('puts the card under the highlight when it fits, above when it does not, and centered with no highlight', () => {
    const card = { width: 300, height: 150 };
    const top = placeCard({ left: 20, top: 100, width: 100, height: 60 }, card, VIEW);
    expect(top.side).toBe('below');
    expect(top.top).toBe(100 + 60 + 12);
    const bottom = placeCard({ left: 20, top: 700, width: 100, height: 60 }, card, VIEW);
    expect(bottom.side).toBe('above');
    expect(bottom.top).toBe(700 - 12 - 150);
    const none = placeCard(null, card, VIEW);
    expect(none.side).toBe('middle');
    expect(none.left).toBe(50);
  });

  it('keeps the card on screen horizontally, and over the lower part when the highlight is nearly the whole screen', () => {
    const card = { width: 300, height: 150 };
    expect(placeCard({ left: 0, top: 100, width: 40, height: 40 }, card, VIEW).left).toBe(12);
    expect(placeCard({ left: 380, top: 100, width: 20, height: 40 }, card, VIEW).left).toBe(400 - 300 - 12);
    const tall = placeCard({ left: 0, top: 0, width: 400, height: 790 }, card, VIEW);
    expect(tall.side).toBe('middle');
    expect(tall.top).toBe(800 - 150 - 12);
  });

  it('four dim rectangles around the hole cover everything else, and none overlaps the hole', () => {
    const hole = { left: 100, top: 200, width: 80, height: 50 };
    const rects = shieldRects(hole, VIEW);
    expect(rects).toHaveLength(4);
    const area = rects.reduce((s, r) => s + r.width * r.height, 0);
    expect(area).toBe(400 * 800 - 80 * 50);
    rects.forEach((r) => {
      const overlaps = r.left < 180 && r.left + r.width > 100 && r.top < 250 && r.top + r.height > 200;
      expect(overlaps).toBe(false);
    });
    expect(shieldRects(null, VIEW)).toEqual([{ left: 0, top: 0, width: 400, height: 800 }]);
  });
});

describe('the tour', () => {
  let rects;
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    window.requestAnimationFrame = (cb) => setTimeout(cb, 16);
    window.cancelAnimationFrame = (id) => clearTimeout(id);
    rects = new Map();
    Element.prototype.getBoundingClientRect = function () { return rects.get(this.id) || { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }; };
  });
  afterEach(() => { skipTour(); vi.useRealTimers(); });

  function button(id, rect, onClick) {
    const b = document.createElement('button');
    b.id = id;
    b.textContent = id;
    document.body.appendChild(b);
    rects.set(id, Object.assign({ right: rect.left + rect.width, bottom: rect.top + rect.height }, rect));
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }
  const title = () => document.querySelector('.tour-card h2').textContent;
  const press = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  it('a counted press moves on without reaching the element; a pass-through press does both', () => {
    const clicked = [];
    const a = button('a', { left: 10, top: 10, width: 100, height: 40 }, () => clicked.push('a'));
    const b = button('b', { left: 10, top: 100, width: 100, height: 40 }, () => clicked.push('b'));
    startTour({ steps: [
      { id: 's1', title: 'One', text: 't', target: '#a', press: 'count' },
      { id: 's2', title: 'Two', text: 't', target: '#b', press: 'pass' },
      { id: 's3', title: 'Three', text: 't', target: null }
    ] });
    expect(isTourOpen()).toBe(true);
    expect(title()).toBe('One');
    press(a);
    vi.advanceTimersByTime(50);
    expect(title()).toBe('Two');
    expect(clicked).toEqual([]); // the PLAY-style button did nothing
    press(b);
    vi.advanceTimersByTime(400);
    expect(clicked).toEqual(['b']); // the tab-style button worked
    expect(title()).toBe('Three');
  });

  it('a press outside the highlight does not move the tour on', () => {
    const a = button('a', { left: 10, top: 10, width: 100, height: 40 });
    const other = button('other', { left: 200, top: 300, width: 50, height: 50 });
    startTour({ steps: [{ id: 's1', title: 'One', text: 't', target: '#a', press: 'count' }, { id: 's2', title: 'Two', text: 't' }] });
    press(other);
    vi.advanceTimersByTime(400);
    expect(title()).toBe('One');
    press(a);
    vi.advanceTimersByTime(50);
    expect(title()).toBe('Two');
  });

  it('a step whose element is not on screen gets a Next button, so the tour cannot get stuck', () => {
    startTour({ steps: [{ id: 's1', title: 'One', text: 't', target: '#missing', press: 'count' }, { id: 's2', title: 'Two', text: 't' }] });
    const next = document.getElementById('tourNextBtn');
    expect(next).not.toBeNull();
    expect(document.querySelector('.tour-hint')).toBeNull();
    next.click();
    vi.advanceTimersByTime(50);
    expect(title()).toBe('Two');
  });

  it('the element can turn up later: the card then asks for the press instead of offering Next', () => {
    startTour({ steps: [{ id: 's1', title: 'One', text: 't', target: '#late', press: 'count' }] });
    expect(document.getElementById('tourNextBtn')).not.toBeNull();
    button('late', { left: 10, top: 10, width: 60, height: 30 });
    vi.advanceTimersByTime(100);
    expect(document.getElementById('tourNextBtn')).toBeNull();
    expect(document.querySelector('.tour-hint')).not.toBeNull();
  });

  it('steps that do not apply are skipped, and before/after hooks run in order', () => {
    const log = [];
    const a = button('a', { left: 10, top: 10, width: 100, height: 40 });
    startTour({ steps: [
      { id: 's1', title: 'One', text: 't', target: '#a', press: 'count', before: () => log.push('before1'), after: () => log.push('after1') },
      { id: 's2', title: 'Two', text: 't', skipIf: () => true },
      { id: 's3', title: 'Three', text: 't', before: () => log.push('before3') }
    ] });
    press(a);
    vi.advanceTimersByTime(50);
    expect(title()).toBe('Three');
    expect(log).toEqual(['before1', 'after1', 'before3']);
  });

  it('finishing the last step reports completed; skipping or Escape reports skipped; one tour at a time', () => {
    const closes = [];
    startTour({ steps: [{ id: 's1', title: 'One', text: 't' }], onClose: (r) => closes.push(r) });
    expect(startTour({ steps: [{ id: 'x', title: 'X', text: 't' }] })).toBe(false);
    expect(document.getElementById('tourNextBtn').textContent).toBe('Finish');
    document.getElementById('tourNextBtn').click();
    vi.advanceTimersByTime(50);
    expect(closes).toEqual([{ completed: true, skipped: false }]);
    expect(isTourOpen()).toBe(false);
    expect(document.getElementById('tourOverlay')).toBeNull();

    startTour({ steps: [{ id: 's1', title: 'One', text: 't' }, { id: 's2', title: 'Two', text: 't' }], onClose: (r) => closes.push(r) });
    document.getElementById('tourSkipBtn').click();
    expect(closes[1]).toEqual({ completed: false, skipped: true });
    startTour({ steps: [{ id: 's1', title: 'One', text: 't' }], onClose: (r) => closes.push(r) });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(closes[2]).toEqual({ completed: false, skipped: true });
    expect(isTourOpen()).toBe(false);
  });

  it('the dimming leaves a hole exactly around the highlighted element (plus a little room)', () => {
    button('a', { left: 100, top: 200, width: 80, height: 50 });
    startTour({ steps: [{ id: 's1', title: 'One', text: 't', target: '#a', press: 'count' }] });
    vi.advanceTimersByTime(100);
    const ring = document.querySelector('.tour-ring');
    expect(ring.style.left).toBe('94px');
    expect(ring.style.top).toBe('194px');
    expect(ring.style.width).toBe('92px');
    expect(ring.style.height).toBe('62px');
  });
});
