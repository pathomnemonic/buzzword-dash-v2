import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

let rpcImpl;
vi.mock('../../js/leaderboard.js', () => ({
  leaderboard: { getClient: () => ({ rpc: (n, a) => rpcImpl(n, a) }), isAuthenticated: () => true }
}));

const { FEATURES } = await import('../../js/features.js');
const { cohorts } = await import('../../js/cohorts.js');
const { mountCohorts } = await import('../../js/cohortsui.js');

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  rpcImpl = async () => ({ data: null, error: null });
});

describe('cohorts (not released)', () => {
  it('stays switched off unless the build turns it on', () => {
    expect(FEATURES.cohorts).toBe(false);
    const html = readFileSync('index.html', 'utf8');
    expect(html).toMatch(/id="cohortsBtn"[^>]*hidden/);
    // nothing outside the flag may reveal the button
    const main = readFileSync('js/main.js', 'utf8');
    expect(main).toMatch(/if \(FEATURES\.cohorts\) \{[\s\S]*cohortsBtn\.hidden = false/);
  });

  it('wraps the database functions', async () => {
    rpcImpl = async (name, args) => {
      if (name === 'cohort_create') return { data: { id: 'c1', tag: 'ABCDE', name: args.p_name }, error: null };
      if (name === 'cohort_search') return { data: [{ name: 'Night Owls' }], error: null };
      return { data: null, error: { message: 'nope' } };
    };
    expect(await cohorts.create('Night Owls', 'State', '')).toMatchObject({ ok: true, cohort: { tag: 'ABCDE' } });
    expect((await cohorts.search('owl')).results).toHaveLength(1);
    expect(await cohorts.leave()).toEqual({ ok: false, error: 'nope' });
  });

  it('offers to join or start a cohort when the player has none', async () => {
    mountCohorts(document.getElementById('root'));
    await settle();
    const text = document.getElementById('root').textContent;
    expect(text).toContain('Join a cohort');
    expect(text).toContain('Start a cohort');
    expect(document.querySelectorAll('[role="tab"]')).toHaveLength(3);
  });

  it('shows the roster and war points for members', async () => {
    rpcImpl = async (name) => name === 'my_cohort'
      ? { data: { id: 'c', name: 'Night Owls', tag: 'ABCDE', school: 'State Med', description: '', my_role: 'leader', week: '2026-W40', war_points: 30,
          members: [{ user_id: 'u1', name: 'Ada', role: 'leader', trophies: 800, war_points: 30 }, { user_id: 'u2', name: 'Bo', role: 'member', trophies: 10, war_points: 0 }] }, error: null }
      : { data: null, error: null };
    mountCohorts(document.getElementById('root'));
    await settle();
    const text = document.getElementById('root').textContent;
    expect(text).toContain('Night Owls');
    expect(text).toContain('30 war points this week');
    expect(text).toContain('Invite code: ABCDE');
    expect(text).toContain('Ada');
    expect(text).toContain('Remove'); // a leader can remove members
  });

  it('shows the war and school ladders', async () => {
    rpcImpl = async (name) => {
      if (name === 'cohort_war_standings') return { data: [{ rank: 1, name: 'Night Owls', school: 'State Med', war_points: 120 }], error: null };
      if (name === 'school_standings') return { data: [{ rank: 1, name: 'State Med', cohorts: 2, war_points: 150 }], error: null };
      return { data: null, error: null };
    };
    mountCohorts(document.getElementById('root'));
    await settle();
    document.querySelector('[data-view="war"]').click();
    await settle();
    expect(document.getElementById('root').textContent).toContain('Night Owls');
    document.querySelector('[data-view="schools"]').click();
    await settle();
    expect(document.getElementById('root').textContent).toContain('State Med (2 cohorts)');
  });
});
