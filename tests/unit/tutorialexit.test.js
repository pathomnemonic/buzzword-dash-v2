import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { confirmExitTutorial, isExitConfirmOpen, dismissExitConfirm } from '../../js/tutorialexit.js';
import { startTour, skipTour } from '../../js/tour.js';

describe('the exit warning', () => {
  beforeEach(() => { document.body.innerHTML = ''; });
  afterEach(() => { dismissExitConfirm(); });

  it('asks, says where to find the tutorial again, and does nothing until answered', () => {
    const onExit = vi.fn();
    expect(confirmExitTutorial({ onExit })).toBe(true);
    const box = document.getElementById('tutExitConfirm');
    expect(box.textContent).toContain('Exit the tutorial?');
    expect(box.textContent).toContain('How to play');
    expect(box.textContent).toContain('Home screen');
    expect(onExit).not.toHaveBeenCalled();
    expect(isExitConfirmOpen()).toBe(true);
  });

  it('Exit tutorial leaves, Keep going stays, and Escape means keep going', () => {
    const onExit = vi.fn();
    const onStay = vi.fn();
    confirmExitTutorial({ onExit, onStay });
    document.getElementById('tutExitStay').click();
    expect(onStay).toHaveBeenCalledTimes(1);
    expect(onExit).not.toHaveBeenCalled();
    expect(document.getElementById('tutExitConfirm')).toBeNull();

    confirmExitTutorial({ onExit, onStay });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onStay).toHaveBeenCalledTimes(2);
    expect(onExit).not.toHaveBeenCalled();

    confirmExitTutorial({ onExit });
    document.getElementById('tutExitYes').click();
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(isExitConfirmOpen()).toBe(false);
  });

  it('only one box at a time', () => {
    expect(confirmExitTutorial({ onExit() {} })).toBe(true);
    expect(confirmExitTutorial({ onExit() {} })).toBe(false);
    expect(document.querySelectorAll('#tutExitConfirm')).toHaveLength(1);
  });

  it('the tour has a × and no Skip button, and hands the question to its caller', () => {
    const requestClose = vi.fn();
    startTour({ steps: [{ id: 's1', title: 'One', text: 't' }, { id: 's2', title: 'Two', text: 't' }], requestClose });
    expect(document.getElementById('tourCloseBtn')).not.toBeNull();
    expect(document.getElementById('tourSkipBtn')).toBeNull();
    expect([...document.querySelectorAll('.tour-card button')].some((b) => /skip/i.test(b.textContent))).toBe(false);
    document.getElementById('tourCloseBtn').click();
    expect(requestClose).toHaveBeenCalledTimes(1);
    expect(document.getElementById('tourOverlay')).not.toBeNull(); // still open until the caller says so
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(requestClose).toHaveBeenCalledTimes(2);
    skipTour();
  });
});
