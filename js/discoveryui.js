/**
 * discoveryui.js — finding study buddies and public groups (hidden until FEATURES.discovery).
 *
 * Three pieces, all opt-in:
 *   - renderDiscoverTab: your buddy listing (off until you turn it on), the ranked list of compatible players,
 *     and a search for public groups to join.
 *   - renderGroupDiscoverySettings: for a group's owner, make it public (or private again), tag its exam, choose
 *     open or by-request joining, and answer join requests.
 * Contact always goes through the normal friend request, and every row can be reported. Anything that comes
 * from the server is shown with textContent only.
 */

import { createElement, clearElement } from './dom.js';
import { btn, note, rowShell, nameBlock } from './friendsdom.js';
import { fillProfilePicture } from './profileicons.js';
import { SUBJECTS } from './cardmeta.js';

export var BUDDY_EXAMS = ['USMLE Step 1', 'USMLE Step 2 CK', 'COMLEX Level 1', 'COMLEX Level 2', 'Other'];
export var BUDDY_PACES = [['relaxed', 'Relaxed'], ['steady', 'Steady'], ['intense', 'Intense']];
export var REPORT_REASONS = [['spam', 'Spam'], ['harassment', 'Harassment'], ['inappropriate_name', 'Inappropriate name'], ['other', 'Something else']];

var _query = '';
var _examFilter = '';

function field(labelText, control, id) {
  var wrap = createElement('div');
  wrap.style.cssText = 'display:flex;gap:8px;align-items:center;margin:6px 0;flex-wrap:wrap';
  var label = createElement('label', { text: labelText, attributes: { for: id } });
  label.style.cssText = 'font-size:12px;min-width:90px';
  control.id = id;
  wrap.appendChild(label);
  wrap.appendChild(control);
  return wrap;
}

function select(options, value) {
  var sel = createElement('select');
  options.forEach(function (o) {
    var v = Array.isArray(o) ? o[0] : o;
    var l = Array.isArray(o) ? o[1] : o;
    var opt = createElement('option', { text: l, attributes: { value: v } });
    if (v === value) opt.selected = true;
    sel.appendChild(opt);
  });
  return sel;
}

/** Report with a preset reason (no free text), as a small row of choices under the thing reported. */
function reportButton(ctx, kind, targetId) {
  var wrap = createElement('span');
  var b = btn('⚑', function () {
    if (wrap.querySelector('.report-choices')) return null;
    var row = createElement('div', { className: 'report-choices' });
    row.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin:4px 0';
    REPORT_REASONS.forEach(function (r) {
      row.appendChild(btn(r[1], function () {
        return ctx.lb.reportContent(kind, targetId, r[0]).then(function (res) {
          ctx.toast(res.success ? 'Report sent. Thank you.' : (res.error || 'Could not send the report.'));
          if (row.parentNode) row.parentNode.removeChild(row);
        });
      }));
    });
    wrap.appendChild(row);
    return null;
  });
  b.setAttribute('aria-label', 'Report');
  wrap.appendChild(b);
  return wrap;
}

function avatar(picture) {
  var pic = createElement('div');
  pic.style.cssText = 'width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;overflow:hidden;flex:none;background:rgba(255,255,255,.08)';
  fillProfilePicture(pic, picture);
  return pic;
}

function utcOffsetHours() {
  return -new Date().getTimezoneOffset() / 60;
}

function offsetLabel(h) {
  if (typeof h !== 'number') return '';
  return 'UTC' + (h >= 0 ? '+' : '') + h;
}

/**
 * @param {HTMLElement} body
 * @param {{lb: object, storage: object, toast: function(string), rerender: function(): void}} ctx
 */
