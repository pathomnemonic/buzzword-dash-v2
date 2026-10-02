import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { audio, MusicGenerator, MENU_THEME } from '../../js/audio.js';

// The music can never be left playing out of sight: not after a theme change on top of another, not after
// stopping in the middle of a crossfade, not after leaving the app.

function fakeCtx() {
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} });
  const node = () => ({ gain: param(), frequency: param(), Q: param(), connect() {}, disconnect() {} });
  const ctx = { currentTime: 0, state: 'running', createGain: node, createBiquadFilter: node, suspend: vi.fn(() => { ctx.state = 'suspended'; }), resume: vi.fn(() => { ctx.state = 'running'; }), close() {} };
  return ctx;
}

const playing = () => audio._allGenerators.filter((g) => g.playing);

describe('music lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MusicGenerator.prototype._schedule = () => {};
    audio.stopMusic();
    audio.ctx = fakeCtx();
    audio._musicBus = {};
    audio._paused = false;
    audio._allGenerators = [];
    audio._musicTheme = null;
    audio._settings = { masterVolume: 1, musicVolume: 1, sfxVolume: 1, voiceVolume: 1, ttsEnabled: false };
  });
  afterEach(() => { audio.stopMusic(); vi.useRealTimers(); });

  it('starts the menu track, and asking for the same track again does nothing', () => {
    audio.startMusic();
    expect(audio.musicGenerator.skinName).toBe(MENU_THEME);
    const gen = audio.musicGenerator;
    audio.setMusicTheme(MENU_THEME, 1);
    expect(audio.musicGenerator).toBe(gen);
    expect(audio._allGenerators).toHaveLength(1);
  });

  it('a run crossfades to its own track and, when it ends, back to the menu track, leaving one generator', () => {
    audio.startMusic();
    audio.setMusicTheme('Vascular Rush', 1);
    expect(audio._allGenerators.length).toBe(2); // old fading out, new fading in
    vi.advanceTimersByTime(2000);
    expect(audio._allGenerators).toHaveLength(1);
    expect(audio.musicGenerator.skinName).toBe('Vascular Rush');
    audio.setMusicTheme(MENU_THEME, 1);
    vi.advanceTimersByTime(2000);
    expect(audio._allGenerators).toHaveLength(1);
    expect(audio.musicGenerator.skinName).toBe(MENU_THEME);
    expect(playing()).toHaveLength(1);
  });

  it('two theme changes close together leave only the last track', () => {
    audio.startMusic();
    audio.setMusicTheme('Vascular Rush', 3);
    vi.advanceTimersByTime(500);
    audio.setMusicTheme('Cardiac Pulse', 3);
    vi.advanceTimersByTime(10000);
    expect(audio._allGenerators).toHaveLength(1);
    expect(audio.musicGenerator.skinName).toBe('Cardiac Pulse');
    expect(playing()).toHaveLength(1);
  });

  it('stopping in the middle of a crossfade silences everything (the old bug left the new track playing)', () => {
    audio.startMusic();
    audio.setMusicTheme('Vascular Rush', 3);
    vi.advanceTimersByTime(500);
    audio.setMusicTheme('Cardiac Pulse', 3);
    vi.advanceTimersByTime(500);
    audio.stopMusic();
    expect(audio._allGenerators).toHaveLength(0);
    vi.advanceTimersByTime(20000);
    expect(audio._allGenerators).toHaveLength(0);
    expect(audio.musicGenerator).toBeNull();
    expect(audio.crossfadeGenerator).toBeNull();
    expect(audio.musicPlaying).toBe(false);
  });

  it('a track chosen while music is off is remembered and plays when music starts', () => {
    audio.setMusicTheme('Cardiac Pulse', 1);
    expect(audio._allGenerators).toHaveLength(0);
    audio.startMusic();
    expect(audio.musicGenerator.skinName).toBe('Cardiac Pulse');
  });

  it('leaving the app stops the music and suspends the audio; coming back plays the current track again', () => {
    audio.startMusic();
    audio.setMusicTheme('Vascular Rush', 1);
    vi.advanceTimersByTime(2000);
    audio.pause('hidden');
    expect(playing()).toHaveLength(0);
    expect(audio.ctx.suspend).toHaveBeenCalled();
    audio.resume('visible');
    expect(audio.ctx.resume).toHaveBeenCalled();
    expect(playing()).toHaveLength(1);
    expect(audio.musicGenerator.skinName).toBe('Vascular Rush');
  });

  it('pausing in the middle of a crossfade and resuming still ends with one track', () => {
    audio.startMusic();
    audio.setMusicTheme('Vascular Rush', 3);
    vi.advanceTimersByTime(1000);
    audio.pause('hidden');
    audio.resume('visible');
    vi.advanceTimersByTime(10000);
    expect(audio._allGenerators).toHaveLength(1);
    expect(audio.musicGenerator.skinName).toBe('Vascular Rush');
    expect(playing()).toHaveLength(1);
  });

  it('a stopped generator brings its sound down at once, so notes already sounding do not ring on', () => {
    audio.startMusic();
    const gen = audio.musicGenerator;
    const spy = vi.spyOn(gen.outputGain.gain, 'setTargetAtTime');
    gen.stop();
    expect(spy).toHaveBeenCalledWith(0, expect.any(Number), expect.any(Number));
  });
});
