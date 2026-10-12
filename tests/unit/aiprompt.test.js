import { describe, it, expect } from 'vitest';
import { buildAiPrompt, parseAiReply } from '../../js/importguide.js';

const card = (o) => Object.assign({ subj: 'Cardiology', bw: ['Fever', 'New murmur', 'Janeway lesions'], ans: 'Infective endocarditis', d: ['Rheumatic fever', 'Atrial myxoma'], tp: 'x', ww: { 'Rheumatic fever': 'a', 'Atrial myxoma': 'b' } }, o || {});

describe('the improved AI prompt', () => {
  const p = buildAiPrompt();
  it('explains the game, the 3-second rule and the three gates', () => {
    expect(p).toMatch(/about 3 seconds/);
    expect(p).toMatch(/THREE options/);
    expect(p).toMatch(/exactly one defensible/);
  });
  it('asks for terms not sentences, no answer in the clues, sibling distractors, and flips what-is-X cards', () => {
    expect(p).toMatch(/a TERM, not a sentence/);
    expect(p).toMatch(/Never put the answer/);
    expect(p).toMatch(/Never opposites/);
    expect(p).toMatch(/flip it/);
  });
  it('lists when to skip and shows bad-versus-good examples', () => {
    expect(p).toMatch(/SKIP the card/);
    expect(p).toMatch(/Bad vs good/);
  });
});

describe('the parser quality screens', () => {
  it('keeps a good card and reports nothing skipped', () => {
    const r = parseAiReply(JSON.stringify([card()]));
    expect(r.cards).toHaveLength(1);
    expect(r.skipped).toBe(0);
  });
  it('skips sentence-length answers and says why', () => {
    const r = parseAiReply(JSON.stringify([card(), card({ ans: 'A hypermetabolic crisis of skeletal muscle triggered by volatile anesthetics given earlier', bw: ['Volatile anesthetics', 'Rigidity'] })]));
    expect(r.cards).toHaveLength(1);
    expect(r.reasons['the answer was a whole sentence']).toBe(1);
  });
  it('skips cards whose clues give the answer away', () => {
    const r = parseAiReply(JSON.stringify([card(), card({ bw: ['Narrowed descending aorta', 'Hypertension'], ans: 'Narrowing of the descending aorta' })]));
    expect(r.cards).toHaveLength(1);
    expect(r.reasons['a clue gave the answer away']).toBe(1);
  });
  it('skips duplicates with the same answer and wrong answers', () => {
    const r = parseAiReply(JSON.stringify([card(), card({ bw: ['Roth spots', 'Fever'] })]));
    expect(r.cards).toHaveLength(1);
    expect(r.reasons['a duplicate card']).toBe(1);
  });
  it('does not mistake a short numeric answer for a leak', () => {
    const r = parseAiReply(JSON.stringify([card({ bw: ['Menorrhagia', 'Volume per cycle'], ans: 'More than 80 ml', d: ['More than 40 ml', 'More than 120 ml'] })]));
    expect(r.cards).toHaveLength(1);
  });
});
