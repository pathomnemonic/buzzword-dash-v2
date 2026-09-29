The repository confirms the architectural conflicts this contract is designed to resolve: duplicate flashcard controllers, positional game-start arguments, direct persistence inside the engine, two render loops sharing one renderer, mutable multiplayer card orders, unsafe HTML generation, and permissive leaderboard authorization [1].

Below is the complete new `ARCHITECTURE.md` file. It freezes the shared contracts before production agents begin work.

```md
# Buzzword Dash Architecture Contract

**Document version:** 1.0.0  
**Target application version:** 2.0.0  
**Multiplayer protocol version:** 3  
**Save-schema version:** 2  
**Status:** FROZEN FOR PARALLEL IMPLEMENTATION

---

# 1. Purpose

This document is the authoritative integration contract for the Buzzword Dash comprehensive update.

It exists to ensure that parallel implementation agents:

- Use the same names for shared concepts.
- Do not create incompatible APIs.
- Do not edit the same production files.
- Do not duplicate event handling or persistence.
- Do not reintroduce unsafe rendering.
- Return complete replacement files that can be combined with minimal manual work.
- Produce deterministic Daily and multiplayer sessions.
- Preserve backward compatibility with existing local save data where practical.

If an implementation conflicts with this document, this document takes precedence.

Any necessary contract change must be proposed explicitly and accepted before an implementation agent introduces it.

---

# 2. Non-negotiable architectural principles

## 2.1 One owner per production file

Each production file has exactly one implementation owner.

No other agent may edit that file.

If an integration problem is found, it must be returned to the original file owner for correction.

---

## 2.2 One application render loop

There must be exactly one animation loop for the main renderer.

The application composition layer in `js/main.js` owns that loop.

The game engine and home scene expose update and render methods but do not create independent animation loops.

The separate Locker character preview may retain its own renderer and animation loop because it uses a separate WebGL renderer and canvas.

---

## 2.3 One run-finalization transaction

`storage.finalizeRun(summary)` is the only API permitted to persist completed or abandoned runner-session results.

The engine must not directly persist:

- Play time
- Cards studied
- Total encounters
- Correct answers
- Wrong answers
- Best score
- Best streak
- Daily completion
- Daily streaks
- Perfect-run totals
- Continue totals
- Quest progress
- Achievement progress
- Multiplayer match totals
- Runner-mode card statistics

`finalizeRun()` must be idempotent by `runId`.

---

## 2.4 One flashcard-finalization transaction

`storage.finalizeFlashcardSession(summary)` is the only API permitted to persist a flashcard session.

It must be idempotent by `sessionId`.

A completed primary session must be finalized before a missed-card review replaces its result set.

---

## 2.5 No raw user or remote content in `innerHTML`

The following content is untrusted:

- Custom cards
- Imported cards
- Anki fields
- AI-generated card content
- Profile names
- Leaderboard entries
- Friend names
- Match messages
- Card reports
- Search input
- Remote error messages

Untrusted content must be rendered with `textContent` or the safe DOM utilities defined in this document.

No new inline event attributes are allowed.

Examples of prohibited markup:

```html
<button onclick="UI_editCard('...')">
<div onmouseover="...">
```

Global UI callbacks such as these must be removed:

```js
window.UI_editCard
window.UI_deleteCard
window.UI_flagCard
window.UI_reportCard
```

---

## 2.6 Runtime code must not silently bypass user filters

If no cards match selected filters, the selection layer must return a structured error.

It must not silently fall back to unfiltered cards.

---

## 2.7 Competitive configuration is authoritative

In multiplayer:

- The host’s accepted match configuration is authoritative.
- Local subject settings must not override it.
- Local filter settings must not override it.
- Both peers must verify the same content version and card-pool hash.
- Competitive encounter plans must not depend on unseeded `Math.random()` calls.
- A match result must be finalized once and only once.

---

## 2.8 Engine events are semantic

The engine emits semantic events.

The engine must not directly:

- Play audio
- Trigger haptics
- Manipulate UI overlays
- Increment quest IDs
- Submit leaderboard records
- Send multiplayer network messages

`main.js` receives engine events and dispatches them to the appropriate systems.

---

## 2.9 Track ownership is explicit

The environment track must live under one dedicated `THREE.Group` called `trackRoot`.

Map transitions may remove and dispose only `trackRoot`.

They must never infer track ownership by traversing and deleting every unprotected scene object.

---

## 2.10 Fail safely

Security-sensitive and competitive systems must fail closed.

Examples:

- If authentication is unavailable, score submission is disabled.
- If multiplayer content hashes disagree, the match does not start.
- If imported cards fail schema validation, they are not made playable.
- If filters produce no cards, the run does not start.
- If a remote message fails validation, it is ignored and reported.
- If a quest has already been claimed, it cannot award coins again.

---

# 3. Terminology

## 3.1 Run

A runner-mode gameplay session beginning when the countdown completes and ending in a terminal or abandoned state.

Examples:

- Endless
- Study
- Weakness
- Daily
- Multiplayer High Score
- Multiplayer Sudden Death
- Multiplayer Race
- Timed Practice, if added later

---

## 3.2 Encounter

One card presentation with:

- A card ID
- Three answer lanes
- One correct lane
- Two distractor lanes
- An answer commitment
- A resolution result

---

## 3.3 Flashcard session

A non-runner study session using reveal and self-rating controls.

A missed-card review is a separate child session linked to the original session.

---

## 3.4 Match

A multiplayer competition identified by `matchId`.

A match may contain one runner session per participant.

---

## 3.5 Encounter plan

An immutable deterministic sequence defining competitive encounter content and layout.

---

## 3.6 Content version

A stable version string representing the active built-in card library.

---

## 3.7 Card-pool hash

A deterministic hash of the exact ordered set of eligible card IDs and their competitive content fields.

---

# 4. Canonical identifiers

## 4.1 Runner mode IDs

These exact strings must be used:

```js
export const GAME_MODES = Object.freeze({
  ENDLESS: 'endless',
  STUDY: 'study',
  WEAKNESS: 'weakness',
  DAILY: 'daily',
  VERSUS: 'versus',
  MP_HIGH_SCORE: 'mp_highscore',
  MP_SUDDEN_DEATH: 'mp_suddendeath',
  MP_RACE: 'mp_race',
  TIMED_PRACTICE: 'timed_practice'
});
```

`timed_practice` may remain unavailable in the first stabilization release, but no alternative identifier may be introduced for it.

---

## 4.2 Game lifecycle states

These exact strings must be used:

```js
export const GAME_STATES = Object.freeze({
  IDLE: 'idle',
  PREPARING: 'preparing',
  COUNTDOWN: 'countdown',
  PLAYING: 'playing',
  PAUSED: 'paused',
  DYING: 'dying',
  CONTINUE_PROMPT: 'continue_prompt',
  FINISHING: 'finishing',
  ENDED: 'ended',
  DISPOSED: 'disposed'
});
```

---

## 4.3 Match lifecycle states

```js
export const MATCH_STATES = Object.freeze({
  IDLE: 'idle',
  CONNECTING: 'connecting',
  LOBBY: 'lobby',
  READY: 'ready',
  SYNCHRONIZING: 'synchronizing',
  COUNTDOWN: 'countdown',
  PLAYING: 'playing',
  WAITING_FOR_RESULT: 'waiting_for_result',
  COMPLETE: 'complete',
  DISCONNECTED: 'disconnected',
  FORFEITED: 'forfeited',
  ERROR: 'error'
});
```

---

## 4.4 Run end reasons

```js
export const RUN_END_REASONS = Object.freeze({
  OUT_OF_LIVES: 'out_of_lives',
  MANUAL_END: 'manual_end',
  NO_MATCHING_CARDS: 'no_matching_cards',
  DAILY_COMPLETE: 'daily_complete',
  TIMER_EXPIRED: 'timer_expired',
  SUDDEN_DEATH_ELIMINATION: 'sudden_death_elimination',
  RACE_FINISHED: 'race_finished',
  OPPONENT_FORFEIT: 'opponent_forfeit',
  LOCAL_FORFEIT: 'local_forfeit',
  DISCONNECTED: 'disconnected',
  FATAL_ERROR: 'fatal_error'
});
```

---

# 5. Game lifecycle state machine

## 5.1 Allowed transitions

```text
idle
  -> preparing

preparing
  -> countdown
  -> ended
  -> idle

countdown
  -> playing
  -> ended
  -> idle

playing
  -> paused
  -> dying
  -> finishing
  -> ended

paused
  -> playing
  -> finishing
  -> ended

dying
  -> continue_prompt
  -> finishing
  -> ended

continue_prompt
  -> playing
  -> finishing
  -> ended

finishing
  -> ended

ended
  -> preparing
  -> idle

any non-disposed state
  -> disposed
