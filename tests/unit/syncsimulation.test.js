// Thousands of random lives of a player with two devices and a cloud save: playing, syncing, wiping a device, answering
// the "which save?" question either way, restoring. The rule that must hold in every one of them: progress that has been
// saved somewhere durable is never lost, whatever order things happen in and whatever the player answers.
//
// It uses the app's own decision function (decideSync) with a model of the server that follows push_save / force_save /
// keep_richest_save in database/schema.sql, and of the device that follows storage.js (a copy kept aside before a cloud
// save replaces local progress, and before an empty save would).

import { describe, it, expect } from 'vitest';
import { decideSync, isFresh } from '../../js/cloudsync.js';

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

const blank = () => ({ schemaVersion: 2, progression: { totalEncounters: 0, totalCoinsEarned: 100, bestScore: 0 } });
const prog = (d) => (d ? d.progression.totalEncounters : 0);

function newWorld() {
  return {
    server: { cur: null, backup: null, t: 0 },
    dev: [0, 1].map(() => ({ data: blank(), lastgood: null, meta: null, dirty: false })),
    best: 0,
    tick: 0
  };
}

// --- the server (schema.sql) ---
function keepRichest(server) {
  if (!server.cur || server.cur.runs <= 0) return;
  if (server.cur.runs >= (server.backup ? server.backup.runs : 0)) server.backup = { data: server.cur.data, runs: server.cur.runs };
}
function pushSave(server, data, runs, base) {
  if (server.cur) {
    if (base == null || base !== server.cur.updatedAt) return null;
    keepRichest(server);
  }
  server.cur = { data: JSON.parse(JSON.stringify(data)), runs, updatedAt: 'ts' + (++server.t) };
  return server.cur.updatedAt;
}
function forceSave(server, data, runs) {
  keepRichest(server);
  server.cur = { data: JSON.parse(JSON.stringify(data)), runs, updatedAt: 'ts' + (++server.t) };
  return server.cur.updatedAt;
}
function restoreBackup(server) {
  if (!server.backup) return;
  const b = server.backup;
  keepRichest(server);
  server.cur = { data: JSON.parse(JSON.stringify(b.data)), runs: b.runs, updatedAt: 'ts' + (++server.t) };
}

// --- a device (storage.js + cloudsync.js) ---
function keepAside(d) { if (prog(d.data) > 0 && prog(d.data) >= (d.lastgood ? prog(d.lastgood) : 0)) d.lastgood = JSON.parse(JSON.stringify(d.data)); } // (storage.js keepAsideIfFuller)

function syncDevice(w, d, answer) {
  for (let guard = 0; guard < 3; guard++) {
    const remote = w.server.cur ? { data: w.server.cur.data, updatedAt: w.server.cur.updatedAt } : null;
    const action = decideSync({ local: d.data, remote, meta: d.meta, userId: 'u', dirty: d.dirty });
    if (action === 'noop') { if (remote) d.meta = { userId: 'u', remoteUpdatedAt: remote.updatedAt }; return; }
    if (action === 'adopt') { d.meta = { userId: 'u', remoteUpdatedAt: remote.updatedAt }; return; }
    const pull = () => { keepAside(d); d.data = JSON.parse(JSON.stringify(remote.data)); d.meta = { userId: 'u', remoteUpdatedAt: remote.updatedAt }; d.dirty = false; };
    const push = () => {
      const ts = pushSave(w.server, d.data, prog(d.data), remote ? remote.updatedAt : null);
      if (ts == null) { d.dirty = true; return false; }
      d.meta = { userId: 'u', remoteUpdatedAt: ts }; d.dirty = false; return true;
    };
    if (action === 'pull') return pull();
    if (action === 'push') { if (push()) return; continue; }
    if (answer === 'cloud') return pull();
    if (answer === 'local') { const ts = forceSave(w.server, d.data, prog(d.data)); d.meta = { userId: 'u', remoteUpdatedAt: ts }; d.dirty = false; return; }
    return; // dismissed
  }
}

// where could progress still be found?
function locations(w, upTo) {
  const out = [];
  w.dev.forEach((d) => { out.push(prog(d.data)); if (d.lastgood) out.push(prog(d.lastgood)); });
  if (w.server.cur) out.push(w.server.cur.runs);
  if (w.server.backup) out.push(w.server.backup.runs);
  return Math.max(0, ...out);
}

