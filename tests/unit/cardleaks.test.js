import { describe, it, expect } from 'vitest';
import { clueLeaksAnswer, genericWords, words, stem } from '../../js/cardleaks.js';
import { CARDS, getLoadReport } from '../../js/cards.js';

// A small deck in which "syndrome" and "acute" each name eight answers, so both are generic
const generic = genericWords([
  'Nephrotic Syndrome', 'Nephritic Syndrome', 'Cushing Syndrome', 'Carcinoid Syndrome', 'Horner Syndrome', 'Marfan Syndrome',
  'Down Syndrome', 'Turner Syndrome',
  'Acute Pancreatitis', 'Acute Cholecystitis', 'Acute Appendicitis', 'Acute Gastritis', 'Acute Bronchitis', 'Acute Otitis',
  'Acute Sinusitis', 'Acute Hepatitis'
]);

describe('what counts as a leak', () => {
  it('matches whole words, not pieces of words', () => {
    // "dural" is inside "subdural", but a subdural clue does not give away "Post-Dural Puncture Headache"
    expect(clueLeaksAnswer('Subdural fluid collection risk', 'Post-Dural Puncture Headache', ['Migraine', 'Tension Headache'], generic)).toBe(false);
    expect(clueLeaksAnswer('Headache worse upright after dural puncture', 'Post-Dural Puncture Headache', ['Migraine', 'Cluster'], generic)).toBe(true);
  });

  it('a clue that is the answer, or contains it, leaks (plurals and parentheticals do not hide it)', () => {
    expect(clueLeaksAnswer('Horseshoe kidney', 'Horseshoe Kidney', ['A', 'B'], generic)).toBe(true);
    expect(clueLeaksAnswer('Kaposi sarcoma lesions', 'Kaposi Sarcoma', ['Angiosarcoma', 'Lymphoma'], generic)).toBe(true);
    expect(clueLeaksAnswer('Positive ice pack test', 'Ice Pack Test for MG', ['EMG', 'Tensilon'], generic)).toBe(true);
    expect(clueLeaksAnswer('Cervical dystonia', 'Cervical Dystonia (Spasmodic Torticollis)', ['x', 'y'], new Set())).toBe(true);
  });

  it('a clue that only shares a common word with the answer is fine', () => {
    expect(generic.has(stem('syndrome'))).toBe(true);
    expect(clueLeaksAnswer('Syndrome of moon facies and striae', 'Cushing Syndrome', ['Addison Disease', 'Conn Syndrome'], generic)).toBe(false);
    expect(clueLeaksAnswer('Acute abdominal pain radiating to back', 'Acute Pancreatitis', ['Cholecystitis', 'Perforated Ulcer'], generic)).toBe(false);
  });

  it('a word the distractors share is the category, not a giveaway', () => {
    expect(clueLeaksAnswer('Fever and nuchal rigidity, meningitis suspected', 'Bacterial Meningitis', ['Viral Meningitis', 'Fungal Meningitis'], new Set())).toBe(false);
    // but a word that is only in the answer still gives it away
    expect(clueLeaksAnswer('Bacterial infection of the meninges', 'Bacterial Meningitis', ['Viral Meningitis', 'Fungal Meningitis'], new Set())).toBe(true);
    expect(clueLeaksAnswer('Positive Kernig sign', 'Meningitis', ['Encephalitis', 'Brain Abscess'], new Set())).toBe(false);
  });

  it('short acronyms and joining words are ignored', () => {
    expect(clueLeaksAnswer('Pain of the abdomen', 'Rash of the skin', [], new Set())).toBe(false);
    expect(words('Anti-NMDA Receptor (anti-NMDAR) Encephalitis')).toEqual(['anti', 'nmda', 'receptor', 'encephalitis']);
  });

  it('learns the common words from the deck: a word in many answers is generic', () => {
    expect(generic.has(stem('syndrome'))).toBe(true);
    expect(generic.has(stem('pancreatitis'))).toBe(false);
  });
});

describe('the loaded deck', () => {
  it('no loaded card keeps a clue that contains its whole answer, except flagged weak-clue cards', () => {
    const weak = new Set(getLoadReport().weakClueIds);
    const deckGeneric = genericWords(CARDS.map((x) => x.ans));
    const bad = [];
    for (const c of CARDS) {
      if (weak.has(c.id)) continue;
      for (const b of c.bw) if (clueLeaksAnswer(b, c.ans, c.d, deckGeneric)) bad.push(`${c.id}: ${b}`);
    }
    expect(bad).toEqual([]);
  });

  it('every card has two distinct distractors, none of them the answer, and at least two clues', () => {
    const plain = (t) => t.toLowerCase().replace(/\s*\([^)]*\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    for (const c of CARDS) {
      expect(c.bw.length, c.id).toBeGreaterThanOrEqual(2);
      expect(c.d.length, c.id).toBe(2);
      expect(plain(c.d[0]), c.id).not.toBe(plain(c.d[1]));
      c.d.forEach((d) => expect(plain(d), c.id).not.toBe(plain(c.ans)));
      expect(Object.keys(c.ww).sort(), c.id).toEqual([...c.d].sort());
    }
  });

  it('cards that cannot keep two clean clues are tracked, and the list does not grow', () => {
    const { weakClueIds } = getLoadReport();
    expect(weakClueIds.length).toBeLessThanOrEqual(75);
  });
});
