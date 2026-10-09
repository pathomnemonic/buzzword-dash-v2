// A save with real progress is never lost for good: a second copy is kept, an empty save cannot replace it, and the
// player is offered it back when the game starts empty.
import { describe, it, expect, beforeEach } from 'vitest';

const KEY = 'buzzword_dash_v1';
const LAST = KEY + '_lastgood';
let storage;

async function fresh() {
  localStorage.clear();
  const mod = await import('../../js/storage.js');
  storage = mod.storage;
  storage._snapshotAt = 0; // (the module is shared between tests; a new player has taken no snapshot yet)
  storage.load();
}

function liveIn(s) {
  s.data.progression.totalEncounters = 120;
  s.data.progression.bestScore = 900;
  s.data.progression.xp = 800;
  s.data.progression.coins = 4321;
  s.data.profile.name = 'Dr Test';
}

describe('the last-good copy', () => {
  beforeEach(fresh);

  it('is made when a save with real progress is written', () => {
    liveIn(storage);
    storage.save();
    const copy = JSON.parse(localStorage.getItem(LAST));
    expect(copy.progression.coins).toBe(4321);
    expect(copy.profile.name).toBe('Dr Test');
  });

  it('is not replaced by an empty save: the old save is put aside first', () => {
    liveIn(storage);
    storage.save();
    // something resets the data in memory and saves (a bug, a bad merge): the real progress must survive somewhere
    storage.data.progression.totalEncounters = 0; storage.data.progression.bestScore = 0; storage.data.progression.xp = 0; storage.data.progression.coins = 100; storage.data.profile.name = '';
    storage.save();
    expect(JSON.parse(localStorage.getItem(KEY)).progression.coins).toBe(100);
    expect(JSON.parse(localStorage.getItem(LAST)).progression.coins).toBe(4321);
  });

  it('is offered back when the game starts empty, and restores everything', async () => {
    liveIn(storage);
    storage.save();
    localStorage.setItem(KEY, JSON.stringify({ schemaVersion: 2 })); // the live save came up empty
    storage.load();
    expect(storage.recoverable).toEqual(expect.objectContaining({ answered: 120, coins: 4321 }));
    const r = storage.restoreLastGood();
    expect(r.ok).toBe(true);
    expect(storage.get('coins')).toBe(4321);
    expect(storage.get('profileName')).toBe('Dr Test');
    expect(storage.recoverable).toBeNull();
  });

  it('is not offered to a player whose game has progress, or who has nothing earlier', () => {
    liveIn(storage);
    storage.save();
    storage.load();
    expect(storage.recoverable).toBeNull();
    localStorage.clear();
    storage.load();
    expect(storage.recoverable).toBeNull();
  });

  it('is forgotten when the player chooses to start fresh, and by a reset they asked for', () => {
    liveIn(storage);
    storage.save();
    localStorage.setItem(KEY, JSON.stringify({ schemaVersion: 2 }));
    storage.load();
    storage.discardLastGood();
    expect(localStorage.getItem(LAST)).toBeNull();
    liveIn(storage);
    storage._snapshotAt = 0;
    storage.save();
    expect(localStorage.getItem(LAST)).not.toBeNull();
    storage.reset('progress');
    expect(localStorage.getItem(LAST)).toBeNull();
  });
});

describe('storage keys and newer saves', () => {
  beforeEach(fresh);

  it('files each site under its own path so another copy of the game on the same host cannot touch it', async () => {
    const { storageKeyFor } = await import('../../js/storage.js');
    expect(storageKeyFor('/')).toBe('buzzword_dash_v1');
    expect(storageKeyFor('/buzzword-dash-v2/')).toBe('buzzword_dash_v1@buzzword-dash-v2');
    expect(storageKeyFor('/buzzword-dash/')).not.toBe(storageKeyFor('/buzzword-dash-v2/'));
  });

  it('never saves over a save from a newer version of the game, and keeps a copy of it', () => {
    const newer = JSON.stringify({ schemaVersion: 99, progression: { totalEncounters: 500, bestScore: 9000, xp: 5000 } });
    localStorage.setItem(KEY, newer);
    storage.load();
    storage.save();
    storage.data.progression.coins = 5;
    storage.save();
    expect(localStorage.getItem(KEY)).toBe(newer);
    expect(localStorage.getItem(KEY + '_newer')).toBe(newer);
    // starting over is a deliberate choice, and saving resumes
    storage.reset('all_local');
    expect(JSON.parse(localStorage.getItem(KEY)).schemaVersion).toBe(2);
  });

  it('keeps the current save aside before a cloud save or a backup file replaces it', () => {
    liveIn(storage);
    storage.save();
    const incoming = JSON.parse(JSON.stringify(storage.data));
    incoming.progression.totalEncounters = 0; incoming.progression.bestScore = 0; incoming.progression.xp = 0; incoming.profile.name = '';
    storage._snapshotAt = Date.now();
    expect(storage.applyRemoteData(incoming).ok).toBe(true);
    expect(JSON.parse(localStorage.getItem(LAST)).progression.totalEncounters).toBe(120);
  });
});