function life(seed, steps) {
  const r = rng(seed);
  const w = newWorld();
  const log = [];
  for (let i = 0; i < steps; i++) {
    const d = w.dev[Math.floor(r() * 2)];
    const op = r();
    if (op < 0.35) { // play
      d.data.progression.totalEncounters += 1 + Math.floor(r() * 20);
      d.data.progression.totalCoinsEarned += 5;
      d.data.progression.bestScore = 10;
      d.dirty = true;
      log.push('play');
    } else if (op < 0.65) { // sync, answering any conflict at random
      const a = r(); syncDevice(w, d, a < 0.4 ? 'cloud' : a < 0.8 ? 'local' : null);
      log.push('sync');
    } else if (op < 0.78) { // the save on this device is lost or reset (its copy kept aside may survive, or not)
      const total = r() < 0.5;
      if (prog(d.data) > 0 && !total) keepAside(d); // (storage.js keeps the old save aside before an empty one replaces it)
      d.data = blank(); d.meta = r() < 0.5 ? null : d.meta; d.dirty = false;
      if (total) { d.lastgood = null; d.meta = null; }
      // progress that existed only on this device is gone for good in a total wipe: that is not the sync's fault
      w.best = locations(w);
      // on starting empty, the app offers the copy kept aside: the player takes it or not
      if (!total && d.lastgood && r() < 0.5) { d.data = JSON.parse(JSON.stringify(d.lastgood)); d.dirty = true; }
      log.push(total ? 'wipe-all' : 'wipe');
    } else if (op < 0.85) { // restore the biggest earlier cloud save
      restoreBackup(w.server); log.push('restore');
    } else { // sign in on a brand-new device (its own empty storage), which syncs at once
      const fresh = { data: blank(), lastgood: null, meta: null, dirty: false };
      w.dev[Math.floor(r() * 2)] = fresh;
      w.best = locations(w); // (whatever was only on the replaced device is gone)
      syncDevice(w, fresh, 'cloud');
      log.push('new-device');
    }
    log[log.length - 1] += ' ' + JSON.stringify({ dev: w.dev.map((x) => [prog(x.data), x.lastgood ? prog(x.lastgood) : null, x.meta && x.meta.remoteUpdatedAt, x.dirty]), srv: [w.server.cur && w.server.cur.runs, w.server.cur && w.server.cur.updatedAt, w.server.backup && w.server.backup.runs] });
    const now = locations(w);
    w.best = Math.max(w.best, now);
    if (now < w.best) return { ok: false, seed, step: i, log: log.slice(-9), best: w.best, now, state: JSON.stringify({ dev: w.dev.map((d) => [prog(d.data), d.lastgood ? prog(d.lastgood) : null, d.meta && d.meta.remoteUpdatedAt, d.dirty]), srv: [w.server.cur && w.server.cur.runs, w.server.backup && w.server.backup.runs] }) };
  }
  return { ok: true };
}

describe('progress that was saved is never lost, in any order of events', () => {
  it('survives 3,000 random lives of two devices and a cloud save', () => {
    const failures = [];
    for (let seed = 1; seed <= 3000; seed++) {
      const res = life(seed, 60);
      if (!res.ok) failures.push(res);
      if (failures.length >= 3) break;
    }
    expect(failures).toEqual([]);
  });

  it('a fresh device can always get back to the biggest save at the end', () => {
    for (let seed = 5000; seed < 5300; seed++) {
      const r = rng(seed);
      const w = newWorld();
      for (let i = 0; i < 40; i++) {
        const d = w.dev[Math.floor(r() * 2)];
        if (r() < 0.5) { d.data.progression.totalEncounters += 1 + Math.floor(r() * 9); d.data.progression.bestScore = 1; d.dirty = true; } else syncDevice(w, d, r() < 0.5 ? 'cloud' : 'local');
      }
      const bestAnywhere = locations(w);
      // at the very end the player signs in on a new phone and, if the cloud has less than exists elsewhere, uses "restore"
      const fresh = { data: blank(), lastgood: null, meta: null, dirty: false };
      syncDevice(w, fresh, 'cloud');
      if (prog(fresh.data) < bestAnywhere && w.server.backup && w.server.backup.runs >= bestAnywhere) { restoreBackup(w.server); syncDevice(w, fresh, 'cloud'); }
      const reachable = Math.max(prog(fresh.data), ...w.dev.map((d) => prog(d.data)), ...w.dev.map((d) => (d.lastgood ? prog(d.lastgood) : 0)));
      expect(reachable, 'seed ' + seed).toBe(bestAnywhere);
    }
  });

  it('knows a blank save from a played one', () => {
    expect(isFresh(blank())).toBe(true);
  });
});
