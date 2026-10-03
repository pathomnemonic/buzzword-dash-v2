import { describe, it, expect } from 'vitest';
import { storage } from '../../js/storage.js';

describe('two tabs sharing one save', () => {
  it('takes the other tab\'s data when it saves, so the next save does not wipe it', () => {
    storage.load();
    storage.set('coins', 10);
    const other = JSON.parse(localStorage.getItem('buzzword_dash_v1'));
    other.progression.coins = 999;
    window.dispatchEvent(new StorageEvent('storage', { key: 'buzzword_dash_v1', newValue: JSON.stringify(other) }));
    expect(storage.get('coins')).toBe(999);
  });

  it('ignores a half-written or foreign value', () => {
    storage.load();
    storage.set('coins', 55);
    window.dispatchEvent(new StorageEvent('storage', { key: 'buzzword_dash_v1', newValue: '{"half' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'something_else', newValue: '{}' }));
    expect(storage.get('coins')).toBe(55);
  });
});
