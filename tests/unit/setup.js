// tests/unit/setup.js
// Global test setup for Vitest unit tests

// Mock Web Audio API for audio.js tests
globalThis.AudioContext = class MockAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.destination = { channelCount: 2 };
  }
  createGain() {
    return {
      gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() {},
      disconnect() {}
    };
  }
  createOscillator() {
    return {
      type: 'sine',
      frequency: { value: 440, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} },
      detune: { value: 0, setValueAtTime() {} },
      connect() {},
      start() {},
      stop() {},
      disconnect() {}
    };
  }
  createBiquadFilter() {
    return {
      type: 'lowpass',
      frequency: { value: 350, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      Q: { value: 1 },
      connect() {},
      disconnect() {}
    };
  }
  createBuffer(channels, length, sampleRate) {
    return {
      getChannelData() { return new Float32Array(length); }
    };
  }
  createBufferSource() {
    return {
      buffer: null,
      connect() {},
      start() {},
      stop() {},
      disconnect() {}
    };
  }
  createStereoPanner() {
    return {
      pan: { value: 0, setValueAtTime() {} },
      connect() {},
      disconnect() {}
    };
  }
  createWaveShaperNode() {
    return {
      curve: null,
      connect() {},
      disconnect() {}
    };
  }
  resume() { return Promise.resolve(); }
};

globalThis.webkitAudioContext = globalThis.AudioContext;

// Mock speechSynthesis
globalThis.speechSynthesis = {
  speak() {},
  cancel() {}
};

globalThis.SpeechSynthesisUtterance = class {
  constructor(text) { this.text = text; }
};

// Mock navigator.vibrate
if (!navigator.vibrate) {
  navigator.vibrate = () => true;
}

// Mock localStorage for storage.js tests
const localStorageMock = (() => {
  let store = {};
  return {
    getItem(key) { return store[key] ?? null; },
    setItem(key, value) { store[key] = String(value); },
    removeItem(key) { delete store[key]; },
    clear() { store = {}; },
    get length() { return Object.keys(store).length; },
    key(i) { return Object.keys(store)[i] ?? null; }
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });
