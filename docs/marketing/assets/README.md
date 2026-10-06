# Marketing assets

Re-render everything with `node tools/make-ads.mjs` (`--static` or `--video` for half). Needs Playwright's Chromium and `ffmpeg`.

## Static ads (`static/`), 9 concepts × 4 sizes

| Concept | Headline | Angle (series in 02) |
|---|---|---|
| `same-phone-time` | Same phone time. Actually studying. | A: scroll less |
| `doomscroll-less` | Doomscroll less. Diagnose more. | A: scroll less |
| `brain-rot` | Brain rot friendly. Board-ready. | B: meme voice |
| `monster` | The monster is your exam date. | D: gameplay |
| `streak` | A streak that forgives you. | A: wellbeing (Finch-style warmth) |
| `adhd-design` | Study design with ADHD-friendly features. | C: design, third person, no claims |
| `free-300` | 300 board questions. Free. | offer |
| `accessible` | Study your way. Accessible by design. | C: accessibility |
| `beat-my-score` | Beat my score. Seriously. | social / viral |

Sizes: `-feed` 1080×1350 · `-story` 1080×1920 (keep text inside the middle; platform UI covers the top ~250 px and bottom ~340 px) · `-square` 1080×1080 · `-wide` 1200×628.

## Videos (`video/`), silent 1080×1920 H.264

| File | Length | Script |
|---|---|---|
| `brain-rot-friendly.mp4` | 12 s | B1 |
| `same-phone-time.mp4` | 12 s | A1 / A2 |
| `adhd-friendly-design.mp4` | 14 s | C1 |

Add music and a voice line in CapCut (04-PRODUCTION-PLAN.md section 2.2). They use real gameplay stills, not recorded footage; swap in a real screen recording of a run for the middle scene when you have one.

## Screens (`screens/`)

Real app screenshots at 390×844 @3×: `home`, `locker`, `quests`, `stats`, `run-a`, `run-b` (real 3D gameplay).

## Source (`src/`)

The HTML each PNG/MP4 is rendered from. Open one in a browser to tweak, or edit the copy in `tools/make-ads.mjs`.
