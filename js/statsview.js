/**
 * statsview.js — the Performance tab.
 *
 * Laid out the way a game dashboard is: the one thing to do next sits at the top as a big button, three numbers
 * you can read at a glance sit under it, and everything else is folded into sections that open when tapped. Only
 * short labels and numbers are shown by default; explanations live in the section they belong to.
 *
 *   Today card      goal progress, streak, and the next study step (more steps fold under "More ways")
 *   Three tiles     due now, accuracy, days to the exam (each opens its section)
 *   Sections        Reviews coming up, Subjects (level and accuracy), Weakest concepts, Lifetime, Plan settings
 */

import { createElement, setText } from './dom.js';
import { storage } from './storage.js';
import { CARDS, SUBJECTS } from './cardhub.js';
import { customCards } from './customcards.js';
import { buildStudyPlan } from './studyplan.js';
import { masteryLevel, examPace } from './readiness.js';

var _open = {};            // which sections are open (kept while the app is running)
var _scrollTo = null;

var LEVEL_STYLE = {
  New: { icon: '🌱', color: 'var(--text-muted)' },
  Learning: { icon: '📖', color: 'var(--accent-orange)' },
  Solid: { icon: '💪', color: 'var(--accent-blue)' },
  Mastered: { icon: '⭐', color: 'var(--accent-gold)' }
};

var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function el(tag, className, text) {
  var e = createElement(tag, { className: className || '' });
  if (text !== undefined) e.textContent = text;
  return e;
}

/** A thin bar, filled to a fraction (0 to 1), in a color. */
function bar(fraction, color, label) {
  var track = el('div', 'perf-bar');
  track.setAttribute('role', 'img');
  if (label) track.setAttribute('aria-label', label);
  var fill = el('div', 'perf-bar-fill');
  fill.style.width = Math.max(2, Math.round(Math.min(1, Math.max(0, fraction)) * 100)) + '%';
  fill.style.background = color;
  track.appendChild(fill);
  return track;
}

function pctColor(p) {
  return p >= 0.8 ? 'var(--accent-green)' : p >= 0.6 ? 'var(--accent-gold)' : 'var(--accent-red)';
}

/** A folded section: a row with an icon, a title and a short value, that opens to its content. */
function section(id, icon, title, hint, build) {
  var d = el('details', 'perf-section');
  d.id = 'perf-' + id;
  d.open = !!_open[id];
  var sum = el('summary', 'perf-summary');
  sum.appendChild(el('span', 'perf-icon', icon));
  sum.appendChild(el('span', 'perf-title', title));
  var h = el('span', 'perf-hint', hint || '');
  sum.appendChild(h);
  d.appendChild(sum);
  var body = el('div', 'perf-body');
  d.appendChild(body);
  var built = false;
  function ensure() { if (!built) { built = true; build(body); } }
  d._ensure = ensure;
  if (d.open) ensure();
  d.addEventListener('toggle', function () { _open[id] = d.open; if (d.open) ensure(); });
  return d;
}

function tile(icon, value, label, onTap, accent) {
  var t = createElement('button', { className: 'perf-tile', attributes: { type: 'button' } });
  t.appendChild(el('div', 'perf-tile-icon', icon));
  var v = el('div', 'perf-tile-value', value);
  if (accent) v.style.color = accent;
  t.appendChild(v);
  t.appendChild(el('div', 'perf-tile-label', label));
  t.setAttribute('aria-label', label + ': ' + value);
  if (onTap) t.addEventListener('click', onTap);
  return t;
}

function liveCards() {
  var disabled = storage.get('disabledCards') || [];
  return CARDS.concat(customCards.getAll()).filter(function (c) { return disabled.indexOf(c.id) < 0; });
}

/** The cards each plan step is about (for the runner; flashcards pick their own). */
function stepCards(step, plan, cards) {
  var stats = storage.get('cardStats') || {};
  if (step.kind === 'due') return plan.dueIds.slice(0, 20);
  if (step.kind === 'weak') {
    return cards.filter(function (c) { return c.subj === step.subject; }).map(function (c) {
      var st = stats[c.id];
      return { id: c.id, acc: st && st.seen ? st.correct / st.seen : 0.5 };
    }).sort(function (x, y) { return x.acc - y.acc; }).slice(0, 20).map(function (x) { return x.id; });
  }
  return cards.slice().sort(function (x, y) {
    var sx = stats[x.id]; var sy = stats[y.id];
    return (sx && sx.seen ? sx.lastSeen || 1 : 0) - (sy && sy.seen ? sy.lastSeen || 1 : 0);
  }).slice(0, Math.min(25, step.count || 10)).map(function (c) { return c.id; });
}

