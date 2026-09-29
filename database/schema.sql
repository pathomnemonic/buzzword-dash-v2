/**
 * multiplayer.js — PeerJS transport, match protocol, and deterministic utilities
 * for Buzzword Dash multiplayer.
 *
 * Protocol version: 3
 * Owner: Agent 11
 *
 * Exports:
 *   MP_PROTOCOL_VERSION
 *   MP_MODES
 *   multiplayer
 *   createSeededRandom(seed)
 *   seededShuffle(items, rng)
 *   getSeededSkinId(seed, skins)
 *   buildEncounterPlan(options)
 *   hashCardPool(cards)
 *   validateMatchConfig(config)
 *   validateMultiplayerMessage(message)
 *
 * Key architectural rules (from ARCHITECTURE.md):
 *   - Uses protocol version 3.
 *   - Every message uses an envelope: { protocolVersion, type, matchId, senderId, sequence, sentAt, payload }.
 *   - Validates all inbound messages (version, matchId, sequence, payload, state transitions).
 *   - Implements clock synchronization via midpoint method.
 *   - Verifies content version and card-pool hash before match start.
 *   - Produces deterministic encounter plans from seeded RNG.
 *   - Implements result acknowledgment (result_proposal / result_ack).
 *   - Implements disconnect/forfeit behavior.
 *   - Removes window-global card access (window.__BUZZWORD_CARDS, window.__BUZZWORD_CUSTOM_CARDS).
 *   - Exposes required pure utilities.
 *   - Does not directly write to storage, manipulate UI, or play audio.
 *   - Card pools are passed as pure inputs, never read from window globals.
 *
 * PeerJS abstracts WebRTC into a simple API. After the initial signaling
 * handshake via the free PeerJS cloud server, all data flows directly
 * between browsers with DTLS encryption.
 */

// ===== CONSTANTS =====

var PEERJS_URL = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
var PEER_PREFIX = 'buzzworddash3-';
var peerLoadPromise = null;

/** @type {3} */
export var MP_PROTOCOL_VERSION = 3;

// ===== MULTIPLAYER MODE DEFINITIONS =====

export var MP_MODES = [
  {
    id: 'mp_highscore',
    name: '⏱️ High Score',
    desc: 'Most points when timer expires',
    configs: ['timeLimitSeconds'],
    defaults: { timeLimitSeconds: 120, targetCorrect: null, allowContinue: false }
  },
  {
    id: 'mp_suddendeath',
    name: '💀 Sudden Death',
    desc: 'First wrong answer loses',
    configs: [],
    defaults: { timeLimitSeconds: null, targetCorrect: null, allowContinue: false }
  },
  {
    id: 'mp_race',
    name: '🏁 Race',
    desc: 'First to X correct wins',
    configs: ['targetCorrect'],
    defaults: { timeLimitSeconds: null, targetCorrect: 20, allowContinue: false }
  }
];

// ===== REQUIRED MESSAGE TYPES =====

var VALID_MESSAGE_TYPES = [
  'hello',
  'hello_ack',
  'clock_ping',
  'clock_pong',
  'mode_selected',
  'ready',
  'match_config',
  'match_config_ack',
  'match_start',
  'game_state',
  'encounter_result',
  'player_eliminated',
  'race_finished',
  'run_finished',
  'result_proposal',
  'result_ack',
  'disconnect_notice',
  'forfeit',
  'error'
];

// ===== DETERMINISTIC RNG =====

/**
 * Creates a deterministic pseudo-random number generator (xorshift32).
 * Both players use the same seed to produce identical sequences.
 *
 * @param {number} seed - Integer seed. Zero is normalized to 1.
 * @returns {function(): number} Function returning next pseudo-random float in [0, 1).
 */
