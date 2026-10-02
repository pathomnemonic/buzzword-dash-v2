import { describe, it, expect } from 'vitest';
import { PROFILES, VOWELS, profileFor, pickReaction, reactionLength, playReaction, say } from '../../js/charactervoices.js';
import { CHARACTER_MODELS } from '../../js/game/modelcatalog.js';

/** A stand-in AudioContext that records what is built, so the sound design can be checked without a speaker. */
function fakeContext() {
  const made = { oscillators: [], filters: [], buffers: 0, started: 0, maxTime: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = (extra = {}) => ({ connect() {}, ...extra });
  const ctx = {
    currentTime: 0, sampleRate: 44100,
    createBuffer: () => { made.buffers++; return { sampleRate: 44100, getChannelData: () => new Float32Array(10) }; },
    createOscillator: () => { const o = node({ type: '', frequency: param(), start() { made.started++; }, stop(t) { made.maxTime = Math.max(made.maxTime, t); } }); made.oscillators.push(o); return o; },
    createBufferSource: () => node({ buffer: null, start() { made.started++; }, stop(t) { made.maxTime = Math.max(made.maxTime, t); } }),
    createBiquadFilter: () => { const f = node({ type: '', frequency: param(), Q: param() }); made.filters.push(f); return f; },
    createGain: () => node({ gain: param() })
  };
  return { ctx, made };
}

describe('character voices', () => {
  it('every playable character has a voice of its own', () => {
    CHARACTER_MODELS.forEach((m) => expect(PROFILES[m.id], m.id).toBeTruthy());
    const pitches = Object.values(PROFILES).map((p) => p.f0);
    expect(new Set(pitches).size).toBe(pitches.length);
  });

  it('an unknown character falls back to the default voice', () => {
    expect(profileFor('nobody')).toBe(PROFILES.avatar_intern);
  });

  it('cheers and groans are different sounds, and never repeat back to back', () => {
    let last = '';
    for (let i = 0; i < 100; i++) {
      const r = pickReaction('cheer', { last });
      expect(r.id).not.toBe(last);
      last = r.id;
    }
    const cheer = pickReaction('cheer', { rand: () => 0 });
    const groan = pickReaction('sad', { rand: () => 0 });
    expect(cheer.id).not.toBe(groan.id);
    // a cheer climbs and a groan falls
    expect(cheer.syl[cheer.syl.length - 1].p[1]).toBeGreaterThan(cheer.syl[0].p[0]);
    expect(groan.syl[groan.syl.length - 1].p[1]).toBeLessThan(groan.syl[0].p[0]);
  });

  it('every reaction is short enough not to get in the way, and uses real vowels', () => {
    ['cheer', 'sad'].forEach((kind) => {
      for (let i = 0; i < 20; i++) {
        const r = pickReaction(kind, { rand: () => i / 20 });
        expect(reactionLength(r), r.id).toBeLessThan(1.1);
        r.syl.forEach((s) => s.v.split('').forEach((v) => expect(VOWELS[v], `${r.id} ${v}`).toBeTruthy()));
      }
    });
  });

  it('builds a sound for every character, cheer and groan, that ends within about two seconds', () => {
    Object.keys(PROFILES).forEach((id) => {
      ['cheer', 'sad'].forEach((kind) => {
        const { ctx, made } = fakeContext();
        const length = playReaction(ctx, {}, id, kind);
        expect(length, `${id} ${kind}`).toBeGreaterThan(0.2);
        expect(length, `${id} ${kind}`).toBeLessThan(1.8);
        expect(made.started, `${id} ${kind}`).toBeGreaterThan(0);
        expect(made.maxTime, `${id} ${kind}`).toBeLessThan(2.2);
      });
    });
  });

  it('a person voice is a buzzing source through vowel filters; the robot and alien make their own noises', () => {
    const person = fakeContext();
    playReaction(person.ctx, {}, 'avatar_intern', 'cheer');
    expect(person.made.oscillators.some((o) => o.type === 'sawtooth')).toBe(true);
    expect(person.made.filters.filter((f) => f.type === 'bandpass').length).toBeGreaterThanOrEqual(3);
    const robot = fakeContext();
    playReaction(robot.ctx, {}, 'avatar_m_robot', 'sad');
    expect(robot.made.oscillators.some((o) => o.type === 'square')).toBe(true);
    const alien = fakeContext();
    playReaction(alien.ctx, {}, 'avatar_m_alien', 'cheer');
    expect(alien.made.oscillators.some((o) => o.type === 'sine')).toBe(true);
  });

  it('does not play over itself when answers come very fast, and does nothing without audio', async () => {
    expect(say(null, 'avatar_intern', 'cheer')).toBeNull();
    await new Promise((r) => setTimeout(r, 650));
    const { ctx } = fakeContext();
    expect(say({ ctx, dest: {} }, 'avatar_m_king', 'cheer')).toBeTruthy();
    expect(say({ ctx, dest: {} }, 'avatar_m_king', 'cheer')).toBeNull();
  });
});
