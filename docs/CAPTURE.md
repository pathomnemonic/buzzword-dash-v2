# Capture mode: real game screenshots for social posts

A testing page that parks the real 3D game on one card, in a chosen map and hero, and steps through the states of a post. It lives only in a build made with `VITE_FEATURE_CAPTURE=1`; the shipped builds, CI and the deploy workflow never set it, and a normal build does not contain the file (`tests/unit/capture.test.js` checks this).

## Build and serve

```
npm ci
VITE_FEATURE_CAPTURE=1 npm run build
npx vite preview --port 4173
```

## Open a card

```
http://localhost:4173/?capture=pe024&map=Neural%20Highway&lane=2&clues=0,1,2,3,4
```

| Param | Meaning |
|---|---|
| `capture` | the card id (required) |
| `map` | a map name or id from `js/game/skins.js` (every map counts as owned) |
| `hero` | a hero id from `js/game/shopdata.js` (counts as owned) |
| `lane` | 0, 1 or 2: the lane the correct gate is in (default 2) |
| `clues` | the reveal order as 0-based positions in the card's clue list, e.g. `2,0,1,3,4`. Default: the card's own order. A shorter list reveals only those clues |
| `theme` | page colors: `classic` (default), `winter`, `spring`, `summer`, `autumn`, `ocean`, `forest`, `ember`, `amber`, `rose` |
| `score`, `coins`, `streak` | the numbers on the top bar (default 0) |
| `state` | the state to open on (default `clue-1`) |

Use a fresh browser context (nothing from a real profile), viewport 540 x 675 and `deviceScaleFactor: 2` for 1080 x 1350 images.

## Drive it from Playwright

```js
await page.goto(url);
await page.waitForFunction(() => window.__capture && (window.__capture.ready || window.__capture.error));
const info = await page.evaluate(() => window.__capture.card);   // { id, answer, clues (in reveal order), distractors, teaching }
for (const state of await page.evaluate(() => window.__capture.states)) {
  await page.evaluate((s) => window.__capture.goto(s), state);   // resolves when the frame has settled
  await page.screenshot({ path: `${info.id}-${state}.png` });
}
```

`window.__capture.next()` and `.prev()` step one state; `window.__capture.current` and `document.body[data-capture-state]` name the state.

## Graphics quality

Captures always render at the game's **High** tier: all 3D hero and monster models, 3D obstacles and props, bloom, shadows and full resolution (up to 2x). The game's own "Auto" setting would pick **Low** on a headless or software-rendered browser (it detects SwiftShader), which is why earlier captures showed the simple stand-in hero. Capture mode sets Graphics to High itself, ignores any performance hint, and waits for the 3D models to finish loading (about 4 seconds of quiet) before it reports ready. `window.__capture.quality` shows the tier in use.

## The states

The sequence has no "start" frame: a post begins at `clue-1`.

1. `clue-1` ... `clue-N`: the clue box shows only the clues revealed so far, one more each step, in the order given by `clues` (default: the card's own order). In normal play all clues show at once; this progressive reveal exists only here. Put the vaguest clue first. `clue-1` also carries the editorial overlay "CAN YOU GUESS THE DIAGNOSIS?".
2. `choices`: all clues revealed, the three gates close to the camera, each answer on a big readable chip over its own gate (LEFT / CENTER / RIGHT), and the editorial overlay "N CLUES IN / WHICH GATE?" (N is the number of clues in this post's sequence). The correct answer is in `lane`; the distractors are in the card's own order; no gate is lit up.
3. `correct`: a capture-only celebration that never happens in play: the correct gate lit green, the hero standing in front of it facing the camera and cheering. The pose is the game's own `celebrate` animation state (the hero's own victory clip where `js/game/clipnames.js` defines one, otherwise its wave, dance, thumbs-up or clap clip), advanced 0.7 s into the clip. A hero built from shapes with no clips gets a small hop instead (`window.__capture.pose` says which). The "✓ answer" and the card's teaching point show as in Study mode.

**Editorial overlays** are bold outlined caption lettering added for the viewer, not game UI, so they read as a post's caption (white and yellow, heavy outline and shadow, a slight tilt). They are drawn by capture mode only (`#captureOverlay`).

The scene is dressed like a run in progress: coins, obstacles and the map's props, placed the same way for the same card and map. Nothing moves between states, the top bar is fixed, the dev and pop-up chrome is hidden, and no run is ever finished or saved.

## Design note

The one-clue-at-a-time reveal is a capture-only presentation; the game itself keeps showing every clue at once, because the runner's timing depends on reading them together. Put the vaguest clue first via `clues=`.
