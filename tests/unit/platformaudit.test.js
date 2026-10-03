import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The phone app runs the game inside an Android web view, which is missing several things a browser has
 * (share sheet, blob downloads, speech, notifications) and serves the page from https://localhost.
 * Bugs of this kind slipped through because tests ran in a desktop browser. This test reads the source and fails
 * when a screen reaches for one of those APIs directly instead of going through the wrapper that handles the app.
 */

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === 'cards' ? [] : walk(p);
    return p.endsWith('.js') ? [p] : [];
  });
}
const files = walk('js').map((p) => ({ p: p.replace(/\\/g, '/'), src: readFileSync(p, 'utf8') }));

// [pattern, files allowed to use it, what to use instead]
const RULES = [
  [/navigator\.share\b/, ['js/platform.js', 'js/sharecard.js'], 'platform.shareText (sharecard.js shares files, then falls back to platform.saveFile)'],
  [/navigator\.clipboard/, ['js/platform.js'], 'platform.copyText'],
  [/execCommand\(/, ['js/platform.js'], 'platform.copyText'],
  [/createObjectURL/, ['js/platform.js'], 'platform.saveFile'],
  [/\bwindow\.open\(/, ['js/platform.js'], 'platform.openExternal'],
  [/speechSynthesis|SpeechSynthesisUtterance/, ['js/tts.js'], 'tts.speak'],
  [/new Notification\(/, ['js/main.js', 'js/reminders.js'], 'reminders.js (main.js holds the browser-only branch)'],
  [/location\.origin|location\.href/, ['js/native.js', 'js/publicurl.js', 'js/multiplayer.js'], 'publicurl.appPublicUrl() for any link a friend will open']
];

describe('phone-app safety: no raw browser-only APIs in screens', () => {
  RULES.forEach(([re, allowed, instead]) => {
    it('only ' + allowed.join(', ') + ' may use ' + re, () => {
      const offenders = files.filter((f) => re.test(f.src) && !allowed.includes(f.p)).map((f) => f.p);
      expect(offenders, 'use ' + instead).toEqual([]);
    });
  });
});
