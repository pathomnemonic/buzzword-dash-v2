import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderFeedTab, kudosLine } from '../../js/feedui.js';

// The Feed tab against a fake service (the database rules are tested in database.test.js).

const ME = 'me';
const flush = () => new Promise((r) => setTimeout(r, 0));
const ago = (mins) => new Date(Date.now() - mins * 60000).toISOString();

function makeService(events, over) {
  return Object.assign({
    getUserId: () => ME,
    getFeed: vi.fn(async () => events),
    getRecentKudos: vi.fn(async () => []),
    giveKudos: vi.fn(async () => ({ success: true })),
    removeKudos: vi.fn(async () => ({ success: true })),
    setActivityVisibility: vi.fn(async () => ({ success: true })),
    deleteActivity: vi.fn(async () => ({ success: true }))
  }, over || {});
}

function mount(lb, store) {
  document.body.innerHTML = '<div id="root"></div>';
  const settings = Object.assign({ shareRuns: 'friends', kudosSeenAt: 0 }, store || {});
  const storage = { get: (k) => settings[k], set: (k, v) => { settings[k] = v; } };
  const toasts = [];
  const root = document.getElementById('root');
  const rerender = () => { root.textContent = ''; renderFeedTab(root, { lb, storage, toast: (m) => toasts.push(m), rerender, startChallenge: vi.fn() }); };
  rerender();
  return { root, settings, toasts, rerender };
}
const buttons = (root, re) => [...root.querySelectorAll('button')].filter((b) => re.test(b.textContent));

describe('Feed tab', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  const friendRun = { id: 5, user_id: 'f1', player_name: 'Alice', avatar: 'icon:🦊', kind: 'run', visibility: 'friends', created_at: ago(5), kudos_count: 2, i_gave: null, kudos_by: ['Bo', 'Cy'], payload: { name: 'Alice', mode: 'endless', score: 1500, correct: 12, total: 15, streak: 8, secs: 120 } };
  const myRun = { id: 6, user_id: ME, player_name: 'Me', avatar: 'icon:🩺', kind: 'run', visibility: 'friends', created_at: ago(60), kudos_count: 1, kudos_by: ['Alice'], payload: { name: 'Me', mode: 'daily', score: 800, correct: 9, total: 10, streak: 6, secs: 90 } };

  it('shows a run with its facts, who gave kudos, and the week in review', async () => {
    const { root } = mount(makeService([friendRun, myRun]));
    await flush();
    const t = root.textContent;
    expect(t).toContain('Alice ran Endless: 1,500 points');
    expect(t).toContain('12/15 right (80%)');
    expect(t).toContain('Bo and Cy');
    expect(t).toContain('You ran Daily 15: 800 points');
    expect(root.querySelector('#feedRecapText').textContent).toContain('1 run');
    expect(root.querySelector('#feedRecapText').textContent).toContain('1 kudos');
  });

  it('the kudos line names up to two people and counts the rest', () => {
    expect(kudosLine({ kudos_count: 0 })).toBe('');
    expect(kudosLine({ kudos_count: 3, kudos_by: ['A', 'B', 'C'] })).toBe('A, B and 1 other');
    expect(kudosLine({ kudos_count: 5, kudos_by: ['A', 'B', 'C'] })).toBe('A, B and 3 others');
  });

  it('gives and takes back kudos on a friend\'s post, never on your own', async () => {
    const lb = makeService([JSON.parse(JSON.stringify(friendRun)), myRun]);
    const { root } = mount(lb);
    await flush();
    expect(buttons(root, /Kudos/).length).toBe(1); // only Alice's post
    buttons(root, /^👏 Kudos$/)[0].click();
    await flush();
    expect(lb.giveKudos).toHaveBeenCalledWith(5, 'kudos');
    expect(root.textContent).toContain('Given');
    expect(root.querySelector('[data-event-id="5"]').textContent).toContain('Bo, Cy and 1 other'); // the count went up by one
    buttons(root, /Given/)[0].click();
    await flush();
    expect(lb.removeKudos).toHaveBeenCalledWith(5);
    expect(buttons(root, /^👏 Kudos$/).length).toBe(1);
  });

  it('offers the other reactions', async () => {
    const lb = makeService([JSON.parse(JSON.stringify(friendRun))]);
    const { root } = mount(lb);
    await flush();
    root.querySelector('[aria-label="More reactions"]').click();
    await flush();
    buttons(root, /Big brain/)[0].click();
    await flush();
    expect(lb.giveKudos).toHaveBeenCalledWith(5, 'brain');
  });

  it('lets the player hide one of their posts, share it again, or delete it', async () => {
    const lb = makeService([JSON.parse(JSON.stringify(myRun))]);
    const { root } = mount(lb);
    await flush();
    buttons(root, /Make private/)[0].click();
    await flush();
    expect(lb.setActivityVisibility).toHaveBeenCalledWith(6, 'private');
    expect(root.textContent).toContain('Only you');
    buttons(root, /Share with friends/)[0].click();
    await flush();
    expect(lb.setActivityVisibility).toHaveBeenLastCalledWith(6, 'friends');
    window.confirm = () => true;
    root.querySelector('[aria-label="Delete this post"]').click();
    await flush();
    expect(lb.deleteActivity).toHaveBeenCalledWith(6);
    expect(root.querySelector('[data-event-id="6"]')).toBeNull();
  });

  it('chooses who sees new runs and remembers it', async () => {
    const { root, settings } = mount(makeService([]));
    await flush();
    expect(root.textContent).toContain('Friends see your runs');
    buttons(root, /Only me/)[0].click();
    await flush();
    expect(settings.shareRuns).toBe('private');
    expect(root.textContent).toContain('no one else sees them');
  });

  it('filters the feed and asks the service for that scope', async () => {
    const lb = makeService([]);
    const { root } = mount(lb);
    await flush();
    buttons(root, /^Mine$/)[0].click();
    await flush();
    expect(lb.getFeed).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'mine' }));
    expect(root.textContent).toContain('no posts yet');
  });

  it('lists kudos received and marks them seen', async () => {
    const lb = makeService([myRun], { getRecentKudos: vi.fn(async () => [{ event_id: 6, kind: 'run', giver_name: 'Alice', emoji: 'fire', created_at: ago(10) }]) });
    const { root, settings } = mount(lb);
    await flush();
    expect(root.textContent).toContain('Kudos you got (1 new)');
    expect(root.textContent).toContain('🔥 Alice');
    expect(settings.kudosSeenAt).toBeGreaterThan(0);
  });

  it('shows a hostile name as plain text', async () => {
    const evil = { ...friendRun, id: 9, payload: { ...friendRun.payload, name: '<img src=x onerror=alert(1)>' }, kudos_count: 0, kudos_by: [] };
    const { root } = mount(makeService([evil]));
    await flush();
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toContain('<img src=x');
  });
});