export function renderDiscoverTab(body, ctx) {
  body.appendChild(note('Find people to study with. You only appear here if you turn it on, and you can turn it off any time. Nobody can message you: the only way to reach you is a friend request, which you can ignore.'));

  var listingBox = createElement('div');
  listingBox.style.cssText = 'background:var(--bg-card);border-radius:12px;padding:10px;margin:8px 0;border:var(--border-card)';
  body.appendChild(listingBox);
  var buddies = createElement('div');
  body.appendChild(buddies);
  body.appendChild(createElement('h3', { text: '🔎 Find a group' }));
  body.lastChild.style.cssText = 'font-size:13px;margin:12px 0 4px';
  var groups = createElement('div');
  body.appendChild(groups);

  ctx.lb.getBuddyListing().then(function (listing) {
    renderListing(listingBox, listing);
    if (listing && listing.discoverable) renderBuddies(buddies);
    else buddies.appendChild(note('Turn on "Let others find me" to see study buddies.'));
  });
  renderGroupSearch(groups);

  function renderListing(box, listing) {
    clearElement(box);
    box.appendChild(createElement('div', { text: '🤝 Study buddy listing' }));
    box.lastChild.style.cssText = 'font-size:13px;font-weight:700';
    var exam = select(BUDDY_EXAMS, listing ? listing.exam : (BUDDY_EXAMS.indexOf(ctx.storage.get('examName')) >= 0 ? ctx.storage.get('examName') : BUDDY_EXAMS[0]));
    box.appendChild(field('My exam', exam, 'buddyExam'));
    var date = createElement('input', { attributes: { type: 'date', value: (listing && listing.exam_date) || ctx.storage.get('examDate') || '' } });
    box.appendChild(field('Exam date', date, 'buddyDate'));
    var pace = select(BUDDY_PACES, listing ? listing.pace : 'steady');
    box.appendChild(field('Pace', pace, 'buddyPace'));

    var chosen = {};
    ((listing && listing.subjects) || []).forEach(function (s) { chosen[s] = true; });
    var chips = createElement('div', { attributes: { role: 'group', 'aria-label': 'Subjects I am studying' } });
    chips.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin:6px 0';
    SUBJECTS.forEach(function (s) {
      var chip = createElement('button', { className: 'btn btn-sm ' + (chosen[s] ? 'btn-primary' : 'btn-outline'), text: s, attributes: { type: 'button', 'aria-pressed': chosen[s] ? 'true' : 'false' } });
      chip.addEventListener('click', function () {
        if (!chosen[s] && Object.keys(chosen).length >= 8) { ctx.toast('Pick up to 8 subjects.'); return; }
        chosen[s] = !chosen[s];
        chip.className = 'btn btn-sm ' + (chosen[s] ? 'btn-primary' : 'btn-outline');
        chip.setAttribute('aria-pressed', chosen[s] ? 'true' : 'false');
      });
      chips.appendChild(chip);
    });
    box.appendChild(createElement('div', { text: 'Subjects (up to 8)' }));
    box.lastChild.style.cssText = 'font-size:11px;color:var(--text-muted)';
    box.appendChild(chips);

    var on = createElement('input', { attributes: { type: 'checkbox' } });
    on.checked = !!(listing && listing.discoverable);
    var onRow = field('Let others find me', on, 'buddyOn');
    box.appendChild(onRow);
    box.appendChild(createElement('div', { className: 'setting-sublabel', text: 'Shows your name, picture, exam, exam date, subjects and pace to other players who have turned this on. Not your scores, runs or location.' }));

    box.appendChild(btn('Save', function () {
      return ctx.lb.setBuddyListing({
        exam: exam.value, examDate: date.value || null, subjects: Object.keys(chosen).filter(function (k) { return chosen[k]; }),
        pace: pace.value, utcOffset: utcOffsetHours(), discoverable: on.checked
      }).then(function (res) {
        ctx.toast(res.success ? (on.checked ? 'Saved. Others can find you now.' : 'Saved. You are hidden.') : (res.error || 'Could not save.'));
        if (res.success) ctx.rerender();
      });
    }, 'btn-primary'));
    if (listing) {
      box.appendChild(btn('Remove my listing', function () {
        return ctx.lb.removeBuddyListing().then(function (res) {
          ctx.toast(res.success ? 'Your listing is removed.' : (res.error || 'Could not remove it.'));
          if (res.success) ctx.rerender();
        });
      }));
    }
  }

  function renderBuddies(el) {
    el.appendChild(createElement('h3', { text: '👋 Study buddies for you' }));
    el.lastChild.style.cssText = 'font-size:13px;margin:12px 0 4px';
    var list = createElement('div');
    list.appendChild(note('Looking…'));
    el.appendChild(list);
    ctx.lb.findBuddies().then(function (res) {
      clearElement(list);
      if (!res.success) { list.appendChild(note(res.error || 'Could not look for buddies.', 'var(--accent-red)')); return; }
      var rows = res.data || [];
      if (rows.length === 0) { list.appendChild(note('No one matches yet. Check back as more players join.')); return; }
      rows.forEach(function (b) {
        var row = rowShell();
        row.style.flexWrap = 'wrap';
        row.appendChild(avatar(b.avatar));
        var bits = [b.exam];
        if (b.exam_date) bits.push(b.exam_date);
        bits.push(b.pace);
        if (typeof b.utc_offset === 'number') bits.push(offsetLabel(b.utc_offset));
        var block = nameBlock(b.player_name, bits.join('  ·  '));
        if (b.subjects && b.subjects.length) {
          var subj = createElement('div', { text: b.subjects.join(', ') });
          subj.style.cssText = 'font-size:10px;color:var(--text-secondary)';
          block.appendChild(subj);
        }
        row.appendChild(block);
        row.appendChild(btn('＋ Add', function () {
          return ctx.lb.sendFriendRequest(b.user_id).then(function (r) { ctx.toast(r.success ? 'Friend request sent!' : (r.error || 'Could not send the request.')); });
        }));
        row.appendChild(reportButton(ctx, 'buddy', b.user_id));
        list.appendChild(row);
      });
    });
  }

  function renderGroupSearch(el) {
    var form = createElement('div');
    form.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px';
    var input = createElement('input', { attributes: { type: 'search', maxlength: '40', placeholder: 'Search group names', 'aria-label': 'Search groups', value: _query } });
    input.style.cssText = 'flex:1;min-width:140px;padding:8px 10px;border-radius:10px;background:rgba(30,15,70,.8);color:#fff;border:1px solid rgba(187,102,255,.3)';
    var exam = select([['', 'Any exam']].concat(BUDDY_EXAMS.map(function (e) { return [e, e]; })), _examFilter);
    exam.setAttribute('aria-label', 'Exam');
    var results = createElement('div');
    function run() {
      _query = input.value.trim();
      _examFilter = exam.value;
      clearElement(results);
      results.appendChild(note('Searching…'));
      return ctx.lb.discoverGroups(_query, _examFilter || null).then(function (rows) {
        clearElement(results);
        if (rows.length === 0) { results.appendChild(note('No public groups match yet.')); return; }
        rows.forEach(function (g) {
          var row = rowShell();
          row.style.flexWrap = 'wrap';
          var sub = [g.exam || 'Any exam', g.member_count + ' member' + (Number(g.member_count) === 1 ? '' : 's'), 'by ' + g.owner_name, g.join_mode === 'request' ? 'owner approves' : 'open'];
          row.appendChild(nameBlock(g.name, sub.join('  ·  ')));
          if (g.requested) {
            row.appendChild(btn('Requested ✓ (cancel)', function () {
              return ctx.lb.cancelGroupRequest(g.id).then(function () { return run(); });
            }));
          } else {
            row.appendChild(btn(g.join_mode === 'request' ? 'Ask to join' : 'Join', function () {
              return ctx.lb.joinPublicGroup(g.id).then(function (res) {
                if (!res.success) { ctx.toast(res.error || 'Could not join.'); return null; }
                ctx.toast(res.data === 'requested' ? 'Request sent. The owner will answer it.' : 'You joined ' + g.name + '!');
                return res.data === 'joined' ? ctx.rerender() : run();
              });
            }, 'btn-primary'));
          }
          row.appendChild(reportButton(ctx, 'group', g.id));
          results.appendChild(row);
        });
      });
    }
    form.appendChild(input);
    form.appendChild(exam);
    form.appendChild(btn('Search', run, 'btn-primary'));
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });
    el.appendChild(form);
    el.appendChild(results);
    run();
  }
}

