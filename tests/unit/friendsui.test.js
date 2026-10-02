import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mountLeaderboardScreen } from '../../js/leaderboardui.js';
import { FEATURES } from '../../js/features.js';

// The Friends screen (friends, feed, groups, requests, find) against a fake service. The database rules behind it
// are tested in database.test.js; this checks that the screen calls the service the right way and shows the results.

const ME = 'me';
const flush = () => new Promise((r) => setTimeout(r, 0));

function makeService(over) {
  const groups = [];
  const svc = {
    getStatus: () => ({ configured: true, authenticated: true, ready: true }),
    getUserId: () => ME,
    getPendingRequests: vi.fn(async () => []),
    getFriends: vi.fn(async () => [{ user_id: 'f1', player_name: 'Alice', best_score: 1200, best_streak: 7 }]),
    getFeed: vi.fn(async () => [
      { id: 1, user_id: 'f1', kind: 'new_best', payload: { name: 'Alice', score: 1200 }, created_at: new Date().toISOString() },
      { id: 2, user_id: ME, kind: 'streak', payload: { name: 'Me', streak: 12 }, created_at: new Date(Date.now() - 3 * 3600000).toISOString() },
      { id: 3, user_id: 'f1', kind: 'mystery', payload: { name: '<img src=x onerror=alert(1)>' }, created_at: new Date(Date.now() - 2 * 86400000).toISOString() }
    ]),
    getMyGroups: vi.fn(async () => groups.slice()),
    createGroup: vi.fn(async (name) => { const g = { id: 'g' + (groups.length + 1), name, code: 'ABC123', member_count: 1, is_owner: true }; groups.push(g); return { success: true, data: g }; }),
    joinGroup: vi.fn(async (code) => (code === 'GOOD' ? (groups.push({ id: 'gj', name: 'Study Crew', code, member_count: 4, is_owner: false }), { success: true, data: groups[groups.length - 1] }) : { success: false, error: 'No group with that code.' })),
    leaveGroup: vi.fn(async (id) => { const i = groups.findIndex((g) => g.id === id); if (i >= 0) groups.splice(i, 1); return { success: true }; }),
    getGroupGoal: vi.fn(async () => [{ goal: 500, user_id: ME, player_name: 'Me', cards: 120 }, { goal: 500, user_id: 'f1', player_name: 'Alice', cards: 80 }]),
    setGroupGoal: vi.fn(async () => ({ success: true })),
    getGroupScores: vi.fn(async () => [{ user_id: 'f1', player_name: 'Alice', score: 900, accuracy: 80, best_streak: 5 }]),
    getModeLabel: (m) => m,
    getTopScores: vi.fn(async () => []),
    sendFriendRequest: vi.fn(async () => ({ success: true })),
    searchPlayers: vi.fn(async () => [{ user_id: 'p9', player_name: 'Zed', best_score: 50, best_streak: 2 }]),
    removeFriend: vi.fn(async () => ({ success: true })),
    postActivity: vi.fn(async () => ({ success: true })),
    ensureProfile: vi.fn(async () => ({ success: true }))
  };
  return Object.assign(svc, over || {});
}

function mount(svc) {
  document.body.innerHTML = '<div id="root"></div>';
  const toasts = [];
  const storage = { get: (k) => ({ profileName: 'Me', profileVisible: true })[k], set() {} };
  mountLeaderboardScreen(document.getElementById('root'), { leaderboard: svc, storage, toast: (m) => toasts.push(m), getRoomCode: () => '', startChallenge: vi.fn() });
  return toasts;
}
const tab = (label) => [...document.querySelectorAll('[role="tab"]')].find((b) => b.textContent.includes(label));
const text = () => document.getElementById('root').textContent;

