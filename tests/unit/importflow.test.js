import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { ankiImport } from '../../js/ankiimport.js';
import { buildAiPrompt, parseAiReply, FORMAT_EXAMPLE } from '../../js/importguide.js';
import { SUBJECTS, validateCard } from '../../js/cardschema.js';

const sample = readFileSync('tests/fixtures/anki-export-sample.txt', 'utf8');
const aiReply = readFileSync('tests/fixtures/ai-reply-sample.txt', 'utf8');

describe('Anki "Notes in Plain Text" export', () => {
  it('drops the metadata columns and HTML, keeps front and back, splits clozes', () => {
    const r = ankiImport.parseDelimitedText(sample);
    const fronts = r.cards.map((c) => c.front);
    expect(fronts[0]).toBe('Fever, new murmur, Janeway lesions, Osler nodes / in an IV drug user');
    expect(r.cards[0].back).toBe('Infective endocarditis / S. aureus is the most common cause');
    expect(r.cards[1].back).toBe('N-acetylcysteine (replenishes glutathione)');
    // the cloze note became two cards
    expect(r.cards.filter((c) => /diabetes/.test(c.front)).length).toBe(2);
    // nothing carries the GUID, note type, deck or tags
    r.cards.forEach((c) => expect(c.front + c.back).not.toMatch(/gT3k|Basic|Cloze|Step 1::|endocarditis cardio/));
    // the quoted field with a comma and the image-only card
    expect(r.cards.find((c) => /facial droop/.test(c.front)).back).toMatch(/^Contralateral upper motor neuron/);
    // the picture-only note is skipped, with a reason, rather than imported as "[image]"
    expect(r.cards.some((c) => /Image occlusion/.test(c.front))).toBe(false);
    expect(r.warnings.join(' ')).toMatch(/picture/);
  });
  it('skips a Front,Back header row and says when a row is half empty', () => {
    const r = ankiImport.parseDelimitedText('Front,Back\nQ1,A1\nQ2,\n');
    expect(r.cards).toEqual([{ front: 'Q1', back: 'A1' }]);
    expect(r.warnings.join(' ')).toMatch(/one side is empty|only a picture/);
  });
  it('reads the example shown in the app', () => {
    expect(ankiImport.parseDelimitedText(FORMAT_EXAMPLE).cards.length).toBe(2);
  });
  it('reads semicolon exports', () => {
    const r = ankiImport.parseDelimitedText('#separator:semicolon\nQ one;A one\nQ two;A two\n');
    expect(r.cards.length).toBe(2);
  });
});

describe('the AI prompt', () => {
  it('names every real subject and the exact field names the importer reads', () => {
    const p = buildAiPrompt();
    SUBJECTS.forEach((s) => expect(p).toContain('"' + s + '"'));
    ['"subj"', '"bw"', '"ans"', '"d"', '"tp"', '"ww"'].forEach((f) => expect(p).toContain(f));
    expect(p).toMatch(/exactly 2 wrong answers/);
    expect(p.endsWith('My cards:')).toBe(true);
  });
  it('its own example card passes the real validator', () => {
    const p = buildAiPrompt();
    const m = /Example of one object:\n(.*)\n/.exec(p);
    const card = JSON.parse(m[1]);
    card.id = 'x1';
    expect(validateCard(card).success).toBe(true);
  });
});

describe('what an AI chat actually sends back', () => {
  beforeEach(() => localStorage.clear());
  it('handles a chatty reply with a code fence, long field names, and bad cards', () => {
    const r = parseAiReply(aiReply);
    expect(r.error).toBeNull();
    expect(r.cards.length).toBe(5);          // the N/A + duplicate-answer card is dropped
    expect(r.skipped).toBe(1);
    expect(r.cards[4].subj).toBe('Multisystem / Mixed'); // "Hematology" is not canonical
    expect(r.cards[4].ans).toBe('Heparin-induced thrombocytopenia');
  });
  it('imports into My Cards as playable (not flashcard-only) cards', async () => {
    const { customCards } = await import('../../js/customcards.js');
    const { storage } = await import('../../js/storage.js');
    storage.load();
    const before = customCards.getAll().length;
    const r = parseAiReply(aiReply);
    const res = customCards.importJSON(JSON.stringify(r.cards));
    expect(res.importedCount).toBe(5);
    expect(res.rejectedCount).toBe(0);
    const added = customCards.getAll().slice(before);
    added.forEach((c) => {
      expect(c.d.length).toBe(2);
      expect(c.enabledModes || null).toBeNull();
      expect(validateCard(c).success).toBe(true);
    });
  });
  it('explains an unusable reply instead of failing silently', () => {
    expect(parseAiReply('').error).toMatch(/Paste/);
    expect(parseAiReply('I am sorry, I cannot help').error).toMatch(/JSON/);
    expect(parseAiReply('[{"bw":["x"],"ans":"y","d":["z"]}]').error).toMatch(/No usable cards/);
  });
  it('accepts {"cards": [...]} and a bare array', () => {
    const one = { subj: 'Cardiology', bw: ['a'], ans: 'b', d: ['c', 'd'], tp: 't' };
    expect(parseAiReply(JSON.stringify({ cards: [one] })).cards.length).toBe(1);
    expect(parseAiReply(JSON.stringify([one])).cards.length).toBe(1);
  });
});

describe('the importer screen', () => {
  it('shows the instructions, the prompt button and no server-URL box', () => {
    const box = document.createElement('div');
    ankiImport.mount(box, { customCards: { add() {}, importJSON: () => ({ importedCount: 0, rejectedCount: 0, rejected: [] }) }, toast() {}, reportError() {} });
    const text = box.textContent;
    expect(text).toMatch(/Notes in Plain Text/);
    expect(text).toMatch(/Copy AI prompt/);
    expect(text).toMatch(/Import quiz cards/);
    expect(text).not.toMatch(/Backend URL/i);
    expect(box.querySelectorAll('details').length).toBe(2);
    ankiImport.unmount();
  });
});

describe('using the importer screen like a person', () => {
  it('paste cards -> preview -> import as flashcards; paste AI reply -> import quiz cards', async () => {
    localStorage.clear();
    const { customCards } = await import('../../js/customcards.js');
    const { storage } = await import('../../js/storage.js');
    storage.load();
    const box = document.createElement('div');
    document.body.appendChild(box);
    const toasts = [];
    ankiImport.mount(box, { customCards, storage, toast: (m) => toasts.push(m), reportError() {} });
    const [paste, ai] = box.querySelectorAll('textarea');
    const buttons = Array.from(box.querySelectorAll('button'));
    const byText = (t) => buttons.find((b) => b.textContent.includes(t));
    const status = box.querySelector('.anki-import-status');

    byText('Fill in an example').click();
    await new Promise((r) => setTimeout(r, 400));
    expect(box.querySelector('.anki-import-preview').textContent).toMatch(/Found 2 cards/);

    const before = customCards.getAll().length;
    byText('Import as flashcards').click();
    await new Promise((r) => setTimeout(r, 50));
    expect(customCards.getAll().length).toBe(before + 2);
    expect(status.textContent).toMatch(/Imported 2 flashcards/);

    byText('Import quiz cards').click();
    expect(status.textContent).toMatch(/Paste the AI/);   // empty box explains itself
    ai.value = aiReply;
    byText('Import quiz cards').click();
    expect(status.textContent).toMatch(/Imported 5 quiz cards/);
    expect(customCards.getAll().length).toBe(before + 7);
    expect(paste).toBeTruthy();
    ankiImport.unmount();
  });
});
