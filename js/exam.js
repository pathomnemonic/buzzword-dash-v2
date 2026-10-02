/**
 * exam.js — Timed exam simulation.
 *
 * A block of multiple-choice questions built from the player's card pool,
 * answered without instant feedback (like a real exam block), with a timer,
 * question navigation, flagging, and a results report by subject.
 *
 * The score is a practice signal from this game's own question bank, not a
 * prediction of a licensing-exam score.
 */

import { createElement, clearElement } from './dom.js';
import { storage } from './storage.js';
import { uniqueByAnswer } from './cardleaks.js';
import { getCardPool } from './game/gates.js';
import { getSubjectStyle, getSubjectCssColor } from './game/subjectstyle.js';

// ===== Pure logic (unit-tested) =====

function shuffle(items, rng) {
  var a = items.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(rng() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/**
 * Build an exam block.
 * @param {object[]} cards - eligible cards (each with ans and d[2])
 * @param {number} count
 * @param {function(): number} [rng]
 * @returns {{card: object, options: string[], correctIndex: number}[]}
 */
export function buildExam(cards, count, rng) {
  rng = rng || Math.random;
  var usable = cards.filter(function (c) { return c && c.ans && Array.isArray(c.d) && c.d.length >= 2; });
  var chosen = uniqueByAnswer(shuffle(usable, rng)).slice(0, count); // no diagnosis twice in one exam
  return chosen.map(function (card) {
    var options = shuffle([card.ans, card.d[0], card.d[1]], rng);
    return { card: card, options: options, correctIndex: options.indexOf(card.ans) };
  });
}

/**
 * Score an exam.
 * @param {{card: object, correctIndex: number}[]} questions
 * @param {(number|null)[]} answers - chosen option index per question, or null
 */
export function scoreExam(questions, answers) {
  var correct = 0;
  var wrong = 0;
  var unanswered = 0;
  var bySubject = {};
  questions.forEach(function (q, i) {
    var subj = q.card.subj || 'Other';
    bySubject[subj] = bySubject[subj] || { n: 0, ok: 0 };
    bySubject[subj].n++;
    var a = answers[i];
    if (a === null || a === undefined) { unanswered++; return; }
    if (a === q.correctIndex) { correct++; bySubject[subj].ok++; }
    else wrong++;
  });
  var total = questions.length;
  return {
    total: total,
    correct: correct,
    wrong: wrong,
    unanswered: unanswered,
    accuracy: total > 0 ? Math.round(correct / total * 100) : 0,
    bySubject: bySubject
  };
}

/** Plain-language band for a practice score. */
export function readinessLabel(accuracy) {
  if (accuracy >= 80) return { label: 'Strong', color: 'var(--accent-green)', note: 'You are answering at a high level on this material.' };
  if (accuracy >= 65) return { label: 'On track', color: 'var(--accent-cyan)', note: 'Solid, with a few subjects worth tightening.' };
  if (accuracy >= 50) return { label: 'Needs work', color: 'var(--accent-gold)', note: 'Focus on the weakest subjects below.' };
  return { label: 'At risk', color: 'var(--accent-red)', note: 'Build the fundamentals with flashcards, then retake.' };
}

// ===== UI =====

var _state = null;
var _timer = null;
var _root = null;
var _deps = null;

function stopTimer() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

function formatTime(sec) {
  sec = Math.max(0, Math.round(sec));
  var m = Math.floor(sec / 60);
  var s = sec % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

function button(label, onClick, className, attrs) {
  var b = createElement('button', { className: 'btn ' + (className || 'btn-outline'), text: label, attributes: Object.assign({ type: 'button' }, attrs || {}) });
  b.addEventListener('click', onClick);
  return b;
}

/**
 * Mount the exam screen.
 * @param {HTMLElement} container
 * @param {object} [deps]
 * @param {function(object[])} [deps.startFlashcards] - start a flashcard session for these cards
 * @param {function()} [deps.goHome]
 * @param {function(string)} [deps.toast]
 */
export function mountExam(container, deps) {
  _root = container;
  _deps = deps || {};
  stopTimer();
  _state = null;
  renderSetup();
}

export function unmountExam() {
  stopTimer();
  _state = null;
}

function renderSetup() {
  clearElement(_root);
  var wrap = createElement('div');
  wrap.appendChild(createElement('p', { text: 'Simulate an exam block: no instant feedback, a running clock, and a full report by subject at the end. Uses your selected subjects and filters.' }));
  wrap.lastChild.style.cssText = 'font-size:12px;color:var(--text-secondary);margin-bottom:12px';

  var count = 20;
  var pace = 90;

  function choiceRow(labelText, options, current, onPick) {
    var row = createElement('div');
    row.style.margin = '10px 0';
    row.appendChild(createElement('div', { text: labelText }));
    row.lastChild.style.cssText = 'font-size:12px;font-weight:700;margin-bottom:4px';
    var group = createElement('div', { attributes: { role: 'radiogroup', 'aria-label': labelText } });
    group.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
    options.forEach(function (o) {
      var b = createElement('button', {
        className: 'btn btn-sm ' + (o[0] === current ? 'btn-primary' : 'btn-outline'),
        text: o[1],
        attributes: { type: 'button', role: 'radio', 'aria-checked': o[0] === current ? 'true' : 'false' }
      });
      b.addEventListener('click', function () {
        onPick(o[0]);
        Array.prototype.forEach.call(group.children, function (c) {
          c.className = 'btn btn-sm btn-outline';
          c.setAttribute('aria-checked', 'false');
        });
        b.className = 'btn btn-sm btn-primary';
        b.setAttribute('aria-checked', 'true');
      });
      group.appendChild(b);
    });
    row.appendChild(group);
    return row;
  }

  wrap.appendChild(choiceRow('Questions', [[10, '10'], [20, '20'], [40, '40 (full block)']], count, function (v) { count = v; }));
  wrap.appendChild(choiceRow('Time per question', [[60, '60 s (hard)'], [90, '90 s (exam pace)'], [120, '120 s'], [0, 'Untimed']], pace, function (v) { pace = v; }));

  var history = storage.get('examResults') || [];
  if (history.length > 0) {
    var last = history[history.length - 1];
    wrap.appendChild(createElement('div', { text: 'Last exam: ' + last.correct + '/' + last.total + ' (' + last.accuracy + '%) on ' + last.date }));
    wrap.lastChild.style.cssText = 'font-size:11px;color:var(--text-muted);margin:8px 0';
  }

  var startBtn = button('▶ Start exam', function () {
    var pool = getCardPool({
      subjects: storage.get('selectedSubjects') || [],
      filters: {
        exams: storage.get('selectedExams') || [],
        questionTypes: storage.get('selectedQuestionTypes') || [],
        sources: storage.get('selectedSources') || [],
        years: storage.get('selectedYears') || [],
        highYieldOnly: storage.get('highYieldOnly') || false
      },
      includeCustomCards: true,
      mode: 'endless'
    });
    if (pool.error || pool.cards.length < 5) {
      if (_deps.toast) _deps.toast('Not enough cards match your filters for an exam.');
      return;
    }
    startExam(pool.cards, count, pace);
  }, 'btn-green btn-block');
  startBtn.style.marginTop = '14px';
  wrap.appendChild(startBtn);

  wrap.appendChild(button('🏠 Back', function () { if (_deps.goHome) _deps.goHome(); }, 'btn-outline btn-block'));
  wrap.lastChild.style.marginTop = '6px';
  _root.appendChild(wrap);
}

function startExam(cards, count, pace) {
  var questions = buildExam(cards, count);
  _state = {
    id: 'exam_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
    questions: questions,
    answers: questions.map(function () { return null; }),
    flags: questions.map(function () { return false; }),
    index: 0,
    startedAt: Date.now(),
    limitSec: pace > 0 ? pace * questions.length : 0,
    finished: false
  };
  renderQuestion();
  stopTimer();
  if (_state.limitSec > 0) {
    _timer = setInterval(function () {
      if (!_state || _state.finished) { stopTimer(); return; }
      var left = _state.limitSec - (Date.now() - _state.startedAt) / 1000;
      var el = document.getElementById('examClock');
      if (el) {
        el.textContent = '⏱ ' + formatTime(left);
        el.style.color = left < 60 ? 'var(--accent-red)' : '';
      }
      if (left <= 0) finishExam();
    }, 500);
  }
}

function renderQuestion() {
  var st = _state;
  if (!st) return;
  clearElement(_root);
  var q = st.questions[st.index];

  var header = createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:700;margin-bottom:8px';
  header.appendChild(createElement('span', { text: 'Question ' + (st.index + 1) + ' of ' + st.questions.length }));
  header.appendChild(createElement('span', { text: st.limitSec > 0 ? '⏱ ' + formatTime(st.limitSec - (Date.now() - st.startedAt) / 1000) : '⏱ Untimed', attributes: { id: 'examClock' } }));
  _root.appendChild(header);

  var card = createElement('div');
  card.style.cssText = 'background:var(--bg-card-solid);border-radius:var(--radius-lg);padding:16px;border:var(--border-glow)';
  var style = getSubjectStyle(q.card.subj);
  var tag = createElement('div', { text: style.icon + ' ' + q.card.subj });
  tag.style.cssText = 'font-size:10px;color:' + getSubjectCssColor(q.card.subj) + ';font-weight:700;margin-bottom:8px';
  card.appendChild(tag);
  (q.card.bw || []).forEach(function (bw) {
    card.appendChild(createElement('div', { text: '• ' + bw }));
    card.lastChild.style.cssText = 'font-size:15px;font-weight:700;margin:4px 0';
  });
  card.appendChild(createElement('div', { text: 'Which diagnosis fits best?' }));
  card.lastChild.style.cssText = 'font-size:11px;color:var(--text-muted);margin-top:8px';

  var group = createElement('div', { attributes: { role: 'radiogroup', 'aria-label': 'Answer choices' } });
  group.style.marginTop = '10px';
  q.options.forEach(function (opt, oi) {
    var chosen = st.answers[st.index] === oi;
    var b = createElement('button', {
      className: 'btn btn-block ' + (chosen ? 'btn-primary' : 'btn-outline'),
      text: (oi + 1) + '. ' + opt,
      attributes: { type: 'button', role: 'radio', 'aria-checked': chosen ? 'true' : 'false' }
    });
    b.style.cssText = 'text-align:left;margin:6px 0;white-space:normal';
    b.addEventListener('click', function () { st.answers[st.index] = oi; renderQuestion(); });
    group.appendChild(b);
  });
  card.appendChild(group);
  _root.appendChild(card);

  var nav = createElement('div');
  nav.style.cssText = 'display:flex;gap:6px;margin-top:10px';
  var prev = button('← Prev', function () { st.index = Math.max(0, st.index - 1); renderQuestion(); }, 'btn-outline');
  prev.disabled = st.index === 0;
  var flag = button(st.flags[st.index] ? '🚩 Flagged' : '⚑ Flag', function () { st.flags[st.index] = !st.flags[st.index]; renderQuestion(); }, st.flags[st.index] ? 'btn-gold' : 'btn-outline');
  var last = st.index === st.questions.length - 1;
  var next = button(last ? 'Finish' : 'Next →', function () {
    if (last) confirmFinish(); else { st.index++; renderQuestion(); }
  }, last ? 'btn-green' : 'btn-primary');
  [prev, flag, next].forEach(function (b) { b.style.flex = '1'; nav.appendChild(b); });
  _root.appendChild(nav);

  // Question map
  var map = createElement('div', { attributes: { 'aria-label': 'Question map' } });
  map.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-top:12px';
  st.questions.forEach(function (_q, i) {
    var answered = st.answers[i] !== null;
    var m = createElement('button', {
      text: String(i + 1) + (st.flags[i] ? '🚩' : ''),
      className: 'btn btn-sm ' + (i === st.index ? 'btn-primary' : answered ? 'btn-green' : 'btn-outline'),
      attributes: { type: 'button', 'aria-label': 'Question ' + (i + 1) + (answered ? ', answered' : ', unanswered') + (st.flags[i] ? ', flagged' : '') }
    });
    m.style.cssText = 'min-width:34px;padding:4px 6px;font-size:10px';
    m.addEventListener('click', function () { st.index = i; renderQuestion(); });
    map.appendChild(m);
  });
  _root.appendChild(map);

  _root.appendChild(button('End exam now', confirmFinish, 'btn-outline btn-block'));
  _root.lastChild.style.marginTop = '10px';
}

function confirmFinish() {
  var st = _state;
  if (!st) return;
  var unanswered = st.answers.filter(function (a) { return a === null; }).length;
  var msg = unanswered > 0 ? unanswered + ' question(s) unanswered. Submit the exam anyway?' : 'Submit your exam?';
  if (window.confirm(msg)) finishExam();
}

function finishExam() {
  var st = _state;
  if (!st || st.finished) return;
  st.finished = true;
  stopTimer();

  var result = scoreExam(st.questions, st.answers);
  var durationSec = Math.round((Date.now() - st.startedAt) / 1000);

  var summary = {
    examId: st.id,
    date: new Date().toISOString().slice(0, 10),
    total: result.total,
    correct: result.correct,
    wrong: result.wrong,
    unanswered: result.unanswered,
    accuracy: result.accuracy,
    durationSec: durationSec,
    bySubject: result.bySubject,
    cardResults: st.questions.map(function (q, i) {
      return { cardId: q.card.id, subject: q.card.subj, answered: st.answers[i] !== null, correct: st.answers[i] === q.correctIndex };
    })
  };
  storage.finalizeExamSession(summary);
  // (main.js posts "scored X% on an exam simulation" to friends' feeds when the player has a public profile)
  document.dispatchEvent(new CustomEvent('dx:exam-finished', { detail: { accuracy: result.accuracy, total: result.total } }));
  renderResults(st, result, durationSec);
}

function renderResults(st, result, durationSec) {
  clearElement(_root);
  var band = readinessLabel(result.accuracy);

  var head = createElement('div');
  head.style.cssText = 'text-align:center;padding:10px 0';
  head.appendChild(createElement('h2', { text: '📋 Exam complete' }));
  head.appendChild(createElement('div', { text: result.correct + ' / ' + result.total }));
  head.lastChild.style.cssText = 'font-size:34px;font-weight:900;margin:6px 0';
  head.appendChild(createElement('div', { text: result.accuracy + '% — ' + band.label }));
  head.lastChild.style.cssText = 'font-size:15px;font-weight:800;color:' + band.color;
  head.appendChild(createElement('div', { text: band.note + ' Time used: ' + formatTime(durationSec) + '.' }));
  head.lastChild.style.cssText = 'font-size:11px;color:var(--text-muted);margin-top:4px';
  head.appendChild(createElement('div', { text: 'Practice score from this game’s question bank, not a licensing-exam prediction.' }));
  head.lastChild.style.cssText = 'font-size:10px;color:var(--text-muted);margin-top:2px';
  _root.appendChild(head);

  // By subject, weakest first
  _root.appendChild(createElement('h3', { text: 'By subject' }));
  _root.lastChild.style.cssText = 'margin:8px 0 6px';
  var subjects = Object.keys(result.bySubject).sort(function (a, b) {
    var A = result.bySubject[a], B = result.bySubject[b];
    return (A.ok / A.n) - (B.ok / B.n);
  });
  subjects.forEach(function (subj) {
    var s = result.bySubject[subj];
    var pct = Math.round(s.ok / s.n * 100);
    var row = createElement('div');
    row.style.margin = '6px 0';
    row.appendChild(createElement('div', { text: getSubjectStyle(subj).icon + ' ' + subj + ' — ' + s.ok + '/' + s.n + ' (' + pct + '%)' }));
    row.lastChild.style.fontSize = '12px';
    var bar = createElement('div', { attributes: { role: 'img', 'aria-label': subj + ' ' + pct + ' percent' } });
    bar.style.cssText = 'height:8px;border-radius:4px;background:rgba(255,255,255,0.12);overflow:hidden;margin-top:2px';
    var fill = createElement('div');
    fill.style.cssText = 'height:100%;width:' + pct + '%;background:' + getSubjectCssColor(subj);
    bar.appendChild(fill);
    row.appendChild(bar);
    _root.appendChild(row);
  });

  // Review
  var missed = st.questions.filter(function (q, i) { return st.answers[i] !== q.correctIndex; });
  if (missed.length > 0) {
    _root.appendChild(createElement('h3', { text: 'Review (' + missed.length + ')' }));
    _root.lastChild.style.cssText = 'margin:14px 0 6px';
    st.questions.forEach(function (q, i) {
      if (st.answers[i] === q.correctIndex) return;
      var item = createElement('div', { className: 'review-card' });
      item.appendChild(createElement('h4', { text: (q.card.bw || []).join(' • ') }));
      var chosen = st.answers[i] === null ? 'No answer' : q.options[st.answers[i]];
      item.appendChild(createElement('p', { text: 'Your answer: ' + chosen }));
      item.lastChild.style.cssText = 'font-size:11px;color:var(--accent-red)';
      item.appendChild(createElement('p', { text: 'Correct: ' + q.card.ans }));
      item.lastChild.style.cssText = 'font-size:12px;font-weight:700;color:var(--accent-green)';
      if (q.card.tp) {
        item.appendChild(createElement('p', { text: q.card.tp }));
        item.lastChild.style.cssText = 'font-size:11px;color:var(--text-secondary);margin-top:4px';
      }
      _root.appendChild(item);
    });
  }

  var actions = createElement('div');
  actions.style.cssText = 'display:flex;gap:6px;margin-top:14px;flex-wrap:wrap';
  if (missed.length > 0 && _deps.startFlashcards) {
    actions.appendChild(button('📖 Study missed cards', function () {
      _deps.startFlashcards(missed.map(function (q) { return q.card.id; }));
    }, 'btn-primary'));
  }
  actions.appendChild(button('🔁 New exam', renderSetup, 'btn-green'));
  actions.appendChild(button('🏠 Home', function () { if (_deps.goHome) _deps.goHome(); }, 'btn-outline'));
  Array.prototype.forEach.call(actions.children, function (b) { b.style.flex = '1'; });
  _root.appendChild(actions);
}
