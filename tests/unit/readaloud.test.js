import { describe, it, expect, beforeEach, vi } from 'vitest';
import { planReading, estimateSeconds, countWords, updateWps, DEFAULT_WPS, MAX_RATE, SAFETY_SECONDS } from '../../js/readaloud.js';
import { audio } from '../../js/audio.js';

const clues = ['Episodic hypertension', 'Headache', 'Diaphoresis', 'Palpitations'];
const answers = ['Pheochromocytoma', 'Essential Hypertension', 'Panic Disorder'];

describe('planning a reading', () => {
  it('with plenty of time it reads everything at the natural pace', () => {
    const plan = planReading({ clues, answers, secondsToLock: 14 });
    expect(plan.rate).toBe(1);
    expect(plan.withAnswers).toBe(true);
    expect(plan.text).toContain('Episodic hypertension. Headache. Diaphoresis. Palpitations.');
    expect(plan.text).toContain('Left: Pheochromocytoma. Middle: Essential Hypertension. Right: Panic Disorder.');
  });

  it('speeds up when time is tight, so the whole thing still finishes before the lock', () => {
    const roomy = planReading({ clues, answers, secondsToLock: 14 });
    const tight = planReading({ clues, answers, secondsToLock: 6 });
    expect(tight.rate).toBeGreaterThan(roomy.rate);
    expect(tight.rate).toBeLessThanOrEqual(MAX_RATE);
    // it really does fit: the time it needs at that rate is inside the budget
    expect(estimateSeconds(tight.parts, DEFAULT_WPS) / tight.rate).toBeLessThanOrEqual(6 - SAFETY_SECONDS + 0.01);
  });

  it('leaves the answers to the eyes when they will not fit, but reads every clue', () => {
    const plan = planReading({ clues, answers, secondsToLock: 3.8 });
    expect(plan.withAnswers).toBe(false);
    expect(plan.clueCount).toBe(clues.length);
    expect(plan.text).not.toContain('Left:');
    expect(estimateSeconds(plan.parts, DEFAULT_WPS) / plan.rate).toBeLessThanOrEqual(4.2 - SAFETY_SECONDS + 0.01);
  });

  it('reads only whole clues when even the clues will not fit, never half of one', () => {
    const long = ['Episodic severe hypertension with headache', 'Marked sweating and palpitations', 'Elevated urinary metanephrines', 'Adrenal mass on imaging'];
    const plan = planReading({ clues: long, answers, secondsToLock: 3.2 });
    expect(plan).not.toBeNull();
    expect(plan.clueCount).toBeLessThan(long.length);
    long.slice(0, plan.clueCount).forEach((c) => expect(plan.text).toContain(c));
    long.slice(plan.clueCount).forEach((c) => expect(plan.text).not.toContain(c.split(' ')[0] + ' ' + c.split(' ')[1]));
  });

  it('says nothing when there is no time for even the first clue, or nothing to say', () => {
    expect(planReading({ clues: ['A fairly long first clue that cannot be spoken quickly'], answers, secondsToLock: 1.2 })).toBeNull();
    expect(planReading({ clues, answers, secondsToLock: 0 })).toBeNull();
    expect(planReading({ clues, answers, secondsToLock: 0.5 })).toBeNull();
    expect(planReading({ clues: [], answers, secondsToLock: 10 })).toBeNull();
  });

  it('a slower voice needs more room: the same question is cut down sooner', () => {
    const fast = planReading({ clues, answers, secondsToLock: 7, wps: 3.4 });
    const slow = planReading({ clues, answers, secondsToLock: 7, wps: 1.8 });
    expect(slow.rate).toBeGreaterThanOrEqual(fast.rate);
    expect(slow.withAnswers && !fast.withAnswers).toBe(false);
  });

  it('the time available at each speed (about 14 s at 1x down to 3 s at the top) always gets a plan that fits or stays quiet', () => {
    for (let t = 1; t <= 16; t += 0.5) {
      const plan = planReading({ clues, answers, secondsToLock: t });
      if (plan) expect(estimateSeconds(plan.parts, DEFAULT_WPS) / plan.rate).toBeLessThanOrEqual(t - SAFETY_SECONDS + 0.01);
    }
  });

  it('counts words and learns the voice\'s speed from what it measures, within limits', () => {
    expect(countWords('Left: Pheochromocytoma. Middle: Essential Hypertension.')).toBe(5);
    expect(updateWps(2.6, 30, 10, 1)).toBeCloseTo(2.6 * 0.6 + 3 * 0.4, 5);
    expect(updateWps(2.6, 2, 10, 1)).toBe(2.6); // too few words to trust
    expect(updateWps(2.6, 30, 0.2, 1)).toBe(2.6); // implausibly short
    expect(updateWps(4.4, 400, 10, 1)).toBeLessThanOrEqual(4.5);
  });
});

describe('Read questions aloud', () => {
  let spoken;
  beforeEach(() => {
    localStorage.clear();
    spoken = [];
    window.speechSynthesis = { speak: (u) => spoken.push(u), cancel: vi.fn() };
    globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    audio._settings = { masterVolume: 0.7, voiceVolume: 0.7, ttsEnabled: true };
    audio._paused = false;
    audio._wps = 0;
  });

  it('speaks the planned text at the planned rate', () => {
    const plan = audio.speakQuestion({ clues, answers, secondsToLock: 14 });
    expect(spoken).toHaveLength(1);
    expect(spoken[0].text).toBe(plan.text);
    expect(spoken[0].rate).toBe(plan.rate);
    expect(spoken[0].lang).toBe('en-US');
  });

  it('is silent when switched off or paused, and stops any earlier question first', () => {
    audio._settings.ttsEnabled = false;
    expect(audio.speakQuestion({ clues, answers, secondsToLock: 14 })).toBeNull();
    audio._settings.ttsEnabled = true;
    audio._paused = true;
    expect(audio.speakQuestion({ clues, answers, secondsToLock: 14 })).toBeNull();
    expect(spoken).toHaveLength(0);
    audio._paused = false;
    audio.speakQuestion({ clues, answers, secondsToLock: 14 });
    expect(window.speechSynthesis.cancel).toHaveBeenCalled();
  });

  it('stays quiet when the question cannot be finished in time', () => {
    expect(audio.speakQuestion({ clues, answers, secondsToLock: 0.9 })).toBeNull();
    expect(spoken).toHaveLength(0);
  });

  it('measures how fast the voice really is and remembers it', () => {
    audio.speakQuestion({ clues, answers, secondsToLock: 14 });
    const u = spoken[0];
    const now = Date.now;
    let t = 1000000;
    Date.now = () => t;
    u.onstart();
    t += 6000; // it took 6 seconds
    u.onend();
    Date.now = now;
    const saved = Number(localStorage.getItem('dx_tts_wps'));
    expect(saved).toBeGreaterThan(0);
    expect(saved).not.toBe(2.6);
  });

  it('pausing the game stops the voice', () => {
    audio.speakQuestion({ clues, answers, secondsToLock: 14 });
    audio.pause('user');
    expect(window.speechSynthesis.cancel).toHaveBeenCalled();
  });
});
