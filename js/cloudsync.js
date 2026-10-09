/**
 * cloudsync.js — keeps a signed-in player's progress saved to their account.
 *
 * Guests are never synced (their data lives on the device). Once a player has
 * an email account, progress is pushed shortly after it changes and pulled on
 * a new device. The decision logic is pure (decideSync) so it can be tested;
 * the CloudSync class wires it to storage and the leaderboard service.
 *
 * A device remembers the timestamp of the cloud save it last synced. The
 * server refuses a write based on an older timestamp, so two devices can never
 * silently overwrite each other; the player is asked instead.
 */
import { track } from './analytics/index.js';

var META_KEY = 'bd_cloud_meta';
var PUSH_DELAY_MS = 15000;

/** Headline numbers used to compare two saves. */
export function summarize(data) {
  var p = (data && data.progression) || {};
  return {
    answered: Number(p.totalEncounters) || 0,
    coins: Number(p.totalCoinsEarned) || 0,
    best: Number(p.bestScore) || 0,
    streak: Number(p.studyStreak) || Number(p.dailyStreak) || 0
  };
}

/** A save with no play history (a brand-new device). */
export function isFresh(data) {
  var s = summarize(data);
  return s.answered === 0 && s.best === 0;
}

/** True when save `a` is plainly behind save `b`: nothing it counts is ahead, and something is behind. Lifetime counts only grow. */
export function isPoorer(a, b) {
  return a.answered <= b.answered && a.coins <= b.coins && (a.answered < b.answered || a.coins < b.coins);
}

function sameSummary(a, b) {
  return a.answered === b.answered && a.coins === b.coins && a.best === b.best;
}

/**
 * Decide what to do.
 * @param {object} input
 * @param {object} input.local - local save data
 * @param {{data: object, updatedAt: string}|null} input.remote - cloud save
 * @param {{userId: string, remoteUpdatedAt: string}|null} input.meta - last sync record
 * @param {string} input.userId
 * @param {boolean} input.dirty - local changes not yet pushed
 * @returns {'noop'|'push'|'pull'|'adopt'|'conflict'}
 *   adopt = both sides already match; just record the cloud timestamp.
 */
export function decideSync(input) {
  var local = input.local;
  var remote = input.remote;
  if (!remote) return isFresh(local) ? 'noop' : 'push';
  if (isFresh(local)) return 'pull';

  var meta = input.meta;
  if (meta && meta.userId === input.userId && meta.remoteUpdatedAt) {
    var ls = summarize(local);
    var rs = summarize(remote.data);
    if (meta.remoteUpdatedAt === remote.updatedAt) {
      if (!input.dirty) return 'noop';
      // never write a smaller save over a bigger one without asking
      return isPoorer(ls, rs) ? 'conflict' : 'push';
    }
    if (input.dirty) return 'conflict';
    // never swap a bigger save here for a smaller one from the cloud without asking
    return isPoorer(rs, ls) ? 'conflict' : 'pull';
  }
  // Never synced together: identical saves are simply linked, otherwise ask.
  if (sameSummary(summarize(local), summarize(remote.data))) return 'adopt';
  return 'conflict';
}

function readMeta() {
  try {
    var raw = JSON.parse(localStorage.getItem(META_KEY));
    return raw && typeof raw === 'object' ? raw : null;
  } catch (e) {
    return null;
  }
}

function writeMeta(meta) {
  try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) { /* storage unavailable */ }
}

/** Own cards ride along with the cloud save up to this size (about 1,500 short cards). */
var MAX_CARDS_SYNC_BYTES = 450000;

export class CloudSync {
  /**
   * @param {object} deps
   * @param {object} deps.storage
   * @param {object} deps.leaderboard
   * @param {function(string): void} deps.toast
   * @param {function(object, object): Promise<'cloud'|'local'|null>} deps.askConflict
   *   receives (localSummary, cloudSummary)
   * @param {function(): void} deps.onPulled - called after cloud data replaced local data
   * @param {object} [deps.customCards] the player's own cards; they ride along with the save when they are small enough
   */
  constructor(deps) {
    this.deps = deps;
    this.dirty = false;
    this.state = 'off'; // off | idle | syncing | error
    this.lastSyncedAt = null;
    this.error = '';
    this._timer = null;
    this._running = null;
    this._started = false;
  }

  /** True when this player has a real (non-guest) account to sync to. */
  get enabled() {
    var st = this.deps.leaderboard.getStatus();
    return !!(st.authenticated && !st.anonymous);
  }

