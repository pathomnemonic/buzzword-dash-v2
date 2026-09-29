/**
 * leaderboardui.js — Leaderboard, friends, requests and account screen.
 *
 * Renders into #leaderboardContent with safe DOM APIs only (all remote
 * values go through textContent). Talks to the `leaderboard` service.
 *
 * Tabs: Global | Friends | Requests | Find | Account
 */

import { createElement, clearElement } from './dom.js';

var BOARD_MODES = ['endless', 'tournament', 'daily', 'weakness', 'study', 'mp_highscore', 'mp_suddendeath', 'mp_race'];

var _state = { tab: 'global', mode: 'endless', period: 'week', groupId: null, requestCount: 0, searchTerm: '', searchResults: null };
var _root = null;
var _deps = null;

/**
 * Mount (or re-mount) the screen.
 *
 * @param {HTMLElement} container
 * @param {object} deps
 * @param {object} deps.leaderboard - leaderboard service
 * @param {object} deps.storage - storage singleton
 * @param {function(string)} deps.toast - shows a short message
 * @param {function(): string} deps.getRoomCode - current hosted room code or ''
 */
export function mountLeaderboardScreen(container, deps) {
  _root = container;
  _deps = deps;
  render();
}

// ===== helpers =====

function lb() { return _deps.leaderboard; }

function btn(label, onClick, className) {
  var b = createElement('button', {
    className: 'btn btn-sm ' + (className || 'btn-outline'),
    text: label,
    attributes: { type: 'button' }
  });
  b.addEventListener('click', function () {
    b.disabled = true;
    Promise.resolve(onClick()).then(function () { b.disabled = false; }, function () { b.disabled = false; });
  });
  return b;
}

function note(text, color) {
  var el = createElement('div', { className: 'mp-status', text: text });
  if (color) el.style.color = color;
  return el;
}

function rowShell() {
  var row = createElement('div', { className: 'setting-row' });
  row.style.gap = '8px';
  return row;
}

function nameBlock(name, sub) {
  var block = createElement('div');
  block.style.flex = '1';
  block.style.minWidth = '0';
  var n = createElement('div', { text: name || 'Anonymous' });
  n.style.fontSize = '13px';
  n.style.fontWeight = '700';
  n.style.overflow = 'hidden';
  n.style.textOverflow = 'ellipsis';
  block.appendChild(n);
  if (sub) {
    var s = createElement('div', { text: sub });
    s.style.fontSize = '10px';
    s.style.color = 'var(--text-muted)';
    block.appendChild(s);
  }
  return block;
}

function refreshRequestCount() {
  return lb().getPendingRequests().then(function (reqs) {
    var changed = _state.requestCount !== reqs.length;
    _state.requestCount = reqs.length;
    return changed;
  });
}

// ===== top-level render =====

function render() {
  if (!_root) return;
  clearElement(_root);

  var status = lb().getStatus();

  if (!status.configured) {
    _root.appendChild(note('The leaderboard is not set up yet. Add your Supabase URL and anon key (see README → Leaderboard Setup) to enable it.'));
    return;
  }
  if (!status.authenticated) {
    var msg = status.ready
      ? 'Could not sign in to the leaderboard.' + (status.error ? ' (' + status.error + ')' : '')
      : 'Connecting to the leaderboard…';
    _root.appendChild(note(msg, status.ready ? 'var(--accent-red)' : null));
    _root.appendChild(btn('Retry', function () {
      return lb().init().then(function () { return lb().isAuthenticated() ? null : lb().signInAnonymously(); })
        .then(render);
    }, 'btn-primary'));
    return;
  }

  _root.appendChild(renderIdentity());

  var tabs = createElement('div', { attributes: { role: 'tablist', 'aria-label': 'Leaderboard sections' } });
  tabs.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin:10px 0';
  [
    ['global', '🌍 Global'],
    ['friends', '👥 Friends'],
    ['feed', '📰 Feed'],
    ['groups', '👪 Groups'],
    ['requests', '📨 Requests' + (_state.requestCount ? ' (' + _state.requestCount + ')' : '')],
    ['find', '🔍 Find'],
    ['account', '⚙ Account']
  ].forEach(function (t) {
    var b = createElement('button', {
      className: 'btn btn-sm ' + (_state.tab === t[0] ? 'btn-primary' : 'btn-outline'),
      text: t[1],
      attributes: { type: 'button', role: 'tab', 'aria-selected': _state.tab === t[0] ? 'true' : 'false' }
    });
    b.addEventListener('click', function () { _state.tab = t[0]; render(); });
    tabs.appendChild(b);
  });
  _root.appendChild(tabs);

  var body = createElement('div', { attributes: { 'aria-live': 'polite' } });
  _root.appendChild(body);

  var loaders = {
    global: renderGlobal,
    friends: renderFriends,
    feed: renderFeed,
    groups: renderGroups,
    requests: renderRequests,
    find: renderFind,
    account: renderAccount
  };
  loaders[_state.tab](body);

  // Keep the Requests badge fresh without blocking the first paint.
  if (_state.tab !== 'requests') {
    refreshRequestCount().then(function (changed) { if (changed) render(); });
  }
}

