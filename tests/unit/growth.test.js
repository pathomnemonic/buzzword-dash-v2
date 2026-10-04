import { describe, it, expect } from 'vitest';
import { whyNot, missExplanation, readSeconds } from '../../js/explain.js';
import { spreadBySubject } from '../../js/interleave.js';
import { encodeChallenge, decodeChallenge } from '../../js/challenge.js';

describe('explain the miss', () => {
  const card = { ans: 'Pneumonia', tp: 'Fever, cough and focal crackles point to a lung infection.', ww: { Asthma: 'Asthma is wheezing without fever.', 'Lung cancer': 'No weight loss or smoking history here' } };

  it('says why the chosen answer is wrong, then the teaching point', () => {
    expect(whyNot(card, 'Asthma')).toBe('Asthma is wheezing without fever.');
    expect(missExplanation(card, 'Asthma')).toBe('Not Asthma: Asthma is wheezing without fever. Fever, cough and focal crackles point to a lung infection.');
    expect(missExplanation(card, 'Lung cancer')).toContain('Not Lung cancer: No weight loss or smoking history here.'); // one full stop, not two
  });

  it('falls back to the teaching point when there is no reason for that answer', () => {
    expect(missExplanation(card, 'Gout')).toBe(card.tp);
    expect(missExplanation({ ans: 'A', tp: 'T' }, 'B')).toBe('T');
    expect(whyNot(card, 'Pneumonia')).toBe('');
    expect(whyNot(null, 'x')).toBe('');
  });

  it('leaves a long explanation up longer, within limits', () => {
    expect(readSeconds('short', 2)).toBe(2);
    const long = Array(40).fill('word').join(' ');
    expect(readSeconds(long, 2)).toBeGreaterThan(readSeconds('a few words here', 2));
    expect(readSeconds(Array(400).fill('w').join(' '), 2)).toBe(6);
  });
});

describe('interleaving', () => {
  it('never puts the same subject twice in a row while another is available', () => {
    const cards = ['A', 'A', 'A', 'B', 'B', 'C'].map((s, i) => ({ id: i, subj: s }));
    const out = spreadBySubject(cards);
    expect(out).toHaveLength(6);
    expect(out.map((c) => c.id).sort()).toEqual([0, 1, 2, 3, 4, 5]);
    for (let i = 1; i < 5; i++) expect(out[i].subj).not.toBe(out[i - 1].subj);
  });

  it('keeps the order when there is only one subject, and handles empty input', () => {
    const one = [1, 2, 3].map((i) => ({ id: i, subj: 'A' }));
    expect(spreadBySubject(one).map((c) => c.id)).toEqual([1, 2, 3]);
    expect(spreadBySubject([])).toEqual([]);
  });
});

describe('challenge links carry their cards', () => {
  const ids = Array.from({ length: 15 }, (_, i) => 'cd' + String(i).padStart(3, '0'));
  const c = { seed: 99, n: 15, from: 'Ada', score: 1200, hash: 'abc', ids };

  it('round-trips the card ids, so the link still works after the card set changes', () => {
    const back = decodeChallenge(encodeChallenge(c));
    expect(back.ids).toEqual(ids);
    expect(encodeChallenge(c).length).toBeLessThan(700);
  });

  it('ignores ids that are the wrong length or not plain ids', () => {
    expect(decodeChallenge(encodeChallenge({ ...c, ids: ids.slice(0, 10) })).ids).toBeNull();
    expect(decodeChallenge(encodeChallenge({ ...c, ids: ids.map((x, i) => (i ? x : '<script>')) })).ids).toBeNull();
    expect(decodeChallenge(encodeChallenge({ ...c, ids: undefined })).ids).toBeNull();
  });
});

import { firstWeekState, FIRST_WEEK_DAYS } from '../../js/firstweek.js';
import { masteryLevel } from '../../js/readiness.js';

describe('first-week checklist', () => {
  const day = 86400000;
  const store = (o) => (k) => o[k];

  it('starts with nothing done and points at the first step', () => {
    const st = firstWeekState({ get: store({}), now: 1e12 });
    expect(st.show).toBe(true);
    expect(st.doneCount).toBe(0);
    expect(st.next).toBe('run');
    expect(st.steps).toHaveLength(7);
  });

  it('ticks steps off by doing the things, in any order', () => {
    const st = firstWeekState({ get: store({ totalEncounters: 12, flashcardSessions: 1, examDate: '2027-03-01', equipped: { trail: 'trail_fire' }, studyStreak: 3, profileVisible: true, profileName: 'Ada', lastDaily: '2026-10-01' }), now: 1e12 });
    expect(st.steps.filter((s) => s.done).map((s) => s.id)).toEqual(['run', 'flashcards', 'daily', 'exam', 'trail', 'streak', 'profile']);
    expect(st.show).toBe(false); // finished
    expect(firstWeekState({ get: store({ totalEncounters: 1, equipped: { trail: 'trail_none' } }), now: 1e12 }).next).toBe('flashcards');
  });

  it('hides when asked, and after two weeks', () => {
    expect(firstWeekState({ get: store({ firstWeekOff: true }), now: 1e12 }).show).toBe(false);
    const first = 1e12;
    expect(firstWeekState({ get: store({ firstRunAt: first }), now: first + (FIRST_WEEK_DAYS - 1) * day }).show).toBe(true);
    expect(firstWeekState({ get: store({ firstRunAt: first }), now: first + (FIRST_WEEK_DAYS + 1) * day }).show).toBe(false);
  });
});

describe('mastery levels', () => {
  it('come from the answers given and the share that was right, so the numbers beside them explain them', () => {
    expect(masteryLevel(3, 2)).toBe('New'); // under 10 answers
    expect(masteryLevel(40, 40)).toBe('Learning'); // 50% right
    expect(masteryLevel(18, 12)).toBe('Learning'); // 60% right
    expect(masteryLevel(20, 8)).toBe('Solid'); // 28 answers, 71%
    expect(masteryLevel(30, 10)).toBe('Solid'); // 75%
    expect(masteryLevel(46, 4)).toBe('Mastered'); // 50 answers, 92%
    expect(masteryLevel(40, 10)).toBe('Solid'); // 50 answers at 80%: not yet 85%
    expect(masteryLevel(undefined, undefined)).toBe('New');
  });
});

import { shareFooterLine } from '../../js/sharecard.js';

describe('share image footer', () => {
  it('shows the streak and cards met only when they are worth saying', () => {
    expect(shareFooterLine({})).toBe('');
    expect(shareFooterLine({ streakDays: 1, cardsMet: 10 })).toBe('');
    expect(shareFooterLine({ streakDays: 12, cardsMet: 340 })).toBe('🔥 12-day streak  ·  340 cards met');
    expect(shareFooterLine({ streakDays: 0, cardsMet: 1200 })).toBe('1,200 cards met');
  });
});
