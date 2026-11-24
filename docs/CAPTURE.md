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
| `state` | the state to open on (default `start`) |

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

## The states

1. `start`: the scene with the clue box reading "GET READY" (the game's own text), gates far away.
2. `clue-1` ... `clue-N`: the clue box shows only the clues revealed so far, one more each step, in the order given by `clues` (default: the card's own order). In normal play all clues show at once; this progressive reveal exists only here.
3. `choices`: all clues, the three answers in the answer bar (the correct one in `lane`, the distractors in the card's own order), gates close, no lane lit up.
4. `correct`: the runner in the correct lane, "✓ answer" and the card's teaching point (Study-mode presentation).

Nothing moves between states (the world is frozen), the top bar is fixed, the dev and pop-up chrome is hidden, and no run is ever finished or saved.

## Design note

The one-clue-at-a-time reveal is a capture-only presentation; the game itself keeps showing every clue at once, because the runner's timing depends on reading them together. Put the vaguest clue first via `clues=`.
