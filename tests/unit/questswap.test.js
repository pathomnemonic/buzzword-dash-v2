import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { QUESTS, QUEST_SWAP_COST, pickReplacementQuest } from '../../js/game/shopdata.js';

describe('choosing the quest to swap in', () => {
  const offered = QUESTS.slice(0, 6).map((q) => q.id);

  it('is never one already on offer, and never one that is finished', () => {
    const finished = QUESTS[10];
    const progressOf = (id) => (id === finished.id ? finished.target : 0);
    for (let i = 0; i < 200; i++) {
      const id = pickReplacementQuest(offered, offered[0], progressOf, () => Math.random());
      expect(offered).not.toContain(id);
      expect(id).not.toBe(finished.id);
      expect(QUESTS.some((q) => q.id === id)).toBe(true);
    }
  });

  it('prefers one of the same kind that has not been started', () => {
    const old = QUESTS[0];
    const progressOf = () => 0;
    for (let i = 0; i < 50; i++) {
      const id = pickReplacementQuest(offered, old.id, progressOf, () => Math.random());
      expect(QUESTS.find((q) => q.id === id).category).toBe(old.category);
    }
  });

  it('falls back to a started one, then to another kind, and gives up only when nothing is left', () => {
    const old = QUESTS[0];
    const sameKind = QUESTS.filter((q) => q.category === old.category && !offered.includes(q.id));
    // everything of that kind has been started: pick from the other kinds that have not
    const startedSame = (id) => (sameKind.some((q) => q.id === id) ? 1 : 0);
    const other = QUESTS.find((q) => q.id === pickReplacementQuest(offered, old.id, startedSame, () => 0));
    expect(other.category).not.toBe(old.category);
    // everything started but not finished: still something to offer
    expect(pickReplacementQuest(offered, old.id, () => 0.0001 + 1, () => 0)).not.toBeNull();
    // nothing open at all
    expect(pickReplacementQuest(offered, old.id, (id) => QUESTS.find((q) => q.id === id).target, () => 0)).toBeNull();
  });

  it('costs a few seconds of play, never more than a quest pays out many times over', () => {
    expect(QUEST_SWAP_COST).toBeGreaterThan(0);
    expect(QUEST_SWAP_COST).toBeLessThanOrEqual(150);
  });
});

describe('swapping a quest', () => {
  let storage;
  beforeEach(async () => {
    localStorage.clear();
    ({ storage } = await import('../../js/storage.js'));
    storage.load();
  });

  it('spends the coins, puts a new quest in the same place, and keeps six different ones', () => {
    storage.data.progression.coins = 500;
    const before = storage.getDailyQuestIds();
    const res = storage.swapQuest(before[2], () => 0);
    expect(res.success).toBe(true);
    expect(res.cost).toBe(QUEST_SWAP_COST);
    expect(storage.get('coins')).toBe(500 - QUEST_SWAP_COST);
    const after = storage.getDailyQuestIds();
    expect(after.length).toBe(before.length);
    expect(after[2]).toBe(res.newId);
    expect(after[2]).not.toBe(before[2]);
    expect(new Set(after).size).toBe(after.length);
    after.forEach((id, i) => { if (i !== 2) expect(id).toBe(before[i]); });
  });

  it('is kept across a reload', () => {
    storage.data.progression.coins = 500;
    const ids = storage.getDailyQuestIds();
    const res = storage.swapQuest(ids[0], () => 0.5);
    storage.save();
    storage.load();
    expect(storage.getDailyQuestIds()[0]).toBe(res.newId);
  });

  it('is refused without enough coins, for a quest that is done, and for one that is not on offer', () => {
    const ids = storage.getDailyQuestIds();
    storage.data.progression.coins = QUEST_SWAP_COST - 1;
    expect(storage.swapQuest(ids[0])).toMatchObject({ success: false, error: expect.stringMatching(/coins/) });
    expect(storage.getDailyQuestIds()).toEqual(ids);
    storage.data.progression.coins = 500;
    const q = QUESTS.find((x) => x.id === ids[1]);
    storage.incrementQuest(q.id, q.target);
    expect(storage.swapQuest(q.id)).toMatchObject({ success: false, error: expect.stringMatching(/done/) });
    expect(storage.swapQuest('q_not_a_quest')).toMatchObject({ success: false });
    expect(storage.get('coins')).toBe(500);
  });

  it('the new quest starts fresh: it is not already done', () => {
    storage.data.progression.coins = 5000;
    for (let i = 0; i < 6; i++) {
      const ids = storage.getDailyQuestIds();
      const res = storage.swapQuest(ids[i % 6]);
      expect(res.success).toBe(true);
      const def = QUESTS.find((x) => x.id === res.newId);
      expect(storage.getQuestProgress(res.newId)).toBeLessThan(def.target);
    }
  });
});

describe('the swap button on the Quests screen', () => {
  let ui; let storage;
  beforeEach(async () => {
    localStorage.clear();
    const html = readFileSync('index.html', 'utf8');
    document.body.innerHTML = html.slice(html.indexOf('<body'), html.indexOf('</body>')).replace(/<script[\s\S]*?<\/script>/g, '');
    ({ ui } = await import('../../js/ui.js'));
    ({ storage } = await import('../../js/storage.js'));
    storage.load();
  });

  it('sits beside every quest that is not done, and asks before it does anything', () => {
    storage.data.progression.coins = 500;
    ui.renderQuests();
    const ids = storage.getDailyQuestIds();
    const buttons = [...document.querySelectorAll('#questList .quest-swap')];
    expect(buttons.length).toBe(ids.length);
    buttons[0].click();
    expect(document.getElementById('questSwapAsk')).not.toBeNull();
    expect(document.getElementById('questSwapAsk').textContent).toContain(String(QUEST_SWAP_COST));
    expect(storage.getDailyQuestIds()).toEqual(ids);       // asking changes nothing
    expect(storage.get('coins')).toBe(500);
    document.getElementById('questSwapNo').click();
    expect(document.getElementById('questSwapAsk')).toBeNull();
    expect(storage.getDailyQuestIds()).toEqual(ids);
  });

  it('swaps on yes, and the screen shows the new quest', () => {
    storage.data.progression.coins = 500;
    ui.renderQuests();
    const ids = storage.getDailyQuestIds();
    document.querySelector('#questList .quest-swap').click();
    document.getElementById('questSwapYes').click();
    const after = storage.getDailyQuestIds();
    expect(after[0]).not.toBe(ids[0]);
    expect(storage.get('coins')).toBe(500 - QUEST_SWAP_COST);
    expect(document.getElementById('questSwapAsk')).toBeNull();
    const def = QUESTS.find((q) => q.id === after[0]);
    expect(document.getElementById('questList').textContent).toContain(def.title);
  });

  it('says so, and cannot be confirmed, when there are not enough coins', () => {
    storage.data.progression.coins = 10;
    ui.renderQuests();
    document.querySelector('#questList .quest-swap').click();
    expect(document.getElementById('questSwapYes').disabled).toBe(true);
    expect(document.getElementById('questSwapAsk').textContent).toMatch(/You have 10/);
  });

  it('is not shown beside a quest that is already done', () => {
    storage.data.progression.coins = 500;
    const first = QUESTS.find((q) => q.id === storage.getDailyQuestIds()[0]);
    storage.incrementQuest(first.id, first.target);
    ui.renderQuests();
    expect(document.querySelectorAll('#questList .quest-swap').length).toBe(storage.getDailyQuestIds().length - 1);
    expect(document.querySelector('#questList [data-swap="' + first.id + '"]')).toBeNull();
  });
});
