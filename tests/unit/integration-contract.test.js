// Guards the seams between main.js and the lazily loaded feature modules.
// main.js once called methods that did not exist on these modules, silently
// breaking the leaderboard, multiplayer lobby and Anki import.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const main = readFileSync('js/main.js', 'utf8');

function calledMethods(receiver) {
  const re = new RegExp(receiver + '[.]([A-Za-z_]+)[(]', 'g');
  return [...new Set([...main.matchAll(re)].map((m) => m[1]))];
}

describe('main.js ↔ leaderboard service', () => {
  it('only calls leaderboard methods that exist', async () => {
    const { leaderboard } = await import('../../js/leaderboard.js');
    for (const name of calledMethods('leaderboard')) {
      expect(typeof leaderboard[name], `leaderboard.${name}`).toBe('function');
    }
  });

  it('exposes the methods the leaderboard screen needs', async () => {
    const { leaderboard } = await import('../../js/leaderboard.js');
    for (const name of [
      'getTopScores', 'getFriends', 'getPendingRequests', 'searchPlayers',
      'sendFriendRequest', 'acceptFriendRequest', 'declineFriendRequest',
      'removeFriend', 'blockUser', 'reportUser', 'sendInvite', 'getInvites',
      'ensureProfile', 'linkEmail', 'getStatus', 'signInAnonymously', 'getModeLabel'
    ]) {
      expect(typeof leaderboard[name], name).toBe('function');
    }
  });
});

describe('main.js ↔ multiplayer client', () => {
  it('only calls multiplayer client methods that exist', async () => {
    const { Multiplayer } = await import('../../js/multiplayer.js');
    const client = new Multiplayer();
    for (const name of calledMethods('(?:client|multiplayerClient|module[.]multiplayer)')) {
      expect(typeof client[name], `multiplayer.${name}`).toBe('function');
    }
  });

  it('only assigns callbacks the client actually invokes', async () => {
    const { Multiplayer } = await import('../../js/multiplayer.js');
    const client = new Multiplayer();
    const assigned = [...main.matchAll(/client\.(on[A-Za-z]+) = /g)].map((m) => m[1]);
    expect(assigned.length).toBeGreaterThan(5);
    for (const cb of assigned) {
      expect(cb in client, cb).toBe(true);
    }
  });
});

describe('main.js ↔ Anki import', () => {
  it('uses the mount API', async () => {
    const { ankiImport } = await import('../../js/ankiimport.js');
    for (const name of calledMethods('ankiImport')) {
      expect(typeof ankiImport[name], `ankiImport.${name}`).toBe('function');
    }
  });

  it('parses CSV and imports flashcard-only cards through mount()', async () => {
    const { ankiImport } = await import('../../js/ankiimport.js');
    const added = [];
    const container = document.createElement('div');
    ankiImport.mount(container, {
      customCards: { add: (c) => { added.push(c); return { success: true, card: c, warnings: [] }; } },
      storage: {}
    });
    expect(container.children.length).toBeGreaterThan(0);

    const parsed = ankiImport.parseDelimitedText('front,back\n"Crescent-shaped RBCs","Sickle cell disease"\nq2,a2', {
      hasHeaders: true
    });
    expect(parsed.cards.length).toBe(2);
    expect(parsed.cards[0].back).toBe('Sickle cell disease');

    const result = ankiImport.importRaw(parsed.cards);
    expect(result.imported).toBe(2);
    expect(added.length).toBe(2);
    ankiImport.unmount();
  });
});

describe('leaderboard screen', () => {
  it('explains when Supabase is not configured', async () => {
    const { mountLeaderboardScreen } = await import('../../js/leaderboardui.js');
    const root = document.createElement('div');
    mountLeaderboardScreen(root, {
      leaderboard: { getStatus: () => ({ configured: false }) },
      storage: { get: () => '' },
      toast() {},
      getRoomCode: () => ''
    });
    expect(root.textContent).toMatch(/not set up/i);
  });

  it('renders remote names as text, never markup', async () => {
    const { mountLeaderboardScreen } = await import('../../js/leaderboardui.js');
    const root = document.createElement('div');
    const evil = '<img src=x onerror=alert(1)>';
    const lb = {
      getStatus: () => ({ configured: true, ready: true, authenticated: true, anonymous: true, email: '' }),
      getUserId: () => 'me',
      getModeLabel: (m) => m,
      getTopScores: () => Promise.resolve([{ user_id: 'u1', player_name: evil, score: 10, accuracy: 90, best_streak: 3 }]),
      getFriends: () => Promise.resolve([]),
      getPendingRequests: () => Promise.resolve([])
    };
    mountLeaderboardScreen(root, {
      leaderboard: lb,
      storage: { get: () => '' },
      toast() {},
      getRoomCode: () => ''
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toContain(evil);
  });
});

describe('UI code ↔ leaderboard service', () => {
  it('leaderboardui.js and ui.js only call service methods that exist', async () => {
    const { leaderboard } = await import('../../js/leaderboard.js');
    const screen = readFileSync('js/leaderboardui.js', 'utf8');
    const ui = readFileSync('js/ui.js', 'utf8');
    const used = [
      ...screen.matchAll(/lb[(][)][.]([A-Za-z_]+)[(]/g),
      ...ui.matchAll(/(?:^|[^A-Za-z_])lb[.]([A-Za-z_]+)[(]/g),
      ...ui.matchAll(/mod[.]leaderboard[.]([A-Za-z_]+)[(]/g)
    ].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(10);
    for (const name of new Set(used)) {
      expect(typeof leaderboard[name], `leaderboard.${name}`).toBe('function');
    }
  });
});
