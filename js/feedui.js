/**
 * feedui.js — the Feed tab of the Friends screen: a Strava-style stream of your runs and your friends'.
 *
 * Each post shows who, what and how it went, with kudos from friends. The player chooses who sees their own
 * runs (friends, or only themselves) and can change that, or delete a post, afterwards.
 * Everything from the server goes through textContent (see friendsdom.js).
 */

import { createElement, clearElement } from './dom.js';
import { btn, note } from './friendsdom.js';
import { fillProfilePicture } from './profileicons.js';
import { KUDOS, kudosIcon, describeActivity, weeklyRecap, newKudosCount, shareSetting, SHARE_FRIENDS, SHARE_PRIVATE } from './sharing.js';

var PAGE = 30;
var SCOPES = [['all', 'All'], ['friends', 'Friends'], ['mine', 'Mine']];

var CHALLENGEABLE = ['run', 'new_best', 'streak', 'exam'];

var _scope = 'all';

export function timeAgo(iso) {
  var minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return minutes + 'm ago';
  var hours = Math.round(minutes / 60);
  if (hours < 24) return hours + 'h ago';
  return Math.round(hours / 24) + 'd ago';
}

function chipRow(options, current, onPick, label) {
  var row = createElement('div', { attributes: { role: 'group', 'aria-label': label } });
  row.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin:6px 0';
  options.forEach(function (o) {
    var b = createElement('button', {
      className: 'btn btn-sm ' + (current === o[0] ? 'btn-primary' : 'btn-outline'),
      text: o[1],
      attributes: { type: 'button', 'aria-pressed': current === o[0] ? 'true' : 'false' }
    });
    b.addEventListener('click', function () { onPick(o[0]); });
    row.appendChild(b);
  });
  return row;
}

/** "Bo, Cy and 1 other" */
export function kudosLine(e) {
  var count = Number(e.kudos_count) || 0;
  if (count === 0) return '';
  var names = (e.kudos_by || []).slice(0, 2);
  var rest = count - names.length;
  if (names.length === 0) return count + ' kudos';
  if (rest <= 0) return names.join(' and ');
  return names.join(', ') + ' and ' + rest + (rest === 1 ? ' other' : ' others');
}

/**
 * @param {HTMLElement} body
 * @param {object} ctx
 * @param {object} ctx.lb the leaderboard service
 * @param {object} ctx.storage
 * @param {function(string)} ctx.toast
 * @param {function(): void} ctx.rerender
 * @param {function(): void} [ctx.startChallenge]
 */