// ===== identity (display name + visibility) =====

function renderIdentity() {
  var storage = _deps.storage;
  var wrap = createElement('div');
  wrap.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap';

  var input = createElement('input', {
    attributes: {
      type: 'text', maxlength: '30', placeholder: 'Choose a display name',
      'aria-label': 'Display name', value: storage.get('profileName') || ''
    }
  });
  input.style.cssText = 'flex:1;min-width:140px;padding:8px 10px;border-radius:10px;background:rgba(30,15,70,.8);color:#fff;border:1px solid rgba(187,102,255,.3)';
  wrap.appendChild(input);

  wrap.appendChild(btn('Save', function () {
    var name = input.value.trim().slice(0, 30);
    if (!name) { _deps.toast('Enter a display name first.'); return null; }
    storage.set('profileName', name);
    storage.set('profileVisible', true);
    return syncProfile().then(function (res) {
      _deps.toast(res.success ? 'Profile saved.' : 'Could not save profile: ' + res.error);
      render();
    });
  }, 'btn-primary'));

  var vis = storage.get('profileVisible');
  var hint = createElement('div', {
    text: vis && storage.get('profileName')
      ? 'Your scores are public on the leaderboard.'
      : 'Set a name to appear on the leaderboard and get friend requests.'
  });
  hint.style.cssText = 'width:100%;font-size:10px;color:var(--text-muted)';
  wrap.appendChild(hint);
  return wrap;
}

function syncProfile() {
  var storage = _deps.storage;
  return lb().ensureProfile({
    playerName: storage.get('profileName') || 'Anonymous',
    avatar: storage.get('profilePicture') || 'avatar_intern',
    badges: storage.get('selectedBadges') || [],
    visible: !!storage.get('profileVisible')
  });
}

// ===== Global =====

function renderGlobal(body) {
  var sel = createElement('select', { attributes: { 'aria-label': 'Game mode' } });
  sel.style.cssText = 'padding:8px;border-radius:10px;background:rgba(30,15,70,.8);color:#fff;border:1px solid rgba(187,102,255,.3);margin-bottom:8px';
  BOARD_MODES.forEach(function (m) {
    var o = createElement('option', { text: lb().getModeLabel(m), attributes: { value: m } });
    if (m === _state.mode) o.selected = true;
    sel.appendChild(o);
  });
  sel.addEventListener('change', function () { _state.mode = sel.value; render(); });
  body.appendChild(sel);

  var periodSel = createElement('select', { attributes: { 'aria-label': 'Time period' } });
  periodSel.style.cssText = 'padding:8px;border-radius:10px;background:rgba(30,15,70,.8);color:#fff;border:1px solid rgba(187,102,255,.3);margin:0 0 8px 6px';
  [['week', 'This week'], ['all', 'All time']].forEach(function (p) {
    var o = createElement('option', { text: p[1], attributes: { value: p[0] } });
    if (p[0] === _state.period) o.selected = true;
    periodSel.appendChild(o);
  });
  periodSel.addEventListener('change', function () { _state.period = periodSel.value; render(); });
  body.appendChild(periodSel);

  var list = createElement('div');
  list.appendChild(note('Loading…'));
  body.appendChild(list);

  Promise.all([
    lb().getTopScores({ mode: _state.mode, period: _state.period, limit: 50 }),
    lb().getFriends()
  ]).then(function (res) {
    var scores = res[0];
    var friendIds = res[1].map(function (f) { return f.user_id; });
    clearElement(list);
    if (scores.length === 0) {
      list.appendChild(note(_state.period === 'week' ? 'No scores yet this week — be the first!' : 'No scores yet for this mode — be the first!'));
      return;
    }
    scores.forEach(function (s, i) {
      list.appendChild(playerRow({
        rank: i + 1,
        userId: s.user_id,
        name: s.player_name,
        sub: s.accuracy + '% accuracy · best streak ' + s.best_streak,
        value: Number(s.score).toLocaleString(),
        isFriend: friendIds.indexOf(s.user_id) >= 0
      }));
    });
  });
}

