/**
 * studyreport.js — a plain-text and CSV summary of how you have been studying, to paste into a message, a study-group
 * chat or a spreadsheet (for a tutor, a dean or just yourself). It is built on the device from your own numbers and
 * contains no name, email or account details: only what you choose to send.
 */

import { masteryLevel } from './readiness.js';
import { levelFromXp, rankForLevel } from './progress.js';

function pct(c, w) {
  var t = (c || 0) + (w || 0);
  return t ? Math.round((c / t) * 100) : null;
}

/**
 * @param {{progression?: object, cards?: {subjectStats?: object, cardStats?: object}}} data the saved data
 * @param {Date} [now]
 * @returns {{generated: string, level: number, rank: string, studyStreak: number, bestStudyStreak: number, runs: number, answered: number, accuracy: number|null, cardsTouched: number, subjects: {subject: string, correct: number, wrong: number, accuracy: number|null, mastery: string}[]}}
 */
export function buildStudyReport(data, now) {
  data = data || {};
  var p = data.progression || {};
  var cards = data.cards || {};
  var subjectStats = cards.subjectStats || {};
  var correct = 0;
  var wrong = 0;
  var subjects = Object.keys(subjectStats).map(function (name) {
    var s = subjectStats[name] || {};
    var c = Math.max(0, Number(s.correct) || 0);
    var w = Math.max(0, Number(s.wrong) || 0);
    correct += c; wrong += w;
    return { subject: name, correct: c, wrong: w, accuracy: pct(c, w), mastery: masteryLevel(c, w) };
  }).filter(function (s) { return s.correct + s.wrong > 0; }).sort(function (a, b) {
    return (b.correct + b.wrong) - (a.correct + a.wrong) || a.subject.localeCompare(b.subject);
  });
  var level = levelFromXp(Math.max(0, Number(p.xp) || 0));
  var rank = rankForLevel(level);
  return {
    generated: (now || new Date()).toISOString().slice(0, 10),
    level: level,
    rank: rank.label,
    studyStreak: Number(p.studyStreak) || 0,
    bestStudyStreak: Math.max(Number(p.bestStudyStreak) || 0, Number(p.studyStreak) || 0),
    runs: Number((data.settings || {}).runsFinished) || 0,
    answered: correct + wrong,
    accuracy: pct(correct, wrong),
    cardsTouched: Object.keys(cards.cardStats || {}).length,
    subjects: subjects
  };
}

/** The report as a short message. */
export function reportToText(r) {
  var lines = [];
  lines.push('Dx Dash study report (' + r.generated + ')');
  lines.push('Level ' + r.level + (r.rank ? ' · ' + r.rank : ''));
  lines.push('Study streak: ' + r.studyStreak + ' day' + (r.studyStreak === 1 ? '' : 's') + ' (best ' + r.bestStudyStreak + ')');
  lines.push('Answered: ' + r.answered + (r.accuracy === null ? '' : ' · ' + r.accuracy + '% correct') + ' · ' + r.cardsTouched + ' different cards seen');
  if (r.subjects.length) {
    lines.push('');
    lines.push('By subject:');
    r.subjects.forEach(function (s) {
      lines.push('• ' + s.subject + ': ' + s.accuracy + '% of ' + (s.correct + s.wrong) + ' (' + s.mastery + ')');
    });
  }
  return lines.join('\n');
}

function csvCell(v) {
  var s = String(v === null || v === undefined ? '' : v);
  // a leading = + - @ would be read as a formula by a spreadsheet
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** The per-subject numbers as a spreadsheet. */
export function reportToCsv(r) {
  var rows = [['subject', 'correct', 'wrong', 'answered', 'accuracy_percent', 'mastery']];
  r.subjects.forEach(function (s) { rows.push([s.subject, s.correct, s.wrong, s.correct + s.wrong, s.accuracy, s.mastery]); });
  return rows.map(function (row) { return row.map(csvCell).join(','); }).join('\n') + '\n';
}
