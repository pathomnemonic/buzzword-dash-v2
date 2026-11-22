import { describe, it, expect, beforeEach } from 'vitest';
import { customCards } from '../../js/customcards.js';
import { renderOpenDecks } from '../../js/opendecksui.js';
import { OPEN_DECKS_INTRO } from '../../js/importguide.js';

const ENTRY = { id: 'demo-deck', title: 'Demo deck', source: 'Demo Book', licence: { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' }, count: 1, size: 3000, version: '1.0.0', file: 'demo-deck.json', attribution: 'Adapted from Demo Book, CC BY 4.0.', url: 'https://example.org/' };
const DECK = { format: 1, id: 'demo-deck', title: 'Demo deck', source: 'Demo Book', licence: ENTRY.licence, version: '1.0.0', cards: [{ subj: 'Cardiology', bw: ['A', 'B'], ans: 'Ans', d: ['W1', 'W2'], tp: 't', ww: { W1: 'x', W2: 'y' }, tags: ['T::U'], key: 'demo-deck:1' }] };
const flush = () => new Promise((r) => setTimeout(r, 20));
function fetcher(online) {
  return async (u) => {
    if (!online.on) throw new TypeError('Failed to fetch');
    const body = /index\.json$/.test(u) ? { format: 1, decks: [ENTRY] } : DECK;
    const text = JSON.stringify(body);
    return { ok: true, status: 200, headers: { get: () => String(text.length) }, text: async () => text };
  };
}

beforeEach(() => { localStorage.clear(); customCards.clear(); document.body.innerHTML = '<div id="h"></div>'; });

describe('Open decks list', () => {
  it('shows the blurb open on first view, the row with count, size, source and licence, and the credits', async () => {
    const host = document.getElementById('h');
    renderOpenDecks(host, { customCards, fetchFn: fetcher({ on: true }) });
    await flush();
    const intro = host.querySelector('details.open-decks-intro');
    expect(intro.open).toBe(true);
    expect(intro.textContent).toContain(OPEN_DECKS_INTRO.whyTitle);
    expect(intro.textContent).toContain(OPEN_DECKS_INTRO.ownTitle);
    const row = host.querySelector('[data-deck="demo-deck"]');
    expect(row.querySelector('[data-role="od-meta"]').textContent).toBe('1 card · 3 KB · Demo Book');
    expect(row.textContent).toContain('CC BY 4.0');
    expect(row.querySelector('[data-role="od-remove"]').style.display).toBe('none');
    const credits = host.querySelector('details.open-decks-credits');
    expect(credits.textContent).toContain('Adapted from Demo Book');
    expect(credits.querySelector('a').getAttribute('href')).toMatch(/^https:\/\//);
  });

  it('Add puts the cards in My Cards and shows Remove; Remove takes them out again', async () => {
    const host = document.getElementById('h');
    renderOpenDecks(host, { customCards, fetchFn: fetcher({ on: true }) });
    await flush();
    host.querySelector('[data-role="od-add"]').click();
    await flush();
    expect(customCards.getAll().filter((c) => c.deck === 'demo-deck').length).toBe(1);
    expect(host.querySelector('[data-role="od-status"]').textContent).toMatch(/1 added/);
    const rm = host.querySelector('[data-role="od-remove"]');
    expect(rm.style.display).toBe('');
    rm.click();
    expect(customCards.getAll().length).toBe(0);
  });

  it('offline: a friendly message with Try again, and the list loads once the connection is back', async () => {
    const host = document.getElementById('h');
    const online = { on: false };
    renderOpenDecks(host, { customCards, fetchFn: fetcher(online) });
    await flush();
    expect(host.querySelector('[data-role="od-error"]').textContent).toMatch(/No connection/);
    online.on = true;
    host.querySelector('[data-role="od-retry"]').click();
    await flush();
    expect(host.querySelector('[data-deck="demo-deck"]')).not.toBeNull();
  });

  it('a failed add says why and adds nothing', async () => {
    const host = document.getElementById('h');
    const online = { on: true };
    renderOpenDecks(host, { customCards, fetchFn: fetcher(online) });
    await flush();
    online.on = false;
    host.querySelector('[data-role="od-add"]').click();
    await flush();
    expect(host.querySelector('[data-role="od-status"]').textContent).toMatch(/No connection/);
    expect(customCards.getAll().length).toBe(0);
  });

  it('remembers that the blurb was closed', async () => {
    const host = document.getElementById('h');
    renderOpenDecks(host, { customCards, fetchFn: fetcher({ on: true }) });
    await flush();
    const intro = host.querySelector('details.open-decks-intro');
    intro.open = false;
    intro.dispatchEvent(new Event('toggle'));
    renderOpenDecks(host, { customCards, fetchFn: fetcher({ on: true }) });
    await flush();
    expect(host.querySelector('details.open-decks-intro').open).toBe(false);
  });
});