```

No undocumented transition is permitted.

---

## 5.2 State responsibilities

### `idle`

- No active run.
- Home scene may render.
- Gameplay input is disabled.
- Gameplay HUD is hidden.

### `preparing`

- Start configuration is validated.
- Card pool is validated.
- Track and player are prepared.
- Run counters are reset.
- No gameplay movement occurs.

### `countdown`

- Gameplay world continues to render.
- Gameplay movement is disabled.
- Audio may play countdown events.
- Start timing is not yet accumulated as active play time.

### `playing`

- Gameplay input is active.
- Gameplay systems update.
- Timer-based modes count down.
- Encounters can resolve.

### `paused`

- Main renderer continues to render a stable frame.
- Gameplay simulation does not advance.
- Music, ambient scheduling, TTS, and gameplay effects are paused.
- Multiplayer pause behavior is mode-dependent and must be explicitly negotiated.

### `dying`

- Gameplay movement and collision are disabled.
- Death animation continues updating and rendering.
- Continue prompt is not yet interactive.

### `continue_prompt`

- Gameplay simulation is stopped.
- Continue UI is interactive.
- The world remains visible.
- Continue can occur at most once unless a future mode explicitly changes the rule.

### `finishing`

- Terminal animation or match synchronization is in progress.
- No additional encounters may spawn.
- No further score-changing gameplay events may occur.

### `ended`

- The final immutable run summary has been emitted.
- `onRunEnd` has fired exactly once.
- The run may be finalized in storage exactly once.
- Gameplay input is disabled.

### `disposed`

- Renderer-owned and scene-owned resources have been released.
- No transition out is allowed.

---

# 6. Canonical game initialization contract

## 6.1 Engine initialization

`js/game/engine.js` must expose:

```js
game.init({
  container,
  quality,
  reducedMotion
});
```

Parameters:

```js
{
  container: HTMLElement,
  quality: 'low' | 'medium' | 'high' | 'auto',
  reducedMotion: boolean
}
```

`game.init()`:

- Creates the main `THREE.WebGLRenderer`.
- Creates the gameplay scene and camera.
- Does not call `renderer.setAnimationLoop()`.
- Returns the renderer or exposes it through `game.renderer`.
- Is safe to call once.
- Throws a structured error if WebGL initialization fails.

---

## 6.2 Canonical game-start contract

The only supported signature is:

```js
game.start(options);
```

Where `options` is:

```js
{
  mode,
  runId,
  subjects,
  filters,
  userSpeed,
  orderedCardIds,
  encounterPlan,
  skinId,
  matchId,
  startAt,
  modeConfig
}
```

Full shape:

```js
{
  mode: string,
  runId: string,

  subjects: string[],

  filters: {
    exams: string[],
    questionTypes: string[],
    sources: string[],
    years: number[],
    highYieldOnly: boolean,
    includeCustomCards: boolean
  },

  userSpeed: number,

  orderedCardIds: string[] | null,
  encounterPlan: EncounterPlanEntry[] | null,

  skinId: string | null,
  matchId: string | null,
  startAt: number | null,

  modeConfig: {
    timeLimitSeconds: number | null,
    targetCorrect: number | null,
    dailyEncounterCount: number,
    allowContinue: boolean,
    continueCost: number,
    adaptiveDifficulty: boolean
  }
}
```

Rules:

- No positional `game.start(mode)` signature may remain.
- `runId` is generated before calling the engine.
- `orderedCardIds` is immutable from the engine’s perspective.
- `encounterPlan` takes precedence over ordinary random selection.
- Multiplayer configuration takes precedence over local settings.
- `subjects: []` means all canonical subjects.
- `startAt` is an adjusted local high-resolution start target when multiplayer synchronization is active.
- `game.start()` prepares the run but does not enter `playing`.
- `game.beginCountdown()` transitions to `countdown`.
- `game.go()` transitions from `countdown` to `playing`.

---

## 6.3 Engine frame APIs

The engine must expose:

```js
game.update(deltaSeconds, nowMs);
game.render();
game.resize(width, height, pixelRatio);
game.pause(reason);
game.resume(reason);
game.requestEnd(reason);
game.continueRun();
game.dispose();
```

`main.js` owns the main renderer loop:

```js
renderer.setAnimationLoop((timeMs) => {
  app.frame(timeMs);
});
```

The application chooses which scene updates and renders:

```js
if (appState === 'game') {
  game.update(deltaSeconds, timeMs);
  game.render();
} else {
  homeCharacter.update(deltaSeconds, timeMs);
  homeCharacter.render();
}
```

---

# 7. Canonical run summary

## 7.1 Run summary shape

The engine must emit this immutable object:

```js
{
  runId,
  mode,
  endReason,
  completed,

  startedAt,
  endedAt,
  durationMs,

  score,
  coinsEarned,
  coinsCollected,

  encountersCompleted,
  correct,
  wrong,
  bestStreak,
  fastestDecisionMs,

  continued,
  continuesUsed,

  subjectsSeen,
  rushesUsed,
  powerupsCollected,
  obstaclesJumped,
  obstaclesSlid,

  dailyCompleted,

  encounters,

  multiplayer
}
```

Full type:

```js
{
  runId: string,
  mode: string,
  endReason: string,
  completed: boolean,

  startedAt: number,
  endedAt: number,
  durationMs: number,

  score: number,
  coinsEarned: number,
  coinsCollected: number,

  encountersCompleted: number,
  correct: number,
  wrong: number,
  bestStreak: number,
  fastestDecisionMs: number | null,

  continued: boolean,
  continuesUsed: number,

  subjectsSeen: string[],
  rushesUsed: number,
  powerupsCollected: number,
  obstaclesJumped: number,
  obstaclesSlid: number,

  dailyCompleted: boolean,

  encounters: EncounterResult[],

  multiplayer: {
    matchId: string | null,
    result: 'win' | 'loss' | 'tie' | 'none',
    opponentId: string | null,
    raceTimeMs: number | null,
    eliminated: boolean,
    forfeit: boolean
  }
}
```

---

## 7.2 Encounter result shape

```js
{
  eventId,
  encounterIndex,
  cardId,
  subject,

  presentedAnswers,
  correctLane,
  committedLane,
  selectedAnswer,

  correct,
  rushed,
  rushStacks,

  clueShownAt,
  firstInputAt,
  committedAt,
  resolvedAt,
  decisionMs,

  scoreAwarded,
  coinsAwarded
}
```

Full type:

```js
{
  eventId: string,
  encounterIndex: number,
  cardId: string,
  subject: string,

  presentedAnswers: [string, string, string],
  correctLane: 0 | 1 | 2,
  committedLane: 0 | 1 | 2,
  selectedAnswer: string,

  correct: boolean,
  rushed: boolean,
  rushStacks: number,

  clueShownAt: number,
  firstInputAt: number | null,
  committedAt: number,
  resolvedAt: number,
  decisionMs: number | null,

  scoreAwarded: number,
  coinsAwarded: number
}
```

---

## 7.3 Completion rules

### Endless

```js
completed = encountersCompleted > 0
```

### Study

```js
completed = encountersCompleted > 0
```

### Weakness

```js
completed = encountersCompleted > 0
```

### Daily

```js
dailyCompleted =
  mode === 'daily' &&
  encountersCompleted === modeConfig.dailyEncounterCount &&
  endReason === 'daily_complete'
```

A manually abandoned or failed Daily run must not:

- Set `dailyDone`.
- Increment the Daily streak.
- Increment the Daily completion quest.
- Award Daily completion achievements.

### Multiplayer High Score

```js
completed = endReason === 'timer_expired'
```

### Multiplayer Sudden Death

```js
completed =
  endReason === 'sudden_death_elimination' ||
  endReason === 'opponent_forfeit'
```

### Multiplayer Race

```js
completed =
  endReason === 'race_finished' ||
  endReason === 'opponent_forfeit'
