/**
 * sharing.js — what goes into a friend's feed, and how it reads.
 *
 * Pure functions (no network, no DOM) so they are tested directly. A feed post is a small structured record
 * (kind + a payload of numbers and the player's display name), never free text, so there is nothing to moderate
 * beyond the name itself.
 */

export var SHARE_FRIENDS = 'friends';
export var SHARE_PRIVATE = 'private';

export var KUDOS = [
  { id: 'kudos', icon: '👏', label: 'Kudos' },
  { id: 'fire', icon: '🔥', label: 'On fire' },
  { id: 'brain', icon: '🧠', label: 'Big brain' },
  { id: 'clap', icon: '🙌', label: 'Nice one' }
];

export function kudosIcon(id) {
  for (var i = 0; i < KUDOS.length; i++) if (KUDOS[i].id === id) return KUDOS[i].icon;
  return KUDOS[0].icon;
}

var MODE_NAMES = {
  endless: 'Endless', daily: 'Daily 15', study: 'Study', weakness: 'Weakness', tournament: 'Weekly Gauntlet',
  versus: 'Versus', mp_highscore: 'High Score', mp_suddendeath: 'Sudden Death', mp_race: 'Race', challenge: 'Friend challenge'
};

/** Who may see the player's new posts: their setting, 'friends' unless they chose to keep runs private. */
export function shareSetting(value) {
  return value === SHARE_PRIVATE ? SHARE_PRIVATE : SHARE_FRIENDS;
}

/** Only real runs are worth a post: some questions answered, in a mode that makes sense on its own. */
export function isShareableRun(summary) {
  if (!summary) return false;
  var answered = (summary.correct || 0) + (summary.wrong || 0);
  return answered >= 5 && summary.mode !== 'tutorial';
}

/** The small record a run becomes. */
export function runPayload(summary, name) {
  var correct = Math.max(0, Math.floor(summary.correct || 0));
  var wrong = Math.max(0, Math.floor(summary.wrong || 0));
  return {
    name: String(name || '').slice(0, 30),
    mode: String(summary.mode || 'endless').slice(0, 20),
    score: Math.max(0, Math.floor(summary.score || 0)),
    correct: correct,
    total: correct + wrong,
    streak: Math.max(0, Math.floor(summary.bestStreak || 0)),
    secs: Math.max(0, Math.round((summary.durationMs || 0) / 1000))
  };
}

var CARD_MILESTONES = [100, 250, 500, 1000, 2500, 5000, 10000];
var DAY_MILESTONES = [3, 7, 14, 30, 60, 100, 200, 365];

/** The milestone (if any) crossed when a count went from `before` to `after`. */
export function crossedMilestone(before, after, list) {
  var hit = null;
  (list || CARD_MILESTONES).forEach(function (m) { if (before < m && after >= m) hit = m; });
  return hit;
}
export function crossedCardMilestone(before, after) { return crossedMilestone(before, after, CARD_MILESTONES); }
export function crossedDayMilestone(before, after) { return crossedMilestone(before, after, DAY_MILESTONES); }

export function formatDuration(secs) {
  secs = Math.max(0, Math.round(secs || 0));
  if (secs < 60) return secs + 's';
  var m = Math.floor(secs / 60);
  var s = secs % 60;
  return m + 'm' + (s ? ' ' + s + 's' : '');
}

function num(n) { return Math.max(0, Number(n) || 0); }

/**
 * How a post reads: an icon, a headline, and a line of small facts. `mine` changes "Alice" to "You".
 * @returns {{icon: string, title: string, facts: string[]}}
 */
export function describeActivity(e, mine) {
  var p = e.payload || {};
  var who = mine ? 'You' : String(p.name || e.player_name || 'A friend').slice(0, 30);
  var verb = function (you, they) { return mine ? you : they; };
  switch (e.kind) {
    case 'run': {
      var facts = [];
      if (num(p.total) > 0) facts.push(num(p.correct) + '/' + num(p.total) + ' right (' + Math.round(num(p.correct) / num(p.total) * 100) + '%)');
      if (num(p.streak) >= 3) facts.push('best streak ' + num(p.streak));
      if (num(p.secs) > 0) facts.push(formatDuration(num(p.secs)));
      return { icon: '🏃', title: who + ' ran ' + (MODE_NAMES[p.mode] || 'a run') + ': ' + num(p.score).toLocaleString() + ' points', facts: facts };
    }
    case 'new_best': return { icon: '🏅', title: who + ' set a new best score: ' + num(p.score).toLocaleString(), facts: [] };
    case 'streak': return { icon: '🔥', title: who + ' hit a ' + num(p.streak) + '-answer streak', facts: [] };
    case 'tournament': return { icon: '🏆', title: who + ' took part in an old weekly tournament (#' + num(p.rank) + ' of ' + num(p.total) + ')', facts: [] };
    case 'exam': return { icon: '📝', title: who + ' scored ' + num(p.accuracy) + '% on an exam simulation', facts: [] };
    case 'group_join': return { icon: '👪', title: who + ' joined a study group', facts: [] };
    case 'milestone': return { icon: '🎓', title: who + ' ' + verb('have', 'has') + ' now met ' + num(p.cards).toLocaleString() + ' cards', facts: [] };
    case 'streak_days': return { icon: '📆', title: who + ' ' + verb('are', 'is') + ' on a ' + num(p.days) + '-day study streak', facts: [] };
    default: return { icon: '✨', title: who + ' did something great', facts: [] };
  }
}

/**
 * The week in review for the player, from their own posts.
 * @param {object[]} events feed rows (get_feed)
 * @param {string} myId
 * @param {number} [now]
 */
export function weeklyRecap(events, myId, now) {
  var since = (now || Date.now()) - 7 * 24 * 3600 * 1000;
  var mine = events.filter(function (e) { return e.user_id === myId && new Date(e.created_at).getTime() >= since; });
  var runs = mine.filter(function (e) { return e.kind === 'run'; });
  var answered = 0;
  var right = 0;
  var best = 0;
  runs.forEach(function (e) { var p = e.payload || {}; answered += num(p.total); right += num(p.correct); best = Math.max(best, num(p.score)); });
  var kudos = 0;
  mine.forEach(function (e) { kudos += Number(e.kudos_count) || 0; });
  return { runs: runs.length, answered: answered, accuracy: answered ? Math.round(right / answered * 100) : null, bestScore: best, kudos: kudos, posts: mine.length };
}

/** Kudos newer than a timestamp (for the badge on the Feed tab). */
export function newKudosCount(kudos, since) {
  return (kudos || []).filter(function (k) { return new Date(k.created_at).getTime() > (since || 0); }).length;
}