// One row shared by global and search lists.
function playerRow(p) {
  var row = rowShell();
  var me = p.userId === lb().getUserId();
  if (p.rank) {
    var rank = createElement('div', { text: p.rank <= 3 ? ['🥇', '🥈', '🥉'][p.rank - 1] : '#' + p.rank });
    rank.style.cssText = 'width:34px;font-weight:800;font-size:13px';
    row.appendChild(rank);
  }
  row.appendChild(nameBlock(p.name + (me ? ' (you)' : ''), p.sub));
  if (p.value !== undefined) {
    var v = createElement('div', { text: p.value });
    v.style.cssText = 'font-weight:800;color:var(--accent-gold)';
    row.appendChild(v);
  }
  if (!me) {
    if (p.isFriend) {
      row.appendChild(createElement('span', { text: '✓ Friend' }));
    } else {
      row.appendChild(btn('＋ Add', function () { return addFriend(p.userId); }));
    }
    row.appendChild(btn('⚑', function () { return reportPlayer(p.userId, p.name); }));
  }
  return row;
}

function addFriend(userId) {
  return lb().sendFriendRequest(userId).then(function (res) {
    _deps.toast(res.success ? 'Friend request sent!' : (res.error || 'Could not send request.'));
  });
}

function reportPlayer(userId, name) {
  var reason = window.prompt('Why are you reporting ' + name + '?');
  if (!reason || !reason.trim()) return Promise.resolve();
  return lb().reportUser(userId, reason).then(function (res) {
    _deps.toast(res.success ? 'Report submitted. Thank you.' : (res.error || 'Could not submit report.'));
  });
}

// ===== Friends =====

function renderFriends(body) {
  var list = createElement('div');
  list.appendChild(note('Loading…'));
  body.appendChild(list);

  lb().getFriends().then(function (friends) {
    clearElement(list);
    if (friends.length === 0) {
      list.appendChild(note('No friends yet. Use Find or tap ＋ Add on the global board.'));
      return;
    }
    friends.sort(function (a, b) { return (b.best_score || 0) - (a.best_score || 0); });
    friends.forEach(function (f, i) {
      var row = rowShell();
      var rank = createElement('div', { text: '#' + (i + 1) });
      rank.style.cssText = 'width:34px;font-weight:800;font-size:13px';
      row.appendChild(rank);
      row.appendChild(nameBlock(f.player_name, 'best streak ' + (f.best_streak || 0)));
      var v = createElement('div', { text: Number(f.best_score || 0).toLocaleString() });
      v.style.cssText = 'font-weight:800;color:var(--accent-gold)';
      row.appendChild(v);

      row.appendChild(btn('🎮 Invite', function () {
        var code = _deps.getRoomCode();
        if (!code) {
          _deps.toast('Host a game first (Multiplayer → Host), then invite your friend.');
          return null;
        }
        return lb().sendInvite({ toUserId: f.user_id, roomCode: code }).then(function (res) {
          _deps.toast(res.success ? 'Invite sent to ' + f.player_name + '!' : (res.error || 'Could not send invite.'));
        });
      }));
      row.appendChild(btn('✕', function () {
        if (!window.confirm('Remove ' + f.player_name + ' from your friends?')) return null;
        return lb().removeFriend(f.user_id).then(render);
      }));
      row.appendChild(btn('🚫', function () {
        if (!window.confirm('Block ' + f.player_name + '? They will be removed from your friends and cannot send requests.')) return null;
        return lb().blockUser(f.user_id).then(function (res) {
          _deps.toast(res.success ? 'Player blocked.' : (res.error || 'Could not block player.'));
          render();
        });
      }));
      list.appendChild(row);
    });
  });
}

