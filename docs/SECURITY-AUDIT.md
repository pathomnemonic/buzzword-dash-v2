# Security and dependency audit

Date: 2026-10-11. Scope: npm dependencies, CSP, database policies, edge functions, secrets, browser storage. Complements `docs/SECURITY.md` (the standing guarantees).

## Summary

- **Shipped code is clean: `npm audit --omit=dev` reports 0 vulnerabilities.** Every remaining advisory is in build or test tooling that never reaches players.
- Safe upgrades applied (below); vitest (1644 tests), lint, typecheck and `vite build` stay green.
- No exploitable issue found in the database policies, edge functions or CSP. Four hardening items and two owner decisions are listed at the end.

## A. Dependencies

### Upgraded (patch or minor, no behavior change)

| Package | From | To | Why |
|---|---|---|---|
| vite | 6.3.5 | 6.4.4 | Clears 7 advisories (dev-server file read, `server.fs.deny` bypasses, path traversal in `.map` handling). Dev server only, but it was the only "high" in our own toolchain. Same major, build output unchanged. |
| @capacitor/core, cli, android | 8.5.2 | 8.5.3 | Patch release, keep the three in lockstep |
| @capacitor/app | 8.1.1 | 8.1.2 | Patch |
| @capacitor/keyboard | 8.0.5 | 8.0.6 | Patch |
| @capacitor/status-bar | 8.0.3 | 8.0.4 | Patch |
| @supabase/supabase-js | 2.117.2 | 2.117.3 | Patch (pinned exact, as before) |
| jszip | 3.10.1 | 3.10.2 | Patch (Anki importer) |
| axe-core | 4.13.0 | 4.14.0 | Dev-only accessibility scanner |

Also pinned: the three edge functions imported `https://esm.sh/@supabase/supabase-js@2` (a floating major, resolved at every cold start, so a bad upstream release would reach the payment code unreviewed). They now import `@2.117.3`, the version the web app is tested against (`tests/unit/edgefunctions.test.js` updated to match). Redeploy the functions to pick it up (`supabase functions deploy <name>`).

After the Capacitor bump run `npx cap sync` before the next native build so `android/` and `ios/` pick up the plugin patch versions (not done here: it touches native projects).

### Not upgraded: recommendations