describe('Friends screen', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('has no Global tab while the global leaderboard is hidden, and opens on Friends', async () => {
    expect(FEATURES.globalLeaderboard).toBe(false);
    const svc = makeService();
    mount(svc);
    await flush();
    const labels = [...document.querySelectorAll('[role="tab"]')].map((b) => b.textContent);
    expect(labels.some((l) => /Global/.test(l))).toBe(false);
    expect(labels).toEqual(expect.arrayContaining([expect.stringContaining('Friends'), expect.stringContaining('Feed'), expect.stringContaining('Groups'), expect.stringContaining('Requests'), expect.stringContaining('Find'), expect.stringContaining('Account')]));
    expect(svc.getTopScores).not.toHaveBeenCalled(); // nothing is fetched for the hidden board
    expect(text()).toContain('Alice');
    expect(text()).not.toMatch(/global board|public on the leaderboard/i);
  });

  it('the feed lists friends\' highlights and mine, as plain text, with a Challenge button only on a friend\'s', async () => {
    mount(makeService());
    tab('Feed').click();
    await flush();
    const t = text();
    expect(t).toContain('Alice set a new best score: 1,200');
    expect(t).toContain('Me hit a 12-answer streak');
    expect(t).toContain('just now');
    expect(t).toContain('3h ago');
    expect(t).toContain('2d ago');
    expect(document.querySelector('#root img')).toBeNull(); // a hostile name is text, never markup
    const challenges = [...document.querySelectorAll('#root button')].filter((b) => /Challenge/.test(b.textContent));
    expect(challenges.length).toBe(2); // Alice's two events, not mine
  });

  it('an empty feed says what to do', async () => {
    mount(makeService({ getFeed: async () => [] }));
    tab('Feed').click();
    await flush();
    expect(text()).toMatch(/Nothing yet/);
  });

  it('groups: create one, see its code and member count, then goal and board', async () => {
    const svc = makeService();
    const toasts = mount(svc);
    tab('Groups').click();
    await flush();
    expect(text()).toContain('You are not in any groups yet.');
    const inputs = document.querySelectorAll('#root input[placeholder="New group name"]');
    inputs[0].value = 'Cardio Crew';
    [...document.querySelectorAll('#root button')].find((b) => b.textContent === 'Create').click();
    await flush(); await flush(); await flush();
    expect(svc.createGroup).toHaveBeenCalledWith('Cardio Crew');
    expect(toasts.some((m) => /Group created! Code: ABC123/.test(m))).toBe(true);
    const t = text();
    expect(t).toContain('Cardio Crew');
    expect(t).toContain('Code ABC123 · 1 member');
    expect(t).toContain('200 / 500'); // the group's cards add up across members (120 + 80)
    expect(t).toContain('Alice');
    expect(document.querySelector('[aria-label="Weekly goal in cards"]')).not.toBeNull(); // the owner can set it
    expect(svc.postActivity).toHaveBeenCalledWith('group_join', { name: 'Me' }); // friends see it in their feed
  });

  it('groups: joining with a bad code shows the error, a good one joins; a non-owner cannot set the goal; leaving removes it', async () => {
    const svc = makeService();
    const toasts = mount(svc);
    tab('Groups').click();
    await flush();
    const join = document.querySelector('#root input[placeholder="Join with a code"]');
    const press = () => [...document.querySelectorAll('#root button')].find((b) => b.textContent === 'Join').click();
    join.value = 'NOPE';
    press();
    await flush(); await flush();
    expect(toasts).toContain('No group with that code.');
    document.querySelector('#root input[placeholder="Join with a code"]').value = 'GOOD';
    [...document.querySelectorAll('#root button')].find((b) => b.textContent === 'Join').click();
    await flush(); await flush(); await flush();
    expect(toasts).toContain('Joined Study Crew!');
    expect(text()).toContain('Code GOOD · 4 members');
    expect(document.querySelector('[aria-label="Weekly goal in cards"]')).toBeNull();
    window.confirm = () => true;
    [...document.querySelectorAll('#root button')].find((b) => b.textContent === 'Leave').click();
    await flush(); await flush(); await flush();
    expect(svc.leaveGroup).toHaveBeenCalledWith('gj');
    expect(text()).toContain('You are not in any groups yet.');
  });

  it('find: search for a player and send a friend request', async () => {
    const svc = makeService();
    const toasts = mount(svc);
    tab('Find').click();
    await flush();
    document.querySelector('#root input[type="search"]').value = 'Zed';
    [...document.querySelectorAll('#root button')].find((b) => b.textContent === 'Search').click();
    await flush(); await flush(); await flush();
    expect(svc.searchPlayers).toHaveBeenCalledWith('Zed');
    expect(text()).toContain('Zed');
    [...document.querySelectorAll('#root button')].find((b) => /Add/.test(b.textContent)).click();
    await flush();
    expect(svc.sendFriendRequest).toHaveBeenCalledWith('p9');
    expect(toasts).toContain('Friend request sent!');
  });

  it('requests: accept a request', async () => {
    const pending = [{ id: 'r1', player_name: 'Bob' }];
    const svc = makeService({
      getPendingRequests: vi.fn(async () => pending.slice()),
      acceptFriendRequest: vi.fn(async () => { pending.length = 0; return { success: true }; })
    });
    const toasts = mount(svc);
    await flush(); await flush();
    tab('Requests').click();
    await flush(); await flush();
    expect(text()).toContain('Bob');
    [...document.querySelectorAll('#root button')].find((b) => b.textContent === 'Accept').click();
    await flush(); await flush();
    expect(svc.acceptFriendRequest).toHaveBeenCalledWith('r1');
    expect(toasts.some((m) => /now friends with Bob/.test(m))).toBe(true);
  });
});
