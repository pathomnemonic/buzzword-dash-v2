/**
 * savemutate.mjs — damages a saved game in the ways saves get damaged.
 *
 * Used by tests/unit/savetorture.test.js (the storage code) and tools/savefuzz.mjs (the whole app in a browser).
 * `mutate(save, rng)` changes one thing somewhere inside the save object: removes a field, gives it a value of the wrong
 * type or an extreme value, cuts or pads a list, or adds a key that tries to reach into the prototype.
 */

/** Every path to something inside the save: [key, key, ...]. */
export function allPaths(node, prefix, out, depth) {
  out = out || [];
  prefix = prefix || [];
  depth = depth || 0;
  if (depth > 6 || node === null || typeof node !== 'object') return out;
  Object.keys(node).slice(0, 60).forEach(function (k) { // (the big maps are sampled: the paths below the first sixty keys look the same)
    out.push(prefix.concat(k));
    allPaths(node[k], prefix.concat(k), out, depth + 1);
  });
  return out;
}

export function getAt(root, path) {
  return path.reduce(function (n, k) { return n == null ? n : n[k]; }, root);
}

export var BAD_VALUES = [
  null, '', 'abc', '2026-13-45', -1, 0, 1.5, 1e21, -1e21, Number.MAX_SAFE_INTEGER * 2, [], {}, [null], [1, 2, 3], { a: 1 }, true, false,
  'x'.repeat(5000), '\u0000‮\u{1F600}', '__proto__', { __proto__: null }, [[[[[]]]]], 'NaN', 'Infinity', ' '
];

/** Change one thing in `root` (in place). `rng` returns numbers in [0, 1). */
export function mutate(root, rng) {
  var paths = allPaths(root);
  if (!paths.length) return;
  var how = rng();
  var path = paths[Math.floor(rng() * paths.length)];
  var parent = getAt(root, path.slice(0, -1));
  var key = path[path.length - 1];
  if (parent === null || typeof parent !== 'object') return;
  if (how < 0.2) { delete parent[key]; return; }
  if (how < 0.75) { parent[key] = BAD_VALUES[Math.floor(rng() * BAD_VALUES.length)]; return; }
  if (how < 0.85 && Array.isArray(parent[key])) { parent[key] = parent[key].slice(0, Math.floor(rng() * 3)); return; }
  if (how < 0.92 && Array.isArray(parent[key])) { parent[key].push(null, undefined, 7, 'x', {}); return; }
  if (how < 0.96 && typeof parent[key] === 'number') { parent[key] = [NaN, Infinity, -Infinity, -0][Math.floor(rng() * 4)]; return; }
  if (parent[key] && typeof parent[key] === 'object') parent[key]['__proto__x'] = { polluted: true };
}
