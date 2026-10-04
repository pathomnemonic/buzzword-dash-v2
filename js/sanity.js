/**
 * sanity.js — is the saved data still the right shape?
 *
 * A bug that stores NaN, a string where a number belongs, or a negative coin count does not crash anything at
 * once; it shows up later as a broken screen. The soak bot and the tests run this after playing, and it lists
 * every field whose type or range is wrong.
 */

/** Fields that may be null even though they normally hold a number or text. */
var NULLABLE = /(^|\.)(fastestCorrectAnswerMs|lastCompletedDailyDate|lastLoginDate|firstRunAt|examDate|picture)$/;

function kind(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

/**
 * @param {object} data the saved data (storage.data)
 * @param {object} template the default data it was built from
 * @param {string} [path]
 * @returns {string[]} problems, empty when everything is fine
 */
export function checkDataSanity(data, template, path) {
  var out = [];
  path = path || '';
  if (!data || typeof data !== 'object') return [path + ' is missing'];
  Object.keys(template).forEach(function (key) {
    var p = path ? path + '.' + key : key;
    var want = template[key];
    var got = data[key];
    var wk = kind(want);
    var gk = kind(got);
    if (got === undefined) { out.push(p + ' is missing'); return; }
    if (wk === 'object') {
      if (gk !== 'object') out.push(p + ' should be an object, is ' + gk);
      else if (Object.keys(want).length) out = out.concat(checkDataSanity(got, want, p));
      return;
    }
    if (gk !== wk && !(gk === 'null' && NULLABLE.test(p)) && !(wk === 'null' && gk !== 'undefined')) {
      out.push(p + ' should be ' + wk + ', is ' + gk);
      return;
    }
    if (gk === 'number') {
      if (!isFinite(got)) out.push(p + ' is not a finite number');
      else if (got < 0 && want >= 0 && !/Offset|offset/.test(key)) out.push(p + ' is negative (' + got + ')');
    }
  });
  return out;
}

function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }

/**
 * Put right anything in the saved data that has the wrong type or an impossible value (a hand-edited save, a damaged
 * file, an old bug): each such field goes back to its default. Fields that are fine are not touched.
 * @param {object} data
 * @param {object} template
 * @param {string} [path]
 * @returns {number} how many fields were repaired
 */
export function repairData(data, template, path) {
  var fixed = 0;
  path = path || '';
  if (!data || typeof data !== 'object') return 0;
  Object.keys(template).forEach(function (key) {
    var p = path ? path + '.' + key : key;
    var want = template[key];
    var got = data[key];
    var wk = kind(want);
    var gk = kind(got);
    if (got === undefined) { data[key] = clone(want); fixed++; return; }
    if (wk === 'object') {
      if (gk !== 'object') { data[key] = clone(want); fixed++; }
      else if (Object.keys(want).length) fixed += repairData(got, want, p);
      return;
    }
    if (gk !== wk && !(gk === 'null' && NULLABLE.test(p)) && !(wk === 'null' && gk !== 'undefined')) { data[key] = clone(want); fixed++; return; }
    if (gk === 'number' && (!isFinite(got) || (got < 0 && want >= 0 && !/Offset|offset/.test(key)))) { data[key] = clone(want); fixed++; }
  });
  return fixed;
}

// ---------------------------------------------------------------------------------------------------------------------
// The collections: maps and lists whose entries the template cannot describe (checkDataSanity only sees their shape)
// ---------------------------------------------------------------------------------------------------------------------

var DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

