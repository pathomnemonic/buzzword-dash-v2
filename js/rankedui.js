/**
 * rankedui.js — the ranked panel (league, trophies, matchmaking) and the
 * trophy results card. The rules live in leagues.js, the server calls in
 * ranked.js; this file is only screens and the match flow.
 */

import { ranked, getCachedTrophies } from './ranked.js';
import { LEAGUES, getLeague, leagueIndex, leagueProgress, describeLeagueRules } from './leagues.js';

var SEARCH_TIMEOUT_MS = 60000;
var POLL_MS = 3000;
var MATCH_SECONDS = 90;

var _match = null;      // { matchId, own, opp, role } while a ranked match is on
var _search = null;     // { timers... } while looking for an opponent

export function isRankedActive() {
  return !!_match;
}

/** True while looking for an opponent. */
export function isSearching() {
  return !!_search;
}

export function getRankedMatch() {
  return _match;
}

function el(tag, className, text) {
  var e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

// ---------- the league header ----------

/** Fill `box` with the player's league card. */
export function renderLeagueCard(box, stats) {
  box.textContent = '';
  var trophies = stats ? stats.trophies : getCachedTrophies();
  var league = getLeague(trophies);
  var progress = leagueProgress(trophies);

  var top = el('div', 'rk-top');
  top.appendChild(el('div', 'rk-badge', league.icon));
  var names = el('div', 'rk-names');
  names.appendChild(el('div', 'rk-league', league.name + ' League'));
  names.appendChild(el('div', 'rk-trophies', '🏆 ' + trophies));
  top.appendChild(names);
  box.appendChild(top);

  var bar = el('div', 'rk-bar');
  var fill = el('span');
  fill.style.width = Math.round(progress.fraction * 100) + '%';
  bar.appendChild(fill);
  box.appendChild(bar);
  box.appendChild(el('div', 'rk-next', progress.next
    ? progress.needed + ' 🏆 to ' + progress.next.icon + ' ' + progress.next.name
    : 'Top league. Defend your crown.'));

  box.appendChild(el('div', 'rk-rules', 'In this league: ' + describeLeagueRules(trophies)));
  if (progress.next) {
    box.appendChild(el('div', 'rk-rules rk-rules-next', 'Next up: ' + describeLeagueRules(progress.next.min)));
  }
  if (stats) {
    box.appendChild(el('div', 'rk-record', stats.wins + ' wins · ' + stats.losses + ' losses'));
  }
}

/** Load the stats and draw the card (shows cached trophies first). */
export function mountLeagueCard(box) {
  renderLeagueCard(box, null);
  ranked.settleStale();
  ranked.myStats().then(function (s) {
    if (s.ok && box.isConnected !== false) renderLeagueCard(box, s);
  });
}

export function mountTopPlayers(box) {
  box.textContent = 'Loading…';
  ranked.top(20).then(function (r) {
    box.textContent = '';
    if (!r.ok) { box.textContent = r.error; return; }
    if (!r.players.length) { box.textContent = 'No ranked matches played yet. Be the first!'; return; }
    r.players.forEach(function (p, i) {
      var row = el('div', 'rk-row');
      row.appendChild(el('span', 'rk-pos', '#' + (i + 1)));
      row.appendChild(el('span', 'rk-name', getLeague(p.trophies).icon + ' ' + p.name));
      row.appendChild(el('span', 'rk-score', '🏆 ' + p.trophies));
      box.appendChild(row);
    });
  });
}

// ---------- finding a match ----------

function stopSearch() {
  if (!_search) return;
  clearInterval(_search.poll);
  clearTimeout(_search.timeout);
  _search.cancelled = true;
  _search = null;
}

/**
 * Look for a random opponent.
 * deps: { client, configure(client, content), onBack(), cardPoolHash(), startMatch(config) }
 */
export function startRankedSearch(deps, content) {
  var client = deps.client;
  stopSearch();
  _match = null;
  _search = { cancelled: false, poll: null, timeout: null };
  var search = _search;

  function show(text, withCancel, isError) {
    content.textContent = '';
    var line = el('div', 'mp-status', text);
    if (isError) line.style.color = 'var(--accent-red)';
    content.appendChild(line);
    if (withCancel) {
      var cancel = el('button', 'btn btn-outline btn-block', 'Cancel');
      cancel.type = 'button';
      cancel.addEventListener('click', function () { cancelRanked(client, deps); });
      content.appendChild(cancel);
    }
  }

  function installMatchHandlers() {
    var started = false;
    client.onConnected = function () {
      stopPolling();
      show('⚔️ Opponent connected! Get ready…', false);
      if (client.isHost) client.setMode('mp_highscore', { timeLimitSeconds: MATCH_SECONDS });
      client.sendReady(true);
    };
    // The host may be connected before its next poll has told it who the match is
    function ensureMatch() {
      if (_match) return Promise.resolve(_match);
      return ranked.pollMatch().then(function (p) {
        if (p.ok && p.matched) _match = { matchId: p.matchId, own: p.ownTrophies, opp: p.opponentTrophies, role: 'host' };
        return _match;
      });
    }
    client.onReadyState = function (state) {
      if (state.localReady && state.opponentReady && client.isHost && !started) {
        started = true;
        ensureMatch().then(function (match) {
          if (!match) {
            started = false;
            show('Could not confirm the match with the server. Please try again.', false, true);
            return;
          }
          var avg = Math.round((match.own + match.opp) / 2);
          var cfg = client.sendMatchConfig({
            mode: 'mp_highscore',
            startAt: Date.now() + 2500,
            seed: Math.floor(Math.random() * 2147483646) + 1,
            subjects: [],
            cardPoolHash: deps.cardPoolHash(),
            modeConfig: { timeLimitSeconds: MATCH_SECONDS, leagueTrophies: avg, ranked: true }
          });
          client.sendMatchStart();
          deps.startMatch({ startAt: cfg.startAt, mode: cfg.mode, config: cfg.modeConfig });
        });
      } else if (!started) {
        show('Waiting for your opponent…', false);
      }
    };
  }

  function stopPolling() {
    clearInterval(search.poll);
    clearTimeout(search.timeout);
  }

  show('Opening a room…', true);
  deps.configure(client, content);
  client.hostGame(function (code) {
    if (search.cancelled) return;
    show('Finding an opponent near your level…', true);
    ranked.findMatch(code).then(function (r) {
      if (search.cancelled) return;
      if (!r.ok) {
        client.disconnect();
        show(r.error, false, true);
        return;
      }
      if (r.role === 'guest') {
        // Someone was already waiting: join their room instead of ours.
        _match = { matchId: r.matchId, own: r.ownTrophies, opp: r.opponentTrophies, role: 'guest' };
        installMatchHandlers();
        show('Opponent found! Connecting…', false);
        client.joinGame(r.roomCode);
        return;
      }
      // Nobody yet: keep our room open and wait to be matched.
      installMatchHandlers();
      search.poll = setInterval(function () {
        ranked.pollMatch().then(function (p) {
          if (search.cancelled || !p.ok || !p.matched) return;
          clearInterval(search.poll);
          _match = { matchId: p.matchId, own: p.ownTrophies, opp: p.opponentTrophies, role: 'host' };
          show('Opponent found! Connecting…', false);
        });
      }, POLL_MS);
      search.timeout = setTimeout(function () {
        if (search.cancelled || _match) return;
        cancelRanked(client, deps, 'No opponent found right now. Try again in a moment, or host a game for a friend.');
      }, SEARCH_TIMEOUT_MS);
    });
  });
}

export function cancelRanked(client, deps, message) {
  stopSearch();
  ranked.cancel();
  _match = null;
  try { client.disconnect(); } catch (e) { /* already closed */ }
  if (deps.onBack) deps.onBack(message);
}

// ---------- the results card ----------

/**
 * Tell the server how the match ended and show the trophy card.
 * @param {'win'|'loss'|'draw'} outcome
 */
export function finishRankedMatch(outcome) {
  var match = _match;
  if (!match) return Promise.resolve(null);
  _match = null;
  stopSearch();
  return ranked.report(match.matchId, outcome).then(function (r) {
    showResultCard(outcome, match, r);
    if (r.ok && !r.settled) waitForSettlement(outcome, match);
    return r;
  });
}

// The other player has not confirmed yet: check back until the trophies move
function waitForSettlement(outcome, match) {
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    if (tries > 20 || !document.getElementById('rankedResult')) { clearInterval(timer); return; }
    ranked.settleStale();
    ranked.myStats().then(function (s) {
      if (!s.ok || s.trophies === match.own) return;
      clearInterval(timer);
      showResultCard(outcome, match, { ok: true, settled: true, delta: s.trophies - match.own, trophies: s.trophies });
    });
  }, 3000);
}