// ===== Feed =====

function timeAgo(iso) {
  var minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return minutes + 'm ago';
  var hours = Math.round(minutes / 60);
  if (hours < 24) return hours + 'h ago';
  return Math.round(hours / 24) + 'd ago';
}

function describeActivity(e) {
  var p = e.payload || {};
  var who = String(p.name || 'A friend').slice(0, 30);
  switch (e.kind) {
    case 'new_best': return ['🏅', who + ' set a new best score: ' + Number(p.score || 0).toLocaleString()];
    case 'streak': return ['🔥', who + ' hit a ' + Number(p.streak || 0) + '-answer streak'];
    case 'tournament': return ['🏆', who + ' placed #' + Number(p.rank || 0) + ' of ' + Number(p.total || 0) + ' in the weekly tournament'];
    case 'exam': return ['📝', who + ' scored ' + Number(p.accuracy || 0) + '% on an exam simulation'];
    case 'group_join': return ['👪', who + ' joined a study group'];
    default: return ['✨', who + ' did something great'];
  }
}

function renderFeed(body) {
  body.appendChild(note('Highlights from you and your friends.'));
  var list = createElement('div');
  list.appendChild(note('Loading\u2026'));
  body.appendChild(list);
  lb().getFeed().then(function (events) {
    clearElement(list);
    if (events.length === 0) {
      list.appendChild(note('Nothing yet. Play a run, or add friends from the Find tab.'));
      return;
    }
    events.forEach(function (e) {
      var d = describeActivity(e);
      var row = rowShell();
      var icon = createElement('div', { text: d[0] });
      icon.style.fontSize = '20px';
      row.appendChild(icon);
      row.appendChild(nameBlock(d[1], timeAgo(e.created_at)));
      if (e.user_id !== lb().getUserId() && _deps.startChallenge) {
        row.appendChild(btn('\u2694 Challenge', function () { _deps.startChallenge(); }));
      }
      list.appendChild(row);
    });
  });
}

// ===== Groups =====