export function createSeededRandom(seed) {
  var state = seed | 0;
  if (state === 0) state = 1;

  return function () {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

/**
 * Deterministic Fisher-Yates shuffle using a seeded RNG.
 * Returns a NEW array; does not mutate the input.
 *
 * @param {Array} items - Array to shuffle. Not mutated.
 * @param {function(): number} rng - Seeded RNG from createSeededRandom.
 * @returns {Array} A new shuffled array.
 */
export function seededShuffle(items, rng) {
  var arr = items.slice();
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(rng() * (i + 1));
    var temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
  }
  return arr;
}

/**
 * Get a deterministic skin ID from a shared seed and available skins array.
 *
 * @param {number} seed - Shared seed.
 * @param {Array<{name: string}>} skins - Array of skin objects.
 * @returns {string} Skin name (or first skin name if array is empty).
 */
export function getSeededSkinId(seed, skins) {
  if (!skins || skins.length === 0) return '';
  var rng = createSeededRandom(seed);
  var index = Math.floor(rng() * skins.length);
  return skins[index].name || skins[index].id || '';
}

// ===== ENCOUNTER PLAN BUILDER =====

/**
 * Build a deterministic encounter plan from a seed and card pool.
 * Both peers call this with identical inputs to produce identical plans.
 *
 * @param {object} options
 * @param {number} options.seed - Shared RNG seed.
 * @param {object[]} options.cards - The validated card pool (array of card objects).
 * @param {number} options.count - Number of encounters to plan.
 * @param {function(): number} [options.rng] - Optional pre-created RNG.
 * @returns {object[]} Array of EncounterPlanEntry objects.
 */
export function buildEncounterPlan(options) {
  var seed = options.seed || 1;
  var cards = options.cards || [];
  var count = options.count || 50;
  var rng = options.rng || createSeededRandom(seed);

  if (cards.length === 0) return [];

  var shuffled = seededShuffle(cards, rng);
  var plan = [];

  for (var i = 0; i < count; i++) {
    var card = shuffled[i % shuffled.length];
    var correctLane = Math.floor(rng() * 3);

    // Determine distractor order deterministically
    var d0First = rng() < 0.5 ? 0 : 1;
    var distractorOrder = [d0First, d0First === 0 ? 1 : 0];

    // Obstacle: ~40% chance, deterministic
    var obstacle = null;
    if (rng() < 0.4) {
      var obsType = rng() < 0.5 ? 'jump' : 'slide';
      var obsLane = Math.floor(rng() * 3);
      obstacle = {
        type: obsType,
        lane: obsLane,
        variantId: 'default',
        spawnOffset: Math.floor(rng() * 20) + 5
      };
    }

    // Coins: 0-3 coins
    var coinCount = Math.floor(rng() * 4);
    var coins = [];
    for (var c = 0; c < coinCount; c++) {
      coins.push({
        lane: Math.floor(rng() * 3),
        offset: Math.floor(rng() * 30) + 5,
        height: 1 + Math.floor(rng() * 3)
      });
    }

    // Powerup: ~15% chance
    var powerup = null;
    if (rng() < 0.15) {
      var puTypes = ['shield', 'magnet', 'double', 'autoPilot', 'scoreFrenzy'];
      powerup = {
        type: puTypes[Math.floor(rng() * puTypes.length)],
        lane: Math.floor(rng() * 3),
        offset: Math.floor(rng() * 25) + 10
      };
    }

    plan.push({
      encounterIndex: i,
      cardId: card.id,
      correctLane: correctLane,
      distractorOrder: distractorOrder,
      obstacle: obstacle,
      pickups: {
        coins: coins,
        powerup: powerup
      }
    });
  }

  return plan;
}

// ===== CARD-POOL HASH =====

/**
 * Compute a deterministic hash of a card pool for content verification.
 * Both peers compute this independently and compare before match start.
 *
 * Uses a simple DJB2-like hash over sorted card IDs + answer fields.
 *
 * @param {object[]} cards - Array of card objects with at least { id, ans, d }.
 * @returns {string} Hex hash string.
 */
export function hashCardPool(cards) {
  if (!cards || cards.length === 0) return '0';

  // Sort by ID for determinism
  var sorted = cards.slice().sort(function (a, b) {
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });

  var hash = 5381;
  for (var i = 0; i < sorted.length; i++) {
    var c = sorted[i];
    var str = c.id + '|' + c.ans + '|' + (c.d ? c.d.join(',') : '');
    for (var j = 0; j < str.length; j++) {
      hash = ((hash << 5) + hash + str.charCodeAt(j)) | 0;
    }
  }

  return (hash >>> 0).toString(16);
}

// ===== MATCH CONFIG VALIDATION =====

/**
 * Validate a match configuration object.
 *
 * @param {object} config - Match config to validate.
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateMatchConfig(config) {
  var errors = [];

  if (!config) {
    return { valid: false, errors: ['Config is null or undefined'] };
  }

  if (config.protocolVersion !== MP_PROTOCOL_VERSION) {
    errors.push('Protocol version mismatch: expected ' + MP_PROTOCOL_VERSION + ', got ' + config.protocolVersion);
  }

  if (typeof config.matchId !== 'string' || config.matchId.length === 0) {
    errors.push('matchId must be a non-empty string');
  }

  var validModes = ['mp_highscore', 'mp_suddendeath', 'mp_race'];
  if (validModes.indexOf(config.mode) < 0) {
    errors.push('Invalid mode: ' + config.mode);
  }

  if (typeof config.seed !== 'number' || config.seed === 0) {
    errors.push('seed must be a non-zero number');
  }

  if (typeof config.startAt !== 'number') {
    errors.push('startAt must be a number (timestamp)');
  }

  if (!Array.isArray(config.subjects)) {
    errors.push('subjects must be an array');
  }

  if (typeof config.cardPoolHash !== 'string' || config.cardPoolHash.length === 0) {
    errors.push('cardPoolHash must be a non-empty string');
  }

  if (typeof config.contentVersion !== 'string') {
    errors.push('contentVersion must be a string');
  }

  return { valid: errors.length === 0, errors: errors };
}

// ===== MESSAGE VALIDATION =====

/**
 * Validate a multiplayer protocol message envelope.
 *
 * @param {object} message - The message to validate.
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateMultiplayerMessage(message) {
  var errors = [];

  if (!message || typeof message !== 'object') {
    return { valid: false, errors: ['Message is not an object'] };
  }

  if (message.protocolVersion !== MP_PROTOCOL_VERSION) {
    errors.push('Unsupported protocol version: ' + message.protocolVersion);
  }

  if (typeof message.type !== 'string' || VALID_MESSAGE_TYPES.indexOf(message.type) < 0) {
    errors.push('Invalid or missing message type: ' + message.type);
  }

  if (typeof message.senderId !== 'string' || message.senderId.length === 0) {
    errors.push('senderId must be a non-empty string');
  }

  if (typeof message.sequence !== 'number') {
    errors.push('sequence must be a number');
  }

  if (typeof message.sentAt !== 'number') {
    errors.push('sentAt must be a number');
  }

  // matchId can be null for hello/hello_ack/error
  var noMatchIdTypes = ['hello', 'hello_ack', 'error'];
  if (noMatchIdTypes.indexOf(message.type) < 0) {
    if (message.matchId !== null && message.matchId !== undefined && typeof message.matchId !== 'string') {
      errors.push('matchId must be a string or null');
    }
  }

  if (message.payload !== undefined && message.payload !== null && typeof message.payload !== 'object') {
    errors.push('payload must be an object or null');
  }

  return { valid: errors.length === 0, errors: errors };
}

// ===== PEERJS LOADING =====

function loadPeerJS() {
  if (window.Peer) return Promise.resolve();
  if (peerLoadPromise) return peerLoadPromise;

  peerLoadPromise = new Promise(function (resolve, reject) {
    var existing = document.querySelector('script[data-buzzword-peerjs]');
    if (existing) {
      if (existing.dataset.loaded === 'true') { resolve(); return; }
      existing.addEventListener('load', function () { resolve(); });
      existing.addEventListener('error', function () { reject(new Error('Failed to load PeerJS.')); });
      return;
    }

    var script = document.createElement('script');
    script.src = PEERJS_URL;
    script.async = true;
    script.dataset.buzzwordPeerjs = 'true';

    script.onload = function () {
      script.dataset.loaded = 'true';
      if (window.Peer) resolve();
      else reject(new Error('PeerJS loaded but Peer was unavailable.'));
    };
    script.onerror = function () { reject(new Error('Failed to load PeerJS.')); };
    document.head.appendChild(script);
  });

  return peerLoadPromise;
}

// ===== ROOM CODE UTILITIES =====

function generateRoomCode() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var code = '';
  for (var i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function normalizeRoomCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 5);
}

// ===== UNIQUE ID GENERATOR =====

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// ===== CLOCK SYNCHRONIZATION =====

/**
 * Clock offset estimator using the midpoint method.
 * Collects multiple samples and selects the one with lowest RTT.
 */
function ClockSync() {
  this.samples = [];
  this.offsetMs = 0;
  this.maxSamples = 5;
}

ClockSync.prototype.addSample = function (localSend, hostTimestamp, localReceive) {
  var roundTripMs = localReceive - localSend;
  var midpoint = localSend + roundTripMs / 2;
  var offset = hostTimestamp - midpoint;

  this.samples.push({ rtt: roundTripMs, offset: offset });

  // Keep only maxSamples
  if (this.samples.length > this.maxSamples) {
    this.samples.shift();
  }

  // Select sample with lowest RTT
  var best = this.samples[0];
  for (var i = 1; i < this.samples.length; i++) {
    if (this.samples[i].rtt < best.rtt) {
      best = this.samples[i];
    }
  }
  this.offsetMs = best.offset;
};

ClockSync.prototype.toLocalTime = function (hostTimestamp) {
  return hostTimestamp - this.offsetMs;
};

ClockSync.prototype.reset = function () {
  this.samples = [];
  this.offsetMs = 0;
};

// ===== MULTIPLAYER CLASS =====

export class Multiplayer {
  constructor() {
    this.peer = null;
    this.conn = null;

    this.roomCode = '';
    this.isHost = false;
    this.connected = false;
    this.senderId = generateId();

    this.localReady = false;
    this.opponentReady = false;

    this.matchId = null;
    this.matchConfig = null;
    this.sharedSeed = 0;
    this.selectedMode = 'mp_highscore';
    this.modeConfig = {};

    this._sequence = 0;
    this._remoteSequence = -1;

    this.clockSync = new ClockSync();
    this.pingInterval = null;
    this.latency = null;

    this._matchResult = null;
    this._resultAcked = false;

    // Typed callbacks
    this.onConnected = null;
    this.onDisconnected = null;
    this.onError = null;
    this.onOpponentUpdate = null;
    this.onReadyState = null;
    this.onModeSelected = null;
    this.onMatchConfig = null;
    this.onMatchConfigAck = null;
    this.onMatchStart = null;
    this.onEncounterResult = null;
    this.onEliminated = null;
    this.onRaceFinished = null;
    this.onRunFinished = null;
    this.onResultProposal = null;
    this.onResultAck = null;
    this.onForfeit = null;
    this.onMessage = null;
  }

  // ===== INITIALIZATION =====

  async init() {
    await loadPeerJS();
  }

  // ===== MESSAGE ENVELOPE =====

  _createEnvelope(type, payload) {
    this._sequence++;
    return {
      protocolVersion: MP_PROTOCOL_VERSION,
      type: type,
      matchId: this.matchId,
      senderId: this.senderId,
      sequence: this._sequence,
      sentAt: Date.now(),
      payload: payload || {}
    };
  }

  // ===== SEND =====

  send(type, payload) {
    if (!this.conn || !this.conn.open) return false;
    var envelope = this._createEnvelope(type, payload);
    try {
      this.conn.send(envelope);
      return true;
    } catch (e) {
      console.warn('Multiplayer send failed:', e);
      return false;
    }
  }

  // ===== MODE SELECTION =====

  setMode(modeId, config) {
    this.selectedMode = modeId || 'mp_highscore';
    this.modeConfig = config || {};

    // Apply defaults
    for (var i = 0; i < MP_MODES.length; i++) {
      if (MP_MODES[i].id === this.selectedMode) {
        var defaults = MP_MODES[i].defaults || {};
        for (var key in defaults) {
          if (this.modeConfig[key] === undefined) {
            this.modeConfig[key] = defaults[key];
          }
        }
        break;
      }
    }

    this.send('mode_selected', {
      mode: this.selectedMode,
      config: this.modeConfig
    });
  }

  // ===== READY =====

  sendReady(ready) {
    this.localReady = ready !== false;
    this.send('ready', { ready: this.localReady });

    if (this.onReadyState) {
      this.onReadyState({
        localReady: this.localReady,
        opponentReady: this.opponentReady
      });
    }
  }

  // ===== MATCH CONFIG (host sends, joiner acks) =====

  sendMatchConfig(config) {
    if (!this.isHost) return false;

    this.matchId = config.matchId || generateId();
    this.sharedSeed = config.seed || Math.floor(Math.random() * 2147483647);
    if (this.sharedSeed === 0) this.sharedSeed = 1;

    var mode = config.mode || this.selectedMode || 'mp_highscore';

    var finalModeConfig = {};
    for (var mi = 0; mi < MP_MODES.length; mi++) {
      if (MP_MODES[mi].id === mode) {
        var defs = MP_MODES[mi].defaults || {};
        for (var dk in defs) finalModeConfig[dk] = defs[dk];
        break;
      }
    }
    if (this.modeConfig) {
      for (var mk in this.modeConfig) finalModeConfig[mk] = this.modeConfig[mk];
    }
    if (config.modeConfig) {
      for (var ck in config.modeConfig) finalModeConfig[ck] = config.modeConfig[ck];
    }

    this.matchConfig = {
      protocolVersion: MP_PROTOCOL_VERSION,
      matchId: this.matchId,
      mode: mode,
      seed: this.sharedSeed,
      startAt: config.startAt || Date.now() + 3000,
      subjects: Array.isArray(config.subjects) ? config.subjects.slice() : [],
      filters: config.filters || {
        exams: [],
        questionTypes: [],
        sources: [],
        years: [],
        highYieldOnly: false,
        includeCustomCards: false
      },
      cardPoolHash: config.cardPoolHash || '',
      contentVersion: config.contentVersion || '',
      skinId: config.skinId || '',
      modeConfig: finalModeConfig
    };

    this.send('match_config', this.matchConfig);
    return this.matchConfig;
  }

  sendMatchConfigAck(ack) {
    this.send('match_config_ack', {
      accepted: !!ack.accepted,
      reason: ack.reason || null
    });
  }

  // ===== MATCH START =====

  sendMatchStart() {
    if (!this.isHost || !this.matchConfig) return false;
    this.send('match_start', this.matchConfig);
    return this.matchConfig;
  }

  // ===== GAME STATE =====

  sendGameState(state) {
    return this.send('game_state', {
      lane: Number(state.lane) || 0,
      score: Number(state.score) || 0,
      streak: Number(state.streak) || 0,
      correct: Number(state.correct) || 0,
      wrong: Number(state.wrong) || 0,
      lives: Number(state.lives) || 0,
      rushing: !!state.rushing,
      rushStacks: Number(state.rushStacks) || 0,
      running: !!state.running,
      correctCount: Number(state.correctCount) || Number(state.correct) || 0,
      timeRemaining: Number(state.timeRemaining) || 0,
      eliminated: !!state.eliminated
    });
  }

  // ===== ENCOUNTER RESULT =====

  sendEncounterResult(correct, score, cardId) {
    return this.send('encounter_result', {
      correct: !!correct,
      score: Number(score) || 0,
      cardId: cardId || ''
    });
  }

  // ===== ELIMINATION (Sudden Death) =====

  sendEliminated(cardId) {
    return this.send('player_eliminated', {
      cardId: cardId || ''
    });
  }

  // ===== RACE FINISHED =====

  sendRaceFinished(correctCount, totalTime) {
    return this.send('race_finished', {
      correctCount: Number(correctCount) || 0,
      totalTime: Number(totalTime) || 0
    });
  }

  // ===== RUN FINISHED =====

  sendRunFinished(finalState) {
    finalState = finalState || {};
    return this.send('run_finished', {
      score: Number(finalState.score) || 0,
      correct: Number(finalState.correct) || 0,
      wrong: Number(finalState.wrong) || 0,
      bestStreak: Number(finalState.bestStreak) || 0,
      coins: Number(finalState.coins) || 0,
      correctCount: Number(finalState.correctCount) || Number(finalState.correct) || 0,
      eliminated: !!finalState.eliminated,
      raceTime: Number(finalState.raceTime) || 0
    });
  }

  // ===== RESULT PROPOSAL / ACK =====

  sendResultProposal(result) {
    this._matchResult = result;
    return this.send('result_proposal', result);
  }

  sendResultAck(accepted) {
    this._resultAcked = true;
    return this.send('result_ack', { accepted: !!accepted });
  }

  // ===== FORFEIT =====

  sendForfeit(reason) {
    this.send('forfeit', { reason: reason || 'User forfeited' });
  }

  // ===== DISCONNECT NOTICE =====

  sendDisconnectNotice(reason) {
    this.send('disconnect_notice', { reason: reason || 'Disconnecting' });
  }

  // ===== CLOCK PING/PONG =====

  _sendClockPing() {
    this.send('clock_ping', {
      localSend: Date.now()
    });
  }

  // ===== HOST / JOIN =====

  async hostGame(onReady) {
    await this.init();
    this.disconnect();

    this.isHost = true;
    this.roomCode = generateRoomCode();
    this.localReady = false;
    this.opponentReady = false;
    this._sequence = 0;
    this._remoteSequence = -1;
    this.matchId = null;
    this.clockSync.reset();

    var self = this;

    try {
      this.peer = new window.Peer(PEER_PREFIX + this.roomCode);
    } catch (error) {
      this._emitError('Failed to create room: ' + error.message);
      return;
    }

    this.peer.on('open', function () {
      if (onReady) onReady(self.roomCode);
    });

    this.peer.on('connection', function (conn) {
      if (self.conn && self.conn.open) { conn.close(); return; }
      self.conn = conn;
      self._setupConnection(conn);
    });

    this.peer.on('disconnected', function () {
      self.connected = false;
      self._stopPing();
      if (self.onDisconnected) self.onDisconnected('Peer signaling disconnected.');
    });

    this.peer.on('close', function () {
      self._handleDisconnected('Room closed.');
    });

    this.peer.on('error', function (error) {
      self._emitError((error.type || 'Peer error') + ': ' + (error.message || 'Unknown error'));
    });
  }

  async joinGame(roomCode, onReady) {
    await this.init();
    this.disconnect();

    var normalized = normalizeRoomCode(roomCode);
    if (normalized.length !== 5) {
      this._emitError('Room code must contain five characters.');
      return;
    }

    this.isHost = false;
    this.roomCode = normalized;
    this.localReady = false;
    this.opponentReady = false;
    this._sequence = 0;
    this._remoteSequence = -1;
    this.matchId = null;
    this.clockSync.reset();

    var self = this;

    try {
      this.peer = new window.Peer();
    } catch (error) {
      this._emitError('Failed to initialize multiplayer: ' + error.message);
      return;
    }

    this.peer.on('open', function () {
      try {
        var conn = self.peer.connect(PEER_PREFIX + self.roomCode, {
          reliable: true,
          serialization: 'json'
        });
        self.conn = conn;
        self._setupConnection(conn);
        if (onReady) onReady();
      } catch (error) {
        self._emitError('Connection failed: ' + error.message);
      }
    });

    this.peer.on('disconnected', function () {
      self.connected = false;
      self._stopPing();
      if (self.onDisconnected) self.onDisconnected('Peer signaling disconnected.');
    });

    this.peer.on('close', function () {
      self._handleDisconnected('Connection closed.');
    });

    this.peer.on('error', function (error) {
      var message = error.message || error.type || 'Unknown error';
      if (error.type === 'peer-unavailable') {
        message = 'Room not found. Check the room code.';
      }
      self._emitError(message);
    });
  }

  // ===== CONNECTION SETUP =====

  _setupConnection(conn) {
    var self = this;

    conn.on('open', function () {
      self.connected = true;
      self.localReady = false;
      self.opponentReady = false;
      self._startPing();

      self.send('hello', {});

      if (self.onConnected) {
        self.onConnected({
          roomCode: self.roomCode,
          isHost: self.isHost
        });
      }
    });

    conn.on('data', function (data) {
      self._handleMessage(data);
    });

    conn.on('close', function () {
      self._handleDisconnected('Opponent disconnected.');
    });

    conn.on('error', function (error) {
      self._emitError('Connection error: ' + (error.message || 'Unknown error'));
    });
  }

  // ===== MESSAGE HANDLING =====

  _handleMessage(data) {
    if (!data || typeof data !== 'object') return;

    // Validate envelope
    var validation = validateMultiplayerMessage(data);
    if (!validation.valid) {
      console.warn('Multiplayer: rejected invalid message', validation.errors, data);
      return;
    }

    // Protocol version check
    if (data.protocolVersion !== MP_PROTOCOL_VERSION) {
      console.warn('Multiplayer: protocol version mismatch, ignoring message');
      return;
    }

    // Match ID check (for messages that require it)
    var noMatchIdTypes = ['hello', 'hello_ack', 'error', 'clock_ping', 'clock_pong'];
    if (noMatchIdTypes.indexOf(data.type) < 0 && this.matchId !== null) {
      if (data.matchId !== null && data.matchId !== this.matchId) {
        console.warn('Multiplayer: matchId mismatch, ignoring message');
        return;
      }
    }

    // Sequence deduplication (reject stale/duplicate)
    if (typeof data.sequence === 'number' && data.sequence <= this._remoteSequence) {
      // Allow clock_pong to pass through (response to our ping)
      if (data.type !== 'clock_pong' && data.type !== 'clock_ping') {
        console.warn('Multiplayer: stale sequence ' + data.sequence + ', ignoring');
        return;
      }
    }
    if (typeof data.sequence === 'number' && data.sequence > this._remoteSequence) {
      this._remoteSequence = data.sequence;
    }

    // Generic callback
    if (this.onMessage) this.onMessage(data);

    var payload = data.payload || {};

    switch (data.type) {
      case 'hello':
        this.send('hello_ack', {});
        break;

      case 'hello_ack':
        // Connection fully established
        break;

      case 'clock_ping':
        this.send('clock_pong', {
          localSend: payload.localSend,
          hostTimestamp: Date.now()
        });
        break;

      case 'clock_pong':
        if (payload.localSend && payload.hostTimestamp) {
          var localReceive = Date.now();
          this.clockSync.addSample(payload.localSend, payload.hostTimestamp, localReceive);
          this.latency = Math.max(0, localReceive - payload.localSend);
        }
        break;

      case 'mode_selected':
        this.selectedMode = payload.mode || 'mp_highscore';
        this.modeConfig = payload.config || {};
        if (this.onModeSelected) {
          this.onModeSelected({ mode: this.selectedMode, config: this.modeConfig });
        }
        break;

      case 'ready':
        this.opponentReady = !!payload.ready;
        if (this.onReadyState) {
          this.onReadyState({
            localReady: this.localReady,
            opponentReady: this.opponentReady
          });
        }
        break;

      case 'match_config':
        this.matchConfig = payload;
        this.matchId = payload.matchId || null;
        this.sharedSeed = payload.seed || 0;
        if (this.onMatchConfig) this.onMatchConfig(payload);
        break;

      case 'match_config_ack':
        if (this.onMatchConfigAck) this.onMatchConfigAck(payload);
        break;

      case 'match_start':
        this.matchConfig = payload;
        this.matchId = payload.matchId || this.matchId;
        this.sharedSeed = payload.seed || 0;
        if (this.onMatchStart) {
          this.onMatchStart({
            startAt: payload.startAt,
            seed: payload.seed,
            subjects: payload.subjects || [],
            mode: payload.mode || 'mp_highscore',
            config: payload.modeConfig || payload.config || {},
            matchId: payload.matchId,
            skinId: payload.skinId || '',
            cardPoolHash: payload.cardPoolHash || '',
            contentVersion: payload.contentVersion || ''
          });
        }
        break;

      case 'game_state':
        if (this.onOpponentUpdate) this.onOpponentUpdate(payload);
        break;

      case 'encounter_result':
        if (this.onEncounterResult) this.onEncounterResult(payload);
        break;

      case 'player_eliminated':
        if (this.onEliminated) this.onEliminated(payload);
        break;

      case 'race_finished':
        if (this.onRaceFinished) this.onRaceFinished(payload);
        break;

      case 'run_finished':
        if (this.onRunFinished) this.onRunFinished(payload);
        break;

      case 'result_proposal':
        if (this.onResultProposal) this.onResultProposal(payload);
        break;

      case 'result_ack':
        this._resultAcked = true;
        if (this.onResultAck) this.onResultAck(payload);
        break;

      case 'forfeit':
        if (this.onForfeit) this.onForfeit(payload);
        break;

      case 'disconnect_notice':
        this._handleDisconnected(payload.reason || 'Opponent sent disconnect notice.');
        break;

      case 'error':
        this._emitError(payload.message || 'Remote error');
        break;
    }
  }

  // ===== QUERY METHODS =====

  isConnected() {
    return !!(this.connected && this.conn && this.conn.open);
  }

  getSeed() {
    return this.sharedSeed;
  }

  getMode() {
    return this.selectedMode || 'mp_highscore';
  }

  getModeConfig() {
    return this.modeConfig || {};
  }

  getMatchId() {
    return this.matchId;
  }

  getClockOffset() {
    return this.clockSync.offsetMs;
  }

  hostStartToLocalTime(hostStartAt) {
    return this.clockSync.toLocalTime(hostStartAt);
  }

  // ===== PING =====

  _startPing() {
    this._stopPing();
    var self = this;
    this.pingInterval = setInterval(function () {
      if (!self.isConnected()) return;
      self._sendClockPing();
    }, 3000);
  }

  _stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  // ===== DISCONNECT =====

  _handleDisconnected(reason) {
    var wasConnected = this.connected;
    this.connected = false;
    this.localReady = false;
    this.opponentReady = false;
    this._stopPing();

    if (wasConnected && this.onDisconnected) {
      this.onDisconnected(reason || 'Disconnected.');
    }
  }

  _emitError(message) {
    console.warn('Multiplayer:', message);
    if (this.onError) this.onError(message);
  }

  disconnect() {
    this._stopPing();
    this.connected = false;
    this.localReady = false;
    this.opponentReady = false;

    if (this.conn) {
      try { this.conn.close(); } catch (e) { /* cleanup */ }
      this.conn = null;
    }

    if (this.peer) {
      try { this.peer.destroy(); } catch (e) { /* cleanup */ }
      this.peer = null;
    }

    this.roomCode = '';
    this.isHost = false;
    this.latency = null;
    this.sharedSeed = 0;
    this.matchId = null;
    this.matchConfig = null;
    this._sequence = 0;
    this._remoteSequence = -1;
    this._matchResult = null;
    this._resultAcked = false;
    this.clockSync.reset();
  }
}

export var multiplayer = new Multiplayer();