function isPlain(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function isNum(v) { return typeof v === 'number' && isFinite(v); }
function count(v) { return isNum(v) && v >= 0 ? Math.floor(v) : 0; }

/** Keep only the entries `clean` returns something for; returns how many were changed or dropped. */
function cleanMap(map, keyOk, clean) {
  if (!isPlain(map)) return 0;
  var fixed = 0;
  Object.keys(map).forEach(function (k) {
    var next;
    if (k === '__proto__' || (keyOk && !keyOk(k))) { delete map[k]; fixed++; return; }
    next = clean(map[k]);
    if (next === undefined) { delete map[k]; fixed++; return; }
    if (next !== map[k]) { map[k] = next; fixed++; }
  });
  return fixed;
}

/** A card's record of answers. Anything unusable is dropped; a missing or damaged number is put right. */
function cleanCardStat(e) {
  if (!isPlain(e)) return undefined;
  ['seen', 'correct', 'wrong', 'lastSeen'].forEach(function (f) { e[f] = count(e[f]); });
  ['interval', 'due', 'ease'].forEach(function (f) {
    if (f in e && !isNum(e[f])) delete e[f];
  });
  // The memory model's three numbers go together: if any is unusable all three go, and the next review rebuilds them
  // from the counts (a stability without a difficulty would turn into NaN at the next answer)
  var scheduleOk = isNum(e.stability) && e.stability > 0 && isNum(e.difficulty) && e.difficulty >= 1 && e.difficulty <= 10 && isNum(e.lastReview);
  if (!scheduleOk) { delete e.stability; delete e.difficulty; delete e.lastReview; }
  if (e.seen < e.correct + e.wrong) e.seen = e.correct + e.wrong;
  return e;
}

function cleanSubjectStat(e) {
  if (!isPlain(e)) return undefined;
  e.correct = count(e.correct);
  e.wrong = count(e.wrong);
  return e;
}

function cleanQuestDay(day) {
  if (!isPlain(day)) return undefined;
  cleanMap(day, null, function (q) {
    if (!isPlain(q)) return undefined;
    q.progress = count(q.progress);
    q.completed = q.completed === true;
    q.claimed = q.claimed === true;
    if (q.completedAt !== null && !isNum(q.completedAt)) q.completedAt = null;
    if (q.claimedAt !== null && !isNum(q.claimedAt)) q.claimedAt = null;
    return q;
  });
  return day;
}

function onlyStrings(arr) { return arr.filter(function (x) { return typeof x === 'string'; }); }
function onlyObjects(arr) { return arr.filter(isPlain); }

/**
 * Put right the parts of a save that the template check cannot see: the maps keyed by card, subject or date, and the
 * lists of ids. A wrong type deep in one of them would otherwise throw the first time the game touched that entry (for
 * example a subject's record that is the number 1.5 stops every run that includes the subject from being saved).
 * @param {object} d the saved data
 * @returns {number} how many entries were repaired or dropped
 */
export function sanitizeCollections(d) {
  if (!isPlain(d)) return 0;
  var fixed = 0;
  var cards = d.cards;
  var history = d.history;
  var prog = d.progression;
  if (isPlain(cards)) {
    fixed += cleanMap(cards.cardStats, null, cleanCardStat);
    fixed += cleanMap(cards.subjectStats, null, cleanSubjectStat);
    ['disabledCardIds'].forEach(function (k) { if (Array.isArray(cards[k])) { var n = onlyStrings(cards[k]); if (n.length !== cards[k].length) { cards[k] = n; fixed++; } } });
    if (Array.isArray(cards.cardReports)) { var r = onlyObjects(cards.cardReports); if (r.length !== cards.cardReports.length) { cards.cardReports = r; fixed++; } }
  }
  if (isPlain(history)) {
    var dayCount = function (v) { return isNum(v) && v >= 0 ? Math.floor(v) : undefined; };
    fixed += cleanMap(history.dailyCounts, function (k) { return DAY_KEY.test(k); }, dayCount);
    fixed += cleanMap(history.dailyCorrect, function (k) { return DAY_KEY.test(k); }, dayCount);
    fixed += cleanMap(history.calendarData, function (k) { return DAY_KEY.test(k); }, function (v) { return isNum(v) ? Math.min(100, Math.max(0, v)) : undefined; });
    fixed += cleanMap(history.weeklyClaims, function (k) { return DAY_KEY.test(k); }, function (v) { return v === true ? v : undefined; });
    ['completedRunIds', 'completedFlashcardSessionIds', 'completedExamIds'].forEach(function (k) {
      if (Array.isArray(history[k])) { var n = onlyStrings(history[k]); if (n.length !== history[k].length) { history[k] = n; fixed++; } }
    });
    ['recentRuns', 'examResults'].forEach(function (k) {
      if (Array.isArray(history[k])) { var n = onlyObjects(history[k]); if (n.length !== history[k].length) { history[k] = n; fixed++; } }
    });
  }
  if (isPlain(prog)) {
    fixed += cleanMap(prog.questState, function (k) { return DAY_KEY.test(k); }, cleanQuestDay);
    fixed += cleanMap(prog.questPicks, function (k) { return DAY_KEY.test(k); }, function (v) { return Array.isArray(v) ? onlyStrings(v) : undefined; });
    ['achievements', 'ownedItems', 'tournamentTop10Weeks'].forEach(function (k) {
      if (Array.isArray(prog[k])) { var n = onlyStrings(prog[k]); if (n.length !== prog[k].length) { prog[k] = n; fixed++; } }
    });
    if (isPlain(prog.equipped)) {
      Object.keys(prog.equipped).forEach(function (slot) { if (typeof prog.equipped[slot] !== 'string') { delete prog.equipped[slot]; fixed++; } });
    }
  }
  if (isPlain(d.profile) && Array.isArray(d.profile.selectedBadges)) {
    var b = onlyStrings(d.profile.selectedBadges);
    if (b.length !== d.profile.selectedBadges.length) { d.profile.selectedBadges = b; fixed++; }
  }
  if (isPlain(d.idempotency) && Array.isArray(d.idempotency.progressionEventIds)) {
    var ev = onlyStrings(d.idempotency.progressionEventIds);
    if (ev.length !== d.idempotency.progressionEventIds.length) { d.idempotency.progressionEventIds = ev; fixed++; }
  }
  if (isPlain(d.settings)) {
    ['selectedSubjects', 'selectedExams', 'selectedQuestionTypes', 'selectedSources', 'achievementsSeen'].forEach(function (k) {
      if (Array.isArray(d.settings[k])) { var n = onlyStrings(d.settings[k]); if (n.length !== d.settings[k].length) { d.settings[k] = n; fixed++; } }
    });
  }
  return fixed;
}