  /** Begin watching for changes. Safe to call more than once. */
  start() {
    if (this._started) return;
    this._started = true;
    var self = this;
    this.deps.storage.onChange = function () {
      self.dirty = true;
      self._schedulePush();
    };
    if (this.deps.customCards && typeof this.deps.customCards.subscribe === 'function') {
      this.deps.customCards.subscribe(function () {
        if (self._applyingCards) return;
        self.dirty = true;
        self._schedulePush();
      });
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden' && self.dirty) self.sync();
      });
    }
    this.deps.leaderboard.onAuthEvent(function (event) {
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') self.sync();
      if (event === 'SIGNED_OUT') { self.state = 'off'; }
    });
    this.sync();
  }

  _schedulePush() {
    if (!this.enabled) return;
    var self = this;
    clearTimeout(this._timer);
    this._timer = setTimeout(function () { self.sync(); }, PUSH_DELAY_MS);
  }

  /** Reconcile local and cloud saves now. @returns {Promise<string>} what happened */
  sync() {
    if (!this.enabled) { this.state = 'off'; return Promise.resolve('off'); }
    if (this._running) return this._running;
    var self = this;
    this.state = 'syncing';
    this._running = this._run().catch(function (e) {
      self.state = 'error';
      self.error = (e && e.message) || 'Sync failed';
      return 'error';
    }).then(function (result) {
      self._running = null;
      // A quiet failure is how progress ends up only on one device: say so, once, when it keeps happening
      self._failures = result === 'error' ? (self._failures || 0) + 1 : 0;
      if (self._failures >= 2 && !self._warned && typeof self.deps.toast === 'function') {
        self._warned = true;
        self.deps.toast('Your progress is not reaching your account (' + self.error + '). Keep a backup file until it is fixed.');
      }
      if (result === 'pushed' || result === 'pulled' || result === 'error') track('cloud_sync', { direction: result === 'pulled' ? 'down' : 'up', ok: result !== 'error' });
      else if (result === 'adopt') track('cloud_sync', { direction: 'restore', ok: true });
      return result;
    });
    return this._running;
  }

  _run() {
    var self = this;
    var lb = this.deps.leaderboard;
    var storage = this.deps.storage;
    var userId = lb.getUserId();
    return lb.pullSave().then(function (res) {
      if (!res.success) throw new Error(res.error || 'Could not reach the cloud save');
      var action = decideSync({
        local: storage.data,
        remote: res.save,
        meta: readMeta(),
        userId: userId,
        dirty: self.dirty
      });
      if (action === 'noop') return self._done('noop', res.save && res.save.updatedAt);
      if (action === 'adopt') return self._done('adopt', res.save.updatedAt);
      if (action === 'pull') return self._pull(res.save, userId);
      if (action === 'push') return self._push(res.save, userId);
      return self._resolveConflict(res.save, userId);
    });
  }

  _done(result, remoteUpdatedAt) {
    var meta = readMeta() || {};
    meta.userId = this.deps.leaderboard.getUserId();
    if (remoteUpdatedAt) meta.remoteUpdatedAt = remoteUpdatedAt;
    writeMeta(meta);
    this.state = 'idle';
    this.error = '';
    this.lastSyncedAt = Date.now();
    return result;
  }

  _snapshot() {
    var data = this.deps.storage.data;
    var copy = JSON.parse(JSON.stringify(data));
    // The player's own cards (typed in or imported) travel with the save, unless a huge deck would make every
    // sync heavy; that deck stays on this device and goes in a backup file instead.
    if (this.deps.customCards) {
      var cards = this.deps.customCards.getAll();
      if (cards.length && JSON.stringify(cards).length <= MAX_CARDS_SYNC_BYTES) copy.customCards = cards;
    }
    return { data: copy, runs: summarize(data).answered };
  }

  _push(remote, userId) {
    var self = this;
    var snap = this._snapshot();
    this.dirty = false;
    return this.deps.leaderboard.pushSave(snap.data, snap.runs, remote ? remote.updatedAt : null).then(function (res) {
      if (res.conflict) {
        // Another device saved in the meantime: re-read and decide again.
        self.dirty = true;
        return self._run();
      }
      if (!res.success) { self.dirty = true; throw new Error(res.error || 'Save failed'); }
      writeMeta({ userId: userId, remoteUpdatedAt: res.updatedAt });
      self.state = 'idle';
      self.error = '';
      self.lastSyncedAt = Date.now();
      return 'pushed';
    });
  }

  _pull(remote, userId) {
    var cards = remote.data && remote.data.customCards;
    var rest = Object.assign({}, remote.data);
    delete rest.customCards;
    var result = this.deps.storage.applyRemoteData(rest);
    if (!result.ok) throw new Error(result.error || 'Cloud save could not be applied');
    if (Array.isArray(cards) && this.deps.customCards) {
      this._applyingCards = true;
      try { this.deps.customCards.replaceAll(cards); } finally { this._applyingCards = false; }
    }
    writeMeta({ userId: userId, remoteUpdatedAt: remote.updatedAt });
    this.dirty = false;
    this.state = 'idle';
    this.error = '';
    this.lastSyncedAt = Date.now();
    this.deps.onPulled();
    return 'pulled';
  }

  _resolveConflict(remote, userId) {
    var self = this;
    var localSummary = summarize(this.deps.storage.data);
    var cloudSummary = summarize(remote.data);
    return this.deps.askConflict(localSummary, cloudSummary).then(function (choice) {
      if (choice === 'cloud') return self._pull(remote, userId);
      if (choice === 'local') {
        var snap = self._snapshot();
        return self.deps.leaderboard.forceSave(snap.data, snap.runs).then(function (res) {
          if (!res.success) throw new Error(res.error || 'Save failed');
          writeMeta({ userId: userId, remoteUpdatedAt: res.updatedAt });
          self.dirty = false;
          self.state = 'idle';
          self.lastSyncedAt = Date.now();
          return 'pushed';
        });
      }
      // Dismissed: leave both untouched, ask again next time.
      self.state = 'idle';
      return 'deferred';
    });
  }

  /** Bring back the richest save the account ever had, then reconcile with this device. @returns {Promise<string>} */
  restoreEarlierCloudSave() {
    var self = this;
    return this.deps.leaderboard.restoreBackupSave().then(function (res) {
      if (!res.success) throw new Error(res.error || 'Could not restore');
      if (!res.updatedAt) return 'none';
      return self.sync().then(function () { return 'restored'; });
    });
  }

  /** For the account screen. */
  getStatus() {
    return { enabled: this.enabled, state: this.state, lastSyncedAt: this.lastSyncedAt, error: this.error, dirty: this.dirty };
  }
}
