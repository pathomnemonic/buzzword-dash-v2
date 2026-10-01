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

describe('the speech bubble', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('shows who is talking and what they say, happy or sad', async () => {
    const line = say('avatar_m_ninja', 'cheer', { speak: false, volume: 0 });
    const bubble = document.getElementById('charBubble');
    expect(line).toBeTruthy();
    expect(bubble.textContent).toContain('Ninja');
    expect(bubble.textContent).toContain(line);
    expect(bubble.className).toContain('happy');
    await new Promise((r) => setTimeout(r, 750)); // past the gap that stops a flood of lines
    const sulk = say('avatar_m_ninja', 'sad', { speak: false, volume: 0 });
    expect(sulk).toBeTruthy();
    expect(bubble.className).toContain('sad');
  });

  it('does not talk over itself when answers come very fast', () => {
    say('avatar_m_king', 'cheer', { speak: false, volume: 0 });
    expect(say('avatar_m_king', 'cheer', { speak: false, volume: 0 })).toBeNull();
  });
});
