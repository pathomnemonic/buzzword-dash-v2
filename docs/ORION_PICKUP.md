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