```

---

# 8. Answer-timing contract

## 8.1 Timing points

The engine must track:

```js
clueShownAt
firstInputAt
committedAt
resolvedAt
```

Definitions:

- `clueShownAt`: the high-resolution timestamp at which clues and answers become readable.
- `firstInputAt`: the first lane-changing input after clue presentation.
- `committedAt`: the timestamp when the answer lane becomes locked.
- `resolvedAt`: the timestamp when the gate resolves.

---

## 8.2 Decision time

```js
decisionMs = committedAt - clueShownAt
```

Decision time must not use total gate travel time.

Speed achievements use `decisionMs` only when:

- The answer was correct.
- The input was player-controlled.
- Auto-Pilot was not active.
- The match was not paused during the measurement.
- The decision was not inherited from a previous lane before clue presentation.

---

## 8.3 Lane commitment

Visual position and logical commitment must not diverge indefinitely.

The engine must define a lane lock boundary before the gate resolves.

Recommended behavior:

```js
if (gateZ >= ANSWER_LOCK_Z) {
  committedLane = nearestLaneIndex(player.position.x);
  answerLocked = true;
}
```

Once locked:

- Later lane inputs do not change the current encounter answer.
- They may be buffered for the next encounter only if explicitly supported.
- Collision checks use physical player position, not merely `targetLane`.

---

# 9. Card schema

## 9.1 Canonical card shape

```js
{
  id,
  subj,
  bw,
  ans,
  d,
  tp,
  ww,

  exams,
  baseDifficulty,
  questionType,
  source,
  tags,
  hx,
  yr,
  pearls,

  enabledModes,
  contentVersion,
  reviewedAt,

  isCustom,
  createdAt,
  updatedAt
}
```

Full type:

```js
{
  id: string,
  subj: string,
  bw: string[],
  ans: string,
  d: [string, string],
  tp: string,
  ww: Record<string, string>,

  exams: string[],
  baseDifficulty: 1 | 2 | 3,
  questionType: string,
  source: string,
  tags: string[],
  hx: boolean,
  yr: 1 | 2 | 3 | 4,
  pearls: string[],

  enabledModes: string[],
  contentVersion: string,
  reviewedAt: string | null,

  isCustom?: boolean,
  createdAt?: number,
  updatedAt?: number
}
```

---

## 9.2 Canonical subjects

```js
export const SUBJECTS = Object.freeze([
  'Neurology',
  'Cardiology',
  'Nephrology',
  'Psychiatry',
  'Gastroenterology',
  'Pulmonology',
  'Infectious Disease',
  'Endocrinology',
  'Hematology/Oncology',
  'Rheumatology',
  'Obstetrics/Gynecology',
  'Pediatrics',
  'Surgery',
  'Emergency Medicine',
  'Multisystem / Mixed'
]);
```

No alternate subject strings are permitted.

For example, `"Hematology"` is not valid and must be migrated or rejected in favor of `"Hematology/Oncology"`.

---

## 9.3 Required card invariants

Every runner-playable card must satisfy:

- `id` is globally unique.
- `subj` is canonical.
- `bw` contains at least one nonempty string.
- `ans` is nonempty.
- `d` contains exactly two nonempty strings.
- Both distractors are unique.
- Neither distractor equals the answer after normalization.
- `ww` keys refer only to actual distractors.
- `baseDifficulty` is 1, 2, or 3.
- `questionType` is canonical.
- `source` is canonical.
- `yr` is 1–4.
- `enabledModes` includes the current runner mode.
- Untrusted HTML is not required for display.

---

## 9.4 Raw Anki imports

Raw imports without generated distractors must use:

```js
enabledModes: ['flashcard']
```

They must not use placeholder distractors such as:

```js
['N/A', 'N/A']
```

A raw card becomes runner-playable only after two valid distractors are supplied and validation succeeds.

---

## 9.5 Card normalization APIs

`js/cardschema.js` must export:

```js
export const SUBJECTS;
export const EXAM_FILTERS;
export const QUESTION_TYPES;
export const SOURCE_DISCIPLINES;
export const CARD_SCHEMA_VERSION;

export function normalizeCard(input, options = {});
export function validateCard(input, options = {});
export function validateCardCollection(cards, options = {});
export function isCardEnabledForMode(card, mode);
export function normalizeComparableText(value);
```

Return shape:

```js
{
  success: boolean,
  card: object | null,
  errors: ValidationIssue[],
  warnings: ValidationIssue[]
}
```

Issue shape:

```js
{
  code: string,
  path: string,
  message: string,
  severity: 'error' | 'warning'
}
```

Runtime validation must not silently rewrite medically meaningful text.

---

# 10. Card repository and selection contract

## 10.1 Card hub exports

`js/cards.js` must export:

```js
export const CARDS;
export const CARD_BY_ID;
export const SUBJECTS;
export const EXAM_FILTERS;
export const QUESTION_TYPES;
export const SOURCE_DISCIPLINES;
export const CONTENT_VERSION;
export const BUILT_IN_CARD_POOL_HASH;

export function getBuiltInCardById(cardId);
```

`CARD_BY_ID` should be a `Map`.

Imported module card objects must not be mutated.

---

## 10.2 Custom-card repository exports

`js/customcards.js` must export:

```js
export const customCards;
```

Required methods:

```js
customCards.getAll()
customCards.getById(cardId)
customCards.add(cardData)
customCards.update(cardId, cardData)
customCards.remove(cardId)
customCards.importJSON(jsonString, options)
customCards.exportJSON()
customCards.count()
customCards.clear()
customCards.getPlayable(mode)
customCards.subscribe(listener)
```

Mutation result:

```js
{
  success: boolean,
  card: object | null,
  errors: ValidationIssue[],
  warnings: ValidationIssue[]
}
```

Import result:

```js
{
  success: boolean,
  importedCount: number,
  rejectedCount: number,
  imported: object[],
  rejected: {
    index: number,
    errors: ValidationIssue[]
  }[],
  warnings: ValidationIssue[]
}
```

---

## 10.3 Canonical card-pool request

```js
getCardPool({
  subjects,
  filters,
  mode,
  includeCustomCards
});
```

Return shape:

```js
{
  cards: object[],
  cardIds: string[],
  error: null | {
    code: 'NO_MATCHING_CARDS',
    message: string
  }
}
```

---

## 10.4 Canonical card-selection contract

The only supported signature is:

```js
pickCard(options);
```

Shape:

```js
pickCard({
  pool,
  recentIds,
  mode,
  encounterIndex,
  orderedCardIds,
  selectionState,
  rng
});
```

Full shape:

```js
{
  pool: object[],
  recentIds: string[],
  mode: string,
  encounterIndex: number,
  orderedCardIds: string[] | null,

  selectionState: {
    recentQuestionTypes: string[],
    recentSubjects: string[]
  },

  rng: () => number
}
```

Return shape:

```js
{
  card: object | null,
  orderedIndex: number | null,
  error: null | {
    code: string,
    message: string
  }
}
```

Rules:

- `orderedCardIds` must never be mutated.
- No `shift()` is permitted on caller-owned arrays.
- Ordered selection uses `encounterIndex`.
- No card outside the supplied pool may be returned.
- Disabled cards must not appear.
- Mode-ineligible cards must not appear.
- Recent duplicate avoidance is best-effort when the pool is too small.

---

# 11. Deterministic Daily contract

## 11.1 Daily seed

The seed is derived from the player’s local calendar date unless the product later introduces a server-authoritative global Daily.

Canonical key:

```text
YYYY-MM-DD
```

---

## 11.2 Daily order generation

The Daily order is created once:

```js
createDailyOrder({
  dateKey,
  eligibleCardIds,
  count
});
```

It returns an immutable array of unique IDs.

The card pool must not be reshuffled independently for every encounter.

---

## 11.3 Daily order invariants

- Same date and eligible pool produce the same order.
- The order contains no duplicates when enough cards exist.
- If fewer cards exist than the configured count, the run must not start unless an explicit product rule allows a shorter Daily.
- Abandoning a Daily does not award completion.
- Replaying an unfinished Daily may either restart or resume, but behavior must be explicit and consistent.
- Only one completed Daily reward may be awarded per date.

---

# 12. Deterministic RNG contract

`js/multiplayer.js` or a shared pure utility owned by the multiplayer agent must expose:

```js
export function createSeededRandom(seed);
export function seededShuffle(items, rng);
```

Rules:

- Seed zero must be normalized to a valid nonzero state.
- The RNG must be deterministic across supported browsers.
- Deterministic modes must not use `Math.random()` for competitive decisions.
- Cosmetic-only randomness may remain local if it cannot affect readability, timing, collisions, or score.

---

# 13. Multiplayer contract

## 13.1 Match configuration

```js
{
  protocolVersion,
  matchId,
  mode,
  seed,
  startAt,

  subjects,
  filters,

  cardPoolHash,
  contentVersion,
  skinId,

  modeConfig
}
```

Full shape:

```js
{
  protocolVersion: 3,
  matchId: string,
  mode: 'mp_highscore' | 'mp_suddendeath' | 'mp_race',
  seed: number,
  startAt: number,

  subjects: string[],

  filters: {
    exams: string[],
    questionTypes: string[],
    sources: string[],
    years: number[],
    highYieldOnly: boolean,
    includeCustomCards: boolean
  },

  cardPoolHash: string,
  contentVersion: string,
  skinId: string,

  modeConfig: {
    timeLimitSeconds: number | null,
    targetCorrect: number | null,
    allowContinue: false
  }
}
```

---

## 13.2 Competitive custom cards

Public or untrusted competitive modes must default to:

```js
includeCustomCards: false
```

Custom cards may be used only when:

- Both clients explicitly opt in.
- Both clients compute the same custom-deck hash.
- The exact custom deck is verified before the match starts.

---

## 13.3 Encounter plan entry

```js
{
  encounterIndex,
  cardId,
  correctLane,
  distractorOrder,
  obstacle,
  pickups
}
```

Full shape:

```js
{
  encounterIndex: number,
  cardId: string,
  correctLane: 0 | 1 | 2,
  distractorOrder: [0 | 1, 0 | 1],

  obstacle: null | {
    type: 'jump' | 'slide',
    lane: 0 | 1 | 2,
    variantId: string,
    spawnOffset: number
  },

  pickups: {
    coins: {
      lane: 0 | 1 | 2,
      offset: number,
      height: number
    }[],
    powerup: null | {
      type: string,
      lane: 0 | 1 | 2,
      offset: number
    }
  }
}
```

Competitive plans must be immutable.

---

## 13.4 Required multiplayer exports

`js/multiplayer.js` must export:

```js
export const MP_PROTOCOL_VERSION;
export const MP_MODES;
export const multiplayer;

