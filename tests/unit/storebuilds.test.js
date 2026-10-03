import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { APP_SCHEME } from '../../js/native.js';

/**
 * The App Store build is made in the cloud from the same code as the Android build, with its own project files.
 * These checks keep what the code relies on in step with what each store build provides.
 */
const codemagic = readFileSync('codemagic.yaml', 'utf8');
const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const config = JSON.parse(readFileSync('capacitor.config.json', 'utf8'));

describe('both store builds', () => {
  it('open the app from the same email-link scheme the code expects', () => {
    expect(manifest).toContain('android:scheme="' + APP_SCHEME + '"');
    expect(codemagic).toContain('CFBundleURLSchemes:0 string ' + APP_SCHEME);
    expect(config.appId).toBe(APP_SCHEME);
    expect(codemagic).toContain('bundle_identifier: ' + APP_SCHEME);
  });

  it('get every native plugin the code imports (the iPhone project is generated from package.json)', () => {
    const imported = new Set();
    for (const f of ['native', 'platform', 'review', 'tts', 'reminders']) {
      for (const m of readFileSync('js/' + f + '.js', 'utf8').matchAll(/import\('(@capacitor[^']*)'\)/g)) imported.add(m[1]);
    }
    expect(imported.size).toBeGreaterThanOrEqual(8);
    for (const name of imported) expect(pkg.dependencies[name], name + ' is imported but not a dependency').toBeTruthy();
  });

  it('run the same web build, and the iPhone build is portrait only like the phone layout', () => {
    expect(codemagic).toMatch(/npx vite build/);
    expect(codemagic).toMatch(/UIInterfaceOrientationPortrait/);
    expect(codemagic).toMatch(/cap sync ios/);
  });

  it('never rely on an Android-only address without checking the platform first', () => {
    const review = readFileSync('js/review.js', 'utf8');
    expect(review).toMatch(/platform === 'android'/);
    expect(review).toMatch(/platform === 'ios'/);
    // market:// is only ever produced inside the android branch
    const lines = review.split('\n');
    const i = lines.findIndex((l) => l.includes("'market://"));
    expect(lines.slice(Math.max(0, i - 3), i).join('\n')).toMatch(/android/);
  });
});
