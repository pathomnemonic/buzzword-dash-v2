/**
 * rewardsui.js — the small "you're getting somewhere" screens: the level chip
 * on Home, the XP card after a run, and the daily reward track.
 */

import { storage } from './storage.js';
import { audio } from './audio.js';
import { levelFromXp, xpForRun, nearMissLine, dailyTrack, rankForLevel } from './progress.js';

function el(tag, className, text) {
  var e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function celebrate() {
  document.dispatchEvent(new CustomEvent('dx:celebrate'));
}

// ---------- the level chip on Home ----------

export function renderLevelChip(box) {
  if (!box) return;
  var lv = levelFromXp(storage.get('xp') || 0);
  box.textContent = '';
  var rank = rankForLevel(lv.level);
  box.appendChild(el('span', 'lv-badge' + (rank.stars > 0 ? ' prestige' : ''), 'LV ' + lv.level));
  var bar = el('span', 'lv-bar');
  var fill = el('span');
  fill.style.width = Math.round(lv.fraction * 100) + '%';
  bar.appendChild(fill);
  box.appendChild(bar);
  box.title = rank.icon + ' ' + rank.label + ': ' + lv.into + ' / ' + lv.needed + ' XP to level ' + (lv.level + 1);
  box.setAttribute('aria-label', 'Level ' + lv.level + ', ' + rank.label + ', ' + lv.into + ' of ' + lv.needed + ' XP to the next level');
}

// ---------- after a run ----------

/**
 * Add the XP for a finished run. Call once per run (the caller checks that
 * the run was newly counted).
 * @returns {{gain: number, before: number, after: number, levelBefore: number, levelAfter: number}}
 */
export function awardRunXp(summary) {
  var gain = xpForRun(summary);
  var before = storage.get('xp') || 0;
  var after = before + gain;
  if (gain > 0) storage.set('xp', after);
  return { gain: gain, before: before, after: after, levelBefore: levelFromXp(before).level, levelAfter: levelFromXp(after).level };
}

/** The sticker card shown on the results screen. */
export function buildRunRewardCard(info, score, best, newBest) {
  var card = el('div', 'xp-card');
  if (info.gain <= 0) return null;

  var head = el('div', 'xp-head');
  head.appendChild(el('span', 'xp-gain', '+' + info.gain + ' XP'));
  var leveled = info.levelAfter > info.levelBefore;
  var rankBefore = rankForLevel(info.levelBefore);
  var rankAfter = rankForLevel(info.levelAfter);
  var promoted = leveled && rankAfter.label !== rankBefore.label;
  head.appendChild(el('span', 'xp-level', promoted ? 'PROMOTED! → ' + rankAfter.icon + ' ' + rankAfter.label : (leveled ? 'LEVEL UP! → ' + info.levelAfter : 'Level ' + info.levelAfter + ' · ' + rankAfter.label)));
  card.appendChild(head);

  var bar = el('div', 'xp-bar');
  var fill = el('span');
  var from = levelFromXp(info.before);
  var to = levelFromXp(info.after);
  // on a level-up the bar fills to the top first, then the card shows the new level
  fill.style.width = Math.round(from.fraction * 100) + '%';
  bar.appendChild(fill);
  card.appendChild(bar);
  var target = leveled ? 100 : Math.round(to.fraction * 100);
  setTimeout(function () { fill.style.width = target + '%'; }, 120);
  if (leveled) {
    setTimeout(function () {
      fill.style.transition = 'none';
      fill.style.width = '0%';
      void fill.offsetWidth;
      fill.style.transition = '';
      fill.style.width = Math.round(to.fraction * 100) + '%';
    }, 1100);
    setTimeout(function () { audio.play(promoted ? 'promotion' : 'level_up'); celebrate(); }, 700);
    card.classList.add('xp-levelup');
  }

  var next = to.needed - to.into;
  card.appendChild(el('div', 'xp-next', next + ' XP to level ' + (to.level + 1)));
  var nudge = newBest ? '' : nearMissLine(score, best);
  if (nudge) card.appendChild(el('div', 'xp-nudge', nudge));
  return card;
}

// ---------- the daily reward track ----------

/**
 * Show the daily reward. The coins are already in the player's wallet; this is
 * the reveal (a chest on day 7).
 * @param {{streak: number, reward: {day: number, coins: number, chest: boolean}, onClose?: function}} opts
 */
export function showDailyRewardModal(opts) {
  var old = document.getElementById('dailyReward');
  if (old) old.remove();
  var reward = opts.reward;
  var overlay = el('div', 'dr-overlay');
  overlay.id = 'dailyReward';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Daily reward');
  var card = el('div', 'dr-card');
  card.appendChild(el('div', 'dr-title', 'DAILY REWARD'));
  card.appendChild(el('div', 'dr-streak', '🔥 ' + opts.streak + '-day streak'));

  var track = el('div', 'dr-track');
  dailyTrack().forEach(function (coins, i) {
    var day = i + 1;
    var cell = el('div', 'dr-day' + (day < reward.day ? ' done' : day === reward.day ? ' today' : '') + (coins === null ? ' chest' : ''));
    cell.appendChild(el('span', 'dr-n', 'DAY ' + day));
    cell.appendChild(el('span', 'dr-v', coins === null ? '🎁' : '🪙' + coins));
    if (day < reward.day) cell.appendChild(el('span', 'dr-check', '✓'));
    track.appendChild(cell);
  });
  card.appendChild(track);

  var message = el('div', 'dr-message');
  var button = el('button', 'btn btn-green btn-block', reward.chest ? 'OPEN CHEST!' : 'CLAIM +' + reward.coins + ' 🪙');
  button.type = 'button';
  var opened = false;
  function close() {
    overlay.remove();
    if (opts.onClose) opts.onClose();
  }
  button.addEventListener('click', function () {
    if (reward.chest && !opened) {
      opened = true;
      audio.play('chest_open');
      card.classList.add('dr-opening');
      button.disabled = true;
      setTimeout(function () {
        card.classList.remove('dr-opening');
        message.textContent = '🎉 +' + reward.coins + ' 🪙 from the chest!';
        message.classList.add('big');
        button.disabled = false;
        button.textContent = 'AWESOME!';
        celebrate();
      }, 900);
      return;
    }
    audio.play('daily_claim');
    close();
  });
  card.appendChild(message);
  if (!reward.chest) {
    message.textContent = reward.day < 6 ? 'Come back tomorrow for more.' : 'Tomorrow: a mystery chest!';
  } else {
    message.textContent = 'Day 7: a mystery chest!';
  }
  card.appendChild(button);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  return overlay;
}
