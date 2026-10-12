# Live site check

Date: 2026-10-11. Site: https://pathomnemonic.github.io/buzzword-dash-v2/ (build `dx-dash-669226bb`, last-modified 9 Oct 2026). Tool: Playwright 1.52 with Chromium (headless, SwiftShader), axe-core 4.13. Read-only: no forms submitted. Note that the app on first load makes an anonymous guest sign-in on its own (`auth/v1/signup`), so each fresh browser profile creates one guest session in Supabase; that is normal app behavior, not an account made by the test.

Viewports: phone 390x844 (touch, 2x) and desktop 1366x800. No throttling (datacenter network), so absolute times are optimistic; compare relatively.

## Results

| Check | Phone | Desktop |
|---|---|---|
| HTTP status of `/`, `privacy.html`, `terms.html`, `delete-account.html`, `landing/`, `sw.js`, `manifest.webmanifest`, `remote-config.json`, `icon.svg` | all 200 | all 200 |
| Console errors or warnings (with the real CSP active) | 0 | 0 |
| Uncaught page errors | 0 | 0 |
| Responses with status >= 400 | 0 | 0 |
| Failed requests | 1 (`count_consent` reported `ERR_ABORTED`, though the server also answered 204; the consent counter is sent with keepalive and the duplicate is cancelled; harmless) | same |
| Horizontal scroll (scrollWidth - clientWidth) | 0 px | 0 px |
| First contentful paint | 628 ms | 648 ms |
| Largest contentful paint | 812 ms | 864 ms |
| DOMContentLoaded / load event | 1284 / 1459 ms | 1502 / 1756 ms |
| Network idle (app interactive, all lazy chunks done) | 3.15 s | 3.86 s |
| Requests on first load | 34 | 37 |
| Transferred (compressed) | **1.52 MB** (1,515,676 B body) | 1.52 MB |
| Decoded size | 5.05 MB | 5.05 MB |

Links: every `href` on the five pages returns 200 (internal links, legal pages, landing anchors). The only external link is `mailto:patho.mnemonic1@gmail.com`.

## Service worker and offline

- Registered at the site scope and `activated`; two caches (`dx-assets` for hashed files, `dx-dash-669226bb` for the rest).
- After a first visit plus one reload, switching the browser offline and reloading: page loads in **501 ms**, title correct, the 3D canvas and the home screen render, and `privacy.html`, `terms.html`, `delete-account.html` all return 200 from cache. Offline works.
- Note: the strategy is network-first for pages and cache-first for hashed assets, so updates arrive on the next load with only the changed files fetched.

## Accessibility (axe-core, WCAG 2.x A/AA and best practices)

Before (live copy):

| Page | Violations |
|---|---|
| Home (phone and desktop) | `label-content-name-mismatch` (serious, 3 nodes: `#streakChip`, `#studyGoal`, one more), `landmark-banner-is-top-level` (moderate, `<header>` nested inside another landmark) |
| privacy / terms / delete-account | `color-contrast` (serious, `.meta` "Last updated" line: grey on light background in light mode) |
| landing | `landmark-one-main`, `region` (6 nodes) |

Fixed in this repo (not yet deployed):

- Streak chip and today-goal button: accessible names now start with the visible text ("Today 3/20", "5 day study streak") per WCAG 2.5.3, then add the explanation (`js/uihome.js`).
- Home `<header>` changed to a `<div>` so it is no longer a nested banner (`index.html`; no CSS depended on the tag).
- Legal pages: `.meta` color darkened in the light scheme (`public/privacy.html`, `terms.html`, `delete-account.html`).
- Landing: logo in a `<header>`, content in `<main>` (`public/landing/index.html`).

Re-scanned against a local production build (`vite preview`): **0 violations** on home, landing, privacy, and on each bottom-tab screen (Stats, Locker, Home, Quests, Profile) at phone width. Other overlays (Friends, Settings, paywall, game over) were not scanned; run `tools/verify-ui.mjs` or repeat the scan there after deploy.

## Performance findings

Largest transfers (compressed / decoded):

| File | Gzip | Raw |
|---|---|---|
| `index-*.js` (app) | 366 KB | 1,165 KB |
| `three-*.js` | 171 KB | 656 KB |
| `index-*.js` (second chunk) | 61 KB | 232 KB |
| `cards-hemeonc` | 69 KB | 230 KB |
| `cards-multisystem` | 61 KB | 202 KB |
| `cards-infectious` | 60 KB | 201 KB |
| `index-*.css` | 34 KB | 174 KB |

1. **All 15 subject card files plus the card index load on first visit: 16 files, 794 KB gzip (52% of the page), 2.67 MB decoded.** The first screen needs none of them until a run starts, and the service worker caches them for later. Loading only the subjects the player picked (the loader already splits them per subject) would cut first-load transfer to about 0.7 MB. This is in `js/cards.js` and `js/cards/*`, which other work is editing, so not changed here. Recommendation: lazy-load the selected subjects plus the free deck; prefetch the rest in idle time.
2. The main app chunk is 1.16 MB (366 KB gzip) and is one file; splitting out the settings, friends and Pro screens (`import()`) would speed up the first paint on slow phones. `vite build` already warns about it.
3. **Hashed assets are served with `Cache-Control: max-age=600`** (GitHub Pages cannot set headers, and `public/_headers` with `immutable` is ignored there). On a repeat visit the service worker covers this, so users are fine, but the first repeat visit before the worker is active revalidates. Moving to a host that honors `_headers` gives one year of immutable caching.
4. Fonts (4 woff2 files, 58 KB) and `icon.svg` are small; no render-blocking third-party requests; the only third-party hosts are our Supabase project and PeerJS (on demand).

## Findings fixed vs left

Fixed in repo: the axe issues above, plus the terms-acceptance line and medical disclaimer wording (see `docs/STORE-POLICY-CHECK.md`). Left: findings 1 to 3 (card loading is in files owned by another task; header caching needs a hosting decision; see `docs/SECURITY-AUDIT.md` B1 for missing security headers on the same host).

After the next deploy, re-run the live scan: expect 0 axe violations on the five pages and unchanged load numbers.
