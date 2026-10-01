import { describe, it, expect, beforeEach } from 'vitest';
import { VOICES, voiceFor, pickLine, say } from '../../js/charactervoices.js';
import { CHARACTER_MODELS } from '../../js/game/modelcatalog.js';

describe('character voices', () => {
  it('every playable character has its own voice and its own lines', () => {
    CHARACTER_MODELS.forEach((m) => {
      const v = VOICES[m.id];
      expect(v, m.id).toBeTruthy();
      expect(v.cheer.length, m.id).toBeGreaterThanOrEqual(5);
      expect(v.sad.length, m.id).toBeGreaterThanOrEqual(5);
    });
  });

  it('no two characters sound the same, and no line is shared between characters', () => {
    const sounds = Object.values(VOICES).map((v) => `${v.pitch}/${v.rate}`);
    expect(new Set(sounds).size).toBe(sounds.length);
    const lines = Object.values(VOICES).flatMap((v) => [...v.cheer, ...v.sad]);
    expect(new Set(lines).size).toBe(lines.length);
  });

  it('lines are short enough to read in a glance, and sad lines are not cheers', () => {
    Object.values(VOICES).forEach((v) => {
      [...v.cheer, ...v.sad].forEach((l) => expect(l.length, l).toBeLessThanOrEqual(45));
      expect(v.cheer.filter((l) => v.sad.includes(l))).toEqual([]);
    });
  });

  it('an unknown character falls back to the default voice', () => {
    expect(voiceFor('nobody')).toBe(VOICES.avatar_intern);
  });

  it('never repeats the same line twice in a row', () => {
    let last = '';
    for (let i = 0; i < 200; i++) {
      const line = pickLine('avatar_m_robot', 'cheer', { last });
      expect(line).not.toBe(last);
      last = line;
    }
  });

  it('cheers come from the cheer pool and sulks from the sad pool', () => {
    expect(VOICES.avatar_m_orc.cheer).toContain(pickLine('avatar_m_orc', 'cheer'));
    expect(VOICES.avatar_m_orc.sad).toContain(pickLine('avatar_m_orc', 'sad'));
  });
});

describe('speaking a line', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('picks a line and puts nothing on screen', async () => {
    const line = say('avatar_m_ninja', 'cheer', { speak: false, volume: 0 });
    expect(line).toBeTruthy();
    expect(document.getElementById('charBubble')).toBeNull();
    expect(document.body.textContent).not.toContain(line);
    await new Promise((r) => setTimeout(r, 750)); // past the gap that stops a flood of lines
    expect(say('avatar_m_ninja', 'sad', { speak: false, volume: 0 })).toBeTruthy();
  });

  it('speaks with the character\'s own pitch and speed, lower and slower when sad', async () => {
    const spoken = [];
    window.speechSynthesis = { cancel() {}, getVoices: () => [], speak: (u) => spoken.push(u) };
    globalThis.SpeechSynthesisUtterance = function (text) { this.text = text; };
    await new Promise((r) => setTimeout(r, 750));
    say('avatar_m_orc', 'cheer', { speak: true, volume: 0.8 });
    await new Promise((r) => setTimeout(r, 750));
    say('avatar_m_orc', 'sad', { speak: true, volume: 0.8 });
    expect(spoken).toHaveLength(2);
    expect(spoken[0].pitch).toBeGreaterThan(spoken[1].pitch);
    expect(spoken[0].rate).toBeGreaterThan(spoken[1].rate);
    expect(spoken[0].volume).toBeCloseTo(0.8);
    expect(VOICES.avatar_m_orc.cheer).toContain(spoken[0].text);
    delete window.speechSynthesis;
  });

  it('does not talk over itself when answers come very fast', async () => {
    await new Promise((r) => setTimeout(r, 750));
    say('avatar_m_king', 'cheer', { speak: false, volume: 0 });
    expect(say('avatar_m_king', 'cheer', { speak: false, volume: 0 })).toBeNull();
  });
});
