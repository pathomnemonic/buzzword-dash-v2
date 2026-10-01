/**
 * cohortsui.js — the Cohorts screen (NOT RELEASED: main.js only wires it up
 * when FEATURES.cohorts is on). Three tabs: your cohort, the weekly war
 * ladder, and the school ladder.
 */

import { cohorts } from './cohorts.js';
import { getLeague } from './leagues.js';

function el(tag, className, text) {
  var e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(label, className, onClick) {
  var b = el('button', className || 'btn btn-primary', label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

function field(placeholder, maxLength) {
  var i = el('input', 'cohort-input');
  i.type = 'text';
  i.placeholder = placeholder;
  i.maxLength = maxLength;
  i.setAttribute('aria-label', placeholder);
  return i;
}

/** Mount the screen into `root`. */
export function mountCohorts(root) {
  root.textContent = '';
  root.appendChild(el('h2', null, '🛡️ Cohorts'));
  var tabs = el('div', 'cohort-tabs');
  tabs.setAttribute('role', 'tablist');
  var body = el('div', 'cohort-body');
  var current = 'mine';

  var views = {
    mine: { label: 'My Cohort', render: renderMine },
    war: { label: 'War Ladder', render: renderWar },
    schools: { label: 'Schools', render: renderSchools }
  };

  function select(id) {
    current = id;
    Array.prototype.forEach.call(tabs.children, function (b) {
      b.setAttribute('aria-selected', b.dataset.view === id ? 'true' : 'false');
      b.classList.toggle('active', b.dataset.view === id);
    });
    body.textContent = 'Loading…';
    views[id].render(body, function () { select(current); });
  }

  Object.keys(views).forEach(function (id) {
    var b = button(views[id].label, 'btn btn-outline btn-sm', function () { select(id); });
    b.dataset.view = id;
    b.setAttribute('role', 'tab');
    tabs.appendChild(b);
  });
  root.appendChild(tabs);
  root.appendChild(body);
  select('mine');
}

function showError(body, message) {
  body.textContent = '';
  body.appendChild(el('div', 'mp-status', message));
}

function renderMine(body, refresh) {
  cohorts.mine().then(function (r) {
    if (!r.ok) return showError(body, r.error);
    body.textContent = '';
    if (!r.cohort) return renderJoinOrCreate(body, refresh);
    var c = r.cohort;
    var card = el('div', 'cohort-card');
    card.appendChild(el('div', 'cohort-name', c.name));
    if (c.school) card.appendChild(el('div', 'cohort-school', '🏫 ' + c.school));
    if (c.description) card.appendChild(el('div', 'cohort-desc', c.description));
    card.appendChild(el('div', 'cohort-war', '⚔️ ' + c.war_points + ' war points this week'));
    card.appendChild(el('div', 'cohort-tag', 'Invite code: ' + c.tag));
    body.appendChild(card);

    var isLeader = c.my_role === 'leader';
    var canKick = c.my_role !== 'member';
    c.members.forEach(function (m) {
      var row = el('div', 'rk-row');
      row.appendChild(el('span', 'rk-name', getLeague(m.trophies).icon + ' ' + m.name + (m.role === 'member' ? '' : ' · ' + m.role)));
      row.appendChild(el('span', 'rk-score', '⚔️ ' + m.war_points));
      if (m.role !== 'leader' && (isLeader || (canKick && m.role === 'member'))) {
        var kick = button('Remove', 'btn btn-outline btn-sm', function () {
          cohorts.kick(m.user_id).then(function (k) { if (k.ok) refresh(); else showError(body, k.error); });
        });
        row.appendChild(kick);
      }
      if (isLeader && m.role === 'member') {
        row.appendChild(button('Officer', 'btn btn-outline btn-sm', function () {
          cohorts.setRole(m.user_id, 'officer').then(function (k) { if (k.ok) refresh(); else showError(body, k.error); });
        }));
      }
      body.appendChild(row);
    });
    body.appendChild(button('Leave cohort', 'btn btn-outline btn-block', function () {
      if (typeof confirm === 'function' && !confirm('Leave ' + c.name + '?')) return;
      cohorts.leave().then(function () { refresh(); });
    }));
  });
}

function renderJoinOrCreate(body, refresh) {
  body.appendChild(el('p', 'cohort-desc', 'Join a cohort to team up with classmates and compete in weekly cohort wars.'));

  var search = field('Search by cohort or school', 40);
  var results = el('div', 'cohort-results');
  var go = button('Search', 'btn btn-primary btn-sm', function () {
    results.textContent = 'Searching…';
    cohorts.search(search.value.trim()).then(function (r) {
      results.textContent = '';
      if (!r.ok) return showError(results, r.error);
      if (!r.results.length) results.appendChild(el('div', 'mp-status', 'No cohorts found. Start one!'));
      r.results.forEach(function (c) {
        var row = el('div', 'rk-row');
        row.appendChild(el('span', 'rk-name', c.name + (c.school ? ' · ' + c.school : '')));
        row.appendChild(el('span', 'rk-score', c.members + '/' + c.max_members));
        row.appendChild(button('Join', 'btn btn-green btn-sm', function () {
          cohorts.join(c.tag).then(function (j) { if (j.ok) refresh(); else showError(results, j.error); });
        }));
        results.appendChild(row);
      });
    });
  });
  body.appendChild(search);
  body.appendChild(go);
  body.appendChild(results);

  var code = field('Have an invite code?', 5);
  body.appendChild(code);
  body.appendChild(button('Join with code', 'btn btn-outline btn-sm', function () {
    cohorts.join(code.value.trim()).then(function (j) { if (j.ok) refresh(); else showError(body, j.error); });
  }));

  body.appendChild(el('h3', null, 'Start a cohort'));
  var name = field('Cohort name', 30);
  var school = field('School (optional)', 60);
  var desc = field('One-line description (optional)', 140);
  [name, school, desc].forEach(function (f) { body.appendChild(f); });
  body.appendChild(button('Create cohort', 'btn btn-green btn-block', function () {
    cohorts.create(name.value, school.value, desc.value).then(function (c) { if (c.ok) refresh(); else showError(body, c.error); });
  }));
}

function renderLadder(body, rows, label, nameOf, detailOf) {
  body.textContent = '';
  if (!rows.length) {
    body.appendChild(el('div', 'mp-status', 'No ' + label + ' on the board yet this week. Win ranked matches to score war points.'));
    return;
  }
  rows.forEach(function (r) {
    var row = el('div', 'rk-row');
    row.appendChild(el('span', 'rk-pos', '#' + r.rank));
    row.appendChild(el('span', 'rk-name', nameOf(r)));
    row.appendChild(el('span', 'rk-score', '⚔️ ' + r.war_points));
    if (detailOf) row.title = detailOf(r);
    body.appendChild(row);
  });
}

function renderWar(body) {
  cohorts.warStandings().then(function (r) {
    if (!r.ok) return showError(body, r.error);
    renderLadder(body, r.rows, 'cohorts', function (c) { return c.name + (c.school ? ' · ' + c.school : ''); });
  });
}

function renderSchools(body) {
  cohorts.schoolStandings().then(function (r) {
    if (!r.ok) return showError(body, r.error);
    renderLadder(body, r.rows, 'schools', function (s) { return '🏫 ' + s.name + ' (' + s.cohorts + ' cohort' + (s.cohorts === 1 ? '' : 's') + ')'; });
  });
}