/** Short labels for plan steps (the plan's own labels are sentences). */
function shortLabel(step) {
  if (step.kind === 'due') return 'Review ' + step.count + ' due';
  if (step.kind === 'weak') return 'Drill ' + step.subject;
  return step.count + ' new cards';
}

function stepButtons(ui, step, plan, cards, small) {
  var row = el('div', 'perf-step-buttons');
  var run = createElement('button', { className: 'btn btn-green ' + (small ? 'btn-sm' : ''), text: '🏃 Run it', attributes: { type: 'button', 'aria-label': 'Run ' + shortLabel(step) } });
  run.addEventListener('click', function () {
    var ids = stepCards(step, plan, cards);
    if (ui.onStudyPlanRun && ids.length) ui.onStudyPlanRun(ids); else ui._showToast('No cards to study for this step yet.');
  });
  var flash = createElement('button', { className: 'btn btn-outline ' + (small ? 'btn-sm' : ''), text: '🗂 Cards', attributes: { type: 'button', 'aria-label': 'Flashcards: ' + shortLabel(step) } });
  flash.addEventListener('click', function () {
    if (step.kind === 'due') ui.startFlashcardSession(null, plan.dueIds.slice(0, 20));
    else if (step.kind === 'weak') ui.startFlashcardSession([step.subject]);
    else ui.startFlashcardSession();
  });
  row.appendChild(run);
  row.appendChild(flash);
  return row;
}

