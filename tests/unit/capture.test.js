import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { FEATURES } from '../../js/features.js';

describe('the screenshot mode never reaches players', () => {
  it('is off unless a build asks for it', () => {
    expect(FEATURES.capture).toBe(false);
  });
  it('is only loaded behind the feature flag and a ?capture= page', () => {
    const main = fs.readFileSync('js/main.js', 'utf8');
    expect(main).toMatch(/import\.meta\.env\.VITE_FEATURE_CAPTURE === '1' && \/\[\?&\]capture=\//);
    expect(main.match(/import\('\.\/capture\.js'\)/g).length).toBe(1);
    expect(main).not.toMatch(/^import .* from '\.\/capture\.js'/m);
  });
  it('the deploy workflow does not set the flag', () => {
    for (const f of fs.readdirSync('.github/workflows')) expect(fs.readFileSync('.github/workflows/' + f, 'utf8'), f).not.toMatch(/VITE_FEATURE_CAPTURE/);
  });
});
