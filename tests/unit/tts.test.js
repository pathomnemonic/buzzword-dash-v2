import { describe, it, expect, beforeEach, vi } from 'vitest';
import { canSpeak, speak, cancelSpeech, setNativePluginForTest } from '../../js/tts.js';

describe('speech in the browser and in the app', () => {
  beforeEach(() => { setNativePluginForTest(null); });

  it('uses the browser voice when there is one, and says so when there is not', () => {
    expect(canSpeak()).toBe(true); // (the test setup provides a speech engine)
    const real = window.speechSynthesis;
    Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true });
    expect(canSpeak()).toBe(false);
    Object.defineProperty(window, 'speechSynthesis', { value: real, configurable: true });
  });

  it('inside the app it speaks through the phone\'s own voice, with the rate and language asked for', async () => {
    const plugin = { speak: vi.fn(async () => {}), stop: vi.fn(async () => {}) };
    setNativePluginForTest(plugin);
    const real = window.speechSynthesis;
    Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true }); // a web view without speech
    expect(canSpeak()).toBe(true);
    const events = [];
    await speak('Clue. Fever and cough.', { rate: 1.2, volume: 0.8, onstart: () => events.push('start'), onend: () => events.push('end') });
    expect(plugin.speak).toHaveBeenCalledWith(expect.objectContaining({ text: 'Clue. Fever and cough.', lang: 'en-US', rate: 1.2, volume: 0.8, queueStrategy: 0 }));
    expect(events).toEqual(['start', 'end']);
    cancelSpeech();
    await Promise.resolve();
    expect(plugin.stop).toHaveBeenCalled();
    Object.defineProperty(window, 'speechSynthesis', { value: real, configurable: true });
  });

  it('a failed phone voice just ends the utterance instead of hanging the hands-free run', async () => {
    setNativePluginForTest({ speak: vi.fn(async () => { throw new Error('no engine'); }), stop: vi.fn(async () => {}) });
    await expect(speak('hello')).resolves.toBeUndefined();
  });
});