function openSection(id) {
  _open[id] = true;
  _scrollTo = id;
  var d = document.getElementById('perf-' + id);
  if (d) {
    d.open = true;
    if (d._ensure) d._ensure();
    if (d.scrollIntoView) d.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

/**
 * @param {HTMLElement} container
 * @param {object} ui the interface (study callbacks, toast, navigation)
 */
export function renderPerformance(container, ui) {
  var cards = liveCards();
  var plan = buildStudyPlan({
    cardStats: storage.get('cardStats') || {},
    cards: cards,
    subjectStats: storage.get('subjectStats') || {},
    goal: storage.get('dailyGoal') || 20,
    studiedToday: storage.getStudiedToday()
  });
  var stats = storage.get('cardStats') || {};
  var unseen = cards.filter(function (c) { return !stats[c.id] || !stats[c.id].seen; }).length;
  var pace = examPace({ examDate: storage.get('examDate') || '', unseen: unseen, due: plan.dueCount, dailyGoal: storage.get('dailyGoal') || 20 });

  // ---------- Today ----------
  var goal = storage.get('dailyGoal') || 20;
  var done = storage.getStudiedToday();
  var streak = storage.getStreakStatus();
  var hero = el('div', 'perf-hero');
  var top = el('div', 'perf-hero-top');
  top.appendChild(el('span', 'perf-hero-label', 'TODAY'));
  top.appendChild(el('span', 'perf-hero-streak', '🔥 ' + streak.streak + (streak.streak === 1 ? ' day' : ' days')));
  hero.appendChild(top);
  var goalLine = el('div', 'perf-goal-line');
  goalLine.appendChild(el('span', '', '🎯 ' + Math.min(done, goal) + ' / ' + goal + ' cards'));
  if (done >= goal) goalLine.appendChild(el('span', 'perf-goal-done', 'Goal reached ✅'));
  hero.appendChild(goalLine);
  var goalBar = bar(done / goal, done >= goal ? 'var(--accent-green)' : 'var(--accent-gold)', 'Daily goal progress');
  goalBar.classList.add('perf-bar-big');
  hero.appendChild(goalBar);

  if (plan.steps.length === 0) {
    hero.appendChild(el('div', 'perf-next-title', 'All caught up! 🎉'));
    var play = createElement('button', { className: 'btn btn-green btn-block', text: '▶ Play a run', attributes: { type: 'button' } });
    play.addEventListener('click', function () { ui.show('screenHome'); });
    hero.appendChild(play);
  } else {
    hero.appendChild(el('div', 'perf-next-label', 'NEXT UP'));
    hero.appendChild(el('div', 'perf-next-title', shortLabel(plan.steps[0])));
    hero.appendChild(stepButtons(ui, plan.steps[0], plan, cards, false));
    if (plan.steps.length > 1) {
      var more = el('details', 'perf-more');
      more.appendChild(el('summary', '', 'More ways to study (' + (plan.steps.length - 1) + ')'));
      plan.steps.slice(1).forEach(function (s) {
        var r = el('div', 'perf-more-row');
        r.appendChild(el('div', 'perf-more-title', shortLabel(s)));
        r.appendChild(stepButtons(ui, s, plan, cards, true));
        more.appendChild(r);
      });
      hero.appendChild(more);
    }
  }
  container.appendChild(hero);

  // ---------- Three numbers ----------
  var tiles = el('div', 'perf-tiles');
  tiles.appendChild(tile('🔁', String(plan.dueCount), 'Due now', function () { openSection('reviews'); }, plan.dueCount > 0 ? 'var(--accent-gold)' : null));
  var tcAll = storage.get('totalCorrect');
  var twAll = storage.get('totalWrong');
  var accAll = (tcAll + twAll) > 0 ? tcAll / (tcAll + twAll) : null;
  tiles.appendChild(tile('🎯', accAll === null ? '—' : Math.round(accAll * 100) + '%', 'Accuracy', function () { openSection('subjects'); }, accAll === null ? null : pctColor(accAll)));
  tiles.appendChild(tile('📅', pace && pace.daysLeft >= 0 ? pace.daysLeft + 'd' : 'Set', 'To exam', function () { openSection('settings'); }));
  container.appendChild(tiles);

  // ---------- Folded sections ----------
  container.appendChild(section('reviews', '📅', 'Reviews coming up', plan.dueCount + ' due', function (body) {
    var counts = [plan.dueCount].concat(plan.forecast);
    var max = Math.max(1, Math.max.apply(null, counts));
    var chart = el('div', 'perf-chart');
    chart.setAttribute('role', 'img');
    chart.setAttribute('aria-label', 'Reviews due now ' + plan.dueCount + '; next seven days ' + plan.forecast.join(', '));
    var today = new Date().getDay();
    counts.forEach(function (n, i) {
      var col = el('div', 'perf-col');
      col.appendChild(el('div', 'perf-col-n', String(n)));
      var b = el('div', 'perf-col-bar');
      b.style.height = Math.max(3, Math.round(n / max * 56)) + 'px';
      b.style.background = i === 0 ? 'var(--accent-gold)' : 'var(--accent-cyan)';
      col.appendChild(b);
      col.appendChild(el('div', 'perf-col-d', i === 0 ? 'Now' : DAY_NAMES[(today + i) % 7]));
      chart.appendChild(col);
    });
    body.appendChild(chart);
  }));

  container.appendChild(section('subjects', '📚', 'Subjects', accuracyHint(), function (body) {
    var any = false;
    SUBJECTS.forEach(function (s) {
      var ss = storage.getSubjectStat(s);
      var total = ss.correct + ss.wrong;
      if (total === 0) return;
      any = true;
      var a = ss.correct / total;
      var lv = LEVEL_STYLE[masteryLevel(ss.correct, ss.wrong)];
      var level = masteryLevel(ss.correct, ss.wrong);
      var r = el('div', 'perf-row');
      var head = el('div', 'perf-row-head');
      head.appendChild(el('div', 'perf-row-name', s));
      var chip = el('span', 'perf-chip', lv.icon + ' ' + level);
      chip.style.color = lv.color;
      head.appendChild(chip);
      r.appendChild(head);
      r.appendChild(bar(a, pctColor(a), s + ' ' + Math.round(a * 100) + '% correct'));
      r.appendChild(el('div', 'perf-row-sub', Math.round(a * 100) + '% correct  ·  ' + total + ' answered'));
      body.appendChild(r);
    });
    if (!any) body.appendChild(el('p', 'perf-empty', 'Answer some cards and your subjects show up here.'));
    if (plan.typeAccuracy.length > 0) {
      body.appendChild(el('div', 'perf-subhead', 'By question type'));
      plan.typeAccuracy.slice(0, 5).forEach(function (t) {
        var r = el('div', 'perf-line');
        r.appendChild(el('span', 'perf-line-name', t.type.replace(/_/g, ' ')));
        r.appendChild(bar(t.accuracy / 100, pctColor(t.accuracy / 100), t.type.replace(/_/g, ' ') + ' ' + t.accuracy + '% correct'));
        r.appendChild(el('span', 'perf-line-val', t.accuracy + '%'));
        body.appendChild(r);
      });
    }
    body.appendChild(el('div', 'perf-note', 'Levels: New under 10 answers, Learning, Solid (25+ answers at 70%+), Mastered (50+ answers at 85%+).'));
  }));

  var weak = cards.map(function (c) {
    var s = storage.getCardStat(c.id);
    return s.seen < 2 ? null : { card: c, accuracy: s.correct / s.seen, seen: s.seen };
  }).filter(Boolean).sort(function (a, b) { return a.accuracy - b.accuracy; }).slice(0, 5);
  container.appendChild(section('weak', '🎯', 'Weakest concepts', weak.length ? String(weak.length) : '', function (body) {
    if (weak.length === 0) { body.appendChild(el('p', 'perf-empty', 'Play more to see weak areas.')); return; }
    weak.forEach(function (w) {
      var row = createElement('button', { className: 'perf-weak', attributes: { type: 'button', 'aria-label': 'Review ' + w.card.ans } });
      var pct = el('span', 'perf-weak-pct', Math.round(w.accuracy * 100) + '%');
      var ans = el('span', 'perf-weak-ans');
      setText(ans, w.card.ans); // (custom card text: never markup)
      var subj = el('span', 'perf-weak-subj');
      setText(subj, w.card.subj);
      var mid = el('span', 'perf-weak-mid');
      mid.appendChild(ans);
      mid.appendChild(subj);
      row.appendChild(pct);
      row.appendChild(mid);
      row.appendChild(el('span', 'perf-weak-go', 'Review'));
      row.addEventListener('click', function () {
        var ordered = [w].concat(weak.filter(function (x) { return x !== w; }));
        ui.showQuickReview(ordered.map(function (x) { return { card: x.card }; }));
      });
      body.appendChild(row);
    });
  }));

  container.appendChild(section('lifetime', '🏅', 'Lifetime', storage.get('totalEncounters') + ' cards', function (body) {
    var tc = storage.get('totalCorrect');
    var tw = storage.get('totalWrong');
    var acc = (tc + tw) > 0 ? Math.round(tc / (tc + tw) * 100) : 0;
    var grid = el('div', 'perf-lifetime');
    [['Cards', storage.get('totalEncounters'), null], ['Correct', tc, 'var(--accent-green)'], ['Wrong', tw, 'var(--accent-red)'], ['Accuracy', acc + '%', null], ['Best score', storage.get('bestScore'), 'var(--accent-gold)']].forEach(function (s) {
      var t = el('div', 'perf-stat');
      var v = el('div', 'perf-stat-val', String(s[1]));
      if (s[2]) v.style.color = s[2];
      t.appendChild(v);
      t.appendChild(el('div', 'perf-stat-label', s[0]));
      grid.appendChild(t);
    });
    body.appendChild(grid);
  }));

  container.appendChild(section('settings', '⚙', 'Plan settings', pace ? (pace.daysLeft >= 0 ? pace.daysLeft + ' days to exam' : 'Date passed') : 'No exam date', function (body) {
    var paceLine = el('div', 'perf-pace');
    paceLine.id = 'examPaceLine';
    function refreshPace() {
      var st = storage.get('cardStats') || {};
      var un = cards.filter(function (c) { return !st[c.id] || !st[c.id].seen; }).length;
      var p = examPace({ examDate: storage.get('examDate') || '', unseen: un, due: storage.getDueCount(), dailyGoal: storage.get('dailyGoal') || 20 });
      paceLine.textContent = p ? p.text : 'Add your exam date and the plan paces the days you have left.';
    }
    var r1 = el('div', 'perf-field');
    var l1 = createElement('label', { text: '📅 Exam date', attributes: { for: 'examDateInput' } });
    var input = createElement('input', { attributes: { type: 'date', id: 'examDateInput', value: storage.get('examDate') || '' } });
    input.addEventListener('change', function () {
      storage.set('examDate', /^\d{4}-\d{2}-\d{2}$/.test(input.value) ? input.value : '');
      refreshPace();
    });
    r1.appendChild(l1);
    r1.appendChild(input);
    body.appendChild(r1);
    body.appendChild(paceLine);
    refreshPace();

    var r2 = el('div', 'perf-field');
    var l2 = createElement('label', { text: '🎯 Remember when due', attributes: { for: 'retentionSelect' } });
    var sel = createElement('select', { attributes: { id: 'retentionSelect' } });
    [[0.8, '80% · fewer reviews'], [0.85, '85%'], [0.9, '90% · recommended'], [0.95, '95% · more reviews']].forEach(function (o) {
      var opt = createElement('option', { text: o[1], attributes: { value: String(o[0]) } });
      if (Math.abs((storage.get('targetRetention') || 0.9) - o[0]) < 0.001) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', function () { storage.set('targetRetention', Number(sel.value)); });
    r2.appendChild(l2);
    r2.appendChild(sel);
    body.appendChild(r2);
    body.appendChild(el('div', 'perf-note', 'ⓘ Reviews are timed by FSRS, the same algorithm Anki uses. A higher number means more reviews.'));
  }));

  if (_scrollTo) {
    var target = document.getElementById('perf-' + _scrollTo);
    _scrollTo = null;
    if (target && target.scrollIntoView) target.scrollIntoView({ block: 'center' });
  }

  function accuracyHint() {
    var tc = storage.get('totalCorrect');
    var tw = storage.get('totalWrong');
    return (tc + tw) > 0 ? Math.round(tc / (tc + tw) * 100) + '%' : '';
  }
}