function renderGroups(body) {
  body.appendChild(note('Private boards for a class or study group. Share the code so classmates can join.'));

  // Create / join
  var forms = createElement('div');
  forms.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin:8px 0';

  function inputRow(placeholder, label, maxlen, onSubmit) {
    var row = createElement('div');
    row.style.cssText = 'display:flex;gap:6px';
    var input = createElement('input', { attributes: { type: 'text', maxlength: String(maxlen), placeholder: placeholder, 'aria-label': placeholder } });
    input.style.cssText = 'flex:1;padding:8px 10px;border-radius:10px;background:rgba(30,15,70,.8);color:#fff;border:1px solid rgba(187,102,255,.3)';
    row.appendChild(input);
    row.appendChild(btn(label, function () { return onSubmit(input.value.trim()); }, 'btn-primary'));
    return row;
  }

  forms.appendChild(inputRow('New group name', 'Create', 40, function (name) {
    if (name.length < 2) { _deps.toast('Give the group a name (2+ characters).'); return null; }
    return lb().createGroup(name).then(function (res) {
      _deps.toast(res.success ? 'Group created! Code: ' + res.data.code : (res.error || 'Could not create group.'));
      if (res.success) _state.groupId = res.data.id;
      render();
    });
  }));
  forms.appendChild(inputRow('Join with a code', 'Join', 12, function (code) {
    if (!code) return null;
    return lb().joinGroup(code).then(function (res) {
      _deps.toast(res.success ? 'Joined ' + res.data.name + '!' : (res.error || 'Could not join.'));
      if (res.success) _state.groupId = res.data.id;
      render();
    });
  }));
  body.appendChild(forms);

  var list = createElement('div');
  list.appendChild(note('Loading\u2026'));
  body.appendChild(list);

  lb().getMyGroups().then(function (groups) {
    clearElement(list);
    if (groups.length === 0) {
      list.appendChild(note('You are not in any groups yet.'));
      return;
    }
    if (!_state.groupId || !groups.some(function (g) { return g.id === _state.groupId; })) _state.groupId = groups[0].id;

    groups.forEach(function (g) {
      var row = rowShell();
      row.appendChild(nameBlock(g.name, 'Code ' + g.code + ' \u00B7 ' + g.member_count + ' member' + (Number(g.member_count) === 1 ? '' : 's')));
      row.appendChild(btn(g.id === _state.groupId ? 'Viewing' : 'View', function () { _state.groupId = g.id; render(); }));
      row.appendChild(btn('Copy code', function () {
        if (navigator.clipboard) return navigator.clipboard.writeText(g.code).then(function () { _deps.toast('Code copied.'); });
        _deps.toast('Code: ' + g.code);
        return null;
      }));
      row.appendChild(btn('Leave', function () {
        if (!window.confirm('Leave ' + g.name + '?')) return null;
        return lb().leaveGroup(g.id).then(function () { if (_state.groupId === g.id) _state.groupId = null; render(); });
      }));
      list.appendChild(row);
    });

    // Weekly goal for the selected group
    var goalBox = createElement('div');
    goalBox.style.marginTop = '10px';
    list.appendChild(goalBox);
    var selected = groups.filter(function (g) { return g.id === _state.groupId; })[0];
    lb().getGroupGoal(_state.groupId).then(function (rows) {
      clearElement(goalBox);
      var goal = rows.length ? rows[0].goal : null;
      var total = rows.reduce(function (sum, r) { return sum + (r.cards || 0); }, 0);
      goalBox.appendChild(createElement('h3', { text: '🎯 Weekly goal' }));
      goalBox.lastChild.style.cssText = 'font-size:13px;margin:6px 0';
      if (goal) {
        var pct = Math.min(100, Math.round(total / goal * 100));
        goalBox.appendChild(note(total.toLocaleString() + ' / ' + goal.toLocaleString() + ' cards studied by the group this week' + (total >= goal ? ' \u2705' : '')));
        var bar = createElement('div', { attributes: { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(goal), 'aria-valuenow': String(Math.min(total, goal)), 'aria-label': 'Group weekly goal' } });
        bar.style.cssText = 'height:8px;border-radius:4px;background:rgba(255,255,255,0.12);overflow:hidden;margin:4px 0 8px';
        var fill = createElement('div');
        fill.style.cssText = 'height:100%;width:' + pct + '%;background:var(--accent-green)';
        bar.appendChild(fill);
        goalBox.appendChild(bar);
        rows.slice(0, 5).forEach(function (r) {
          goalBox.appendChild(note(r.player_name + ': ' + r.cards + ' cards'));
        });
      } else {
        goalBox.appendChild(note(selected && selected.is_owner ? 'No goal set yet.' : 'The group owner has not set a goal yet.'));
      }
      if (selected && selected.is_owner) {
        var setRow = createElement('div');
        setRow.style.cssText = 'display:flex;gap:6px;margin-top:6px';
        var goalInput = createElement('input', { attributes: { type: 'number', min: '50', max: '100000', step: '50', placeholder: 'Cards per week (50+)', 'aria-label': 'Weekly goal in cards', value: goal ? String(goal) : '' } });
        goalInput.style.cssText = 'flex:1;padding:8px 10px;border-radius:10px;background:rgba(30,15,70,.8);color:#fff;border:1px solid rgba(187,102,255,.3)';
        setRow.appendChild(goalInput);
        setRow.appendChild(btn('Set goal', function () {
          var v = parseInt(goalInput.value, 10);
          if (!(v >= 50 && v <= 100000)) { _deps.toast('Enter a goal between 50 and 100,000 cards.'); return null; }
          return lb().setGroupGoal(_state.groupId, v).then(function (res) {
            _deps.toast(res.success ? 'Goal updated.' : (res.error || 'Could not set the goal.'));
            render();
          });
        }, 'btn-primary'));
        goalBox.appendChild(setRow);
      }
    });

    // Board for the selected group
    var board = createElement('div');
    board.style.marginTop = '10px';
    board.appendChild(note('Loading scores\u2026'));
    list.appendChild(board);
    lb().getGroupScores(_state.groupId, { mode: _state.mode, period: _state.period }).then(function (scores) {
      clearElement(board);
      var title = createElement('h3', { text: (_state.period === 'week' ? 'This week' : 'All time') + ' \u2014 ' + lb().getModeLabel(_state.mode) });
      title.style.cssText = 'font-size:13px;margin:6px 0';
      board.appendChild(title);
      if (scores.length === 0) { board.appendChild(note('No scores from this group yet.')); return; }
      scores.forEach(function (s, i) {
        board.appendChild(playerRow({
          rank: i + 1, userId: s.user_id, name: s.player_name,
          sub: s.accuracy + '% accuracy \u00B7 best streak ' + s.best_streak,
          value: Number(s.score).toLocaleString(), isFriend: true
        }));
      });
    });
  });
}

