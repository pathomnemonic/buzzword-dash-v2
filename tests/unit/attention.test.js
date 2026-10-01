import { describe, it, expect, beforeEach } from 'vitest';
import { computeAttention, setDot, updateAttentionDots } from '../../js/attentiondots.js';
import { QUESTS } from '../../js/game/shopdata.js';

let storage;

beforeEach(async () => {
  localStorage.clear();
  const mod = await import('../../js/storage.js');
  storage = mod.storage;
  storage.load();
  document.body.innerHTML = '<button id="profileBtn">Profile</button><button id="profileCornerBtn">P</button><button id="questBtn">Quests</button><div id="studyGoal"></div>';
});

describe('badges and red dots', () => {
  it('counts badges as seen when the dots were introduced, so only new ones get a dot', () => {
    storage.data.progression.achievements = ['ach_first_run'];
    storage.data.settings.achievementsSeenInit = false;
    storage._ensureInvariants();
    expect(storage.getNewAchievementIds()).toEqual([]);
    storage.unlockAchievement('ach_encounters_100');
    expect(storage.getNewAchievementIds()).toEqual(['ach_encounters_100']);
    expect(computeAttention(storage, QUESTS).profile).toBe(1);
  });

  it('a new badge stays marked until the profile has been looked at', () => {
    storage.unlockAchievement('ach_first_run');
    expect(storage.getNewAchievementIds().length).toBe(1);
    expect(storage.markAchievementsSeen()).toBe(true);
    expect(storage.getNewAchievementIds()).toEqual([]);
    expect(storage.markAchievementsSeen()).toBe(false);   // nothing left to mark
    storage.unlockAchievement('ach_encounters_100');
    expect(storage.getNewAchievementIds()).toEqual(['ach_encounters_100']);
  });

  it('finished quests wait for a claim, and stop asking once claimed', () => {
    const quest = QUESTS[0];
    expect(storage.getClaimableQuestIds(QUESTS)).toEqual([]);
    for (let i = 0; i < quest.target; i++) storage.incrementQuest(quest.id, 1);
    expect(storage.getClaimableQuestIds(QUESTS)).toEqual([quest.id]);
    expect(computeAttention(storage, QUESTS).quests).toBe(1);
    storage.claimQuest(quest.id, new Date().toISOString().slice(0, 10));
    expect(storage.getClaimableQuestIds(QUESTS)).toEqual([]);
  });

  it('puts a dot on the profile buttons for a new badge and takes it off again', () => {
    updateAttentionDots(storage, QUESTS);
    expect(document.querySelectorAll('.nav-dot').length).toBe(0);
    storage.unlockAchievement('ach_first_run');
    updateAttentionDots(storage, QUESTS);
    expect(document.querySelector('#profileBtn .nav-dot')).toBeTruthy();
    expect(document.querySelector('#profileCornerBtn .nav-dot')).toBeTruthy();
    expect(document.querySelector('#questBtn .nav-dot')).toBeNull();
    storage.markAchievementsSeen();
    updateAttentionDots(storage, QUESTS);
    expect(document.querySelectorAll('.nav-dot').length).toBe(0);
  });

  it('does not stack dots when refreshed repeatedly', () => {
    const el = document.getElementById('questBtn');
    setDot(el, true, 'x'); setDot(el, true, 'x'); setDot(el, true, 'x');
    expect(el.querySelectorAll('.nav-dot').length).toBe(1);
    setDot(el, false);
    expect(el.querySelectorAll('.nav-dot').length).toBe(0);
  });
});
