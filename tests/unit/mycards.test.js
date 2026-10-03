import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';

function loadPage() {
  const html = readFileSync('index.html', 'utf8');
  const body = html.slice(html.indexOf('<body'), html.indexOf('</body>'));
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, '');
}

describe('My Cards with a big imported deck', () => {
  let ui, customCards;
  beforeEach(async () => {
    localStorage.clear();
    loadPage();
    ({ ui } = await import('../../js/ui.js'));
    ({ customCards } = await import('../../js/customcards.js'));
    const { storage } = await import('../../js/storage.js');
    storage.load();
    ui._myCardsQuery = '';
    ui._myCardsPage = 0;
    customCards.addMany(Array.from({ length: 120 }, (_, i) => ({ subject: 'Cardiology', buzzwords: ['Clue ' + i], answer: i === 77 ? 'Needle answer' : 'Answer ' + i, distractors: [], teachingPoint: 'tp' })));
    customCards.add({ subject: 'Cardiology', buzzwords: ['Own clue'], answer: 'Own answer', distractors: ['Wrong A', 'Wrong B'], teachingPoint: 'mine' });
  });

  it('draws one page at a time instead of every card', () => {
    ui.renderCustomCardList();
    expect(document.querySelectorAll('#customCardList .review-card').length).toBe(50);
    expect(document.getElementById('customCardList').textContent).toMatch(/Page 1 of 3/);
    const next = [...document.querySelectorAll('#customCardList button')].find((b) => /Next/.test(b.textContent));
    next.click();
    expect(document.getElementById('customCardList').textContent).toMatch(/Page 2 of 3/);
  });

  it('finds a card by search', async () => {
    ui.renderCustomCardList();
    const search = document.querySelector('#customCardList input[type="search"]');
    search.value = 'needle';
    search.dispatchEvent(new Event('input'));
    await vi.waitFor(() => expect(document.querySelectorAll('#customCardList .review-card').length).toBe(1));
    expect(document.getElementById('customCardList').textContent).toMatch(/Needle answer/);
  });

  it('can delete the whole imported deck at once and keeps cards made by hand', () => {
    window.confirm = () => true;
    ui.renderCustomCardList();
    const btn = [...document.querySelectorAll('#customCardList button')].find((b) => /Delete imported flashcards \(120\)/.test(b.textContent));
    expect(btn).toBeTruthy();
    btn.click();
    expect(customCards.getAll().map((c) => c.ans)).toEqual(['Own answer']);
  });
});