| Package | Now | Latest | Recommendation |
|---|---|---|---|
| three | 0.160.0 | 0.186.1 | Do not bump casually. three has no semver; 26 releases of renderer, color-management and loader changes sit in between and the game's look (lighting, tone mapping, GLTF materials) can shift. Plan it as its own task with the screenshot/e2e suite (`tools/verify-*.mjs`, `tests/e2e`). No security advisory against 0.160 applies to how it is used (no untrusted model loading). |
| sql.js | 1.8.0 | 1.14.2 | Minor-looking but it ships a WASM binary and the Anki importer depends on SQLite behavior; test with a real `.apkg` (`tests/unit/anki.test.js` covers the parser only) before taking it. Low risk of a security win: it only opens decks the player picks on their own device. |
| peerjs | 1.5.4 | 1.5.5 | Patch, but multiplayer cannot be checked without two live browsers (`tools/verify-multiplayer.mjs`). Take it together with a manual two-device test. |
| capacitor-plugin-cdv-purchase | ^13.18.0 | (in range) | Already on the latest 13.x. It handles money; only update with a sandbox purchase and restore test on both stores. |
| @capacitor-community/in-app-review, text-to-speech, @capacitor/* others | in range | in range | Current within their 8.x ranges. |
| @playwright/test + playwright | 1.52.0 | 1.64.0 | Fixes GHSA-7mvr-c777-76hp (browser download without TLS verification; only matters when running `npx playwright install`). Moving changes the bundled Chromium revision and the CI browser cache; do it as a deliberate tooling bump and re-run `npm run test:e2e`. |
| vitest + @vitest/coverage-v8 | 3.2.1 | 5.0.3 | Two majors. Within 3.x, 3.2.7 clears the `tinypool` advisory (prototype pollution in worker options, test runner only). Needs a green full run on a machine you control; the suite takes about 6 minutes. |
| eslint / @eslint/js / globals / jsdom / typescript | pinned | 10.x / 10.x / 17.x / 29.x / 7.x | Majors; no security reason. Skip until you want the features. |

### Remaining `npm audit` items (all dev tooling, none in the shipped app)

14 advisories (4 moderate, 6 high, 4 critical), all reached only through: `@capacitor/assets` (sharp, tar, uuid via `@trapezedev/project`/`xcode`; used by `npm run app:assets` on a developer machine, processes our own icons), `tinypool` (vitest), `playwright` (installer). None runs in the browser or on the server. `npm audit fix --force` would downgrade or break; ignore until `@capacitor/assets` publishes a fixed release.

## B. Review findings

### Content-Security-Policy (`tools/csp.mjs`)

Good: `default-src 'self'`, scripts limited to self plus one hashed inline boot script, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `connect-src` limited to our own Supabase project and the PeerJS signalling host. The live site serves it (checked).

Findings:
1. **`public/_headers` is ignored on GitHub Pages.** The live response has no `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP or COEP (verified with `curl -I`). Only the CSP `<meta>` applies, and a meta CSP cannot set `frame-ancestors`, so the site can be framed (clickjacking of the sign-in and purchase screens). Fix options: put Cloudflare/Netlify in front (the `_headers` file already works there), or add a small frame-buster in `index.html`. Not applied here because a frame-buster that breaks the Capacitor webview needs an on-device check. Owner decision.
2. `style-src 'unsafe-inline'` is required by the UI's inline styles; accepted. `'wasm-unsafe-eval'` is needed for sql.js. Both are narrow.
3. `privacy.html`, `terms.html`, `delete-account.html` and `landing/` carry no CSP. They are static and script-free except the landing campaign-tag snippet; low risk.

### Database (`database/*.sql`)

- Row-level security is enabled on all 44 tables; the only `USING (true)` is the public leaderboard read on `scores` (intended).
- All `SECURITY DEFINER` functions set `search_path`; `lockdown.sql` revokes the Supabase default grants and `audit.sql` plus `tests/unit/dbprivileges.test.js` verify the allow-lists. No change needed.
- Reminder from `docs/SECURITY.md` that cannot be checked from code: Confirm-email ON, redirect-URL allow-list, backups on a paid plan.

### Edge functions (`supabase/functions`)

- `stripe-webhook`: signature checked first with a constant-time compare and a 300 s replay window (`verifyStripeSignature`); refunds use idempotency keys; bad JSON refused. Good.
- `pro-checkout`: price comes from the server; identity looked up from the bearer token; guests refused for money flows. Good. `Access-Control-Allow-Origin: *` is acceptable because every sensitive call needs the bearer token (no cookies).
- `iap-verify`: validates platform, product id (allow-list through `describeStoreProduct`) and token length; asks Google/Apple directly; one purchase to one account (`pro_store_claim`); store errors never revoke. The Apple transaction JWS is decoded without signature verification, which is fine only because it is fetched by us over TLS from Apple's API. If the function ever accepts a JWS sent by the client, add x5c chain verification first.
- All three use `verify_jwt = false` deliberately (documented in `docs/SECURITY.md`); each does its own check.

### Secrets

- No keys in the repo: the only matches for `service_role`, `-----BEGIN` or `sk_live` are environment-variable names, test fixtures and the preflight scanner. `.gitignore` covers `.env*`, keystores and `*.b64`. The Supabase anon key in the web build is public by design.

### Browser storage and XSS

- `localStorage` holds the save, settings and the Supabase session. `storagesafety.test.js` guards against another site on the same host overwriting it. No secrets beyond the user's own session token.
- `innerHTML` is used in 4 places, all with constant strings (`main.js` multiplayer panel, `errors.js` with `escapeText`); player-supplied names go through `textContent`. No XSS path found.

### Android

- `android:allowBackup="true"` in `AndroidManifest.xml`: Android auto-backup copies the WebView storage, which includes the Supabase session token, to the user's Google account and to new devices. Low risk (the user's own data) but it can also restore a stale save over a newer one. Recommend `allowBackup="false"` or `dataExtractionRules` excluding WebView; left alone because the app also has its own backup (`js/nativebackup.js`) and the owner may rely on the OS one. Owner decision.

## Needs the owner

1. Security headers: move hosting behind something that honors `_headers`, or accept the framing exposure (item B1).
2. `allowBackup` choice (Android).
3. Schedule the risky upgrades: three, sql.js, peerjs, playwright, vitest 3.2.7 (each described above).
4. Redeploy the three edge functions and run `npx cap sync` after merging.
