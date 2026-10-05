import { describe, it, expect } from 'vitest';
import { buildStudyReport, reportToText, reportToCsv } from '../../js/studyreport.js';

const data = {
  progression: { xp: 5000, studyStreak: 4, bestStudyStreak: 9, displayName: 'Secret Name', email: 'a@b.c' },
  settings: { runsFinished: 12 },
  cards: {
    subjectStats: { Cardiology: { correct: 45, wrong: 5 }, Nephrology: { correct: 2, wrong: 3 }, '=Evil': { correct: 1, wrong: 0 }, Unused: { correct: 0, wrong: 0 } },
    cardStats: { a: {}, b: {}, c: {} }
  }
};

describe('study report', () => {
  const r = buildStudyReport(data, new Date('2026-10-05T12:00:00Z'));

  it('adds up the numbers and sorts busiest subject first, leaving out untouched ones', () => {
    expect(r.answered).toBe(56);
    expect(r.accuracy).toBe(86);
    expect(r.cardsTouched).toBe(3);
    expect(r.runs).toBe(12);
    expect(r.bestStudyStreak).toBe(9);
    expect(r.subjects.map((s) => s.subject)).toEqual(['Cardiology', 'Nephrology', '=Evil']);
    expect(r.subjects[0]).toMatchObject({ accuracy: 90, mastery: 'Mastered' });
    expect(r.generated).toBe('2026-10-05');
  });

  it('reads as a short message with no personal details', () => {
    const text = reportToText(r);
    expect(text).toContain('Dx Dash study report (2026-10-05)');
    expect(text).toContain('Study streak: 4 days (best 9)');
    expect(text).toContain('• Cardiology: 90% of 50 (Mastered)');
    expect(text).not.toMatch(/Secret Name|a@b\.c/);
  });

  it('exports a spreadsheet that cannot run formulas', () => {
    const csv = reportToCsv(r);
    expect(csv.split('\n')[0]).toBe('subject,correct,wrong,answered,accuracy_percent,mastery');
    expect(csv).toContain("'=Evil");
    expect(csv).not.toMatch(/\n=Evil/);
  });

  it('copes with an empty save', () => {
    const empty = buildStudyReport({});
    expect(empty.answered).toBe(0);
    expect(empty.accuracy).toBeNull();
    expect(reportToText(empty)).toContain('Answered: 0');
    expect(reportToCsv(empty)).toBe('subject,correct,wrong,answered,accuracy_percent,mastery\n');
  });
});
