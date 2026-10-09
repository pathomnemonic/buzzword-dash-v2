import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let native;
let files;
vi.mock('../../js/native.js', async (orig) => ({ ...(await orig()), isNative: () => native }));
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Data: 'DATA' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: {
    readFile: async ({ path }) => { if (!(path in files)) throw new Error('File does not exist'); return { data: files[path] }; },
    writeFile: async ({ path, data }) => { files[path] = data; },
    deleteFile: async ({ path }) => { delete files[path]; }
  }
}));

const save = (answered, coins = answered * 5) => JSON.stringify({ schemaVersion: 2, progression: { totalEncounters: answered, totalCoinsEarned: coins, bestScore: 10, xp: answered * 3, coins: 321 }, profile: { name: 'Dr Test' } });

async function fresh() {
  vi.resetModules();
  localStorage.clear();
  return { nb: await import('../../js/nativebackup.js'), st: (await import('../../js/storage.js')).storage };
}

beforeEach(() => { native = true; files = {}; vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('the second copy of the save in the phone\'s file storage', () => {
  it('is written a few seconds after a change, once, with the last save', async () => {
    const { nb } = await fresh();
    nb.scheduleNativeBackup(save(10));
    nb.scheduleNativeBackup(save(11));
    expect(files['dxdash-save.json']).toBeUndefined();
    await vi.advanceTimersByTimeAsync(4500);
    expect(JSON.parse(files['dxdash-save.json']).progression.totalEncounters).toBe(11);
  });

  it('never lets a smaller save replace a fuller one, and ignores an empty one', async () => {
    const { nb } = await fresh();
    nb.scheduleNativeBackup(save(100));
    await vi.advanceTimersByTimeAsync(4500);
    nb.scheduleNativeBackup(save(3));
    await vi.advanceTimersByTimeAsync(4500);
    nb.scheduleNativeBackup(save(0, 100));
    await vi.advanceTimersByTimeAsync(4500);
    expect(JSON.parse(files['dxdash-save.json']).progression.totalEncounters).toBe(100);
  });

  it('writes at once when the app goes to the background', async () => {
    const { nb } = await fresh();
    nb.scheduleNativeBackup(save(7));
    await nb.flushNativeBackup();
    expect(JSON.parse(files['dxdash-save.json']).progression.totalEncounters).toBe(7);
  });

  it('does nothing on the website', async () => {
    native = false;
    const { nb } = await fresh();
    nb.scheduleNativeBackup(save(7));
    await vi.advanceTimersByTimeAsync(10000);
    expect(files).toEqual({});
    expect(await nb.readNativeBackup()).toBeNull();
  });

  it('is forgotten when the player resets their progress on purpose', async () => {
    const { nb } = await fresh();
    files['dxdash-save.json'] = save(50);
    await nb.clearNativeBackup();
    expect(files).toEqual({});
  });

  it('comes back as an offer when the game starts empty and the file holds a fuller save', async () => {
    const { nb, st } = await fresh();
    st.load();
    expect(st.recoverable).toBeNull();
    files['dxdash-save.json'] = save(120);
    const text = await nb.readNativeBackup();
    const offered = st.adoptBackup(text);
    expect(offered).toMatchObject({ answered: 120 });
    expect(st.restoreLastGood().ok).toBe(true);
    expect(st.get('totalEncounters') || st.data.progression.totalEncounters).toBe(120);
    expect(st.data.profile.name).toBe('Dr Test');
  });

  it('is not offered over a game that already has progress, or when it is damaged or from a newer version', async () => {
    const { st } = await fresh();
    st.load();
    st.data.progression.totalEncounters = 5; st.data.progression.bestScore = 5; st.data.progression.xp = 9;
    st.save();
    expect(st.adoptBackup(save(120))).toBeNull();
    const { st: empty } = await fresh();
    empty.load();
    expect(empty.adoptBackup('not json')).toBeNull();
    expect(empty.adoptBackup(JSON.stringify({ schemaVersion: 99, progression: { totalEncounters: 5 } }))).toBeNull();
    expect(empty.adoptBackup(save(0, 0).replace('"bestScore":10', '"bestScore":0').replace(/"xp":0/, '"xp":0'))).toBeNull();
  });

  it('is written by storage on every save once connected, and cleared by a reset', async () => {
    const { nb, st } = await fresh();
    st.load();
    st.onSaved = nb.scheduleNativeBackup;
    st.onReset = (scope) => { if (scope === 'progress' || scope === 'all_local') nb.clearNativeBackup(); };
    st.data.progression.totalEncounters = 30; st.data.progression.bestScore = 40; st.data.progression.xp = 50;
    st.save();
    await vi.advanceTimersByTimeAsync(4500);
    expect(JSON.parse(files['dxdash-save.json']).progression.totalEncounters).toBe(30);
    st.reset('progress');
    await vi.advanceTimersByTimeAsync(50);
    expect(files['dxdash-save.json']).toBeUndefined();
  });
});
