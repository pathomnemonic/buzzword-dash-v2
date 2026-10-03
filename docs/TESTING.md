# How the game is tested, and why

Most bugs found by hand shared a handful of root causes. Each root cause now has a test that fails on the *kind* of
bug, not just the one instance. When you find a new bug, first ask which theme it belongs to; if none fits, add one.

| Theme (what went wrong) | Example found | What catches the whole class |
|---|---|---|
| **A name that does not exist is silently "falsy"** (`QUEST_IDS.MARATHON` is `undefined`, so nothing ever completes) | Quests never showed complete; 18 badges could never be earned | `tests/unit/contracts.test.js` (every `CONSTANT.MEMBER` resolves, every sound / screen / tour target exists), `achievements.test.js` (every badge has an award path and real play awards it), `storagekeys.test.js` (every storage key has a default), `quests.test.js` (every quest metric is something a run reports) |
| **Works in a desktop browser, not in the phone app** (Android web view has no speech, notifications, share sheet or blob downloads, and is served from `https://localhost`) | "Not supported" for read-aloud and notifications; share link was a localhost link | Wrappers `js/tts.js`, `js/reminders.js`, `js/platform.js`, `js/publicurl.js`; `platformaudit.test.js` fails if a screen calls `navigator.share`, `navigator.clipboard`, `speechSynthesis`, `createObjectURL`, `window.open`, `new Notification` or `location.origin` directly; each wrapper has unit tests with the native plugin faked and with the browser API removed |
| **Looks interactive but does nothing** (an arrow with no action, a number with no next step) | Weakest topics arrow; Today popup with no buttons | `tests/e2e/deadcontrols.spec.js` clicks every control on every main screen and fails if nothing observable happens |
| **Stale state at the moment of truth** (a value read at the wrong time) | Last-second lane change counted the old lane; stale question on a new run | `gatefixes.test.js` (rule), `tests/e2e/lanelock.spec.js` (real engine, lane switched at random moments up to the last instant) |
| **Rendering order / transparency** | Coins, monster and power-ups vanished under the lamp's light cone | `gatefixes.test.js` builds every track and fails if a see-through material writes depth |
| **A number whose meaning is not obvious** | "Memory 99%" next to 60% accuracy | Removed; every number on Stats is derived from the same stats and labelled in plain words (`statsview.test.js`) |
| **Built but not wired, or not explained** | Importer with no instructions and a server box that did nothing | `importflow.test.js` simulates a real Anki export and an AI chat's reply end to end |
| **One rotating set is too small** | Same quests every day | `quests.test.js` checks the pool size, one per category, no repeat of yesterday, wide coverage over two months |

## Running everything

```
npm run lint && npx tsc -p tsconfig.checked.json
npx vitest run                       # unit tests (jsdom), ~700 tests
npm run build && npx vite preview --port 4173 &
npx playwright test                  # browser tests, desktop and phone-sized
node tools/soak.mjs --minutes 30     # long random-input run: crashes and memory growth
```

Do not rebuild `dist/` while Playwright is running; the preview server serves files from it.

## Rules of thumb when adding code

- Use the wrappers in `platform.js`, `tts.js`, `reminders.js`, `publicurl.js` for anything the phone app handles differently.
- Look things up through the exported tables (`QUEST_IDS`, `ACHIEVEMENT_IDS`, `GAME_MODES`...) and never hard-code the string next to `||` as a fallback: a wrong fallback hides the bug.
- If a screen shows a count, name or warning, give it a button that does the obvious next thing, or make it plainly non-interactive.
- A new setting must be read somewhere (the settings audit fails otherwise).
