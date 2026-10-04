import { describe, it, expect } from 'vitest';

// Right/wrong gate colours (js/game/gates.js). Simulated with the Machado et al. (2009) matrices for full colour-vision deficiency.
const PAIRS = { default: [0x00cc55, 0xcc0000], colorblindMode: [0x0072b2, 0xe69f00] };
const M = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]]
};
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const toLin = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map(lin);
const sim = (rgb, m) => m.map((row) => Math.min(1, Math.max(0, row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2])));
const lum = (rgb) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('right and wrong gate colours stay apart for colour-blind players', () => {
  Object.keys(M).forEach((kind) => {
    it(`${kind}: the colour-blind pair differs clearly`, () => {
      const [a, b] = PAIRS.colorblindMode.map((h) => sim(toLin(h), M[kind]));
      expect(dist(a, b)).toBeGreaterThan(0.25);
    });
    it(`${kind}: the default pair differs in brightness, so it never relies on hue alone`, () => {
      const [a, b] = PAIRS.default.map((h) => sim(toLin(h), M[kind]));
      const ratio = (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
      expect(ratio).toBeGreaterThan(1.8);
    });
  });
});
