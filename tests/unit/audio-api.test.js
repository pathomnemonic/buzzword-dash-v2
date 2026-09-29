// Guards against calling Web Audio methods that do not exist (for example
// createWaveShaperNode), which would throw at runtime inside game events.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const VALID_CONTEXT_FACTORIES = [
  'createAnalyser', 'createBiquadFilter', 'createBuffer', 'createBufferSource',
  'createChannelMerger', 'createChannelSplitter', 'createConstantSource',
  'createConvolver', 'createDelay', 'createDynamicsCompressor', 'createGain',
  'createIIRFilter', 'createMediaElementSource', 'createMediaStreamDestination',
  'createMediaStreamSource', 'createOscillator', 'createPanner', 'createPeriodicWave',
  'createScriptProcessor', 'createStereoPanner', 'createWaveShaper'
];

describe('audio.js Web Audio usage', () => {
  it('only calls context factory methods that exist', () => {
    const src = readFileSync('js/audio.js', 'utf8');
    const used = [...new Set([...src.matchAll(/\b(?:ctx|context)\.(create[A-Za-z]+)\(/g)].map((m) => m[1]))];
    expect(used.length).toBeGreaterThan(3);
    for (const name of used) {
      expect(VALID_CONTEXT_FACTORIES, name).toContain(name);
    }
  });
});
