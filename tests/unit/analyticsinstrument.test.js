import { describe, it, expect, beforeAll } from 'vitest';
import { analytics } from '../../js/analytics/index.js';
import { instrumentLeaderboard } from '../../js/analytics/instrument.js';
import { storage } from '../../js/storage.js';

function recent(name) { return analytics.recent().filter(function (e) { return e.n === name; }); }

describe('instrumented services report what happened, never who with', function () {
  beforeAll(function () { analytics.init(); analytics.setConsent(true, 'settings'); });

  it('friend, group and deck calls become events once they succeed', async function () {
    var lb = {
      sendFriendRequest: function () { return Promise.resolve({ success: true }); },
      acceptFriendRequest: function () { return Promise.resolve({ success: false, error: 'nope' }); },
      createGroup: function () { return Promise.resolve({ success: true, code: 'ABC123' }); },
      searchPlayers: function () { return Promise.resolve([{ id: 'u1', name: 'Someone' }, { id: 'u2', name: 'Else' }]); },
      publishDeck: function (name, cards) { return Promise.resolve({ success: true, code: 'ZZZ' }); },
      fetchDeck: function () { return Promise.resolve({ success: false }); }
    };
    instrumentLeaderboard(lb);
    await lb.sendFriendRequest('some-user-id');
    await lb.acceptFriendRequest('req');
    await lb.createGroup('My secret group name');
    await lb.searchPlayers('someone');
    await lb.publishDeck('My deck', [1, 2, 3]);
    await lb.fetchDeck('ZZZ');
    await Promise.resolve();
    expect(recent('friend_event').map(function (e) { return e.p.action; })).toEqual(['request_sent', 'group_created', 'search']);
    expect(recent('friend_event').pop().p.count).toBe(2);
    expect(recent('deck_shared').map(function (e) { return e.p.action; })).toEqual(['published', 'failed']);
    expect(recent('deck_shared')[0].p.cards).toBe(3);
    var all = JSON.stringify(analytics.recent());
    ['some-user-id', 'My secret group name', 'Someone', 'ABC123', 'My deck'].forEach(function (secret) { expect(all).not.toContain(secret); });
  });

  it('instrumenting twice does not double-count', async function () {
    var lb = { sendFriendRequest: function () { return Promise.resolve({ success: true }); } };
    instrumentLeaderboard(lb); instrumentLeaderboard(lb);
    var before = recent('friend_event').length;
    await lb.sendFriendRequest('x');
    await Promise.resolve();
    expect(recent('friend_event').length).toBe(before + 1);
  });
});

describe('storage problems are remembered for analytics', function () {
  it('records a damaged save, even before analytics starts', function () {
    var s = Object.create(Object.getPrototypeOf(storage));
    s.problems = undefined;
    s._problem('corrupt', 'load');
    s._problem('quota', 'QuotaExceededError');
    expect(s.problems).toEqual([{ kind: 'corrupt', detail: 'load' }, { kind: 'quota', detail: 'QuotaExceededError' }]);
    var seen = [];
    s.onProblem = function (k) { seen.push(k); };
    s._problem('repaired', 'x');
    expect(seen).toEqual(['repaired']);
  });
});
