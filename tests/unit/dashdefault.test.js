import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveDashControl, shouldAskDoubleTap, attachDashPrompt, DASH_PROMPT_AFTER_RUNS } from '../../js/dashcontrol.js';
import { buildSteps } from '../../js/tutorial.js';
import { getControlText } from '../../js/controlhints.js';

describe('the dash defaults to the button on phones', () => {
  it('Automatic is the button on touch devices and the double tap elsewhere', () => {
    expect(resolveDashControl('auto', true)).toBe('button');
    expect(resolveDashControl(undefined, true)).toBe('button');
    expect(resolveDashControl('auto', false)).toBe('double');
  });
  it('an explicit choice always wins', () => {
    ['double', 'button', 'off'].forEach((m) => {
      expect(resolveDashControl(m, true)).toBe(m);
      expect(resolveDashControl(m, false)).toBe(m);
    });
  });
});

describe('asking about the double tap', () => {
  const base = { setting: 'auto', touchFirst: true, runs: DASH_PROMPT_AFTER_RUNS, asked: false };
  it('waits for 3 games, and only asks phone players who were given the default', () => {
    expect(DASH_PROMPT_AFTER_RUNS).toBe(3);
    expect(shouldAskDoubleTap({ ...base, runs: 2 })).toBe(false);
    expect(shouldAskDoubleTap(base)).toBe(true);
    expect(shouldAskDoubleTap({ ...base, touchFirst: false })).toBe(false);
    expect(shouldAskDoubleTap({ ...base, setting: 'button' })).toBe(false); // chose it themselves
    expect(shouldAskDoubleTap({ ...base, setting: 'double' })).toBe(false);
    expect(shouldAskDoubleTap({ ...base, asked: true })).toBe(false);
  });
});

describe('the question card', () => {
  let storage;
  let container;
  beforeEach(async () => {
    localStorage.clear();
    window.matchMedia = (q) => ({ matches: q.includes('coarse'), addEventListener() {}, removeEventListener() {} });
    ({ storage } = await import('../../js/storage.js'));
    storage.load();
    storage.data.settings.runsFinished = 3;
    document.body.innerHTML = '<div id="c"><h2>Case Review</h2><p>x</p></div>';
    container = document.getElementById('c');
  });

  it('explains the risk and how to switch back, and stays on every results screen until one button is pressed', () => {
    expect(attachDashPrompt(container, () => {})).toBe(true);
    const text = container.querySelector('.dash-prompt').textContent;
    expect(text).toMatch(/by accident/);
    expect(text).toMatch(/Settings/);
    expect(storage.get('dashPromptSeen')).toBe(false); // seeing it is not an answer
    // the next results screens (the card was left alone, or the app was closed): it is still there
    container.querySelector('.dash-prompt').remove();
    expect(attachDashPrompt(container, () => {})).toBe(true);
    container.querySelector('.dash-prompt').remove();
    expect(attachDashPrompt(container, () => {})).toBe(true);
  });

  it('after either button it is never shown again', () => {
    attachDashPrompt(container, () => {});
    container.querySelector('.btn-outline').click(); // Keep the button
    expect(container.querySelector('.dash-prompt')).toBeNull();
    expect(storage.get('dashPromptSeen')).toBe(true);
    expect(attachDashPrompt(container, () => {})).toBe(false);

    storage.data.settings.dashPromptSeen = false;
    storage.data.settings.dashControl = 'auto';
    attachDashPrompt(container, () => {});
    container.querySelector('.btn-gold').click(); // Turn on double-tap
    expect(storage.get('dashControl')).toBe('double');
    expect(attachDashPrompt(container, () => {})).toBe(false);
  });

  it('"Turn on double-tap" saves the choice; "Keep the button" leaves the default', () => {
    const toast = vi.fn();
    attachDashPrompt(container, toast);
    container.querySelector('.btn-gold').click();
    expect(storage.get('dashControl')).toBe('double');
    expect(toast).toHaveBeenCalled();
    storage.data.settings.dashControl = 'auto';
    storage.data.settings.dashPromptSeen = false;
    attachDashPrompt(container, toast);
    container.querySelector('.btn-outline').click();
    expect(storage.get('dashControl')).toBe('auto');
    expect(storage.get('dashPromptSeen')).toBe(true);
  });

  it('does not ask on a computer', () => {
    window.matchMedia = (q) => ({ matches: q.includes('fine'), addEventListener() {}, removeEventListener() {} });
    expect(attachDashPrompt(container, () => {})).toBe(false);
  });
});

describe('saves from before the phone default', () => {
  it('players left on the old double-tap default move to Automatic once, and a later choice sticks', async () => {
    localStorage.clear();
    const { storage } = await import('../../js/storage.js');
    storage.load();
    storage.data.settings.dashControl = 'double';
    storage.data.settings.dashDefaultSeen = false;
    storage._ensureInvariants();
    expect(storage.get('dashControl')).toBe('auto');
    storage.data.settings.dashControl = 'double';
    storage._ensureInvariants();
    expect(storage.get('dashControl')).toBe('double');
  });
});

describe('the tutorial teaches the dash you actually use', () => {
  const touch = getControlText(true, 'button');
  const rush = (controls, dash) => buildSteps(controls, dash).find((s) => s.id === 'rush');
  it('button: a Dash button to tap', () => {
    expect(rush(touch, 'button').dashButton).toBe(true);
    expect(rush(touch, 'button').prompt).toMatch(/Dash button/);
  });
  it('double-tap: the double-tap step, with no button', () => {
    const c = getControlText(true, 'double');
    expect(rush(c, 'double').dashButton).toBe(false);
    expect(rush(c, 'double').prompt).toMatch(/Double-tap/);
  });
  it('keyboard players are taught the keys whatever the setting', () => {
    expect(rush(getControlText(false), 'button').prompt).toMatch(/Shift or Space/);
    expect(rush(getControlText(false), 'button').dashButton).toBe(false);
  });
});
