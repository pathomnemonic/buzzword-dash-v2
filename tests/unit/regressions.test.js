import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { stepAdaptiveResolution, createAdaptiveResolution } from '../../js/game/quality.js';

// Bugs that were found by playing the game, so they stay fixed.

function loadPage() {
  const html = readFileSync('index.html', 'utf8');
  const body = html.slice(html.indexOf('<body'), html.indexOf('</body>'));
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, '');
}

describe('pause screen', () => {
  let game;
  beforeEach(async () => {
    localStorage.clear();
    loadPage();
    ({ game } = await import('../../js/game/engine.js'));
  });

  it('shows when the game pauses and goes away when it resumes (even via the Resume button)', () => {
    const overlay = document.getElementById('pauseOverlay');
    game._state = 'playing';
    game.pause('user');
    expect(game._state).toBe('paused');
    expect(overlay.classList.contains('active')).toBe(true);
    game.resume(); // what the Resume button calls
    expect(game._state).toBe('playing');
    expect(overlay.classList.contains('active')).toBe(false);
  });

  it('is cleared by resume even if the state already moved on', () => {
    const overlay = document.getElementById('pauseOverlay');
    overlay.classList.add('active');
    game._state = 'ended';
    game.resume();
    expect(overlay.classList.contains('active')).toBe(false);
  });

  it('toggles from the pause button', () => {
    const overlay = document.getElementById('pauseOverlay');
    game._state = 'playing';
    game.togglePause();
    expect(overlay.classList.contains('active')).toBe(true);
    game.togglePause();
    expect(overlay.classList.contains('active')).toBe(false);
  });
});

describe('navigation tabs', () => {
  it('only the current tab is highlighted (aria-current follows the tab)', async () => {
    localStorage.clear();
    loadPage();
    const { ui } = await import('../../js/ui.js');
    const { storage } = await import('../../js/storage.js');
    storage.load();
    ui.show('screenSettings');
    const current = [...document.querySelectorAll('.nav-item')].filter((n) => n.getAttribute('aria-current') === 'true');
    expect(current).toHaveLength(0); // Settings is a button on Home, not a tab, so no tab is lit
    ui.show('screenStats');
    const lit = [...document.querySelectorAll('.nav-item')].filter((n) => n.getAttribute('aria-current') === 'true' || n.classList.contains('active'));
    expect(lit.map((n) => n.dataset.screen)).toEqual(['screenStats']);
    ui.show('screenHome');
    const home = [...document.querySelectorAll('.nav-item')].filter((n) => n.getAttribute('aria-current') === 'true');
    expect(home.map((n) => n.dataset.screen)).toEqual(['screenHome']);
  });
});

describe('starting monster and defaults', () => {
  it('everyone starts with the animated 3D ghost, and the old monster stays available', async () => {
    localStorage.clear();
    const { storage } = await import('../../js/storage.js');
    storage.load();
    expect(storage.get('equipped').monster).toBe('monster_m_ghost');
    expect(storage.get('ownedItems')).toContain('monster_m_ghost');
    expect(storage.get('ownedItems')).toContain('monster_classic');
  });

  it('players still on the old round monster are moved to the 3D one once', async () => {
    localStorage.clear();
    const { storage } = await import('../../js/storage.js');
    storage.load();
    const raw = JSON.parse(JSON.stringify(storage.data));
    raw.progression.equipped.monster = 'monster_classic';
    delete raw.progression.monsterDefaultSeen;
    localStorage.setItem('buzzword_dash_v1', JSON.stringify(raw));
    storage.load();
    expect(storage.get('equipped').monster).toBe('monster_m_ghost');
    // the old monster is archived: nobody is left wearing it, but they still own it
    storage.data.progression.equipped.monster = 'monster_classic';
    storage.save && storage.save();
    storage.load();
    expect(storage.get('equipped').monster).toBe('monster_m_ghost');
    expect(storage.get('ownedItems')).toContain('monster_classic');
  });

  it('30 fps is on by default, once, and can be turned off', async () => {
    localStorage.clear();
    const { storage } = await import('../../js/storage.js');
    storage.load();
    expect(storage.get('batterySaver')).toBe(true);
    storage.set('batterySaver', false);
    storage.save && storage.save();
    storage.load();
    expect(storage.get('batterySaver')).toBe(false);
  });
});

describe('monster names', () => {
  it('has no name that could offend', async () => {
    const { CHARACTER_MODELS, MONSTER_MODELS } = await import('../../js/game/modelcatalog.js');
    const names = CHARACTER_MODELS.concat(MONSTER_MODELS).map((m) => m.name.toLowerCase()).join(' | ');
    ['abominable', 'retard', 'crazy', 'insane', 'psycho', 'savage', 'slave'].forEach((w) => expect(names).not.toContain(w));
  });
});

describe('adaptive resolution with a 30 fps cap', () => {
  const run = (state, ms, frames, target, start = 10000) => {
    let out = null;
    for (let i = 0; i < frames; i++) {
      const r = stepAdaptiveResolution(state, ms, start + i * ms, target);
      if (r !== null) out = r;
    }
    return out;
  };

  it('does not mistake a steady 30 fps cap for a slow device', () => {
    const st = createAdaptiveResolution();
    expect(run(st, 33.3, 400, 1000 / 30)).toBeNull();
    expect(st.level).toBe(0);
  });

  it('still steps down when even 30 fps is missed', () => {
    const st = createAdaptiveResolution();
    expect(run(st, 60, 100, 1000 / 30)).toBe(0.85);
  });

  it('steps back up after holding the cap for two samples', () => {
    const st = createAdaptiveResolution();
    run(st, 60, 100, 1000 / 30);               // down one level
    const ups = [];
    for (let k = 0; k < 4; k++) {
      const r = run(st, 33.3, 90, 1000 / 30, 40000 + k * 20000);
      if (r !== null) ups.push(r);
    }
    expect(ups).toContain(1);
  });
});

describe('saved progress survives a reload', () => {
  it('keeps card stats, subject stats, calendar, daily counts, quest state and avatar colors', async () => {
    localStorage.clear();
    const { storage } = await import('../../js/storage.js');
    storage.load();
    storage.updateCardStat('n001', false);
    storage.data.cards.subjectStats.Neurology = { correct: 3, wrong: 1 };
    storage.data.history.calendarData['2026-09-30'] = 80;
    storage.data.history.dailyCounts['2026-09-30'] = 12;
    storage.data.progression.questState.q1 = { progress: 2 };
    storage.data.settings.avatarColors.shirt = 0xff0000;
    storage.save();
    storage.load();
    expect(storage.getCardStat('n001').wrong).toBe(1);
    expect(storage.data.cards.subjectStats.Neurology).toEqual({ correct: 3, wrong: 1 });
    expect(storage.data.history.calendarData['2026-09-30']).toBe(80);
    expect(storage.data.history.dailyCounts['2026-09-30']).toBe(12);
    expect(storage.data.progression.questState.q1).toEqual({ progress: 2 });
    expect(storage.data.settings.avatarColors.shirt).toBe(0xff0000);
  });

  it('still fills in new settings for old saves', async () => {
    localStorage.clear();
    const { storage } = await import('../../js/storage.js');
    storage.load();
    const raw = JSON.parse(JSON.stringify(storage.data));
    delete raw.settings.uiTheme;
    localStorage.setItem('buzzword_dash_v1', JSON.stringify(raw));
    storage.load();
    expect(storage.get('uiTheme')).toBe('surprise');
  });
});
