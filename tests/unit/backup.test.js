import { describe, it, expect, beforeEach } from 'vitest';
import { buildBackup, restoreBackup } from '../../js/backup.js';
import { storage } from '../../js/storage.js';
import { customCards } from '../../js/customcards.js';

describe('a backup carries the player\'s own cards too', () => {
  beforeEach(() => { localStorage.clear(); storage.load(); });

  it('restoring on a fresh device brings back progress AND imported cards', () => {
    storage.set('coins', 4321);
    customCards.importJSON(JSON.stringify([
      { subj: 'Cardiology', bw: ['Fever', 'New murmur'], ans: 'Endocarditis', d: ['Rheumatic fever', 'Myxoma'], tp: 'IE', ww: {} },
      { subj: 'Neurology', bw: ['Facial droop sparing forehead'], ans: 'UMN lesion', d: ['Bell palsy', 'LMN lesion'], tp: 'Forehead is bilateral', ww: {} }
    ]));
    const text = buildBackup(storage, customCards);

    localStorage.clear(); // a new phone
    storage.load();
    expect(customCards.getAll().length).toBe(0);
    const res = restoreBackup(text, storage, customCards);
    expect(res).toEqual({ ok: true, cards: 2 });
    expect(storage.get('coins')).toBe(4321);
    expect(customCards.getAll().map((c) => c.ans).sort()).toEqual(['Endocarditis', 'UMN lesion']);
  });

  it('an older backup without cards leaves the cards that are already there', () => {
    customCards.importJSON(JSON.stringify([{ subj: 'Cardiology', bw: ['x'], ans: 'y', d: ['a', 'b'], tp: 't', ww: {} }]));
    const old = storage.exportBackup(); // the old format
    const res = restoreBackup(old, storage, customCards);
    expect(res.ok).toBe(true);
    expect(customCards.getAll().length).toBe(1);
  });

  it('drops broken or duplicate cards in a backup instead of crashing', () => {
    const base = JSON.parse(buildBackup(storage, customCards));
    base.customCards = [{ id: 'a', bw: ['x'], ans: 'y' }, { id: 'a', bw: ['x'], ans: 'y' }, { id: 'b' }, null, 'junk'];
    const res = restoreBackup(JSON.stringify(base), storage, customCards);
    expect(res).toEqual({ ok: true, cards: 1 });
  });

  it('a file that is not a backup is refused and touches nothing', () => {
    customCards.importJSON(JSON.stringify([{ subj: 'Cardiology', bw: ['x'], ans: 'y', d: ['a', 'b'], tp: 't', ww: {} }]));
    const res = restoreBackup('{"hello":1}', storage, customCards);
    expect(res.ok).toBe(false);
    expect(customCards.getAll().length).toBe(1);
  });

  it('a restore never grants a real money item the device does not already own', () => {
    const base = JSON.parse(buildBackup(storage, customCards));
    base.data.progression.ownedItems = ['avatar_m_king', 'trail_fire'];
    base.data.progression.equipped = { ...(base.data.progression.equipped || {}), trail: 'trail_fire' };
    base.data.progression.paidItems = { uid: 'someone', ids: ['avatar_m_king'], missing: [] };
    const res = restoreBackup(JSON.stringify(base), storage, customCards);
    expect(res.ok).toBe(true);
    expect(storage.get('ownedItems')).not.toContain('avatar_m_king');
    expect(storage.get('ownedItems')).not.toContain('trail_fire');
    expect(storage.get('equipped').trail).not.toBe('trail_fire');
    expect(storage.data.progression.paidItems).toEqual({ uid: '', ids: [], missing: [] });
  });

  it('a restore keeps a real money item the device already owns', () => {
    storage.data.progression.ownedItems.push('avatar_m_king');
    storage.save();
    const base = JSON.parse(buildBackup(storage, customCards));
    base.data.progression.ownedItems = ['avatar_m_king'];
    const res = restoreBackup(JSON.stringify(base), storage, customCards);
    expect(res.ok).toBe(true);
    expect(storage.get('ownedItems')).toContain('avatar_m_king');
  });
});
