import { describe, it, expect, vi } from 'vitest';
import { MusicGenerator, audio } from '../../js/audio.js';

// The constant tapping behind the busy tracks (the red Vascular Rush especially) is gone.
describe('no tapping behind the music', () => {
  it('hi-hats make no sound at all', () => {
    const ctx = new Proxy({}, { get() { throw new Error('a hi-hat must not touch the audio graph'); } });
    expect(() => MusicGenerator.prototype._playHiHat.call({ ctx }, 1, 0)).not.toThrow();
  });

  it('no environmental beeps are scheduled, on any track', () => {
    vi.useFakeTimers();
    const ctx = { currentTime: 0, createGain: () => { throw new Error('nothing should be created'); }, createOscillator: () => { throw new Error('nothing should be created'); } };
    audio.ctx = ctx;
    audio._ambientBus = {};
    ['Vascular Rush', 'Neon ER', 'Cellular Matrix', 'Cardiac Pulse'].forEach((track) => {
      audio.startAmbient(track);
      expect(audio.ambientTimers.length).toBe(0);
      vi.advanceTimersByTime(30000);
    });
    audio.stopAmbient();
    vi.useRealTimers();
  });
});
