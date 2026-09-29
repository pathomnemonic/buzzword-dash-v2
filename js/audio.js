/**
 * audio.js — Sound effects, procedural music, TTS, and ambient audio
 *
 * Agent 10 — Complete replacement per ARCHITECTURE.md v1.0.0
 *
 * Implements:
 * - Five audio buses: master, music, sfx, ambient, voice
 * - Semantic event-based play() API
 * - Procedural music system with per-skin musical styles
 * - Look-ahead Web Audio scheduling for music
 * - Music crossfade for map transitions
 * - Ambient environmental FX (separate lifecycle from music)
 * - TTS with speed-adaptive rate
 * - Haptic feedback via navigator.vibrate()
 * - Pause/resume support
 * - Compressor/limiter on master output
 * - Noise buffer reuse
 * - Volume zero preservation (nullish coalescing)
 * - No direct storage reads from music generators
 *
 * The engine emits semantic events; main.js routes them here.
 * This module does NOT read storage directly for anything except
 * settings retrieval through updateSettings() and getSettings().
 */

import { storage } from './storage.js';

// ===== MUSICAL CONSTANTS =====

const SCALES = {
  cMinorPentatonic: [0, 3, 5, 7, 10],
  cMajorPentatonic: [0, 2, 4, 7, 9],
  cMinor: [0, 2, 3, 5, 7, 8, 10],
  cMajor: [0, 2, 4, 5, 7, 9, 11],
  cBlues: [0, 3, 5, 6, 7, 10],
  cDorian: [0, 2, 3, 5, 7, 9, 10],
  cMixolydian: [0, 2, 4, 5, 7, 9, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
};

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function scaleNote(scale, baseNote, index) {
  var octave = Math.floor(index / scale.length);
  var degree = ((index % scale.length) + scale.length) % scale.length;
  return baseNote + octave * 12 + scale[degree];
}

// ===== SKIN MUSIC CONFIGURATIONS =====

const SKIN_MUSIC = {
  'Neural Highway': {
    bpm: 128, key: 48, scale: 'cMinorPentatonic',
    bassPattern: [0, 0, -1, 0, 2, 2, -1, 3, 0, 0, -1, 2, 3, 3, -1, 0],
    melodyPattern: [4, 5, 7, -1, 5, 4, -1, 7, 8, 7, 5, -1, 4, 5, -1, 7],
    chordIntervals: [[0, 3, 7], [0, 3, 7], [2, 5, 9], [2, 5, 9]],
    bassType: 'triangle', melodyType: 'sawtooth', padType: 'sine',
    drumPattern: {
      kick:  [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],
      snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
      hat:   [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0]
    },
    filterFreq: 2000, filterQ: 2
  },
  'Vascular Rush': {
    bpm: 140, key: 45, scale: 'cMinor',
    bassPattern: [0, 0, 0, -1, 0, 3, -1, 2, 0, 0, 0, -1, 3, 2, -1, 0],
    melodyPattern: [7, 8, 10, 7, -1, 8, 10, 12, 10, 8, 7, -1, 5, 7, 8, -1],
    chordIntervals: [[0, 3, 7], [3, 7, 10], [0, 3, 7], [5, 8, 12]],
    bassType: 'sawtooth', melodyType: 'square', padType: 'triangle',
    drumPattern: {
      kick:  [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],
      snare: [0,0,0,0,1,0,0,1,0,0,0,0,1,0,0,1],
      hat:   [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
    },
    filterFreq: 3000, filterQ: 1
  },
  'Skeletal Corridor': {
    bpm: 100, key: 40, scale: 'cDorian',
    bassPattern: [0, -1, -1, 2, 0, -1, 3, -1, 5, -1, -1, 3, 2, -1, 0, -1],
    melodyPattern: [7, -1, 5, -1, 3, 5, -1, -1, 7, -1, 8, -1, 7, 5, -1, -1],
    chordIntervals: [[0, 3, 7], [0, 3, 7], [5, 9, 12], [3, 7, 10]],
    bassType: 'triangle', melodyType: 'triangle', padType: 'sine',
    drumPattern: {
      kick:  [1,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0],
      snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
      hat:   [0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0]
    },
    filterFreq: 1500, filterQ: 3
  },
  'Cellular Matrix': {
    bpm: 120, key: 52, scale: 'cMajorPentatonic',
    bassPattern: [0, -1, 2, -1, 0, -1, 4, -1, 2, -1, 0, -1, 4, -1, 2, -1],
    melodyPattern: [4, 5, 7, 9, 7, 5, 4, -1, 5, 7, 9, 11, 9, 7, 5, -1],
    chordIntervals: [[0, 4, 7], [0, 4, 7], [2, 5, 9], [4, 7, 11]],
    bassType: 'sine', melodyType: 'sine', padType: 'triangle',
    drumPattern: {
      kick:  [1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,0],
      snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
      hat:   [1,0,1,1,0,1,1,0,1,1,0,1,1,0,1,0]
    },
    filterFreq: 4000, filterQ: 1
  },
  'Neon ER': {
    bpm: 138, key: 48, scale: 'cMinor',
    bassPattern: [0, 0, -1, 0, 3, 3, -1, 5, 3, 3, -1, 0, 7, 5, -1, 3],
    melodyPattern: [7, 10, 12, -1, 10, 7, 12, -1, 7, 10, 12, 14, 12, 10, 7, -1],
    chordIntervals: [[0, 3, 7], [3, 7, 10], [5, 8, 12], [0, 3, 7]],
    bassType: 'sawtooth', melodyType: 'sawtooth', padType: 'sine',
    drumPattern: {
      kick:  [1,0,0,0,1,0,0,0,1,0,0,0,1,0,1,0],
      snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
      hat:   [1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1]
    },
    filterFreq: 2500, filterQ: 3
  },
  'DNA Helix Tunnel': {
    bpm: 132, key: 50, scale: 'cMinorPentatonic',
    bassPattern: [0, -1, 0, 2, -1, 2, 3, -1, 5, -1, 3, 2, -1, 0, 2, -1],
    melodyPattern: [5, 7, 8, 10, 12, 10, 8, 7, 5, 7, 8, 10, 8, 7, 5, -1],
    chordIntervals: [[0, 3, 7], [2, 5, 9], [3, 7, 10], [0, 3, 7]],
    bassType: 'triangle', melodyType: 'sawtooth', padType: 'sine',
    drumPattern: {
      kick:  [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],
      snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
      hat:   [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,1]
    },
    filterFreq: 2200, filterQ: 2
  },
  'Prescription Sunset': {
    bpm: 90, key: 48, scale: 'cMajorPentatonic',
    bassPattern: [0, -1, -1, 0, -1, 2, -1, -1, 4, -1, -1, 2, -1, 0, -1, -1],
    melodyPattern: [7, -1, 9, 7, -1, -1, 5, -1, 4, -1, 5, 7, -1, -1, 9, -1],
    chordIntervals: [[0, 4, 7], [2, 5, 9], [4, 7, 11], [0, 4, 7]],
    bassType: 'triangle', melodyType: 'triangle', padType: 'sine',
    drumPattern: {
      kick:  [1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0],
      snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
      hat:   [0,0,1,0,1,0,0,0,1,0,1,0,0,0,1,0]
    },
    filterFreq: 1800, filterQ: 1
  },
  'Cardiac Pulse': {
    bpm: 125, key: 45, scale: 'cMinor',
    bassPattern: [0, 0, -1, -1, 0, 0, -1, -1, 3, 3, -1, -1, 2, 2, -1, -1],
    melodyPattern: [7, -1, 8, 7, -1, 5, -1, 7, 8, -1, 10, 8, -1, 7, -1, 5],
    chordIntervals: [[0, 3, 7], [0, 3, 7], [3, 7, 10], [2, 5, 8]],
    bassType: 'sine', melodyType: 'sawtooth', padType: 'triangle',
    drumPattern: {
      kick:  [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
      snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
      hat:   [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0]
    },
    filterFreq: 2000, filterQ: 2
  },
  'Surgical Theater': {
    bpm: 118, key: 52, scale: 'cMajor',
    bassPattern: [0, -1, 0, -1, 2, -1, 2, -1, 4, -1, 4, -1, 2, -1, 0, -1],
    melodyPattern: [7, 9, 11, -1, 9, 7, -1, 11, 12, 11, 9, -1, 7, 9, -1, -1],
    chordIntervals: [[0, 4, 7], [2, 5, 9], [4, 7, 11], [0, 4, 7]],
    bassType: 'sine', melodyType: 'triangle', padType: 'sine',
    drumPattern: {
      kick:  [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],
      snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
      hat:   [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
    },
    filterFreq: 3500, filterQ: 1
  },
  'Candy Lab': {
    bpm: 145, key: 55, scale: 'cMajorPentatonic',
    bassPattern: [0, 0, 2, 2, 4, 4, 2, 2, 0, 0, 4, 4, 2, 2, 0, 0],
    melodyPattern: [7, 9, 11, 9, 7, 9, 11, 14, 11, 9, 7, 9, 11, 9, 7, -1],
    chordIntervals: [[0, 4, 7], [4, 7, 11], [0, 4, 7], [2, 5, 9]],
    bassType: 'square', melodyType: 'square', padType: 'triangle',
    drumPattern: {
      kick:  [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],
      snare: [0,0,0,0,1,0,0,1,0,0,0,0,1,0,0,1],
      hat:   [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
    },
    filterFreq: 5000, filterQ: 0.5
  },
  'X-Ray Vision': {
    bpm: 108, key: 43, scale: 'cDorian',
    bassPattern: [0, -1, -1, 0, -1, -1, 2, -1, 3, -1, -1, 2, -1, -1, 0, -1],
    melodyPattern: [7, -1, -1, 8, -1, 7, -1, -1, 5, -1, -1, 7, -1, 8, -1, -1],
    chordIntervals: [[0, 3, 7], [0, 3, 7], [3, 5, 10], [2, 5, 9]],
    bassType: 'sine', melodyType: 'sine', padType: 'sine',
    drumPattern: {
      kick:  [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
      snare: [0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0],
      hat:   [0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0]
    },
    filterFreq: 1200, filterQ: 4
  },
  'Defibrillator Shock': {
    bpm: 136, key: 48, scale: 'cBlues',
    bassPattern: [0, 0, 0, -1, 3, 3, -1, 5, 3, 3, -1, 0, 5, 3, -1, 0],
    melodyPattern: [5, 7, 8, 10, -1, 8, 7, 5, 7, 8, 10, 12, -1, 10, 8, 7],
    chordIntervals: [[0, 3, 6, 7], [0, 3, 7], [3, 6, 10], [0, 3, 7]],
    bassType: 'sawtooth', melodyType: 'sawtooth', padType: 'triangle',
    drumPattern: {
      kick:  [1,0,0,1,0,0,1,0,1,0,0,1,0,0,1,0],
      snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,1],
      hat:   [1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0]
    },
    filterFreq: 3000, filterQ: 2
  }
};

// ===== SHARED NOISE BUFFER (reused, not recreated) =====

let _sharedNoiseBuffer = null;
let _sharedNoiseBufferShort = null;

function getNoiseBuffer(ctx, duration) {
  if (duration <= 0.1) {
    if (!_sharedNoiseBufferShort || _sharedNoiseBufferShort.sampleRate !== ctx.sampleRate) {
      var size = Math.ceil(ctx.sampleRate * 0.1);
      _sharedNoiseBufferShort = ctx.createBuffer(1, size, ctx.sampleRate);
      var data = _sharedNoiseBufferShort.getChannelData(0);
      for (var i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
    }
    return _sharedNoiseBufferShort;
  }
  if (!_sharedNoiseBuffer || _sharedNoiseBuffer.sampleRate !== ctx.sampleRate) {
    var sz = Math.ceil(ctx.sampleRate * 0.5);
    _sharedNoiseBuffer = ctx.createBuffer(1, sz, ctx.sampleRate);
    var d = _sharedNoiseBuffer.getChannelData(0);
    for (var j = 0; j < sz; j++) d[j] = Math.random() * 2 - 1;
  }
  return _sharedNoiseBuffer;
}


// ===== MUSIC GENERATOR CLASS (look-ahead scheduler) =====

class MusicGenerator {
  constructor(ctx, outputNode, skinName, settingsGetter) {
    this.ctx = ctx;
    this.skinName = skinName;
    this.config = SKIN_MUSIC[skinName] || SKIN_MUSIC['Neural Highway'];
    this.scale = SCALES[this.config.scale] || SCALES.cMinorPentatonic;
    this.playing = false;
    this.schedulerTimer = null;
    this.currentStep = 0;
    this.nextStepTime = 0;
    this.tempoMultiplier = 1.0;
    this._getSettings = settingsGetter;

    // Output gain for crossfading
    this.outputGain = ctx.createGain();
    this.outputGain.gain.value = 1.0;
    this.outputGain.connect(outputNode);

    // Melody filter
    this.melodyFilter = ctx.createBiquadFilter();
    this.melodyFilter.type = 'lowpass';
    this.melodyFilter.frequency.value = this.config.filterFreq || 2000;
    this.melodyFilter.Q.value = this.config.filterQ || 2;
    this.melodyFilter.connect(this.outputGain);

    // Look-ahead scheduling constants
    this._lookAheadMs = 25;    // How often to call scheduler (ms)
    this._scheduleAhead = 0.1; // How far ahead to schedule (seconds)
  }

  play() {
    if (this.playing) return;
    this.playing = true;
    this.nextStepTime = this.ctx.currentTime + 0.05;
    this.currentStep = 0;
    this._startScheduler();
  }

  stop() {
    this.playing = false;
    this._stopScheduler();
  }

  fadeOut(duration) {
    if (!this.outputGain) return;
    var now = this.ctx.currentTime;
    this.outputGain.gain.setValueAtTime(this.outputGain.gain.value, now);
    this.outputGain.gain.linearRampToValueAtTime(0, now + duration);
    var self = this;
    setTimeout(function () { self.stop(); }, duration * 1000 + 100);
  }

  fadeIn(duration) {
    if (!this.outputGain) return;
    var now = this.ctx.currentTime;
    this.outputGain.gain.setValueAtTime(0, now);
    this.outputGain.gain.linearRampToValueAtTime(1.0, now + duration);
    this.play();
  }

  setTempoMultiplier(mult) {
    this.tempoMultiplier = Math.max(0.5, Math.min(1.5, mult));
    // Do NOT stop and restart — preserve musical phase
  }

  _startScheduler() {
    this._stopScheduler();
    var self = this;
    this.schedulerTimer = setInterval(function () {
      self._schedule();
    }, this._lookAheadMs);
  }

  _stopScheduler() {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  _schedule() {
    if (!this.playing) return;
    var stepDuration = (60 / this.config.bpm) / 4 / this.tempoMultiplier;

    while (this.nextStepTime < this.ctx.currentTime + this._scheduleAhead) {
      this._playStep(this.currentStep, this.nextStepTime);
      this.currentStep = (this.currentStep + 1) % 16;
      this.nextStepTime += stepDuration;
    }
  }

  _playStep(step, time) {
    var cfg = this.config;
    var settings = this._getSettings();
    var vol = settings.masterVolume * settings.musicVolume;
    if (vol <= 0) return;

    // Drums
    this._playDrums(step, vol, time);

    // Bass (every step)
    if (step < cfg.bassPattern.length) {
      var bassNote = cfg.bassPattern[step];
      if (bassNote >= 0) {
        var bassMidi = scaleNote(this.scale, cfg.key - 12, bassNote);
        this._playBass(midiToFreq(bassMidi), vol, time);
      }
    }

    // Melody
    if (step < cfg.melodyPattern.length) {
      var melNote = cfg.melodyPattern[step];
      if (melNote >= 0) {
        var melMidi = scaleNote(this.scale, cfg.key, melNote);
        this._playMelody(midiToFreq(melMidi), vol, time);
      }
    }

    // Pad chords (every 4 steps)
    if (step % 4 === 0) {
      var chordIdx = Math.floor(step / 4) % cfg.chordIntervals.length;
      this._playPad(cfg.chordIntervals[chordIdx], vol, time);
    }
  }

  _playBass(freq, vol, t) {
    var ctx = this.ctx;
    var stepDur = (60 / this.config.bpm) / 4 / this.tempoMultiplier;
    var osc = ctx.createOscillator();
    osc.type = this.config.bassType || 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(vol * 0.12, t);
    gain.gain.setValueAtTime(vol * 0.10, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 1.8);
    osc.connect(gain);
    gain.connect(this.outputGain);
    osc.start(t);
    osc.stop(t + stepDur * 2);
  }

  _playMelody(freq, vol, t) {
    var ctx = this.ctx;
    var stepDur = (60 / this.config.bpm) / 4 / this.tempoMultiplier;
    var osc = ctx.createOscillator();
    osc.type = this.config.melodyType || 'sawtooth';
    osc.frequency.setValueAtTime(freq, t);
    var osc2 = ctx.createOscillator();
    osc2.type = this.config.melodyType || 'sawtooth';
    osc2.frequency.setValueAtTime(freq * 1.003, t);
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol * 0.06, t + 0.01);
    gain.gain.setValueAtTime(vol * 0.05, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 1.2);
    var gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0, t);
    gain2.gain.linearRampToValueAtTime(vol * 0.03, t + 0.01);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 1.2);
    osc.connect(gain);
    osc2.connect(gain2);
    gain.connect(this.melodyFilter);
    gain2.connect(this.melodyFilter);
    osc.start(t);
    osc.stop(t + stepDur * 1.5);
    osc2.start(t);
    osc2.stop(t + stepDur * 1.5);
  }

  _playPad(intervals, vol, t) {
    var ctx = this.ctx;
    var stepDur = (60 / this.config.bpm) / 4 / this.tempoMultiplier;
    var chordDur = stepDur * 4;
    for (var i = 0; i < intervals.length; i++) {
      var noteMidi = scaleNote(this.scale, this.config.key, intervals[i]);
      var freq = midiToFreq(noteMidi);
      var osc = ctx.createOscillator();
      osc.type = this.config.padType || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      var detune = (i - intervals.length / 2) * 5;
      osc.detune.setValueAtTime(detune, t);
      var gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol * 0.025, t + 0.1);
      gain.gain.setValueAtTime(vol * 0.02, t + chordDur * 0.6);
      gain.gain.exponentialRampToValueAtTime(0.001, t + chordDur * 0.95);
      osc.connect(gain);
      gain.connect(this.outputGain);
      osc.start(t);
      osc.stop(t + chordDur);
    }
  }

  _playDrums(step, vol, t) {
    var drums = this.config.drumPattern;
    if (!drums) return;
    if (drums.kick && drums.kick[step]) this._playKick(vol, t);
    if (drums.snare && drums.snare[step]) this._playSnare(vol, t);
    if (drums.hat && drums.hat[step]) this._playHiHat(vol, t);
  }

  _playKick(vol, t) {
    var ctx = this.ctx;
    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.08);
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(vol * 0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain);
    gain.connect(this.outputGain);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  _playSnare(vol, t) {
    var ctx = this.ctx;
    var noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx, 0.08);
    var noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 3000;
    var noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(vol * 0.10, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.outputGain);
    noise.start(t);
    noise.stop(t + 0.1);

    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.04);
    var oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(vol * 0.08, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(oscGain);
    oscGain.connect(this.outputGain);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  _playHiHat(vol, t) {
    var ctx = this.ctx;
    var noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx, 0.03);
    var filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 8000;
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(vol * 0.04, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.outputGain);
    noise.start(t);
    noise.stop(t + 0.05);
  }

  dispose() {
    this.stop();
    try { this.outputGain.disconnect(); } catch (e) { /* best-effort cleanup */ }
    try { this.melodyFilter.disconnect(); } catch (e) { /* best-effort cleanup */ }
  }
}


// ===== MAIN AUDIO ENGINE =====

class AudioEngine {
  constructor() {
    this.ctx = null;

    // Bus gain nodes
    this._masterGain = null;
    this._musicBus = null;
    this._sfxBus = null;
    this._ambientBus = null;
    this._voiceBus = null;
    this._compressor = null;

    // Cached settings (updated via updateSettings)
    this._settings = {
      masterVolume: 0.7,
      musicVolume: 0.5,
      sfxVolume: 0.8,
      ambientVolume: 0.5,
      voiceVolume: 0.7,
      musicOn: true,
      ttsEnabled: false,
      hapticsEnabled: true
    };

    // Music system
    this.musicGenerator = null;
    this.crossfadeGenerator = null;
    this.musicPlaying = false;

    // Ambient system (separate lifecycle)
    this.ambientPlaying = false;
    this.ambientTimers = [];

    // State
    this.correctCounter = 0;
    this._paused = false;
    this._lastPlayedEvent = null;
    this._lastPlayedTime = 0;
  }

  // ===== INITIALIZATION =====

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('Web Audio API not available');
      return;
    }

    // Create compressor/limiter at the end of the chain
    this._compressor = this.ctx.createDynamicsCompressor();
    this._compressor.threshold.value = -12;
    this._compressor.knee.value = 10;
    this._compressor.ratio.value = 4;
    this._compressor.attack.value = 0.003;
    this._compressor.release.value = 0.25;
    this._compressor.connect(this.ctx.destination);

    // Master gain → compressor
    this._masterGain = this.ctx.createGain();
    this._masterGain.connect(this._compressor);

    // Individual bus gains → master
    this._musicBus = this.ctx.createGain();
    this._musicBus.connect(this._masterGain);

    this._sfxBus = this.ctx.createGain();
    this._sfxBus.connect(this._masterGain);

    this._ambientBus = this.ctx.createGain();
    this._ambientBus.connect(this._masterGain);

    this._voiceBus = this.ctx.createGain();
    this._voiceBus.connect(this._masterGain);

    this.updateSettings();
  }

  unlock() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // ===== SETTINGS =====

  updateSettings() {
    // Read settings from storage using nullish coalescing for zero preservation
    this._settings = {
      masterVolume: storage.get('masterVolume') ?? 0.7,
      musicVolume: storage.get('musicVolume') ?? 0.5,
      sfxVolume: storage.get('sfxVolume') ?? 0.8,
      ambientVolume: storage.get('ambientVolume') ?? 0.5,
      voiceVolume: storage.get('voiceVolume') ?? 0.7,
      musicOn: storage.get('musicOn') ?? true,
      ttsEnabled: storage.get('ttsEnabled') ?? false,
      hapticsEnabled: storage.get('hapticsEnabled') ?? true
    };
    this._applyBusGains();
  }

  _applyBusGains() {
    if (!this._masterGain) return;
    var s = this._settings;
    this._masterGain.gain.value = s.masterVolume;
    if (this._musicBus) this._musicBus.gain.value = s.musicVolume;
    if (this._sfxBus) this._sfxBus.gain.value = s.sfxVolume;
    if (this._ambientBus) this._ambientBus.gain.value = s.ambientVolume;
    if (this._voiceBus) this._voiceBus.gain.value = s.voiceVolume;
  }

  _getSettingsForGenerator() {
    return this._settings;
  }

  // ===== HAPTIC FEEDBACK =====

  _vibrate(pattern) {
    if (this._settings.hapticsEnabled && navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch (e) { /* best-effort */ }
    }
  }

  // ===== DUPLICATE PREVENTION =====

  _canPlay(eventName) {
    var now = performance.now();
    if (this._lastPlayedEvent === eventName && now - this._lastPlayedTime < 30) {
      return false;
    }
    this._lastPlayedEvent = eventName;
    this._lastPlayedTime = now;
    return true;
  }

  // ===== SEMANTIC PLAY API =====

  play(eventName, options) {
    if (!this.ctx || this.ctx.state === 'suspended') {
      this.unlock();
    }
    if (!this.ctx) return;
    if (this._paused) return;

    var sfxVol = this._settings.masterVolume * this._settings.sfxVolume;
    if (sfxVol <= 0) return;
    if (!this._canPlay(eventName)) return;

    var opts = options || {};

    switch (eventName) {
      case 'correct':
        this._playCorrectVariation(sfxVol);
        this._vibrate(50);
        break;
      case 'wrong':
        this._playWrong(sfxVol);
        this._vibrate([30, 50, 30]);
        break;
      case 'coin':
        this._playCoinVariation(sfxVol, opts.lane);
        this._vibrate(15);
        break;
      case 'rush':
        this._playRush(sfxVol);
        this._vibrate([20, 30, 20, 30, 20]);
        break;
      case 'countdown':
        this._playCountdown(sfxVol);
        break;
      case 'countdown_go':
        this._playCountdownGo(sfxVol);
        break;
      case 'powerup':
        this._playPowerup(sfxVol);
        this._vibrate([40, 20, 40]);
        break;
      case 'continue':
        this._playContinue(sfxVol);
        break;
      case 'achievement':
        this._playAchievement(sfxVol);
        this._vibrate([30, 20, 30, 20, 60]);
        break;
      case 'heart':
        this._playHeart(sfxVol);
        this._vibrate([40, 30, 40]);
        break;
      case 'monster_close':
        this._playMonsterClose(sfxVol);
        this._vibrate([100, 50, 100]);
        break;
      case 'monster_consume':
        this._playMonsterConsume(sfxVol);
        this._vibrate([200, 100, 300]);
        break;
      case 'faceplant':
        this._playFaceplant(sfxVol);
        this._vibrate([80, 40, 120]);
        break;
      case 'map_transition':
        this._playMapTransition(sfxVol);
        break;
      case 'elimination':
        this._playElimination(sfxVol);
        this._vibrate([100, 50, 200]);
        break;
      case 'race_finish':
        this._playRaceFinish(sfxVol);
        this._vibrate([40, 20, 40, 20, 80]);
        break;
      case 'timer_warning':
        this._playTimerWarning(sfxVol);
        break;
      case 'jump':
        this._playJump(sfxVol);
        break;
      case 'land':
        this._playLand(sfxVol);
        break;
      case 'slide':
        this._playSlide(sfxVol);
        break;
      case 'shield_break':
        this._playShieldBreak(sfxVol);
        this._vibrate([60, 30, 60]);
        break;
      default:
        this._playGeneric(sfxVol);
        break;
    }
  }

  // ===== SFX IMPLEMENTATIONS =====

  _playCorrectVariation(vol) {
    var ctx = this.ctx;
    var t = ctx.currentTime;
    var g = ctx.createGain();
    g.connect(this._sfxBus);
    var o = ctx.createOscillator();
    o.type = 'sine';
    var pitchShift = (this.correctCounter % 5) * 30;
    var baseFreq = 523 + pitchShift;
    this.correctCounter++;
    var variation = Math.floor(Math.random() * 4);
    switch (variation) {
      case 0:
        o.frequency.setValueAtTime(baseFreq, t);
        o.frequency.setValueAtTime(baseFreq + 136, t + 0.06);
        o.frequency.setValueAtTime(baseFreq + 261, t + 0.12);
        break;
      case 1:
        o.frequency.setValueAtTime(baseFreq + 64, t);
        o.frequency.setValueAtTime(baseFreq + 175, t + 0.07);
        o.frequency.setValueAtTime(baseFreq + 357, t + 0.14);
        break;
      case 2:
        o.frequency.setValueAtTime(baseFreq - 83, t);
        o.frequency.setValueAtTime(baseFreq + 31, t + 0.06);
        o.frequency.setValueAtTime(baseFreq + 136, t + 0.12);
        o.frequency.setValueAtTime(baseFreq + 357, t + 0.18);
        break;
      case 3:
        o.frequency.setValueAtTime(baseFreq + 136, t);
        o.frequency.setValueAtTime(baseFreq + 261, t + 0.05);
        o.frequency.setValueAtTime(baseFreq + 465, t + 0.1);
        break;
    }
    g.gain.setValueAtTime(vol * 0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g); o.start(t); o.stop(t + 0.25);
  }

  _playWrong(vol) {
    var ctx = this.ctx; var t = ctx.currentTime;
    var g = ctx.createGain(); g.connect(this._sfxBus);
    var o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(200, t);
    o.frequency.setValueAtTime(130, t + 0.1);
    g.gain.setValueAtTime(vol * 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g); o.start(t); o.stop(t + 0.18);
  }

  _playCoinVariation(vol, lane) {
    var ctx = this.ctx; var t = ctx.currentTime;
    var g = ctx.createGain();
    var panner = null;
    if (typeof ctx.createStereoPanner === 'function') {
      panner = ctx.createStereoPanner();
      var panValue = 0;
      if (lane === 0) panValue = -0.7;
      else if (lane === 2) panValue = 0.7;
      panner.pan.setValueAtTime(panValue, t);
      g.connect(panner);
      panner.connect(this._sfxBus);
    } else {
      g.connect(this._sfxBus);
    }
    var o = ctx.createOscillator(); o.type = 'sine';
    var variation = Math.floor(Math.random() * 4);
    switch (variation) {
      case 0: o.frequency.setValueAtTime(988, t); o.frequency.setValueAtTime(1318, t + 0.04); break;
      case 1: o.frequency.setValueAtTime(1047, t); o.frequency.setValueAtTime(1397, t + 0.04); break;
      case 2: o.frequency.setValueAtTime(880, t); o.frequency.setValueAtTime(1175, t + 0.03); o.frequency.setValueAtTime(1480, t + 0.06); break;
      case 3: o.frequency.setValueAtTime(1175, t); o.frequency.setValueAtTime(1480, t + 0.04); break;
    }
    g.gain.setValueAtTime(vol * 0.09, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(g); o.start(t); o.stop(t + 0.1);
  }

  _playRush(vol) {
    var ctx = this.ctx; var t = ctx.currentTime;
    var g1 = ctx.createGain(); g1.connect(this._sfxBus);
    var o1 = ctx.createOscillator(); o1.type = 'sine';
    o1.frequency.setValueAtTime(400, t);
    o1.frequency.exponentialRampToValueAtTime(1600, t + 0.12);
    g1.gain.setValueAtTime(vol * 0.1, t);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o1.connect(g1); o1.start(t); o1.stop(t + 0.15);
    var g2 = ctx.createGain(); g2.connect(this._sfxBus);
    var o2 = ctx.createOscillator(); o2.type = 'triangle';
    o2.frequency.setValueAtTime(800, t);
    o2.frequency.exponentialRampToValueAtTime(2400, t + 0.1);
    g2.gain.setValueAtTime(vol * 0.06, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o2.connect(g2); o2.start(t); o2.stop(t + 0.12);
  }

  _playCountdown(vol) {
    var ctx = this.ctx; var t = ctx.currentTime;
    var g = ctx.createGain(); g.connect(this._sfxBus);
    var o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(660, t);
    g.gain.setValueAtTime(vol * 0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(g); o.start(t); o.stop(t + 0.1);
  }

  _playCountdownGo(vol) {
    var ctx = this.ctx; var t = ctx.currentTime;
    var g = ctx.createGain(); g.connect(this._sfxBus);
    var o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(880, t);
    o.frequency.setValueAtTime(1100, t + 0.08);
    g.gain.setValueAtTime(vol * 0.14, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g); o.start(t); o.stop(t + 0.2);
  }

  _playPowerup(vol) {
    var ctx = this.ctx; var t = ctx.currentTime;
    var g = ctx.createGain(); g.connect(this._sfxBus);
    var o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(440, t);
    o.frequency.exponentialRampToValueAtTime(1760, t + 0.3);
    g.gain.setValueAtTime(vol * 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g); o.start(t); o.stop(t + 0.35);
  }

  _playContinue(vol) {
    var ctx = this.ctx; var t = ctx.currentTime;
    var g = ctx.createGain(); g.connect(this._sfxBus);
    var o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(330, t);
    o.frequency.setValueAtTime(440, t + 0.1);
    o.frequency.setValueAtTime(550, t + 0.2);
    o.frequency.setValueAtTime(660, t + 0.3);
    o.frequency.setValueAtTime(880, t + 0.4);
    g.gain.setValueAtTime(vol * 0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g); o.start(t); o.stop(t + 0.5);
  }

  _playAchievement(vol) {
    var ctx = this.ctx; var t = ctx.currentTime;
    var g = ctx.createGain(); g.connect(this._sfxBus);
    var o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(523, t);
    o.frequency.setValueAtTime(659, t + 0.1);
    o.frequency.setValueAtTime(784, t + 0.2);
    o.frequency.setValueAtTime(1047, t + 0.3);
    g.gain.setValueAtTime(vol * 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g); o.start(t); o.stop(t + 0.5);
  }

  _playHeart(vol) {
    var ctx = this.ctx; var t = ctx.currentTime;
    var g = ctx.createGain(); g.connect(this._sfxBus);
    var o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(330, t);
    o.frequency.setValueAtTime(440, t + 0.08);
    o.frequency.setValueAtTime(550, t + 0.16);
    g.gain.setValueAtTime(vol * 0.14, t);
    g.gain.setValueAtTime(vol * 0.12, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g); o.start(t); o.stop(t + 0.35);
    var g2 = ctx.createGain(); g2.connect(this._sfxBus);
    var o2 = ctx.createOscillator(); o2.type = 'triangle';
    o2.frequency.setValueAtTime(660, t + 0.05);
    o2.frequency.setValueAtTime(880, t + 0.15);
    g2.gain.setValueAtTime(vol * 0.06, t + 0.05);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o2.connect(g2); o2.start(t + 0.05); o2.stop(t + 0.35);
  }

  _playMonsterClose(vol) {
    var ctx = this.ctx; var t = ctx.currentTime;
    var g = ctx.createGain(); g.connect(this._sfxBus);
    var o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(40, t);
    o.frequency.linearRampToValueAtTime(80, t + 0.4);
    var filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 200; filter.Q.value = 5;
    g.gain.setValueAtTime(vol * 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(filter); filter.connect(g);
    o.start(t); o.stop(t + 0.5);
    var noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx, 0.3);
    var nFilter = ctx.createBiquadFilter();
    nFilter.type = 'lowpass'; nFilter.frequency.value = 150;
    var nGain = ctx.createGain();
    nGain.gain.setValueAtTime(vol * 0.06, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    noise.connect(nFilter); nFilter.connect(nGain); nGain.connect(this._sfxBus);
    noise.start(t); noise.stop(t + 0.4);
  }

  _playMonsterConsume(vol) {
    var ctx = this.ctx; var t = ctx.currentTime;
    var g = ctx.createGain(); g.connect(this._sfxBus);
    var o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(400, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.6);
    g.gain.setValueAtTime(vol * 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    var distortion = ctx.createWaveShaperNode();
    var curve = new Float32Array(256);
    for (var i = 0; i < 256; i++) {
      var x = (i / 128) - 1;
      curve[i] = (Math.PI + 10) * x / (Math.PI + 10 * Math.abs(x));
    }
    distortion.curve = curve;
    o.connect(distortion); distortion.connect(g);
    o.start(t); o.stop(t + 0.8);
    var noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx, 0.15);
    var nGain = ctx.createGain();
    nGain.gain.setValueAtTime(vol * 0.15, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    noise.connect(nGain); nGain.connect(this._sfxBus);
    noise.start(t); noise.stop(t + 0.2);
  }

  _playFaceplant(vol) {
    var ctx = this.ctx; var t = ctx.currentTime;
    var g = ctx.createGain(); g.connect(this._sfxBus);
    var o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    g.gain.setValueAtTime(vol * 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g); o.start(t); o.stop(t + 0.25);
    var noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx, 0.1);
    var nFilter = ctx.createBiquadFilter();
    nFilter.type = 'bandpass'; nFilter.frequency.value = 800; nFilter.Q.value = 1;
    var nGain = ctx.createGain();
    nGain.gain.setValueAtTime(vol * 0.08, t + 0.05);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    noise.connect(nFilter); nFilter.connect(nGain); nGain.connect(this._sfxBus);
    noise.start(t + 0.05); noise.stop(t + 0.2);
  }

  _playMapTransition(vol) {
    var ctx = this.ctx; var t = ctx.currentTime;
    var g = ctx.createGain(); g.connect(this._sfxBus);
    var o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(200, t);
    o.frequency.exponentialRampToValueAtTime(1200, t + 0.5);
    var filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(400, t);
    filter.frequency.exponentialRampToValueAtTime(2000, t + 0.5);
    filter.Q.value = 2;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol * 0.1, t + 0.15);
    g.gain.linearRampToValueAtTime(0, t + 0.6);
    o.connect(filter); filter.connect(g);
    o.start(t); o.stop(t + 0.65);
    var g2 = ctx.createGain(); g2.connect(this._sfxBus);
    var o2 = ctx.createOscillator(); o2.type = 'triangle';
    o2.frequency.setValueAtTime(800, t + 0.1);
    o2.frequency.exponentialRampToValueAtTime(2400, t + 0.5);
    g2.gain.setValueAtTime(vol * 0.04, t + 0.1);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    o2.connect(g2); o2.start(t + 0.1); o2.stop(t + 0.6);
  }

  _playElimination(vol) {
    var ctx = this.ctx; var t = ctx.currentTime;
    var freqs = [330, 392, 466];
    for (var i = 0; i < freqs.length; i++) {
      var g = ctx.createGain(); g.connect(this._sfxBus);
      var o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(freqs[i], t);
      o.frequency.exponentialRampToValueAtTime(freqs[i] * 0.5, t + 0.4);
      var filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(3000, t);
      filter.frequency.exponentialRampToValueAtTime(200, t + 0.4);
      g.gain.setValueAtTime(vol * 0.08, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      o.connect(filter); filter.connect(g);
      o.start(t); o.stop(t + 0.5);
    }
  }

  _playRaceFinish(vol) {
    var ctx = this.ctx; var t = ctx.currentTime;
    var notes = [523, 659, 784, 1047];
    for (var i = 0; i < notes.length; i++) {
      var delay = i * 0.08;
      var g = ctx.createGain(); g.connect(this._sfxBus);
      var o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(notes[i], t + delay);
      g.gain.setValueAtTime(0, t + delay);
      g.gain.linearRampToValueAtTime(vol * 0.15, t + delay + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.4);
      o.connect(g); o.start(t + delay); o.stop(t + delay + 0.45);
    }
  }

  _playTimerWarning(vol) {
    var ctx = this.ctx; var t = ctx.currentTime;
    var g = ctx.createGain(); g.connect(this._sfxBus);
    var o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(1200, t);
    g.gain.setValueAtTime(vol * 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    o.connect(g); o.start(t); o.stop(t + 0.04);
  }

  // Dedicated jump sound (not reusing countdown)
  _playJump(vol) {
    var ctx = this.ctx; var t = ctx.currentTime;
    var g = ctx.createGain(); g.connect(this._sfxBus);
    var o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(300, t);
    o.frequency.exponentialRampToValueAtTime(600, t + 0.08);
    g.gain.setValueAtTime(vol * 0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(g); o.start(t); o.stop(t + 0.12);
  }

  // Dedicated land sound
  _playLand(vol) {
    var ctx = this.ctx; var t = ctx.currentTime;
    var g = ctx.createGain(); g.connect(this._sfxBus);
    var o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(200, t);
    o.frequency.exponentialRampToValueAtTime(80, t + 0.06);
    g.gain.setValueAtTime(vol * 0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(g); o.start(t); o.stop(t + 0.1);
  }

  // Dedicated slide sound (not reusing countdown)
  _playSlide(vol) {
    var ctx = this.ctx; var t = ctx.currentTime;
    var noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx, 0.1);
    var filter = ctx.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = 2000; filter.Q.value = 1;
    var g = ctx.createGain(); g.connect(this._sfxBus);
    g.gain.setValueAtTime(vol * 0.06, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    noise.connect(filter); filter.connect(g);
    noise.start(t); noise.stop(t + 0.15);
  }

  _playShieldBreak(vol) {
    var ctx = this.ctx; var t = ctx.currentTime;
    var g = ctx.createGain(); g.connect(this._sfxBus);
    var o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(800, t);
    o.frequency.exponentialRampToValueAtTime(200, t + 0.15);
    g.gain.setValueAtTime(vol * 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g); o.start(t); o.stop(t + 0.22);
    var noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx, 0.1);
    var nGain = ctx.createGain(); nGain.connect(this._sfxBus);
    nGain.gain.setValueAtTime(vol * 0.1, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    noise.connect(nGain);
    noise.start(t); noise.stop(t + 0.15);
  }

  _playGeneric(vol) {
    var ctx = this.ctx; var t = ctx.currentTime;
    var g = ctx.createGain(); g.connect(this._sfxBus);
    var o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(440, t);
    g.gain.setValueAtTime(vol * 0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(g); o.start(t); o.stop(t + 0.1);
  }

  // ===== STREAK SOUND =====

  playStreakSound(streak) {
    if (!this.ctx || this._paused) return;
    var sfxVol = this._settings.masterVolume * this._settings.sfxVolume;
    if (sfxVol <= 0) return;
    var ctx = this.ctx; var t = ctx.currentTime;
    var g = ctx.createGain(); g.connect(this._sfxBus);
    var o = ctx.createOscillator(); o.type = 'sine';
    var baseFreq = 523 + Math.min(streak, 50) * 10;
    var noteCount = Math.min(3 + Math.floor(streak / 10), 6);
    var duration = 0.055;
    for (var i = 0; i < noteCount; i++) {
      o.frequency.setValueAtTime(baseFreq * (1 + i * 0.18), t + i * duration);
    }
    g.gain.setValueAtTime(sfxVol * 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + noteCount * duration + 0.12);
    o.connect(g); o.start(t); o.stop(t + noteCount * duration + 0.12);
    this.correctCounter = 0;
  }

  // ===== TTS =====

  speak(text, options) {
    if (!this._settings.ttsEnabled || !window.speechSynthesis) return;
    if (this._paused) return;
    var opts = options || {};
    var gameSpeed = opts.gameSpeed || 10;
    var arrivalTime = 60 / gameSpeed;
    var wordCount = text.split(/[\s.]+/).filter(function (w) { return w.length > 0; }).length;
    var naturalDuration = wordCount * 0.4;
    var targetDuration = Math.max(0.5, arrivalTime - 0.5);
    var rate = naturalDuration / targetDuration;
    rate = Math.max(0.5, Math.min(3.0, rate));
    var u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    u.volume = this._settings.masterVolume * this._settings.voiceVolume;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  cancelSpeech() {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }

  // ===== MUSIC (procedural, per-skin) =====

  startMusic(skinId) {
    if (this.musicPlaying) return;
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    this.musicPlaying = true;
    if (!this._musicBus) return;

    var name = skinId || 'Neural Highway';
    if (this.musicGenerator) {
      this.musicGenerator.dispose();
    }
    var self = this;
    this.musicGenerator = new MusicGenerator(
      this.ctx,
      this._musicBus,
      name,
      function () { return self._getSettingsForGenerator(); }
    );
    this.musicGenerator.play();
  }

  changeMusicTheme(skinId, durationSeconds) {
    if (!this.ctx || !this.musicPlaying) return;
    var duration = durationSeconds ?? 3.0;
    var name = skinId || 'Neural Highway';

    if (this.musicGenerator) {
      this.musicGenerator.fadeOut(duration);
    }
    if (this.crossfadeGenerator) {
      this.crossfadeGenerator.stop();
      this.crossfadeGenerator.dispose();
    }

    var self = this;
    var newGen = new MusicGenerator(
      this.ctx,
      this._musicBus,
      name,
      function () { return self._getSettingsForGenerator(); }
    );
    newGen.fadeIn(duration);

    setTimeout(function () {
      if (self.musicGenerator) {
        self.musicGenerator.dispose();
      }
      self.musicGenerator = newGen;
      self.crossfadeGenerator = null;
    }, (duration + 0.5) * 1000);

    this.crossfadeGenerator = newGen;
  }

  stopMusic(options) {
    this.musicPlaying = false;
    if (this.musicGenerator) {
      this.musicGenerator.stop();
    }
    if (this.crossfadeGenerator) {
      this.crossfadeGenerator.stop();
      this.crossfadeGenerator.dispose();
      this.crossfadeGenerator = null;
    }
  }

  // ===== AMBIENT (separate lifecycle from music) =====

  startAmbient(skinId) {
    this.stopAmbient();
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    this.ambientPlaying = true;

    var skinName = skinId || 'Neural Highway';
    this._startEnvironmentalFX(skinName);
  }

  _startEnvironmentalFX(skinName) {
    var self = this;
    var vol = this._settings.masterVolume * this._settings.ambientVolume * 0.02;

    var hospitalSkins = ['Neon ER', 'Surgical Theater', 'Cardiac Pulse'];
    var natureSkins = ['Cellular Matrix', 'DNA Helix Tunnel'];

    function scheduleBeep() {
      if (!self.ambientPlaying) return;
      var delay = 3000 + Math.random() * 8000;
      var timer = setTimeout(function () {
        if (!self.ambientPlaying || !self.ctx || self._paused) return;
        var t = self.ctx.currentTime;
        var g = self.ctx.createGain(); g.connect(self._ambientBus);
        var o = self.ctx.createOscillator(); o.type = 'sine';
        if (hospitalSkins.indexOf(skinName) >= 0) {
          o.frequency.setValueAtTime(1000, t);
          g.gain.setValueAtTime(vol, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
          o.connect(g); o.start(t); o.stop(t + 0.08);
        } else if (natureSkins.indexOf(skinName) >= 0) {
          o.frequency.setValueAtTime(400 + Math.random() * 300, t);
          o.frequency.exponentialRampToValueAtTime(200, t + 0.1);
          g.gain.setValueAtTime(vol * 0.5, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
          o.connect(g); o.start(t); o.stop(t + 0.15);
        } else {
          o.frequency.setValueAtTime(800 + Math.random() * 400, t);
          g.gain.setValueAtTime(vol * 0.3, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
          o.connect(g); o.start(t); o.stop(t + 0.05);
        }
        scheduleBeep();
      }, delay);
      self.ambientTimers.push(timer);
    }

    scheduleBeep();
  }

  stopAmbient() {
    for (var i = 0; i < this.ambientTimers.length; i++) {
      clearTimeout(this.ambientTimers[i]);
    }
    this.ambientTimers = [];
    this.ambientPlaying = false;
    // NOTE: Does NOT stop music. Music and ambient have separate lifecycles.
  }

  // ===== SPEED-REACTIVE TEMPO =====

  updateSpeedPitch(baseSpeed, currentSpeed) {
    var ratio = currentSpeed / Math.max(baseSpeed, 0.01);
    if (this.musicGenerator && ratio > 1.1) {
      this.musicGenerator.setTempoMultiplier(Math.min(ratio * 0.7 + 0.3, 1.3));
    }
  }

  // ===== PAUSE / RESUME =====

  pause(reason) {
    this._paused = true;
    if (this.musicGenerator) {
      this.musicGenerator.stop();
    }
    if (this.crossfadeGenerator) {
      this.crossfadeGenerator.stop();
    }
    this.cancelSpeech();
    // Pause ambient timers by clearing them
    for (var i = 0; i < this.ambientTimers.length; i++) {
      clearTimeout(this.ambientTimers[i]);
    }
    this.ambientTimers = [];
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend();
    }
  }

  resume(reason) {
    this._paused = false;
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    if (this.musicPlaying && this.musicGenerator) {
      this.musicGenerator.play();
    }
    if (this.musicPlaying && this.crossfadeGenerator) {
      this.crossfadeGenerator.play();
    }
    // Ambient FX will need to be restarted if they were playing
    // The caller (main.js) should call startAmbient again if needed
  }

  // ===== DISPOSE =====

  dispose() {
    this.stopMusic();
    this.stopAmbient();
    this.cancelSpeech();
    if (this.musicGenerator) {
      this.musicGenerator.dispose();
      this.musicGenerator = null;
    }
    if (this.crossfadeGenerator) {
      this.crossfadeGenerator.dispose();
      this.crossfadeGenerator = null;
    }
    if (this.ctx) {
      try { this.ctx.close(); } catch (e) { /* best-effort cleanup */ }
      this.ctx = null;
    }
    this._masterGain = null;
    this._musicBus = null;
    this._sfxBus = null;
    this._ambientBus = null;
    this._voiceBus = null;
    this._compressor = null;
  }
}

export var audio = new AudioEngine();