export function renderFeedTab(body, ctx) {
  var lb = ctx.lb;
  var me = lb.getUserId();

  // ---- who sees my runs ----
  var shareBox = createElement('div');
  shareBox.style.cssText = 'background:var(--bg-card);border-radius:12px;padding:10px;margin-bottom:8px;border:var(--border-card)';
  shareBox.appendChild(createElement('div', { text: 'Who sees my runs' }));
  shareBox.lastChild.style.cssText = 'font-size:12px;font-weight:700';
  var current = shareSetting(ctx.storage.get('shareRuns'));
  shareBox.appendChild(chipRow([[SHARE_FRIENDS, '👥 My friends'], [SHARE_PRIVATE, '🔒 Only me']], current, function (v) {
    ctx.storage.set('shareRuns', v);
    ctx.toast(v === SHARE_PRIVATE ? 'New runs stay private. Posts you already shared stay as they are.' : 'New runs are shared with your friends.');
    ctx.rerender();
  }, 'Who sees my runs'));
  shareBox.appendChild(createElement('div', {
    className: 'setting-sublabel',
    text: current === SHARE_PRIVATE
      ? 'Your runs are saved to your own feed and no one else sees them. You can still give kudos to friends.'
      : 'Friends see your runs, personal bests and milestones. You can hide any single post with the lock on it.'
  }));
  body.appendChild(shareBox);

  body.appendChild(chipRow(SCOPES, _scope, function (v) { _scope = v; ctx.rerender(); }, 'Feed filter'));

  var extras = createElement('div');
  body.appendChild(extras);
  var list = createElement('div');
  list.appendChild(note('Loading…'));
  body.appendChild(list);
  var more = createElement('div');
  body.appendChild(more);

  var events = [];

  function load(before) {
    return lb.getFeed({ scope: _scope, before: before || null, limit: PAGE }).then(function (rows) {
      if (!before) { events = []; clearElement(list); }
      events = events.concat(rows);
      if (events.length === 0) {
        list.appendChild(note(_scope === 'mine' ? 'You have no posts yet. Finish a run and it will show up here.' : 'Nothing yet. Play a run, or add friends from the Find tab.'));
      }
      rows.forEach(function (e) { list.appendChild(renderPost(e)); });
      clearElement(more);
      if (rows.length >= PAGE) {
        more.appendChild(btn('Show more', function () { return load(rows[rows.length - 1].id); }));
      }
      if (!before) renderExtras();
    });
  }

  function renderExtras() {
    clearElement(extras);
    // the week in review, from the player's own posts
    var recap = weeklyRecap(events, me);
    if (recap.runs > 0 && _scope !== 'friends') {
      var box = createElement('div', { className: 'feed-recap' });
      box.style.cssText = 'background:var(--bg-card);border-radius:12px;padding:10px;margin:8px 0;border:var(--border-card)';
      box.appendChild(createElement('div', { text: '📊 Your week' }));
      box.lastChild.style.cssText = 'font-size:12px;font-weight:700';
      var bits = [recap.runs + ' run' + (recap.runs === 1 ? '' : 's'), 'best ' + recap.bestScore.toLocaleString()];
      if (recap.accuracy !== null) bits.push(recap.accuracy + '% right');
      if (recap.kudos > 0) bits.push('👏 ' + recap.kudos + ' kudos');
      box.appendChild(createElement('div', { text: bits.join('  ·  '), attributes: { id: 'feedRecapText' } }));
      box.lastChild.style.cssText = 'font-size:12px;margin-top:2px';
      extras.appendChild(box);
    }
    // kudos the player received
    lb.getRecentKudos().then(function (kudos) {
      var since = Number(ctx.storage.get('kudosSeenAt')) || 0;
      var fresh = newKudosCount(kudos, since);
      if (kudos.length === 0) return;
      var box = createElement('div', { className: 'feed-kudos-got' });
      box.style.cssText = 'background:var(--bg-card);border-radius:12px;padding:10px;margin:8px 0;border:var(--border-card)';
      box.appendChild(createElement('div', { text: '👏 Kudos you got' + (fresh ? ' (' + fresh + ' new)' : '') }));
      box.lastChild.style.cssText = 'font-size:12px;font-weight:700';
      kudos.slice(0, 5).forEach(function (k) {
        var line = createElement('div', { text: kudosIcon(k.emoji) + ' ' + k.giver_name + '  ·  ' + timeAgo(k.created_at) });
        line.style.cssText = 'font-size:11px;margin-top:2px;color:var(--text-secondary)';
        box.appendChild(line);
      });
      extras.appendChild(box);
      ctx.storage.set('kudosSeenAt', Date.now());
    });
  }

  function renderPost(e) {
    var mine = e.user_id === me;
    var d = describeActivity(e, mine);
    var card = createElement('div', { className: 'feed-post' });
    card.style.cssText = 'background:var(--bg-card);border-radius:12px;padding:10px;margin:8px 0;border:var(--border-card)';
    card.setAttribute('data-event-id', String(e.id));

    var head = createElement('div');
    head.style.cssText = 'display:flex;gap:8px;align-items:center';
    var pic = createElement('div', { className: 'pp-sm' });
    pic.style.cssText = 'width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;overflow:hidden;flex:none;background:rgba(255,255,255,.08)';
    fillProfilePicture(pic, e.avatar);
    head.appendChild(pic);
    var titles = createElement('div');
    titles.style.cssText = 'flex:1;min-width:0';
    titles.appendChild(createElement('div', { text: d.icon + ' ' + d.title }));
    titles.lastChild.style.cssText = 'font-size:13px;font-weight:700';
    var sub = timeAgo(e.created_at) + (e.visibility === 'private' ? '  ·  🔒 Only you' : '');
    titles.appendChild(createElement('div', { text: sub }));
    titles.lastChild.style.cssText = 'font-size:10px;color:var(--text-muted)';
    head.appendChild(titles);
    card.appendChild(head);

    if (d.facts.length) {
      var facts = createElement('div', { text: d.facts.join('  ·  ') });
      facts.style.cssText = 'font-size:12px;margin:6px 0 0 44px;color:var(--text-secondary)';
      card.appendChild(facts);
    }

    var actions = createElement('div');
    actions.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:8px 0 0 44px';
    if (!mine) {
      var gave = e.i_gave;
      var kbtn = btn((gave ? kudosIcon(gave) + ' Given' : '👏 Kudos'), function () {
        var promise = gave ? lb.removeKudos(e.id) : lb.giveKudos(e.id, 'kudos');
        return promise.then(function (res) {
          if (!res.success) { ctx.toast(res.error || 'Could not send kudos.'); return; }
          e.kudos_count = Math.max(0, (Number(e.kudos_count) || 0) + (gave ? -1 : 1));
          e.i_gave = gave ? null : 'kudos';
          swap(card, renderPost(e));
        });
      }, gave ? 'btn-primary' : 'btn-outline');
      kbtn.setAttribute('aria-pressed', gave ? 'true' : 'false');
      actions.appendChild(kbtn);
      var picker = btn('⋯', function () {
        var open = card.querySelector('.kudos-picker');
        if (open) { open.parentNode.removeChild(open); return null; }
        var row = createElement('div', { className: 'kudos-picker' });
        row.style.cssText = 'display:flex;gap:6px;margin:6px 0 0 44px';
        KUDOS.forEach(function (k) {
          row.appendChild(btn(k.icon + ' ' + k.label, function () {
            return lb.giveKudos(e.id, k.id).then(function (res) {
              if (!res.success) { ctx.toast(res.error || 'Could not send kudos.'); return; }
              if (!e.i_gave) e.kudos_count = (Number(e.kudos_count) || 0) + 1;
              e.i_gave = k.id;
              swap(card, renderPost(e));
            });
          }, e.i_gave === k.id ? 'btn-primary' : 'btn-outline'));
        });
        card.appendChild(row);
        return null;
      });
      picker.setAttribute('aria-label', 'More reactions');
      actions.appendChild(picker);
      if (ctx.startChallenge && CHALLENGEABLE.indexOf(e.kind) >= 0) {
        actions.appendChild(btn('⚔ Challenge', function () { ctx.startChallenge(); }));
      }
    } else {
      var priv = e.visibility === 'private';
      var lock = btn(priv ? '👥 Share with friends' : '🔒 Make private', function () {
        return lb.setActivityVisibility(e.id, priv ? SHARE_FRIENDS : SHARE_PRIVATE).then(function (res) {
          if (!res.success) { ctx.toast(res.error || 'Could not change that.'); return; }
          e.visibility = priv ? SHARE_FRIENDS : SHARE_PRIVATE;
          swap(card, renderPost(e));
        });
      });
      actions.appendChild(lock);
      actions.appendChild(btn('🗑', function () {
        if (!window.confirm('Delete this post?')) return null;
        return lb.deleteActivity(e.id).then(function (res) {
          if (!res.success) { ctx.toast(res.error || 'Could not delete.'); return; }
          if (card.parentNode) card.parentNode.removeChild(card);
        });
      }));
      actions.lastChild.setAttribute('aria-label', 'Delete this post');
    }
    card.appendChild(actions);

    var who = kudosLine(e);
    if (who) {
      var kl = createElement('div', { text: '👏 ' + who, className: 'kudos-line' });
      kl.style.cssText = 'font-size:11px;margin:6px 0 0 44px;color:var(--text-secondary)';
      card.appendChild(kl);
    }
    return card;
  }

  function swap(oldCard, newCard) {
    if (oldCard.parentNode) oldCard.parentNode.replaceChild(newCard, oldCard);
  }

  load(null);
}