/**
 * Owner-only settings for one group: public or private, exam tag, how people join, and the join requests.
 * @param {HTMLElement} container
 * @param {object} group a row of my_groups()
 * @param {{lb: object, toast: function(string), rerender: function(): void}} ctx
 */
export function renderGroupDiscoverySettings(container, group, ctx) {
  if (!group || !group.is_owner || typeof group.visibility === 'undefined') return;
  var box = createElement('div', { className: 'group-discovery' });
  box.style.cssText = 'background:var(--bg-card);border-radius:12px;padding:10px;margin-top:10px;border:var(--border-card)';
  box.appendChild(createElement('div', { text: '🌐 Group discovery' }));
  box.lastChild.style.cssText = 'font-size:13px;font-weight:700';
  var pub = createElement('input', { attributes: { type: 'checkbox' } });
  pub.checked = group.visibility === 'public';
  box.appendChild(field('Public', pub, 'groupPublic'));
  var exam = select([['', 'No exam tag']].concat(BUDDY_EXAMS.map(function (e) { return [e, e]; })), group.exam || '');
  box.appendChild(field('Exam', exam, 'groupExam'));
  var join = select([['open', 'Anyone can join'], ['request', 'I approve each person']], group.join_mode || 'open');
  box.appendChild(field('Joining', join, 'groupJoin'));
  box.appendChild(createElement('div', { className: 'setting-sublabel', text: 'A public group can be found by name and exam. Members still see only what groups already show.' }));
  box.appendChild(btn('Save', function () {
    return ctx.lb.setGroupDiscovery(group.id, pub.checked, exam.value, join.value).then(function (res) {
      ctx.toast(res.success ? 'Saved.' : (res.error || 'Could not save.'));
      if (res.success) ctx.rerender();
    });
  }, 'btn-primary'));

  var requests = createElement('div');
  box.appendChild(requests);
  if (Number(group.pending_requests) > 0) {
    ctx.lb.getGroupRequests(group.id).then(function (rows) {
      if (rows.length === 0) return;
      requests.appendChild(createElement('div', { text: 'Join requests' }));
      requests.lastChild.style.cssText = 'font-size:12px;font-weight:700;margin-top:10px';
      rows.forEach(function (r) {
        var row = rowShell();
        row.appendChild(avatar(r.avatar));
        row.appendChild(nameBlock(r.player_name, 'wants to join'));
        row.appendChild(btn('Accept', function () {
          return ctx.lb.resolveGroupRequest(group.id, r.user_id, true).then(function (res) { ctx.toast(res.success ? 'Added.' : (res.error || 'Could not add them.')); ctx.rerender(); });
        }, 'btn-green'));
        row.appendChild(btn('Decline', function () {
          return ctx.lb.resolveGroupRequest(group.id, r.user_id, false).then(function () { ctx.rerender(); });
        }));
        requests.appendChild(row);
      });
    });
  }
  container.appendChild(box);
}