export function createSeededRandom(seed);
export function seededShuffle(items, rng);
export function getSeededSkinId(seed, skins);
export function buildEncounterPlan(options);
export function hashCardPool(cards);
export function validateMatchConfig(config);
export function validateMultiplayerMessage(message);
```

---

## 13.5 Message envelope

Every protocol message must use:

```js
{
  protocolVersion: 3,
  type,
  matchId,
  senderId,
  sequence,
  sentAt,
  payload
}
```

Full shape:

```js
{
  protocolVersion: number,
  type: string,
  matchId: string | null,
  senderId: string,
  sequence: number,
  sentAt: number,
  payload: object
}
```

Messages with:

- An unsupported protocol version
- A mismatched match ID
- A stale or duplicate sequence number
- An invalid payload
- An impossible state transition

must be rejected.

---

## 13.6 Required message types

```text
hello
hello_ack
clock_ping
clock_pong
mode_selected
ready
match_config
match_config_ack
match_start
game_state
encounter_result
player_eliminated
race_finished
run_finished
result_proposal
result_ack
disconnect_notice
forfeit
error
```

---

## 13.7 Clock synchronization

Clock offset must be estimated using the midpoint method.

For one sample:

```js
roundTripMs = localReceive - localSend;
midpoint = localSend + roundTripMs / 2;
offsetMs = hostTimestamp - midpoint;
```

Use multiple samples and select either:

- The sample with the lowest round-trip time, or
- A robust median of the best samples.

Convert host start time to local time before starting the countdown.

Local simulation should use `performance.now()` after synchronization.

---

## 13.8 Mode terminal rules

### High Score

- Timer is authoritative from synchronized start time.
- Match ends when time reaches zero.
- Highest score wins.
- Ties are valid.

### Sudden Death

- First incorrect encounter eliminates that player.
- If both clients report elimination for the same encounter within the synchronization tolerance, compare authoritative resolution timestamps.
- If timestamps cannot reliably determine a winner, declare a tie or replay according to product rules.
- Score alone does not determine the winner.

### Race

- First player to reach `targetCorrect` wins.
- Race time is measured from synchronized start.
- Score does not determine the winner.
- Incorrect answers may continue unless mode configuration says otherwise.

---

## 13.9 Match result shape

```js
{
  matchId,
  mode,
  result,
  winnerId,
  loserId,
  tie,
  reason,
  localFinal,
  remoteFinal,
  finalizedAt
}
```

Result recording must occur once after:

- Both final states are known, or
- A validated terminal event establishes the result, or
- A forfeit/disconnection timeout expires.

---

# 14. Progression contract

## 14.1 Exports

`js/storage.js` must export:

```js
export const storage;
export const progression;
```

---

## 14.2 Progression event API

```js
progression.recordEvent(type, payload);
```

Supported names:

```text
encounter_resolved
correct_answer
wrong_answer
streak_reached
coin_collected
powerup_collected
rush_used
obstacle_jumped
obstacle_slid
continue_used
daily_completed
flashcard_completed
multiplayer_completed
item_purchased
item_equipped
```

Payload base:

```js
{
  eventId,
  runId,
  sessionId,
  matchId,
  occurredAt
}
```

`eventId` must be unique and must make event handling idempotent.

No engine code may directly reference a quest ID.

---

## 14.3 Runner finalization

```js
storage.finalizeRun(summary);
```

Return shape:

```js
{
  applied: boolean,
  duplicate: boolean,
  newlyUnlockedAchievementIds: string[],
  completedQuestIds: string[],
  dailyCompleted: boolean,
  newBestScore: boolean,
  newBestStreak: boolean
}
```

---

## 14.4 Flashcard finalization

```js
storage.finalizeFlashcardSession(summary);
```

Flashcard summary:

```js
{
  sessionId,
  parentSessionId,
  kind,
  startedAt,
  endedAt,
  durationMs,
  total,
  correct,
  wrong,
  cardResults
}
```

Where:

```js
kind: 'primary' | 'missed_review'
```

Return shape:

```js
{
  applied: boolean,
  duplicate: boolean,
  newlyUnlockedAchievementIds: string[],
  completedQuestIds: string[]
}
```

---

## 14.5 Quest state

Quest progress must be stored by local date:

```js
{
  questState: {
    'YYYY-MM-DD': {
      [questId]: {
        progress,
        completed,
        claimed,
        completedAt,
        claimedAt
      }
    }
  }
}
```

---

## 14.6 Quest claiming

```js
storage.claimQuest(questId, dateKey);
```

Return shape:

```js
{
  success: boolean,
  alreadyClaimed: boolean,
  reward: number,
  newCoinBalance: number,
  error: string | null
}
```

Rules:

- Rewards are never awarded merely by rendering the quest screen.
- Claiming is atomic.
- Claiming is idempotent.
- A quest cannot be claimed before completion.
- A completed quest remains visible after claiming.

---

## 14.7 Achievement registry

`js/game/shopdata.js` must export:

```js
export const ACHIEVEMENT_IDS;
export const QUEST_IDS;
export const ACHIEVEMENTS;
export const QUESTS;
```

All achievement unlocking must use `ACHIEVEMENT_IDS`.

All quest definitions must use `QUEST_IDS`.

String literals for achievement or quest IDs outside the registry are prohibited.

---

## 14.8 Perfect runs

Storage must contain:

```js
perfectRuns: number
```

It increments once when a finalized qualifying run has:

```js
summary.completed === true &&
summary.correct > 0 &&
summary.wrong === 0
```

Achievements describing 10 or 50 perfect runs evaluate `perfectRuns`, not lifetime correct answers.

---

## 14.9 Subject mastery

Subject mastery requires:

```js
total >= 50 &&
correct / total >= 0.8
```

Descriptions and evaluation thresholds must match.

Per-subject mastery achievements must use the IDs defined in the registry.

---

# 15. Persistence schema

## 15.1 Root shape

```js
{
  schemaVersion,
  settings,
  progression,
  cards,
  profile,
  social,
  history,
  idempotency
}
```

Recommended shape:

```js
{
  schemaVersion: 2,

  settings: {
    selectedSubjects: [],
    selectedExams: [],
    selectedQuestionTypes: [],
    selectedSources: [],
    selectedYears: [],
    highYieldOnly: false,

    userSpeed: 1,

    masterVolume: 0.7,
    musicVolume: 0.5,
    sfxVolume: 0.8,
    voiceVolume: 0.7,
    ambientVolume: 0.5,

    musicOn: true,
    ttsEnabled: false,
    hapticsEnabled: true,
    reducedMotion: false,
    quality: 'auto',
    nightMode: false
  },

  progression: {
    coins: 100,
    totalCoinsEarned: 100,
    bestScore: 0,
    bestStreak: 0,
    totalCorrect: 0,
    totalWrong: 0,
    totalEncounters: 0,
    totalPlayTimeMs: 0,
    totalCardsStudied: 0,
    perfectRuns: 0,
    continuesUsed: 0,
    dailyStreak: 0,
    lastCompletedDailyDate: null,
    achievements: [],
    ownedItems: [],
    equipped: {},
    questState: {}
  },

  cards: {
    cardStats: {},
    subjectStats: {},
    disabledCardIds: [],
    cardReports: []
  },

  profile: {
    name: '',
    picture: 'avatar_intern',
    visible: false,
    selectedBadges: []
  },

  social: {
    authenticatedUserId: null
  },

  history: {
    completedRunIds: [],
    completedFlashcardSessionIds: [],
    recentRuns: []
  },

  idempotency: {
    progressionEventIds: []
  }
}
```

---

## 15.2 Migration requirements

Migration must preserve existing:

- Coins
- Owned items
- Equipment
- Card statistics
- Subject statistics
- Achievements
- Profile settings
- Filters
- Audio settings
- Calendar data
- Existing Daily data where valid

Legacy invalid achievement IDs should be mapped to canonical IDs where an unambiguous mapping exists.

Legacy API keys must be deleted during migration.

---

## 15.3 Volume zero

All settings must use nullish fallback behavior.

Correct:

```js
const value = storedValue ?? defaultValue;
```

Incorrect:

```js
const value = storedValue || defaultValue;
```

A saved value of zero must remain zero.

---

## 15.4 Reset scopes

Storage must expose:

```js
storage.reset(scope);
```

Supported scopes:

```text
progress
settings
custom_cards
identity
all_local
```

`all_local` must clear:

- Main save data
- Custom cards
- Local leaderboard identity remnants
- Stored local caches owned by the application
- Legacy API keys
- Pending local migration data

Remote deletion requires authenticated confirmation and is not implied by a local reset.

---

# 16. Safe DOM contract

`js/dom.js` must export these exact functions:

```js
export function escapeHTML(value);
export function setText(element, value);
export function createElement(tag, options = {});
export function clearElement(element);
export function delegate(root, eventName, selector, handler);
```

---

## 16.1 `createElement()` options

Supported shape:

```js
{
  className,
  text,
  attributes,
  dataset,
  children,
  on
}
```

Example:

```js
createElement('button', {
  className: 'btn btn-primary',
  text: 'Start',
  attributes: {
    type: 'button',
    'aria-label': 'Start game'
  },
  dataset: {
    mode: 'endless'
  },
  on: {
    click: handleStart
  }
});
```

---

## 16.2 DOM rendering rules

- Use `textContent` for untrusted text.
- `innerHTML` is permitted only for static, source-controlled markup with no interpolated values.
- Event delegation is preferred for dynamic lists.
- Inline `style` attributes should be removed where practical.
- UI rerenders must not destroy active text input focus unnecessarily.
- Screen rerenders must remount required child components through lifecycle hooks.

---

# 17. Error-handling contract

`js/errors.js` must export:

```js
export function reportError(error, context = {});
export function showUserError(message, options = {});
export async function requireSupabaseSuccess(queryPromise);
```

---

## 17.1 Error context

Recommended shape:

```js
{
  system,
  operation,
  runId,
  sessionId,
  matchId,
  recoverable,
  metadata
}
```

---

## 17.2 User-error options

```js
{
  title,
  recoverable,
  actionLabel,
  onAction,
  durationMs
}
```

---

## 17.3 Supabase wrapper

```js
const data = await requireSupabaseSuccess(
  supabase.from('table').select('*')
);
```

The wrapper must inspect the resolved `{ error }` value and throw when present.

Relying only on `.catch()` is prohibited.

---

## 17.4 Silent catches

Empty catches are prohibited except for documented best-effort cleanup, such as:

```js
try {
  node.disconnect();
} catch {
  // Best-effort cleanup: node may already be disconnected.
}
```

---

# 18. Audio contract

## 18.1 Audio buses

`js/audio.js` must provide:

```text
master
music
sfx
ambient
voice
```

All generated nodes route through the appropriate bus.

---

## 18.2 Required audio APIs

```js
audio.init()
audio.unlock()
audio.play(eventName, options)
audio.startMusic(skinId)
audio.changeMusicTheme(skinId, durationSeconds)
audio.stopMusic(options)
audio.startAmbient(skinId)
audio.stopAmbient()
audio.speak(text, options)
audio.cancelSpeech()
audio.pause(reason)
audio.resume(reason)
audio.updateSettings()
audio.dispose()
```

---

## 18.3 Semantic audio event names

```text
correct
wrong
coin
rush
countdown
countdown_go
powerup
continue
achievement
heart
monster_close
monster_consume
faceplant
map_transition
elimination
race_finish
timer_warning
jump
land
slide
shield_break
```

No gameplay module may use the countdown sound for jump or slide.

---

## 18.4 Volume calculation

Only the audio mixer calculates effective bus gains.

Example:

```js
effectiveMusicGain = masterVolume * musicVolume;
effectiveSfxGain = masterVolume * sfxVolume;
```

Individual music generators must not read storage directly.

---

## 18.5 Scheduler requirements

Procedural music must:

- Use a look-ahead scheduler.
- Schedule Web Audio events ahead of playback.
- Preserve musical phase during tempo changes.
- Avoid stopping and restarting on every speed update.
- Reuse noise buffers.
- Limit simultaneous voices.
- Route through a compressor or limiter.

---

# 19. Main application lifecycle

`js/main.js` is the composition root.

It owns:

- Main render loop
- Active application view
- Screen-to-system composition
- Engine event routing
- Audio event routing
- Multiplayer event routing
- Run finalization invocation
- Visibility pause behavior
- Settings component remounting

It must not own duplicate implementations of:

- Flashcard session logic
- Card browser rendering
- Profile rendering
- Card reporting
- Quest evaluation
- Achievement evaluation

---

## 19.1 Application states

Recommended:

```js
export const APP_STATES = Object.freeze({
  HOME: 'home',
  MENU: 'menu',
  GAME: 'game',
  MODAL: 'modal',
  ERROR: 'error'
});
```

---

## 19.2 Visibility behavior

When `document.visibilityState === 'hidden'`:

- Solo gameplay pauses.
- TTS stops.
- Music and ambient pause or fade.
- Timers use authoritative elapsed time on resume.
- Multiplayer behavior follows the match protocol and cannot silently pause only one peer.

---

# 20. Engine event contract

`game.setEventSink(handler)` installs one semantic event sink.

Event shape:

```js
{
  type,
  occurredAt,
  runId,
  payload
}
```

Required event names:

```text
state_changed
countdown_started
run_started
encounter_started
lane_changed
answer_locked
encounter_resolved
score_changed
streak_milestone
coin_collected
powerup_collected
rush_started
obstacle_dodged
damage_taken
shield_broken
death_started
continue_requested
continue_applied
skin_transition_started
skin_transition_completed
monster_warning
run_finishing
run_ended
fatal_error
```

Only `run_ended` contains the canonical final summary.

---

# 21. UI controller contract

`js/ui.js` is the sole main UI controller.

Required high-level APIs:

```js
ui.init(options)
ui.showScreen(screenId)
ui.hideScreens()
ui.showHud()
ui.hideHud()
ui.updateHud(viewModel)
ui.showCountdown(options)
ui.showPause()
ui.hidePause()
ui.showContinuePrompt(options)
ui.showPostRun(summary)
ui.showError(message, options)
ui.mountSettingsExtensions(extensions)
ui.dispose()
```

---

## 21.1 Settings extension mount

The Anki importer must be mounted after every Settings render.

Recommended contract:

```js
ui.registerSettingsExtension({
  id: 'anki_import',
  mount(container) {},
  unmount() {}
});
```

`renderSettings()` must not permanently destroy the importer without remounting it.

---

## 21.2 Card-browser behavior

The card browser must:

- Keep the search control mounted while typing.
- Update only results during input.
- Debounce search.
- Use pagination or virtualization.
- Preserve filters and scroll position where practical.
- Render untrusted card content safely.
- Provide accurate result counts.
- Provide accessible enable/disable controls.

---

## 21.3 Modal behavior

Every modal must:

- Move focus inside when opened.
- Trap focus while active.
- Close on Escape when safe.
- Restore focus to the opener.
- Provide an accessible label.
- Avoid relying on color alone.

---

# 22. Flashcard contract

`FlashcardMode` owns session state, not HTML.

Required APIs:

```js
flashcardMode.start(options)
flashcardMode.getState()
flashcardMode.getCurrentCard()
flashcardMode.reveal()
flashcardMode.rate(result)
flashcardMode.complete()
flashcardMode.startMissedReview()
flashcardMode.end(reason)
```

Start shape:

```js
{
  sessionId,
  parentSessionId,
  subjects,
  filters,
  cardCount,
  kind
}
```

Rating values:

```text
correct
incorrect
```

Rules:

- The class returns structured data, not HTML.
- Completion finalizes exactly once.
- Starting a missed review first finalizes the primary session.
- Starting a new session cannot silently discard unfinalized results.
- `getSummary()` has no side effects.
- Disabled and mode-ineligible cards are excluded.
- Flashcard-only raw imports are eligible.

---

# 23. Track contract

## 23.1 Track builder

The canonical signature is:

```js
buildTrack(trackRoot, skin, options);
```

Not:

```js
buildTrack(scene, skin);
```

Options:

```js
{
  quality,
  reducedMotion,
  rng
}
```

Return shape:

```js
{
  root,
  lights,
  runningLights,
  particleSystem,
  scrollLines,
  wallScrollPanels,
  wallMarkers,
  skyboxElements,
  sharedResources,
  dispose
}
```

---

## 23.2 Track ownership

All environment-owned objects must be descendants of `trackRoot`, including:

- Ground
- Walls
- Arches
- Wall strips
- Running lights
- Atmospheric particles
- Scroll lines
- Wall panels
- Wall markers
- Skybox decorations
- Skin-owned lights

The following must not be children of `trackRoot`:

- Player
- Player shadow
- Exam monster
- Gates
- Obstacles
- Pickups
- Trails
- Power-up effects
- Main camera

---

## 23.3 Track replacement

```js
scene.remove(trackRoot);
trackRefs.dispose();
trackRoot = new THREE.Group();
scene.add(trackRoot);
trackRefs = buildTrack(trackRoot, nextSkin, options);
```

No scene-wide cleanup traversal is allowed for map transitions.

---

# 24. Character and effects contract

## 24.1 Home character

`HomeCharacter` must expose:

```js
homeCharacter.init(renderer)
homeCharacter.update(deltaSeconds, nowMs)
homeCharacter.render()
homeCharacter.resize(width, height)
homeCharacter.rebuildCharacter()
homeCharacter.setReducedMotion(enabled)
homeCharacter.dispose()
```

It must not call `requestAnimationFrame()`.

---

## 24.2 Locker preview

The Locker preview may use its own renderer and loop.

It must:

- Dispose replaced characters.
- Preserve drag rotation.
- Respect reduced motion.
- Fix gesture cooldown ordering by evaluating the completed gesture before resetting it.

---

## 24.3 Vehicle cosmetics

Every cosmetic item must declare compatibility:

```js
compatibility: {
  humanoid: boolean,
  vehicle: boolean,
  vehicleTypes: string[]
}
```

If an item is incompatible:

- The UI must explain that it cannot be equipped for the selected avatar, or
- The item must be represented by a vehicle-specific attachment.

Silent disappearance is prohibited.

---

# 25. Input contract

`js/game/input.js` must expose:

```js
setupInput(element, handlers, options)
```

Handlers:

```js
{
  moveLeft,
  moveRight,
  jump,
  slide,
  rush,
  pause
}
```

Options:

```js
{
  enabled,
  reducedMotion,
  keyBindings
}
```

Requirements:

- Use Pointer Events where possible.
- Support touch, mouse, keyboard, and pen.
- Ignore keyboard auto-repeat for Rush.
- Prevent browser gestures only while gameplay input is active.
- Support remappable controls.
- Support input buffering for jump and slide.
- Expose cleanup:

```js
const disposeInput = setupInput(...);
disposeInput();
```

---

# 26. Rush contract

The first stabilization release uses this mechanic:

- Rush may be activated while an encounter is active and not answer-locked.
- The first Rush activation starts propulsion.
- Additional valid Rush presses increase `rushStacks` up to 3.
- Additional stacks do not reset the propulsion timer.
- Additional stacks affect score bonus and visual intensity.
- Rush provides obstacle invulnerability only during the defined propulsion window.
- Rush usage is counted once per activation press accepted by the engine.
- Keyboard auto-repeat cannot add stacks.

The UI may describe stack bonuses, but it must not falsely claim each stack independently forces 2×, 3×, and 4× travel speed unless the engine actually implements that behavior.

---

# 27. Leaderboard and social contract

## 27.1 Identity

Supabase Auth user IDs are authoritative.

Local random player IDs must not be used for authorization.

---

## 27.2 Leaderboard service APIs

```js
leaderboard.init()
leaderboard.getSession()
leaderboard.submitVerifiedScore(summary)
leaderboard.getTopScores(options)
leaderboard.getPlayerBest(options)
leaderboard.searchPlayers(query)
leaderboard.sendFriendRequest(userId)
leaderboard.acceptFriendRequest(requestId)
leaderboard.declineFriendRequest(requestId)
leaderboard.removeFriend(userId)
leaderboard.blockUser(userId)
leaderboard.reportUser(userId, reason)
leaderboard.sendInvite(options)
leaderboard.getInvites()
leaderboard.acceptInvite(inviteId)
leaderboard.declineInvite(inviteId)
leaderboard.subscribeToInvites(callback)
leaderboard.dispose()
```

---

## 27.3 Best-score semantics

Profile bests must use maximum values.

A lower score or streak must never overwrite a higher best.

---

## 27.4 Leaderboard semantics

A primary ranking view should contain one best entry per:

```text
user + mode + season
```

Raw run history may be stored separately.

---

## 27.5 Invite lifecycle

Invite states:

```text
pending
accepted
declined
expired
cancelled
```

Invites must not be deleted on read.

Reading five invites and displaying only one is prohibited.

---

## 27.6 Authentication and RLS

Policies must bind rows to:

```sql
auth.uid()
```

Public anonymous writes to:

- Scores
- Profiles
- Friends
- Invites

are prohibited in production.

---

# 28. Anki import contract

## 28.1 Parsing APIs

`js/ankiimport.js` must expose:

```js
ankiImport.parseDelimitedText(text, options)
ankiImport.parseApkg(file, options)
ankiImport.importRaw(cards, options)
ankiImport.convertWithBackend(cards, options)
ankiImport.mount(container, dependencies)
ankiImport.unmount()
```

---

## 28.2 Delimited parsing requirements

The parser must support:

- CSV
- TSV
- Quoted delimiters
- Escaped quotes
- Multiline quoted fields
- BOM
- CRLF and LF
- Empty-row handling
- Malformed-row reporting
- Configurable headers

---

## 28.3 APKG resource cleanup

SQLite statements and databases must be freed in `finally`.

Large files must be rejected before loading.

---

## 28.4 AI conversion

The browser must not:

- Store OpenAI keys.
- Store Anthropic keys.
- Call provider APIs directly with user secrets.
- Enable dangerous direct browser API access.

The optional backend contract is:

```http
POST /api/cards/convert
Content-Type: application/json
Authorization: Bearer <application session>
```

Request:

```js
{
  cards: {
    front: string,
    back: string
  }[],
  options: {
    subjectHint: string | null
  }
}
```

Response:

```js
{
  converted: object[],
  rejected: {
    index: number,
    reason: string
  }[]
}
```

All backend output is still validated locally.

---

# 29. Dependency ownership

## 29.1 Allowed dependency direction

Recommended direction:

```text
cardschema
  -> no application modules

