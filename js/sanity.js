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
