# Orion pickup list (23 Nov 2026)

Architectural calls stay with the Dx Dash owner session. Everything below is small and scoped.

## 1. Confirm CI is green on main
- Run: GitHub Actions `ci.yml` on `main`; read the e2e matrix (chromium, firefox, webkit).
- Known local result (chromium, heavy parallel load, flag-on build `VITE_FEATURE_LOCKER_ITEMS=1`): `deadcontrols.spec.js` 4 failures, all `CLICK FAILED: Timeout 8000ms` (Card browser; settings study/rules/data: "Help fix problems", CSV, Save). Likely load/overlay timing, not dead controls. Re-run with `--workers=1`; if they still fail, check whether `#tutorialOverlay` or the daily-reward overlay covers the control (helpers in `tests/e2e/helpers.js`).
- The earlier "Open decks credits" `<summary>` flag (`js/opendecksui.js:91`) did NOT reproduce in this run.
- WebKit job is very slow and was failing before; do not block on it, report counts.

## 2. Axe on Home popups
- `tests/e2e/a11y.spec.js`: check `#studyGoal` and `#streakChip` popups for `label-content-name-mismatch`. Fix = make each aria-label contain the visible text (same pattern as `js/statsview.js`, commit "Stats screen: accessible names contain the visible text"). Verify: that spec green on chromium.

## 3. Pinned badges timeout
- `tests/e2e/fit.spec.js:283`. Re-run alone; if it still times out, report the error context.

## Not for pickup (needs the owner)
- Parity items 1-11 beyond what exists; Play Console steps; iOS/Codemagic; Supabase Pro upgrade (backups).

## Update 23 Nov (after live play-through and CI verdict on 9788942)
Fixed in code (verify live after the deploy): F1 reset-all and restore-backup now use an in-page box (`js/uisettings.js`, `js/ui.js`); F4 flashcard sessions now add to Lifetime/Accuracy and the "correct answers" and subjects quests (`js/storage.js` finalizeFlashcardSession); F5 Home, Stats and the picker count due cards one way (`liveDueCount` in `js/statsview.js`); Terms operator is now PathoMnemonic (no personal name anywhere in the repo).
Verify: Settings > Backup & data > Reset all progress opens a box (use a throwaway profile); a 10-card flashcard session changes Lifetime and Accuracy; Home "due" equals Stats "Due now" equals the Flashcards picker.

### For Orion to do (no architecture needed)
1. F2 daily reward: by design the coins are credited BEFORE the dialog (see the docstring in `js/rewardsui.js`), and the dialog's streak is the login streak, not the study streak. Check with a fresh profile whether coins rise when the dialog appears; if so it is not a bug. Report back.
2. F8 locker affordability: reproduce with `window.__storage.get('coins')` and `window.__ui._lockerFresh` in the console (`?debug=1`) while the dots show; send me both values and the ids. Premium items have price 0 so they should never appear; I need the ids to find out why 300+ coin items do.
3. F14 report export: after "Report a problem", run `JSON.stringify(window.__storage.get('cardReports'))` and tell me whether the report was stored. If stored, only the export is wrong (`js/cardreport.js`).
4. Firefox `#flashcardBtn` overlay (CI run 45122097770): download the firefox trace/screenshot artifacts and send me the element that intercepts the click (its class/id). Likely the WebGL notice in `.home-header` (`js/main.js` showWebGLNotice).
5. WebKit: run `npx playwright test --project=webkit --shard=1/2 --workers=1` on a 4-core machine and report the per-test result list; if it passes with 1 worker, set `workers: 1` for webkit only in `playwright.config.js` (a mechanical edit you may make).
6. Chromium hard failures: a11y answer-lanes-from-keyboard, gameplay "score climbs by itself" (30s), no-WebGL notice layout, fit pinned-badges: send the error contexts; I fix.
7. Smaller items (F9 reset filters leaves subjects, F10 chip colours/raw codes, F12, F13 empty REDEEM message, F16 theme label, F17 "0 Missed — PERFECT", F19 CTA label, F20 dismiss on update banner): batch these as a spec and I review; none block launch.
8. Q16: the "8 why explanations/day" free cap: grep `explain` in `js/explain.js` and `js/proconfig.js`; tell me whether Flashcards calls the gate. I decide whether it should.
