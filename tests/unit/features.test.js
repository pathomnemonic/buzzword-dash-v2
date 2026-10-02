import { describe, it, expect, beforeEach } from 'vitest';
import { buildExam, scoreExam, readinessLabel } from '../../js/exam.js';
import { buildStudyPlan } from '../../js/studyplan.js';
import { encodeChallenge, decodeChallenge, parseChallengeHash, buildChallengeUrl } from '../../js/challenge.js';

let storage;

beforeEach(async () => {
  localStorage.clear();
  storage = (await import('../../js/storage.js')).storage;
  storage.load();
});

function card(id, ans, subj, extra) {
  return Object.assign({ id, ans, subj: subj || 'Neurology', bw: ['a', 'b'], d: ['x' + id, 'y' + id], tp: 't', questionType: 'buzzword_dx' }, extra);
}

function dayKey(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

describe('exam simulation', () => {
  it('builds unique questions with the correct answer among three options', () => {
    const cards = Array.from({ length: 30 }, (_, i) => card('c' + i, 'Ans' + i));
    const exam = buildExam(cards, 10);
    expect(exam).toHaveLength(10);
    expect(new Set(exam.map((q) => q.card.id)).size).toBe(10);
    exam.forEach((q) => {
      expect(q.options).toHaveLength(3);
      expect(q.options[q.correctIndex]).toBe(q.card.ans);
    });
  });

  it('skips cards that cannot form three options', () => {
    const exam = buildExam([card('ok', 'A'), { id: 'bad', ans: 'B', d: ['only one'] }], 5);
    expect(exam.map((q) => q.card.id)).toEqual(['ok']);
  });

  it('scores correct, wrong and unanswered by subject', () => {
    const qs = [
      { card: card('1', 'A', 'Neurology'), correctIndex: 0 },
      { card: card('2', 'B', 'Neurology'), correctIndex: 1 },
      { card: card('3', 'C', 'Cardiology'), correctIndex: 2 },
      { card: card('4', 'D', 'Cardiology'), correctIndex: 0 }
    ];
    const r = scoreExam(qs, [0, 0, 2, null]);
    expect(r.correct).toBe(2);
    expect(r.wrong).toBe(1);
    expect(r.unanswered).toBe(1);
    expect(r.accuracy).toBe(50);
    expect(r.bySubject.Neurology).toEqual({ n: 2, ok: 1 });
    expect(r.bySubject.Cardiology).toEqual({ n: 2, ok: 1 });
  });

  it('labels readiness bands', () => {
    expect(readinessLabel(85).label).toBe('Strong');
    expect(readinessLabel(70).label).toBe('On track');
    expect(readinessLabel(55).label).toBe('Needs work');
    expect(readinessLabel(20).label).toBe('At risk');
  });

  it('persists an exam once and feeds spaced repetition', () => {
    const summary = {
      examId: 'e1', date: '2026-09-29', total: 2, correct: 1, wrong: 1, unanswered: 0, accuracy: 50, durationSec: 60,
      bySubject: { Neurology: { n: 2, ok: 1 } },
      cardResults: [
        { cardId: 'k1', subject: 'Neurology', answered: true, correct: true },
        { cardId: 'k2', subject: 'Neurology', answered: true, correct: false }
      ]
    };
    expect(storage.finalizeExamSession(summary).applied).toBe(true);
    expect(storage.finalizeExamSession(summary).duplicate).toBe(true);
    expect(storage.getCardStat('k1').seen).toBe(1);
    expect(storage.getCardStat('k2').wrong).toBe(1);
    expect(storage.get('examResults')).toHaveLength(1);
    expect(storage.getStudiedToday()).toBe(2);
  });
});

describe('study plan', () => {
  it('finds due cards, forecasts reviews and picks the weakest subject', () => {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const cards = [card('a', 'A'), card('b', 'B'), card('c', 'C', 'Cardiology', { questionType: 'treatment' })];
    const plan = buildStudyPlan({
      now,
      cards,
      cardStats: {
        a: { seen: 3, correct: 1, wrong: 2, due: now - DAY },
        b: { seen: 2, correct: 2, wrong: 0, due: now + 2.5 * DAY },
        c: { seen: 4, correct: 4, wrong: 0, due: now + 1000 }
      },
      subjectStats: { Neurology: { correct: 3, wrong: 7 }, Cardiology: { correct: 9, wrong: 1 } },
      goal: 20,
      studiedToday: 5
    });
    expect(plan.dueIds).toEqual(['a']);
    expect(plan.forecast[2]).toBe(1);
    expect(plan.forecast[0]).toBe(1);
    expect(plan.weakestSubject.subject).toBe('Neurology');
    expect(plan.remainingToGoal).toBe(15);
    expect(plan.steps.map((s) => s.kind)).toEqual(['due', 'weak', 'goal']);
    expect(plan.typeAccuracy[0].type).toBe('buzzword_dx');
  });
});

describe('challenges', () => {
  it('round-trips a challenge through its link token', () => {
    const c = { seed: 12345, n: 15, from: 'Dr. Ünïcode', score: 4321, hash: 'abc123' };
    const back = decodeChallenge(encodeChallenge(c));
    expect(back).toEqual({ ...c, ids: null });
    expect(parseChallengeHash('#c=' + encodeChallenge(c)).seed).toBe(12345);
    expect(buildChallengeUrl('https://x.test/app/', c)).toMatch(/^https:\/\/x\.test\/app\/#c=/);
  });

  it('rejects malformed or out-of-range tokens', () => {
    expect(decodeChallenge('!!!')).toBeNull();
    expect(parseChallengeHash('#other=1')).toBeNull();
    const bad = (o) => decodeChallenge(btoa(JSON.stringify(o)).replace(/=+$/, ''));
    expect(bad({ v: 2, s: 5, n: 15, c: 1 })).toBeNull();
    expect(bad({ v: 1, s: 0, n: 15, c: 1 })).toBeNull();
    expect(bad({ v: 1, s: 5, n: 9999, c: 1 })).toBeNull();
    expect(bad({ v: 1, s: 5, n: 15, c: -1 })).toBeNull();
  });

  it('treats the sender name as data, capped at 30 characters', () => {
    const c = decodeChallenge(encodeChallenge({ seed: 5, n: 15, from: '<img src=x onerror=alert(1)>'.repeat(5), score: 1, hash: '' }));
    expect(c.from.length).toBeLessThanOrEqual(30);
  });
});

describe('streak shields and weekly goal', () => {
  it('a shield saves a streak after one missed day, and is consumed', () => {
    const p = storage.data.progression;
    p.dailyStreak = 4;
    p.streakShields = 1;
    p.lastCompletedDailyDate = dayKey(-2);
    storage.finalizeRun({ runId: 'r1', mode: 'daily', dailyCompleted: true, encountersCompleted: 15, correct: 10, wrong: 5, score: 100, completed: true });
    expect(p.dailyStreak).toBe(5);
    expect(p.streakShields).toBe(0);
  });

  it('the streak resets without a shield', () => {
    const p = storage.data.progression;
    p.dailyStreak = 4;
    p.streakShields = 0;
    p.lastCompletedDailyDate = dayKey(-2);
    storage.finalizeRun({ runId: 'r2', mode: 'daily', dailyCompleted: true, encountersCompleted: 15, correct: 10, wrong: 5, score: 100, completed: true });
    expect(p.dailyStreak).toBe(1);
  });

  it('earns a shield at a 7-day streak', () => {
    const p = storage.data.progression;
    p.dailyStreak = 6;
    p.streakShields = 0;
    p.lastCompletedDailyDate = dayKey(-1);
    storage.finalizeRun({ runId: 'r3', mode: 'daily', dailyCompleted: true, encountersCompleted: 15, correct: 10, wrong: 5, score: 100, completed: true });
    expect(p.dailyStreak).toBe(7);
    expect(p.streakShields).toBe(1);
    expect(storage.getStreakStatus().streak).toBe(7);
  });

  it('reads a lapsed streak as zero', () => {
    const p = storage.data.progression;
    p.dailyStreak = 9;
    p.streakShields = 0;
    p.lastCompletedDailyDate = dayKey(-5);
    expect(storage.getStreakStatus().streak).toBe(0);
  });

  it('pays the weekly reward once after five goal days', () => {
    const counts = storage.data.history.dailyCounts;
    const goal = storage.get('dailyGoal');
    // Fill the five earliest days of the current week (Mon..Fri).
    const d = new Date();
    const monday = -((d.getDay() + 6) % 7);
    for (let i = 0; i < 5; i++) counts[dayKey(monday + i)] = goal;
    expect(storage.getWeeklyProgress().daysMet).toBe(5);
    const before = storage.get('coins');
    expect(storage.claimWeeklyGoal().success).toBe(true);
    expect(storage.get('coins')).toBe(before + 250);
    expect(storage.claimWeeklyGoal().success).toBe(false);
  });
});

describe('game modes and the card pool', () => {
  it('every runner game mode has cards available', async () => {
    const { getCardPool } = await import('../../js/game/gates.js');
    const { GAME_MODES } = await import('../../js/game/engine.js').catch(() => ({ GAME_MODES: null }));
    // GAME_MODES needs WebGL-free import; fall back to the known list if unavailable.
    const modes = GAME_MODES ? Object.values(GAME_MODES) : [
      'endless', 'study', 'weakness', 'daily', 'challenge', 'versus', 'mp_highscore', 'mp_suddendeath', 'mp_race'
    ];
    for (const mode of modes) {
      const pool = getCardPool({ subjects: [], filters: {}, includeCustomCards: false, mode });
      expect(pool.error, 'mode ' + mode).toBeNull();
      expect(pool.cards.length, 'mode ' + mode).toBeGreaterThan(100);
    }
  });
});
