import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mountLeaderboardScreen } from '../../js/leaderboardui.js';
import { renderDiscoverTab, renderGroupDiscoverySettings } from '../../js/discoveryui.js';
import { FEATURES } from '../../js/features.js';

const flush = () => new Promise((r) => setTimeout(r, 0));
const buttons = (root, re) => [...root.querySelectorAll('button')].filter((b) => re.test(b.textContent));

function service(over) {
  return Object.assign({
    getBuddyListing: vi.fn(async () => null),
    setBuddyListing: vi.fn(async () => ({ success: true })),
    removeBuddyListing: vi.fn(async () => ({ success: true })),
    findBuddies: vi.fn(async () => ({ success: true, data: [{ user_id: 'u2', player_name: 'Bo', avatar: 'icon:🦊', exam: 'USMLE Step 1', exam_date: '2027-03-01', subjects: ['Cardiology'], pace: 'steady', utc_offset: -5, score: 8 }] })),
    sendFriendRequest: vi.fn(async () => ({ success: true })),
    discoverGroups: vi.fn(async () => [
      { id: 'g1', name: 'Step 1 Crew', exam: 'USMLE Step 1', join_mode: 'open', member_count: '4', owner_name: 'Ada', requested: false },
      { id: 'g2', name: 'Quiet Study', exam: null, join_mode: 'request', member_count: '2', owner_name: 'Cy', requested: false }
    ]),
    joinPublicGroup: vi.fn(async (id) => ({ success: true, data: id === 'g1' ? 'joined' : 'requested' })),
    cancelGroupRequest: vi.fn(async () => ({ success: true })),
    getGroupRequests: vi.fn(async () => [{ user_id: 'u9', player_name: 'Di', avatar: '', created_at: new Date().toISOString() }]),
    resolveGroupRequest: vi.fn(async () => ({ success: true })),
    setGroupDiscovery: vi.fn(async () => ({ success: true })),
    reportContent: vi.fn(async () => ({ success: true }))
  }, over || {});
}

function mount(lb) {
  document.body.innerHTML = '<div id="root"></div>';
  const root = document.getElementById('root');
  const toasts = [];
  const storage = { get: (k) => ({ examDate: '2027-03-01' })[k] || '', set() {} };
  const rerender = vi.fn();
  renderDiscoverTab(root, { lb, storage, toast: (m) => toasts.push(m), rerender });
  return { root, toasts, rerender };
}

describe('discovery screens', () => {
  beforeEach(() => { FEATURES.discovery = false; });

  it('has no Discover tab while the feature is off, and one when it is on', async () => {
    const base = {
      getStatus: () => ({ configured: true, authenticated: true, ready: true }), getUserId: () => 'me',
      getPendingRequests: async () => [], getFriends: async () => [], getFeed: async () => [], getRecentKudos: async () => [],
      getMyGroups: async () => [], getModeLabel: (m) => m, getTopScores: async () => []
    };
    const deps = { leaderboard: base, storage: { get: () => '' , set() {} }, toast() {}, getRoomCode: () => '' };
    document.body.innerHTML = '<div id="root"></div>';
    mountLeaderboardScreen(document.getElementById('root'), deps);
    await flush();
    expect([...document.querySelectorAll('[role="tab"]')].some((b) => /Discover/.test(b.textContent))).toBe(false);
    FEATURES.discovery = true;
    mountLeaderboardScreen(document.getElementById('root'), deps);
    await flush();
    expect([...document.querySelectorAll('[role="tab"]')].some((b) => /Discover/.test(b.textContent))).toBe(true);
  });

  it('keeps the player hidden until they turn their listing on', async () => {
    const lb = service();
    const { root } = mount(lb);
    await flush();
    expect(root.querySelector('#buddyOn').checked).toBe(false);
    expect(root.textContent).toContain('Turn on "Let others find me"');
    expect(lb.findBuddies).not.toHaveBeenCalled();
  });

  it('saves a listing with the chosen exam, subjects and pace', async () => {
    const lb = service();
    const { root } = mount(lb);
    await flush();
    root.querySelector('#buddyExam').value = 'COMLEX Level 1';
    root.querySelector('#buddyPace').value = 'intense';
    buttons(root, /^Cardiology$/)[0].click();
    root.querySelector('#buddyOn').checked = true;
    buttons(root, /^Save$/)[0].click();
    await flush();
    const arg = lb.setBuddyListing.mock.calls[0][0];
    expect(arg).toMatchObject({ exam: 'COMLEX Level 1', pace: 'intense', discoverable: true, examDate: '2027-03-01' });
    expect(arg.subjects).toContain('Cardiology');
    expect(typeof arg.utcOffset).toBe('number');
  });

  it('shows matches once discoverable, with add and report', async () => {
    const lb = service({ getBuddyListing: vi.fn(async () => ({ user_id: 'me', exam: 'USMLE Step 1', exam_date: null, subjects: [], pace: 'steady', discoverable: true })) });
    const { root, toasts } = mount(lb);
    await flush();
    expect(root.textContent).toContain('Bo');
    expect(root.textContent).toContain('USMLE Step 1');
    buttons(root, /Add/)[0].click();
    await flush();
    expect(lb.sendFriendRequest).toHaveBeenCalledWith('u2');
    expect(toasts).toContain('Friend request sent!');
    root.querySelector('[aria-label="Report"]').click();
    buttons(root, /^Spam$/)[0].click();
    await flush();
    expect(lb.reportContent).toHaveBeenCalledWith('buddy', 'u2', 'spam');
  });

  it('lets someone join an open group and ask to join another', async () => {
    const lb = service();
    const { root, rerender, toasts } = mount(lb);
    await flush();
    expect(root.textContent).toContain('Step 1 Crew');
    expect(root.textContent).toContain('owner approves');
    buttons(root, /^Join$/)[0].click();
    await flush();
    expect(lb.joinPublicGroup).toHaveBeenCalledWith('g1');
    expect(rerender).toHaveBeenCalled();
    buttons(root, /Ask to join/)[0].click();
    await flush();
    expect(lb.joinPublicGroup).toHaveBeenCalledWith('g2');
    expect(toasts.some((m) => /Request sent/.test(m))).toBe(true);
  });

  it('owner settings: make a group public and answer requests; others see nothing', async () => {
    const lb = service();
    const rerender = vi.fn();
    const box = document.createElement('div');
    renderGroupDiscoverySettings(box, { id: 'g1', is_owner: false, visibility: 'private' }, { lb, toast() {}, rerender });
    expect(box.children.length).toBe(0);
    renderGroupDiscoverySettings(box, { id: 'g1', is_owner: true, visibility: 'private', exam: null, join_mode: 'open', pending_requests: 1 }, { lb, toast() {}, rerender });
    await flush();
    box.querySelector('#groupPublic').checked = true;
    box.querySelector('#groupExam').value = 'USMLE Step 1';
    box.querySelector('#groupJoin').value = 'request';
    buttons(box, /^Save$/)[0].click();
    await flush();
    expect(lb.setGroupDiscovery).toHaveBeenCalledWith('g1', true, 'USMLE Step 1', 'request');
    expect(box.textContent).toContain('Di');
    buttons(box, /Accept/)[0].click();
    await flush();
    expect(lb.resolveGroupRequest).toHaveBeenCalledWith('g1', 'u9', true);
  });
});