// ===== Requests =====

function renderRequests(body) {
  var list = createElement('div');
  list.appendChild(note('Loading…'));
  body.appendChild(list);

  lb().getPendingRequests().then(function (reqs) {
    _state.requestCount = reqs.length;
    clearElement(list);
    if (reqs.length === 0) {
      list.appendChild(note('No pending friend requests.'));
    }
    reqs.forEach(function (r) {
      var row = rowShell();
      row.appendChild(nameBlock(r.player_name, 'wants to be friends'));
      row.appendChild(btn('Accept', function () {
        return lb().acceptFriendRequest(r.id).then(function (res) {
          _deps.toast(res.success ? 'You are now friends with ' + r.player_name + '!' : (res.error || 'Could not accept.'));
          _state.requestCount = Math.max(0, _state.requestCount - 1);
          render();
        });
      }, 'btn-green'));
      row.appendChild(btn('Decline', function () {
        return lb().declineFriendRequest(r.id).then(function () {
          _state.requestCount = Math.max(0, _state.requestCount - 1);
          render();
        });
      }));
      list.appendChild(row);
    });
  });
}

// ===== Find =====

function renderFind(body) {
  var form = createElement('div');
  form.style.cssText = 'display:flex;gap:6px;margin-bottom:8px';
  var input = createElement('input', {
    attributes: { type: 'search', maxlength: '50', placeholder: 'Search by display name', 'aria-label': 'Search players', value: _state.searchTerm }
  });
  input.style.cssText = 'flex:1;padding:8px 10px;border-radius:10px;background:rgba(30,15,70,.8);color:#fff;border:1px solid rgba(187,102,255,.3)';
  form.appendChild(input);

  function run() {
    _state.searchTerm = input.value.trim();
    if (!_state.searchTerm) { _state.searchResults = null; render(); return Promise.resolve(); }
    return Promise.all([lb().searchPlayers(_state.searchTerm), lb().getFriends()]).then(function (res) {
      var ids = res[1].map(function (f) { return f.user_id; });
      _state.searchResults = res[0].map(function (p) {
        p.isFriend = ids.indexOf(p.user_id) >= 0;
        return p;
      });
      render();
    });
  }
  form.appendChild(btn('Search', run, 'btn-primary'));
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });
  body.appendChild(form);

  if (_state.searchResults) {
    if (_state.searchResults.length === 0) body.appendChild(note('No players found.'));
    _state.searchResults.forEach(function (p) {
      body.appendChild(playerRow({
        userId: p.user_id,
        name: p.player_name,
        sub: 'best streak ' + (p.best_streak || 0),
        value: Number(p.best_score || 0).toLocaleString(),
        isFriend: p.isFriend
      }));
    });
  }
}

// ===== Account =====

function renderAccount(body) {
  var status = lb().getStatus();
  body.appendChild(note(status.email
    ? 'Signed in as ' + status.email + '. Your leaderboard identity is tied to this email.'
    : 'You are playing as a guest. Your scores and friends are tied to this browser — link an email so you can keep them if you clear your browser data or switch devices.'));

  if (!status.email) {
    var form = createElement('div');
    form.style.cssText = 'display:flex;gap:6px;margin-top:8px';
    var input = createElement('input', {
      attributes: { type: 'email', placeholder: 'you@example.com', 'aria-label': 'Email address', autocomplete: 'email' }
    });
    input.style.cssText = 'flex:1;padding:8px 10px;border-radius:10px;background:rgba(30,15,70,.8);color:#fff;border:1px solid rgba(187,102,255,.3)';
    form.appendChild(input);
    form.appendChild(btn('Link email', function () {
      return lb().linkEmail(input.value).then(function (res) {
        _deps.toast(res.success ? 'Check your inbox for a confirmation link.' : (res.error || 'Could not link email.'));
      });
    }, 'btn-primary'));
    body.appendChild(form);
  }
}