function showResultCard(outcome, match, result) {
  var old = document.getElementById('rankedResult');
  if (old) old.remove();
  var overlay = el('div', 'rk-result');
  overlay.id = 'rankedResult';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Ranked match result');
  var card = el('div', 'rk-result-card rk-' + outcome);

  card.appendChild(el('div', 'rk-result-title', outcome === 'win' ? 'VICTORY!' : outcome === 'loss' ? 'DEFEAT' : 'DRAW'));

  if (!result.ok) {
    card.appendChild(el('div', 'rk-result-sub', 'Could not record this match: ' + result.error));
  } else if (!result.settled) {
    card.appendChild(el('div', 'rk-result-sub', 'Waiting for your opponent to confirm. Your trophies will update shortly.'));
  } else {
    var before = Math.max(0, result.trophies - result.delta);
    var delta = el('div', 'rk-delta', result.delta === 0 ? 'No change' : (result.delta > 0 ? '+' : '') + result.delta + ' 🏆');
    card.appendChild(delta);
    var total = el('div', 'rk-total', '🏆 ' + before);
    card.appendChild(total);
    countUp(total, before, result.trophies);
    var oldLeague = leagueIndex(before);
    var newLeague = leagueIndex(result.trophies);
    var league = LEAGUES[newLeague];
    if (newLeague > oldLeague) {
      card.appendChild(el('div', 'rk-promo', '🎉 PROMOTED to ' + league.icon + ' ' + league.name + '!'));
      card.appendChild(el('div', 'rk-result-sub', 'New rules: ' + describeLeagueRules(result.trophies)));
    } else {
      card.appendChild(el('div', 'rk-result-sub', league.icon + ' ' + league.name + ' League'));
    }
  }

  var close = el('button', 'btn btn-primary btn-block', 'Continue');
  close.type = 'button';
  close.addEventListener('click', function () { overlay.remove(); });
  card.appendChild(close);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

function countUp(node, from, to) {
  if (from === to || typeof requestAnimationFrame !== 'function') { node.textContent = '🏆 ' + to; return; }
  var start = null;
  function step(ts) {
    if (start === null) start = ts;
    var t = Math.min(1, (ts - start) / 900);
    node.textContent = '🏆 ' + Math.round(from + (to - from) * t);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