shopdata
  -> no storage or UI modules

cards
  -> cardschema + subject card files

customcards
  -> cardschema

storage
  -> shopdata constants

gates
  -> cards + customcards + cardschema + storage read APIs

engine
  -> gates + track + player + obstacles + effects
  -> no UI
  -> no leaderboard
  -> no multiplayer transport
  -> no progression writes

ui
  -> storage read/action APIs + shopdata + dom
  -> no engine internals beyond supplied view models

audio
  -> storage settings read APIs only

multiplayer
  -> pure card-plan inputs
  -> no window-global card cache

leaderboard
  -> errors + authenticated Supabase client

main
  -> all top-level services
```

---

## 29.2 Prohibited cycles

These cycles must not exist:

```text
cards <-> customcards
storage <-> ui
engine <-> main
engine <-> multiplayer
ui <-> main
audio <-> engine
shopdata <-> storage
```

---

# 30. File ownership matrix

## Agent 0 — Architecture coordinator

Owns:

```text
ARCHITECTURE.md
```

May not edit production files.

---

## Agent 1 — Core game-session engine

Owns:

```text
js/game/engine.js
```

---

## Agent 2 — Card selection and deterministic Daily logic

Owns:

```text
js/game/gates.js
```

---

## Agent 3 — Persistence and progression

Owns:

```text
js/storage.js
```

---

## Agent 4 — Progression and cosmetics definitions

Owns:

```text
js/game/shopdata.js
```

---

## Agent 5 — Main UI and DOM safety

Owns:

```text
js/ui.js
js/dom.js
```

---

## Agent 6 — Application composition and errors

Owns:

```text
js/main.js
js/errors.js
```

---

## Agent 7 — Flashcard session logic

Owns:

```text
js/game/flashcardmode.js
```

---

## Agent 8 — Custom cards and schema

Owns:

```text
js/customcards.js
js/cardschema.js
```

---

## Agent 9 — Anki import

Owns:

```text
js/ankiimport.js
```

---

## Agent 10 — Audio

Owns:

```text
js/audio.js
```

---

## Agent 11 — Multiplayer protocol

Owns:

```text
js/multiplayer.js
```

---

## Agent 12 — Leaderboard, friends, authentication, and policies

Owns:

```text
js/leaderboard.js
database/schema.sql
database/policies.sql
```

---

## Agent 13 — Track, skins, themes, and environment performance

Owns:

```text
js/game/track.js
js/game/skinbuilders.js
js/game/skins.js
js/game/themes.js
js/game/props.js
```

---

## Agent 14 — Effects and trails

Owns:

```text
js/game/trails.js
js/game/powerupfx.js
```

---

## Agent 15 — Characters and animation

Owns:

```text
js/game/player.js
js/game/homecharacter.js
js/game/preview.js
js/game/exammonster.js
```

---

## Agent 16 — Input and obstacles

Owns:

```text
js/game/input.js
js/game/obstacles.js
```

---

## Agent 17 — HTML, CSS, accessibility shell, and documentation

Owns:

```text
index.html
css/style.css
README.md
```

---

## Agent 18 — Card hub and content tooling

Owns:

```text
js/cards.js
tools/validate-cards.mjs
tools/audit-content.mjs
```

The active subject files in `js/cards/` remain externally owned unless assigned later.

---

## Agent 19 — Build, tests, CI, and security headers

Owns only new infrastructure files:

```text
package.json
package-lock.json
vite.config.js
eslint.config.js
playwright.config.js
vitest.config.js
.github/workflows/ci.yml
public/_headers
tests/**
```

Agent 19 must not patch production files owned by other agents.

---

# 31. Agent implementation checklists

## Agent 1 checklist

- [ ] Implements canonical `game.start(options)`.
- [ ] Removes positional start signature.
- [ ] Implements game lifecycle states.
- [ ] Emits semantic events through one sink.
- [ ] Removes direct audio calls.
- [ ] Removes quest-ID manipulation.
- [ ] Removes end-of-run persistence.
- [ ] Emits canonical run summary.
- [ ] Maintains immutable encounter results.
- [ ] Implements accurate lane commitment.
- [ ] Implements unified damage handling.
- [ ] Implements unified fatal-damage handling.
- [ ] Renders during `dying`.
- [ ] Shows Continue only after death animation.
- [ ] Tracks continues correctly.
- [ ] Implements multiplayer mode terminal rules.
- [ ] Creates and replaces only `trackRoot`.
- [ ] Disposes replaced player and monster resources.
- [ ] Supports pause/resume.
- [ ] Does not create the main render loop.

---

## Agent 2 checklist

- [ ] Implements object-based `pickCard()`.
- [ ] Never mutates ordered IDs.
- [ ] Creates duplicate-free Daily order.
- [ ] Honors all filters.
- [ ] Honors disabled cards.
- [ ] Honors `enabledModes`.
- [ ] Returns no-results errors.
- [ ] Removes silent filter fallback.
- [ ] Supports deterministic RNG.
- [ ] Preserves adaptive solo weighting.
- [ ] Uses indexed lookups where practical.

---

## Agent 3 checklist

- [ ] Adds schema version.
- [ ] Adds ordered migrations.
- [ ] Deletes legacy API keys.
- [ ] Implements idempotent `finalizeRun`.
- [ ] Implements idempotent flashcard finalization.
- [ ] Adds `perfectRuns`.
- [ ] Adds correct continue tracking.
- [ ] Repairs achievement IDs.
- [ ] Repairs achievement thresholds.
- [ ] Implements quest event mapping.
- [ ] Implements atomic quest claiming.
- [ ] Prevents duplicate totals.
- [ ] Preserves zero volume.
- [ ] Implements reset scopes.
- [ ] Handles corrupt storage.
- [ ] Exports `storage` and `progression`.

---

## Agent 4 checklist

- [ ] Exports canonical ID registries.
- [ ] Aligns descriptions and thresholds.
- [ ] Declares quest event mappings.
- [ ] Removes unreachable definitions.
- [ ] Defines vehicle compatibility.
- [ ] Defines achievement-gated cosmetics.
- [ ] Contains no storage imports.
- [ ] Contains no evaluation side effects.
- [ ] Every ID is unique.

---

## Agent 5 checklist

- [ ] Is the sole main UI controller.
- [ ] Removes duplicate flashcard UI implementation.
- [ ] Removes global callbacks.
- [ ] Removes inline event handlers.
- [ ] Uses safe DOM utilities.
- [ ] Initializes advanced filters.
- [ ] Fixes card-browser focus.
- [ ] Adds pagination or virtualization.
- [ ] Completes profile picture selector.
- [ ] Adds quest claiming.
- [ ] Correctly displays all post-run answers.
- [ ] Supports settings extension mounting.
- [ ] Adds accessible modal behavior.
- [ ] Honors reduced motion.
- [ ] Returns no raw untrusted HTML.

---

## Agent 6 checklist

- [ ] Owns the only main render loop.
- [ ] Removes duplicate button bindings.
- [ ] Removes duplicate flashcard controller.
- [ ] Removes global card-report function.
- [ ] Generates `runId`.
- [ ] Passes canonical game-start options.
- [ ] Installs multiplayer plan before game start.
- [ ] Calls `storage.finalizeRun()` once.
- [ ] Routes engine events to audio once.
- [ ] Routes engine events to multiplayer once.
- [ ] Remounts Settings extensions.
- [ ] Handles visibility pause.
- [ ] Removes stale window card caches.
- [ ] Uses centralized error reporting.

---

## Agent 7 checklist

- [ ] Returns structured data instead of HTML.
- [ ] Finalizes primary session once.
- [ ] Finalizes before missed review.
- [ ] Supports child review sessions.
- [ ] Prevents result loss on restart.
- [ ] Applies all filters.
- [ ] Supports flashcard-only cards.
- [ ] Keeps summaries side-effect free.
- [ ] Produces canonical flashcard summary.

---

## Agent 8 checklist

- [ ] Exports canonical card enums and validators.
- [ ] Avoids importing `cards.js` from `customcards.js`.
- [ ] Validates add/update/import consistently.
- [ ] Rejects malformed cards.
- [ ] Enforces canonical subjects.
- [ ] Enforces distractor uniqueness.
- [ ] Restricts raw cards to flashcard mode.
- [ ] Adds size/count limits.
- [ ] Returns detailed import reports.
- [ ] Adds repository subscriptions.
- [ ] Prevents unsafe types and oversized payloads.

---

## Agent 9 checklist

- [ ] Supports standards-compliant CSV/TSV.
- [ ] Supports quoted multiline fields.
- [ ] Handles BOM.
- [ ] Adds file limits.
- [ ] Cleans SQLite resources in `finally`.
- [ ] Removes browser provider keys.
- [ ] Removes direct provider requests.
- [ ] Implements backend conversion contract.
- [ ] Validates all converted cards.
- [ ] Imports raw cards as flashcard-only.
- [ ] Mounts and unmounts safely.
- [ ] Uses safe DOM APIs.

---

## Agent 10 checklist

- [ ] Implements audio buses.
- [ ] Uses one volume calculation.
- [ ] Preserves zero volume.
- [ ] Uses look-ahead scheduling.
- [ ] Does not restart music on every tempo update.
- [ ] Reuses noise buffers.
- [ ] Adds compressor/limiter.
- [ ] Separates music and ambient lifecycle.
- [ ] Supports pause/resume.
- [ ] Cancels TTS correctly.
- [ ] Adds dedicated jump/land/slide sounds.
- [ ] Prevents duplicate sounds.

---

## Agent 11 checklist

- [ ] Uses protocol version 3.
- [ ] Uses message envelopes.
- [ ] Validates all messages.
- [ ] Adds sequence numbers.
- [ ] Adds match IDs.
- [ ] Implements clock synchronization.
- [ ] Verifies content version.
- [ ] Verifies card-pool hash.
- [ ] Produces deterministic encounter plans.
- [ ] Implements result acknowledgment.
- [ ] Implements disconnect/forfeit behavior.
- [ ] Removes window-global card access.
- [ ] Exposes required pure utilities.

---

## Agent 12 checklist

- [ ] Uses Supabase Auth.
- [ ] Uses `auth.uid()` in RLS.
- [ ] Removes anonymous score writes.
- [ ] Inspects resolved Supabase errors.
- [ ] Preserves maximum profile bests.
- [ ] Produces one ranking row per player/mode/season.
- [ ] Does not delete invites on read.
- [ ] Adds invite statuses.
- [ ] Adds unfriend/block/report.
- [ ] Safely renders remote values.
- [ ] Adds verified-score backend hook.
- [ ] Cleans up subscriptions.

---

## Agent 13 checklist

- [ ] Builds under supplied `trackRoot`.
- [ ] Returns explicit references.
- [ ] Implements safe disposal.
- [ ] Uses shared resources where safe.
- [ ] Instances repeated decorations.
- [ ] Merges static geometry where practical.
- [ ] Supports quality levels.
- [ ] Reduces transparent overdraw.
- [ ] Supports deterministic skin IDs.
- [ ] Supports reduced motion.
- [ ] Keeps track lights under `trackRoot`.
- [ ] Does not traverse/delete unrelated scene objects.

---

## Agent 14 checklist

- [ ] Batches trails.
- [ ] Enforces particle budgets.
- [ ] Fixes excessive scaling.
- [ ] Supports quality levels.
- [ ] Uses no independent RAF loops.
- [ ] Supports pause/resume/reset/dispose.
- [ ] Keeps effects outside `trackRoot`.
- [ ] Pools transient shield/gate effects.

---

## Agent 15 checklist

- [ ] Removes home independent RAF.
- [ ] Implements home update/render APIs.
- [ ] Fixes gesture cooldown ordering.
- [ ] Disposes replaced characters.
- [ ] Disposes replaced monsters.
- [ ] Implements vehicle compatibility behavior.
- [ ] Shares animation conventions.
- [ ] Honors reduced motion.
- [ ] Supports end-run celebration animation.

---

## Agent 16 checklist

- [ ] Uses Pointer Events.
- [ ] Returns input cleanup function.
- [ ] Ignores Rush key repeat.
- [ ] Implements input buffering.
- [ ] Implements remappable controls.
- [ ] Tracks successful jump/slide.
- [ ] Defines obstacle bounds.
- [ ] Prevents impossible layouts.
- [ ] Supports deterministic obstacle plans.
- [ ] Aligns obstacle terminology with documentation.

---

## Agent 17 checklist

- [ ] Removes `user-scalable=no`.
- [ ] Restricts `touch-action: none` to active gameplay.
- [ ] Restores text selection in forms.
- [ ] Uses semantic navigation controls.
- [ ] Adds ARIA labels.
- [ ] Adds live regions.
- [ ] Adds visible focus states.
- [ ] Adds reduced-motion CSS.
- [ ] Adds safe-area behavior.
- [ ] Removes unnecessary inline styles.
- [ ] Adds quality controls.
- [ ] Updates README controls and obstacles.
- [ ] Prepares strict-CSP-compatible markup.

---

## Agent 18 checklist

- [ ] Does not mutate imported card objects.
- [ ] Builds `CARD_BY_ID`.
- [ ] Exports content version.
- [ ] Exports card-pool hash.
- [ ] Validates duplicate IDs.
- [ ] Validates semantic duplicates.
- [ ] Validates subjects.
- [ ] Validates metadata enums.
- [ ] Validates distractor mappings.
- [ ] Detects HTML.
- [ ] Generates machine-readable reports.
- [ ] Fails CI on blockers.
- [ ] Excludes archive data from production build.

---

## Agent 19 checklist

- [ ] Pins dependencies.
- [ ] Bundles production dependencies.
- [ ] Adds linting.
- [ ] Adds type checking.
- [ ] Adds unit tests.
- [ ] Adds browser E2E tests.
- [ ] Adds accessibility tests.
- [ ] Adds XSS regressions.
- [ ] Adds Daily determinism tests.
- [ ] Adds multiplayer-plan tests.
- [ ] Adds progression-idempotency tests.
- [ ] Adds card-validation CI.
- [ ] Adds production build validation.
- [ ] Adds security headers.
- [ ] Supports GitHub Pages base paths.

---

# 32. Integration invariants

The integration audit must verify all of the following.

## 32.1 Run invariants

- `run_ended` fires exactly once.
- `finalizeRun()` is called exactly once by normal application flow.
- A duplicate call does not change totals.
- Encounter totals equal the number of encounter results.
- Correct plus wrong equals encounters completed.
- Daily completion requires the configured encounter count.
- Continues cannot be charged twice for one prompt.

---

## 32.2 Progression invariants

- Every unlocked achievement exists in the registry.
- Every quest exists in the registry.
- Every reward can be claimed once.
- Quest rendering has no persistence side effects.
- Perfect-run achievements use `perfectRuns`.
- Subject mastery uses 50 or more answers and at least 80% accuracy.
- Volume zero persists.

---

## 32.3 Rendering invariants

- One main renderer loop exists.
- Countdown frames continue rendering.
- Death animations continue rendering.
- Home scene never owns a competing RAF.
- Track replacement removes only `trackRoot`.
- Dynamic gameplay objects survive map transitions.
- Rebuilt characters and monsters do not leak GPU resources.

---

## 32.4 Security invariants

- No user or remote string enters interpolated `innerHTML`.
- No inline event attributes remain.
- No AI provider key is stored.
- No dangerous direct-browser provider header remains.
- Supabase writes require authenticated ownership.
- Competitive score submission is not trusted solely from arbitrary client fields.

---

## 32.5 Multiplayer invariants

- Match starts only after config acknowledgment.
- Both clients verify content version and pool hash.
- Both clients use the same encounter plan.
- Host subjects and filters are authoritative.
- Skin selection is deterministic.
- Lane layout is deterministic.
- High Score ends on timer expiration.
- Sudden Death ends on first wrong answer.
- Race ends at target correct count.
- Result recording is independent of message arrival order.
- Disconnect and forfeit outcomes are explicit.

---

# 33. Required automated tests

## 33.1 Storage tests

```text
fresh defaults
legacy migration
corrupt JSON recovery
volume zero persistence
run idempotency
flashcard idempotency
quest claim idempotency
perfect run counting
Daily completion validation
continue counting
achievement registry integrity
reset scopes
```

---

## 33.2 Card tests

```text
all modules import
unique IDs
canonical subjects
required fields
exactly two unique distractors
answer differs from distractors
ww keys match distractors
valid enums
mode eligibility
unsafe HTML detection
semantic duplicate warnings
content hash stability
```

---

## 33.3 Selection tests

```text
empty subjects means all
all filters are honored
empty filters do not silently bypass
disabled cards excluded
Daily deterministic
Daily duplicate-free
ordered IDs immutable
multiplayer deterministic
recent-card avoidance
small-pool behavior
```

---

## 33.4 Engine tests

```text
allowed state transitions
invalid transition rejection
lane commitment
damage with shield
fatal wrong answer
fatal obstacle collision
death animation before Continue
Continue succeeds once
Continue failure
Daily ends at configured count
manual Daily end not completed
High Score timer
Sudden Death elimination
Race completion
run summary consistency
map transition object preservation
run end emitted once
```

---

## 33.5 Multiplayer tests

```text
protocol mismatch
invalid message
stale sequence
wrong match ID
clock-offset calculation
content mismatch
pool-hash mismatch
identical encounter plans
result arrival-order independence
disconnect
forfeit
simultaneous sudden-death resolution
race finish
high-score tie
```

---

## 33.6 UI and security tests

```text
custom-card XSS
profile-name XSS
leaderboard-name XSS
imported-card XSS
search-string attribute injection
card-browser retains focus
Settings remounts Anki
keyboard modal navigation
focus restoration
pinch zoom enabled
reduced motion
quest claim button
complete post-run answer list
```

---

# 34. Agent delivery format

Every implementation agent must return:

1. Complete replacement content for each owned file.
2. No partial patch unless explicitly requested.
3. A list of exports added.
4. A list of exports removed.
5. Dependencies expected from other agents.
6. Contract deviations, if any.
7. Tests required for the file.
8. Known limitations.
9. Migration concerns.
10. A statement confirming no unowned files were edited.

Required footer:

```text
Ownership confirmation:
I modified only the files assigned to my agent in ARCHITECTURE.md.
```

---

# 35. Integration workflow

## Wave 0 — Contract freeze

- Distribute this file to all agents.
- Do not begin production edits before receipt.
- Agents report ambiguities before coding.

## Wave 1 — Parallel implementation

- Each production file has one owner.
- Agents generate complete files.
- Agents may rely only on contracts in this document.

## Wave 2 — Static integration audit

A read-only integration agent checks:

- Imports and exports
- API names
- Event names
- Schema shapes
- Circular dependencies
- Ownership violations
- Duplicate lifecycle responsibility

The integration agent does not edit production files.

## Wave 3 — Owner revisions

- Defects return to the original file owner.
- No cross-owner patching.
- Contracts remain unchanged unless formally revised.

## Wave 4 — Automated validation

Required commands:

```bash
npm ci
npm run lint
npm run typecheck
npm run test
npm run validate:cards
npm run test:e2e
npm run build
```

## Wave 5 — Manual QA

Parallel QA tracks:

- Low-end Android
- Mid-range Android
- iPhone Safari
- Desktop Chromium
- Firefox
- WebKit
- Accessibility
- Multiplayer latency and disconnects
- Security and abuse
- Medical editorial review

---

# 36. Release gates

The release is blocked unless:

- All critical tests pass.
- No duplicate progression occurs.
- Daily completion cannot be falsely awarded.
- Quest rewards are claimable exactly once.
- Every achievement ID resolves.
- No untrusted string can execute markup or script.
- Direct browser AI credentials are removed.
- Authenticated RLS policies are active.
- Multiplayer configurations and results are deterministic.
- Map transitions preserve gameplay objects.
- Main rendering has one owner.
- Mobile memory does not grow continuously in a 30-minute run.
- Active card files pass automated validation.
- Medical content has an editorial review process.
- A clean checkout installs, tests, builds, and deploys.

---

# 37. Deferred feature contracts

The following features are approved for later releases but must not delay stabilization unless separately authorized:

```text
spaced-repetition dashboard
adaptive difficulty
challenge decks
timed practice
wrong-answer comparison view
streak-reactive environments
3D gate labels
victory animations
achievement-linked cosmetics
weekly seeded challenges
clinical boss rounds
differential-diagnosis chains
confidence calibration
personalized remediation
ghost racing
offline/PWA support
study groups
community decks
community card review
seasonal tournaments
```

New features must use the same:

- Card schema
- Safe DOM rules
- Run summary
- Progression transaction
- Deterministic RNG utilities
- Accessibility requirements
- Authenticated backend model

---

# 38. Final authority

This file is the source of truth for the comprehensive update.

In particular:

- `main.js` owns composition and the main render loop.
- `engine.js` owns gameplay simulation and run summaries.
- `storage.js` owns persistence and progression transactions.
- `ui.js` owns main UI rendering.
- `flashcardmode.js` owns flashcard session state.
- `multiplayer.js` owns transport and match protocol.
- `leaderboard.js` owns authenticated social services.
- `trackRoot` owns environment geometry.
- No user or remote content is trusted.
- No completed run is persisted more than once.
```
