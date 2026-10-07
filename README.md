# Dx Dash

**Run the list.**

An endless-runner game for USMLE & COMLEX board prep. Recognize medical buzzwords, swipe into the correct diagnosis lane, dodge obstacles, collect coins, and build your streak.

## Play Online

Visit: `https://pathomnemonic.github.io/buzzword-dash-v2/`

## How It Works

- **See buzzwords** at the top of the screen
- **3 lanes** each have a diagnosis gate approaching you
- **Swipe left/right** (or arrow keys / A/D) to choose your lane
- **Swipe up** (or arrow up / W) to jump over ground obstacles
- **Swipe down** (or arrow down / S) to slide under overhead obstacles
- **Double-tap or Shift/Space** to RUSH through gates for bonus points

## Controls

### Touch (Mobile)

| Action | Gesture |
|--------|---------|
| Move left | Swipe left |
| Move right | Swipe right |
| Jump | Swipe up |
| Slide | Swipe down |
| Rush | Double-tap |

### Keyboard (Desktop)

| Action | Keys |
|--------|------|
| Move left | Arrow Left or A |
| Move right | Arrow Right or D |
| Jump | Arrow Up or W |
| Slide | Arrow Down or S |
| Rush | Shift or Space |
| Pause | Escape |

Rush can be stacked up to 3 times while an encounter is active. Each stack increases your speed and score bonus. You are invulnerable to obstacles during a rush.

## Obstacles

### Jump Obstacles (orange ⬆ arrow indicator)

- **Gurney** — a hospital stretcher on wheels
- **Wet Floor Sign** — a yellow caution cone
- **Wheelchair** — a parked wheelchair blocking the lane
- **Spilled Supplies** — overturned boxes and scattered bottles
- **Fallen Stretcher** — a stretcher tipped on its side
- **Medical Waste Bin** — a red biohazard bin tipped over

### Slide Obstacles (blue ⬇ arrow indicator)

- **OR Doors** — operating room double doors at chest height
- **MRI Tunnel** — an MRI bore you must duck through
- **Caution Tape** — yellow caution tape strung between poles
- **X-Ray Machine Arm** — an overhead X-ray arm extending across the lane

## Game Modes

| Mode | Description |
|------|-------------|
| **Endless** | Play until you run out of lives. Speed increases over time. |
| **Study** | Infinite lives. Teaching points shown after every answer. |
| **Weakness** | Focuses on cards you have previously missed. |
| **Daily 15** | A quick habit: today's 15 cards, one try a day, the same for everyone. Keeps your login streak going. Not ranked. |
| **Weekly Gauntlet** | A real test: 30 cards (the same all week) and just one life. Clear it for a weekly badge and 150 bonus coins; retry as often as you like. Not ranked. |
| **Friend challenge** | Play 15 fresh cards, then send a link; friends play the same cards and compare. Any time, no sign-up. |
| **Versus** | Multiplayer via peer-to-peer WebRTC. |

Daily 15, the Weekly Gauntlet and Friend challenges are deliberately not on a leaderboard: many players finish a fixed set perfectly, so a board would just be a wall of ties. Leaderboards are for Endless, Weakness and Versus, and show each player's single best run per mode (the app only sends a run that beats your best, and the database keeps one row per player, mode and season; run `database/schema.sql` in Supabase to apply that rule).

### The Home screen

Home fits on one screen with no scrolling. Top bar: Settings (left), coins and best score, a Friends button (friends, the activity feed and study groups; the global leaderboard is built but hidden until there are enough players, see `FEATURES.globalLeaderboard` in `js/features.js`) and the profile/account button. Then the level, a one-tap "Today" strip (goal, streak, reviews, weekly reward), the big PLAY button with **Filters** (subjects, exam and advanced filters, plus game speed) on its left and **Quests** on its right, both popups, and a "How to play" link that opens the guided tutorial, which is played on the real track (see below). Three ways to play sit below: **Versus**, **Flashcards** (a popup to choose due, missed, new or your subjects, then flip cards or listen hands-free) and **Challenge** (a popup explaining Study, Weakness, Daily 15, Weekly Gauntlet, Friend challenge and Exam Sim). The tab bar is Stats, Locker, **Home** (center), Cards and Profile (with your streak calendar and badges). Swipe left or right to move between tabs; a slim indicator along the top of the tab bar shows where you are.

Dash: after the third game a phone player is asked about double-tap dashing on the results screen; that card stays on every results screen until one of its two buttons is pressed, and either answer is final. Dash: on phones and tablets the default is an on-screen Dash button (double taps fire by accident while swiping); on a computer it is a double-click, and Space or Shift always work. After the third game, a phone player is asked once whether to switch to double-tap dashing (with a note that it can trigger by accident and can be switched back). Settings -> Look -> Dash control has Automatic, Double-tap, Button and Off, and the tutorial teaches whichever you use. The run looks fast (walls, floor, scenery and legs move about 2.2x faster) while the time to each gate is unchanged. During the 3-2-1 the scene stays visible, so you can see your runner's face and the monster behind them.

Controls feel forgiving: jumps hang in the air for about a second and slides last nearly a second. Jumping cancels a slide, and sliding in the air drops you fast and slides on landing. Animated characters use their own roll or crouch animation to slide, never a faceplant. A model whose only dodge clip is a very short flip (Stat Sadie's) does not loop it: she crouches and keeps running, like the models with no slide clip.

## Power-ups

Each orb floats a shape that shows what it does, so nothing has to be memorized.

| Power-up | Shape on the orb | Effect |
|----------|------------------|--------|
| 🛡 Shield | a shield | Absorbs one hit from an obstacle or wrong answer |
| 🧲 Magnet | a horseshoe magnet | Attracts nearby coins to you for 10 seconds |
| 2× Score | "2×" | Doubles points earned for 15 seconds |
| 🤖 Auto-Pilot | a steering wheel | Automatically steers to the correct lane for 1 gate |
| 💎 Frenzy | a gem | Multiplies coin value by 5 for 8 seconds |

## Hearts

When you are down to 1 life, heart pickups may appear on the track. Collecting one restores a life (up to the starting maximum of 3).

## The Exam Monster

An exam monster chases you from behind. Every run opens with a quick look-back shot that shows it lurking behind you, then the camera swings round to the normal view and the monster is out of sight. It only shows up when you slip (a wrong answer or a lost life): then it drifts in from behind the camera as if catching up, and once you have answered one or two correctly it drifts away again. It never fades; it always moves. If it catches you it lunges in, hits the runner and sends them flying, and your run ends. 

The monster follows the game mode. Study and timed practice have no way to lose, and sudden death ends on the first wrong answer, so there is no monster in those. Weakness practice gives you more room (a wrong answer moves it less, a right one pushes it back more). Every other mode uses the standard monster, and it depends only on your answers, so challenges, the Gauntlet and versus stay comparable.

## Maps

Everyone starts with the four hospital rooms (Hospital Hallway, Operating Room, Research Lab, Ambulance Bay). Every other map is a bright, animated "world" that unlocks at a player level (one more every five levels, in the order in `js/game/mapunlocks.js`) or can be bought early in the Locker's **Maps** tab (`map_*` items in `js/game/shopdata.js`; which maps are free is `isIndoorSkin` in `js/game/skins.js`). A run opens on a random hospital room. The first map change goes to a world map the player owns (or another hospital room if they own none), and after that the next map is random among the maps they own. A favorite map (Locker -> Maps, or Settings) stays for the whole run, and only maps you own can be chosen. Shared multiplayer maps are the host's choice and ignore ownership. Someone who already had a map as their favorite keeps it.

## Look

The menus have a fun, campy arcade look: grape purple, candy pink and bright accents, with medical odds and ends (pills, syringes, microbes, brains, ambulances and so on) flying out of the middle of the screen behind the menus. The season and time of day only tint it (a cooler indigo with ice-blue accents in winter, orchid with blossom pink and lime in spring, magenta with coral and sunshine in summer, plum with pumpkin and berry in autumn; lighter by day, deeper at night). There are no falling leaves or snowflakes. The flying objects turn off for reduced motion. By default ("Surprise me") the look switches to a different season's colors after every run, or after about 20 minutes, with a small toast. Settings -> Colors can follow the date instead (Seasonal), pin a season, or switch to Classic.

## Filters, badges and red dots

The three question filters (subjects, exam and the advanced ones) sit on one page, opened from a single "Question filters" row on Home that shows what is active (for example "All subjects" or "Cardiology · 2 filters"). Badges live in the profile: every badge is listed there, earned ones can be pinned (up to 6). Red dots mark what is waiting for you: a badge you have not looked at yet (on the Profile buttons), a finished quest or the weekly goal whose coins are unclaimed (on Quests and the weekly goal), and new things you can afford in the Locker. A dot goes away once you have seen or claimed the thing.

## Asking for shares, ratings and accounts

Now and then the results screen offers one small card: share the game with a friend, rate it on the store, or make a free account to keep progress safe. The timing is deliberate (`js/prompts.js`): only after a good run or a new best score, never during a run or exam, not in the first runs, at most one ask every three days, each kind backing off (14, 28, 56 days) and stopping after three asks, and "Don't ask again" or doing the thing ends that kind for good. An ask only appears when it can work: no "rate" without a store link (set `VITE_REVIEW_URL`; the Android app falls back to its Play Store page), no "make an account" when signed in or when accounts are not set up. Sharing uses the system share sheet, or copies a link (`VITE_SHARE_URL` overrides the link).

## Card quality

Cards are checked when the app loads (`js/cards.js`, `js/cardschema.js`). The validator drops a card only if it is broken (bad subject, missing answer, not exactly two different distractors, fewer than two usable clues). It also removes any clue that gives the answer away (`js/cardleaks.js`): a clue leaks when it contains the whole answer or a word distinctive to the answer. Matching is by whole words, and words that are common across the deck's answers ("syndrome", "acute", "tumor") are treated as categories, not giveaways. `npm run audit:cards` prints what the validator did (add `--weak`, `--cut` or `--dups` for lists); cards whose clues all repeat their title are flagged "weak" and kept, and a test stops that list growing. Every one of the 3,010 cards has at least three clues, none is cut mid-sentence, and a card shows at most 260 characters of clues so it fits a phone screen (tests enforce all of this).

## Scoring

- Correct answers build your streak.
- Every 5 correct answers increases your multiplier (up to 8×).
- Higher game speed earns more points per correct answer.
- Rushing through a gate awards bonus points based on distance and stack count.
- Coins are collected during the run and added to your total at the end.

## Subjects

The game covers 15 medical subjects:

1. Neurology
2. Cardiology
3. Nephrology
4. Psychiatry
5. Gastroenterology
6. Pulmonology
7. Infectious Disease
8. Endocrinology
9. Hematology/Oncology
10. Rheumatology
11. Obstetrics/Gynecology
12. Pediatrics
13. Surgery
14. Emergency Medicine
15. Multisystem / Mixed

Select any combination of subjects on the home screen. Leaving all subjects deselected includes all of them.

## Filters

- **Exam Filter** — filter cards by exam relevance (Step 1, Step 2, COMLEX, Shelf exams)
- **Question Type** — filter by buzzword diagnosis, treatment, workup, mechanism, side effects, etc.
- **Year** — filter by medical school year (M1–M4)
- **High-Yield Only** — show only high-yield flagged cards

## Features

- **1,200+ medical flashcards** across all 15 subjects
- **Spaced repetition** card selection that prioritizes cards you have missed or not seen recently
- **12 track environments** with unique music, visuals, and atmospheric effects
- **Map transitions** every 10 encounters with music crossfade
- **13 avatar skins** including 3 vehicle avatars (Ambulance, Race Car, Hearse)
- **60+ cosmetic items** — hats, clothing, trails, and gear
- **Flashcard study mode** — study without the runner game
- **Card browser** — search, filter, enable/disable individual cards
- **Custom cards** — create, import, and export your own cards
- **Anki import** — import .apkg, CSV, or TSV files with optional AI conversion
- **Achievements and quests** — a pool of 48 quests in six categories (accuracy, volume, skill, explore, mode, speed); each day six are on offer, one per category, the same for every player and never repeating yesterday's (`pickDailyQuests` / `questIdsForDate` in `js/game/shopdata.js`). Finishing all six earns a gold calendar day. Plus 50+ achievement badges, each of which can really be earned (`tests/unit/achievements.test.js`)
- **Profile** — set a display name, select badges, and track lifetime stats
- **Leaderboard** — global and friends leaderboard (requires Supabase setup)
- **Multiplayer** — real-time versus mode via PeerJS WebRTC
- **Procedural music** — each track skin has its own generated music style
- **Night mode** — darker color palette for low-light studying
- **Text-to-speech** — optional TTS reads buzzwords aloud
- **Study streak calendar** — tracks daily study activity
- **Continue system** — spend coins to continue after losing all lives
- **Speed dial** — adjust game speed from 1× to 10× for more points. The run speeds up as you go: by default +0.5 every 20 questions, and Settings → Gameplay lets you turn that off or choose your own (a custom rule makes the run unranked, like the other rule changes). The road, scenery, gates, obstacles and coins all move at the same look-speed as the floor and the runner's legs, and start proportionally farther away, so the time to reach a gate depends only on the speed, not on how fast it looks. Obstacles are checked as they reach the runner, and a jump or slide that is under way (about a second each) clears them.
- **Spaced repetition** — each card is scheduled with FSRS, the open algorithm Anki offers (`js/fsrs.js`; cards saved with the older schedule are converted the first time they are reviewed). Due cards surface first and the home screen shows how many are due. In the study plan you can set your exam date (for a pace of new cards per day), a target retention, and see a mastery level per subject (New, Learning, Solid, Mastered, from your answers and accuracy; `js/readiness.js`)
- **Missed-card remediation** — a card you miss comes back a few encounters later in the same run
- **Daily study goal** — configurable cards-per-day target with a progress bar, plus a "focus area" (weakest subject) after each run
- **Weekly leaderboards** — this-week and all-time boards per mode, with friends, requests and match invites
- **Accessibility** — colorblind-safe palette, keyboard-operable switches, and keyboard flashcards (Space to reveal, arrow keys or 1/2 to rate)
- **Card reports** — flag a card from the post-run review; reports are saved locally and sent to Supabase when signed in
- **Exam simulation** — timed blocks (10/20/40 questions) with no instant feedback, flagging, a question map, and a report by subject with a practice readiness band
- **Weak-spot dashboard** — today's study plan, 7-day review forecast, and accuracy by question type, with one-tap review of due cards
- **Study streak, shields and weekly goal** — the streak counts every day you answer at least one card (one number on Home, the Today sheet, the Profile and the calendar); earn a shield every 7 days, and a shield covers one missed day; hit your daily goal on 5 days a week for a coin reward; optional daily reminder notification
- **Async challenges** — play 15 seeded questions, share a link with your score, and a friend plays the same cards to beat it (no server needed)
- **Study groups** — private class leaderboards joined by code (needs Supabase)
- **Deck sharing** — publish your custom cards and share a code; import by code (needs Supabase)
- **Hands-free audio review** — the game reads clues and answers aloud, for commutes
- **Visual polish** — bloom glow, subject icons on gates, a run-start fly-in, slow motion on lightning-fast answers, screen feedback and streak flames, recolorable characters in the Locker, and a redesigned exam monster
- **Women in the roster** — Dr. Dash (a physician) and the Scout are full animated characters. The medical characters (Pager Pete, Dr. Dash, Paramedic Pat) can all be given any skin tone, and Pager Pete and Dr. Dash any hair color, so one character covers many looks.
- **Any color** — beside each part's swatches is a rainbow swatch that opens a full color wheel (drag it or use the arrow keys), a brightness slider and a color-code field, so any color can be picked (`js/colorwheel.js`).
- **Animated characters** — real glTF models with authored animation clips. Each one has its own recolorable parts and palettes in the Locker (a doctor's scrub top and pants, a robot's body and trim, and so on), saved per character.
- **Purchasable exam monsters** — Pager Wraith, Textbook Golem and Caffeine Kraken, each with its own back-view design
- **Per-map hazards** — each track has a signature hazard (blackout, fog, tremor, pulse, glitch, flare, speed surge) in solo runs; never in seeded or competitive modes and skipped for reduced motion
- **Adaptive music** — layers build with your streak and a tense drone rises as the monster closes in
- **Share image** — save or share a styled picture of your run result
- **Weekly Gauntlet** — 30 cards, the same all week, just one life; clear it for a weekly badge and bonus coins (not ranked)
- **Why not that one?** — after a miss the teaching line also says why the answer you ran into is wrong (from the card's per-answer reasons, `js/explain.js`), and stays up long enough to read
- **Interleaving** — flashcard sessions never put the same subject twice in a row when another is available (`js/interleave.js`), and cards past their FSRS due date come first
- **First weeks checklist** — seven small steps in the Today popup (a run, flashcards, the Daily 15, your exam date, a trail, a three-day streak, a visible profile), hidden when finished, after two weeks, or on request (`js/firstweek.js`)
- **Challenge links that survive updates** — a friend-challenge link carries its card ids, so it still plays the same cards after the card set changes (`js/challenge.js`)
- **Graceful offline and low battery** — a notice when the connection drops or returns, a clear message in Friends, and "Auto" graphics step down a tier below 20% battery (`js/offline.js`, `js/battery.js`)
- **Friend activity feed** — a Strava-style feed (`js/feedui.js`, `js/sharing.js`): your runs, personal bests and milestones with the numbers, kudos from friends (one tap, or pick a reaction), a weekly recap, the kudos you got, and a one-tap challenge. You choose who sees your runs (friends or only you) and can hide or delete any post. Server rules (private posts, blocks, rate limits) are in `database/schema.sql` and tested in `tests/unit/database.test.js`
- **Study buddies and public groups** (built and tested, hidden behind `FEATURES.discovery` until there are enough players; see `docs/DISCOVERY.md`)
- **Group weekly goals** — a shared cards-per-week target with a progress bar and contributor list
- **Offline decks** — decks fetched by code are saved on the device and can be re-added without a connection
- **Progress backup** — save and restore all progress as a JSON file (Settings)
- **Installable / offline** — PWA manifest and service worker (production build)

## Accessibility

- Pinch-to-zoom is enabled (no `user-scalable=no`)
- Touch gestures are restricted to the game canvas only, not menu screens
- Text selection is restored in all form inputs
- Navigation uses semantic `<nav>` and `<button>` elements
- ARIA labels, roles, and live regions are provided for screen readers
- All interactive elements have visible `:focus-visible` outlines
- A `prefers-reduced-motion` media query disables animations
- Safe-area insets are respected for notched devices
- Modals trap focus and restore it on close
- No inline event handlers or inline styles are used in the HTML
- Settings → Look: a dyslexia-friendly font (OpenDyslexic, bundled, nothing is fetched from a font service) and a button side for left-handed play (Dash and Auto-Pilot move to the left)
- Settings → Your Rules: Relaxed pace runs single-player games at 65% speed with no speed-up. Progress and coins count; the run is marked custom, so it is not posted to leaderboards
- Settings → Data: Study report (copy a summary or save a CSV with no name or account details) and, on the web version, Play with no connection, which downloads the cards, models and portraits listed in the build's `offline-manifest.json` into the service worker's cache

## Development

```bash
npm ci
npm run dev            # local dev server
npm run lint && npm run typecheck && npm test
npm run validate:cards # validate card data
npm run build          # production build into dist/
npm run test:e2e       # Playwright (needs a build)
npm run soak -- --minutes 30   # a bot plays every mode with random inputs, watching for crashes and leaks (needs a build served on :4173)
```

The production build ships a Content-Security-Policy in `index.html` (`tools/csp.mjs`; the Supabase host is read from `VITE_SUPABASE_URL`), and the card database is split into one file per subject (`cards-<subject>-<hash>.js`), so an update only re-downloads the subjects that changed.

## Deploying

Pushing to `main` runs `.github/workflows/deploy.yml`, which lints, tests, builds with the right sub-path and publishes to GitHub Pages (Settings -> Pages -> Source: GitHub Actions). To enable the leaderboard in the deployed build, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as repository variables.

## Setup (manual GitHub Pages)

1. Create a new GitHub repository called `buzzword-dash`
2. Upload all files maintaining the folder structure:

buzzword-dash/
├── index.html
├── css/
│ └── style.css
├── js/
│ ├── main.js
│ ├── ui.js
│ ├── audio.js
│ ├── cards.js
│ ├── storage.js
│ ├── customcards.js
│ ├── ankiimport.js
│ ├── multiplayer.js
│ ├── leaderboard.js
│ ├── cards/
│ │ ├── neurology.js
│ │ ├── cardiology.js
│ │ └── ... (one file per subject)
│ └── game/
│ ├── engine.js
│ ├── gates.js
│ ├── input.js
│ ├── obstacles.js
│ ├── player.js
│ ├── track.js
│ ├── skins.js
│ ├── skinbuilders.js
│ ├── themes.js
│ ├── props.js
│ ├── trails.js
│ ├── powerupfx.js
│ ├── homecharacter.js
│ ├── preview.js
│ ├── exammonster.js
│ ├── flashcardmode.js
│ └── shopdata.js


3. Go to **Settings → Pages → Source** and select the `main` branch
4. Your game will be live at `https://pathomnemonic.github.io/buzzword-dash-v2/`

## Error reporting (Optional)

Uncaught errors and unhandled promise rejections are logged to the console. To also collect them, set a build-time endpoint that accepts a JSON `POST`:

```
VITE_ERROR_ENDPOINT=https://example.com/dxdash-errors
```

(In GitHub, add it as a repository variable named `VITE_ERROR_ENDPOINT`.) With no URL set, nothing leaves the device. Separately, players can switch on **Settings → Data → Help fix problems** to send anonymous crash and slow-frame reports to the `client_diagnostics` table (`database/schema.sql`; nobody but you can read it in the Supabase table editor; no account id is stored). Each report holds only the error message, a trimmed stack, the area it came from and the build id, with no account, score or card data, and a page load sends at most 10 distinct reports.

## Updates and offline cache

The card chunks and game code are cached as they are first used. Settings → Data → Play with no connection fetches everything else (3D heroes, monsters, maps) in one go; the phone apps already contain it all.

The service worker's cache is named after the build (the commit in CI), so every deploy starts a fresh cache. When a new version finishes installing while the game is open, a notice offers a reload.

## Tips (Optional)

Dx Dash is free. To let players leave a tip, create a page on Ko-fi, Buy Me a Coffee, GitHub Sponsors or a Stripe Payment Link, then set its URL at build time:

```
VITE_TIP_URL=https://ko-fi.com/yourname
```

(In GitHub, add it as a repository variable named `VITE_TIP_URL`.) With no URL set, no tip UI is shown. When set, a "Support the developer" button appears in Settings, and a rare note appears after a good run: never during a run or exam, only after five or more runs, at most once a week, and players can turn it off for good. Only `https` links are accepted.

## Leaderboard, Friends and Invites Setup (Optional)

The leaderboard, friend requests and match invites use [Supabase](https://supabase.com/) (free tier).

1. Create a Supabase project.
2. In the SQL editor run `database/schema.sql`, then `database/policies.sql` (both are safe to re-run).
3. In **Authentication -> Providers**, enable **Allow anonymous sign-ins**. Players are signed in as guests automatically; they can link an email later from the Account tab.
4. Provide your project URL and anon key, either by setting `SUPABASE_URL` / `SUPABASE_ANON_KEY` in `js/leaderboard.js`, or (preferred) with environment variables at build time:

   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

   The anon key is safe to expose; Row Level Security protects the data.
5. Optional: Database -> Replication, confirm `match_invites` is enabled for realtime invite pop-ups (schema.sql does this).

Group boards and deck sharing use the same setup (`schema.sql` creates the tables and functions).

### Accounts and cloud saves

Players start as guests. From **Leaderboard -> Account** they can create a free account with an email and password (a guest keeps their scores, friends and groups when they upgrade), sign in on another device, and reset a forgotten password. Signed-in players get their progress saved to the cloud automatically (table `player_saves`, private to each account). If a device and the account both hold progress, the player is asked which to keep, and one device can never silently overwrite a newer save from another.

Supabase setup for accounts:

1. Re-run `database/schema.sql` and `database/policies.sql` (adds the `player_saves` table and save functions).
2. **Authentication -> Providers -> Email**: enabled by default. Decide whether to require **Confirm email** (recommended).
3. **Authentication -> URL Configuration**: set **Site URL** to your live game URL (for example `https://<user>.github.io/buzzword-dash-v2/`) and add it, plus `http://localhost:5173`, under **Redirect URLs**. Confirmation and reset links send players back here.
4. Supabase's built-in email sender is limited to a few messages per hour. For real use, add your own SMTP provider under **Authentication -> SMTP Settings** (Resend, Postmark, SendGrid, Brevo and similar all work).

In the app: set a display name on the Leaderboard screen, then use **Find** or **＋ Add** to send friend requests, **Requests** to accept them, and **Invite** on a friend (after hosting a multiplayer room) to send a match invite.

## Credits

- `css/fonts/opendyslexic-*.woff2` — OpenDyslexic by Abbie Gonzalez ([opendyslexic.org](https://opendyslexic.org/)), SIL Open Font License 1.1 (see `css/fonts/OpenDyslexic-LICENSE.txt`), via the `@fontsource/opendyslexic` package.

- `public/models/characters/{scout,rogue-hooded,knight,mage,barbarian}.glb` — the Rogue, Hooded Rogue, Knight, Mage and Barbarian from the KayKit Adventurers Character Pack 1.0 by Kay Lousberg ([kaylousberg.com](https://www.kaylousberg.com/), CC0 1.0); the weapons were removed and the animation clips trimmed with `tools/import-character.mjs`. The Knight, Mage and Barbarian are imported with `--split`, which gives each piece (headwear, cape, arms, body, head, legs) its own material so every piece can be recolored.

- `public/models/characters/*.glb` and `public/models/monsters/*.glb` — animated characters and monsters by [Quaternius](https://quaternius.com/) (CC0 1.0, public domain), downloaded from [Poly Pizza](https://poly.pizza/). Characters (as the model packs name them: Explorer, Ranger, Adventurer, Hooded Rogue, Zombie, Ninja, Bones, Orc, Archmage, Alien, Mecha Bot, King, plus the Doctor, Nurse and Paramedic; the game gives them their own names in `js/game/modelcatalog.js`) and six monsters (Ghost, Flying Skull, Yeti, Brute, Demon, Dragon). Catalog and clip mapping live in `js/game/modelcatalog.js` and `js/game/charactermodel.js`.

- `public/models/obstacles/*.glb`, `public/models/props/*.glb` — small props (hospital bed, traffic cone, cardboard boxes, traffic barrier, trash can, street light, air conditioner) by [Quaternius](https://quaternius.com/), and a computer screen and hospital sign by [Kenney](https://kenney.nl/), and a telescope by CreativeTrio; all CC0 1.0, from [Poly Pizza](https://poly.pizza/).

- `public/models/obstacles/*.glb` (crate, traffic light, chandelier, spot light, sign) and `public/models/props/*.glb` (heart, first aid kit, potion bottle, skull, bone, tree) — by Quaternius (CC0 1.0) except the chandelier (CreativeTrio) and spot light (iPoly3D), all CC0 1.0 from [Poly Pizza](https://poly.pizza/); the tree is by Kenney.

- `public/models/medical/*.glb` — set dressing for the hospital hallway, operating room, research lab and ambulance bay, downloaded from [Poly Pizza](https://poly.pizza/). Licensed CC BY 3.0 (credit required): Wheelchair by Poly by Google, IV stand ("15") by Daisuke Takeoka, Doctor by jeremy, Wet Floor Sign by J-Toastie, Microscope by Colonel Cthulu, Science Tubes by Ryan Donaldson, Lab Desk by Colonel Cthulu, Ambulance (two) by Poly by Google and jeremy, Fire Extinguisher by Jarlan Perez. The hospital bed and traffic cone in the rooms are the CC0 Quaternius ones listed above. These credits are also shown in Settings -> About.

- `public/models/kaykit/kaykit.glb` — props for the bright maps (burgers, kitchen and diner pieces, pumpkins, jack-o'-lanterns, candles, a ribcage and a coffin for the skeleton party, autumn trees, city buildings, furniture) from the KayKit Restaurant Bits, Halloween Bits, City Builder Bits and Furniture Bits packs by Kay Lousberg ([kaylousberg.com](https://www.kaylousberg.com/), CC0 1.0). `tools/pack-kaykit.mjs` packs only the models the maps use into one file that shares one swatch texture; the packs are not stored in this repository (see the tool's header for where to get them).

- `public/models/characters/{doctor,nurse,surgeon,paramedic,resident}.glb` — the medical staff: Quaternius's CC0 "Casual Character", "Animated Woman" and "Worker" (from [Poly Pizza](https://poly.pizza/)), repainted into scrubs, a white coat and a paramedic uniform by `tools/make-medical-characters.mjs`. Animations are the originals.

## Bright maps

Twenty-two extra maps are bright, colourful, campy "worlds" built from many assets, like the Hospital Hallway but sunnier: Pediatric Playland, Sunshine Rehab Garden, Vet and Farm Clinic, Holiday Wards (which dresses itself for winter, spring, summer, autumn or an everyday party by the calendar), Cafeteria Carnival, Neonatal Cloud Nursery, Anatomy Amusement Park, Pharmacy Pop Factory, Aquarium Imaging Center, Rooftop Helipad Resort, and the twelve upgraded body-and-science maps: Neural Highway (a bubblegum brain-wave speedway), Vascular Rush (a splash-park slide through the bloodstream), Neon ER (a retro neon diner of an emergency room), Surgical Theater (velvet curtains and spotlights), Candy Lab, Prescription Sunset (a golden-hour boardwalk that keeps its sunset), Skeletal Corridor (a skeleton dance party under giant rib arches), Cellular Matrix (a jelly-bright playground inside a cell), DNA Helix Tunnel (giant double helixes turning on the walls), Cardiac Pulse (a valentine carnival in a thumping heart), X-Ray Vision (a radiology disco) and Defibrillator Shock (an electric amusement park). Faces, bolts, capsules and light strings shared by the upgraded maps are in `js/game/maps/cartoon.js`. Each repeats every 16 units so it scrolls without a seam; the shared building blocks are in `js/game/mapkit.js` (materials, shapes, painted textures, kit models), `js/game/mapfx.js` (the moving parts: shared-material animation, spinning features, drifting movers, instanced swarms of fish, balloons, butterflies...) and `js/game/mapprops.js`; each map is one file in `js/game/maps/`, registered in `js/game/worlds.js` and `js/game/skins.js`. The motion is decoration: it stays off the lanes, and tests (`tests/unit/worldmaps.test.js`) check every map keeps the lanes clear, repeats without a seam and stays within a draw-call and triangle budget. Players who prefer reduced motion see the scenery still.

## Graphics

The world is lit with physically based materials, a soft studio reflection map and ACES tone mapping (`js/game/materials.js`). Tracks have a gradient sky with stars, distance haze and a glossy floor; walls, obstacles, gates, coins and power-ups use lit materials and rounded geometry so they match the animated characters. Every obstacle, all floating scenery and the street lights and trees along the track are real 3D models (`js/game/scenery.js`).

**Graphics tiers:** Settings -> Graphics chooses Auto, High, Medium or Low. *High* is everything (3D characters and monsters, 3D obstacles and scenery, glow, shadows). *Medium* keeps the animated 3D character and monster, the sky, reflections and lit materials, but uses simple built-in obstacles and scenery, no glow or shadows, and caps resolution at 1.5x. *Low* is the fast backup: the simple built-in characters and obstacles, no model downloads, and normal resolution. Auto picks Low for software rendering, very little memory or 2 or fewer cores or data-saver, Medium for modest devices (4 GB or fewer, 4 cores or fewer, or touch-first), otherwise High, and steps down a tier after repeated slow sessions. Adaptive resolution also trims the render resolution in small steps while the game runs slowly and restores it when there is headroom. Cached model geometry is shared between copies and never freed by one copy, shader compilation is warmed up during the countdown, and the service worker caches model files after first use.

**Character voices:** every character cheers when you score and groans when you miss, each with a voice of their own (`js/charactervoices.js`). These are not speech: each reaction (a "woo-hoo", a "yay", an "aww", an "oh no") is a short vocal sound built live with the Web Audio API from a buzzing voice source run through vowel filters, with a different pitch and vocal size per character, and special sounds for the robot (beeps), the alien (chirps), the zombie and orc (groans and roars) and the skeleton (rattles). Nothing is downloaded and nothing needs a license. **They are switched off for now** (they sounded too robotic): see `FEATURES.characterVoices` in `js/features.js`; the code and its tests are kept.

**How to play:** the practice teaches left, right, jump, slide, then picking the right lane for a real question, and only then the dash. The coach card sits near the top of the screen while the track is empty and just under the answer boxes once a question is up, never over the lower part where the thumb swipes. The tutorial (`js/tutorialrun.js`) is an ordinary run on the real track with the real top bar, clue and answer gates. A welcome page starts it; then a coach card at the bottom asks for one move at a time and only then sends what that move needs: left, right, a jump over an obstacle, a slide under one, a dash through a real question, and finally picking the right gate. A missed obstacle or question is sent again. Nothing from it is saved (no score, coins, stats or history), and it can be left at any time with the small × on any of its pop-ups (or Escape, or the Android back button), which first asks "Exit the tutorial? You can open it again any time with How to play on the Home screen." There is no Skip button. After the last practice step the run is put away and a **spotlight tour** (`js/tour.js`, steps in `js/tourdata.js`) walks through the real screens: the screen is dimmed except for one highlighted element, a card explains it, and you press the highlighted spot to go on (PLAY and the other Home buttons only count the press; the bottom tabs and the Locker's buy and equip buttons really work). It covers Home (coins, PLAY, Filters, Speed, then a short section for each way to play: press Versus, Flashcards or Challenge to open it and see what is inside, with Challenge going through Study, Weakness, Daily 15, the Weekly Gauntlet, Friend challenge and Exam Sim one by one; then Friends and Settings), Stats, the Locker (the starting coins buy the cheapest trail, which is then worn and shown in the display), Quests and Profile. A step whose element is missing just gets a Next button, and the tour has the same × and warning. New players start with exactly 300 coins, the price of the Pill Trail (the cheapest trail) the tour has them buy, and no more. Where the runner cannot start (no WebGL) the older practice-track tutorial (`js/tutorial.js`) is used instead. The tab screens (Stats, Locker, Home, Quests, Profile) have no Back button, since the bottom bar and a swipe move between them.

**Sound:** the music has no hi-hats and there are no random environmental beeps, which sounded like a constant tapping behind the busier tracks. A right answer plays a rising chime and a wrong one a soft falling two-note sigh. The runner's synthesized voices are switched off (they sounded robotic; `FEATURES.characterVoices` in `js/features.js` brings them back). *Read questions aloud* (Settings -> Sound) reads the clues and then "Left: ..., Middle: ..., Right: ...", planned from the time left before the answer locks (`js/readaloud.js`): natural pace if there is time, faster (up to 2x) if not, only the clues if the answers will not fit, only whole clues if even those will not, and silence if not even the first fits. It measures how fast the device's voice really talks and remembers it, and stops at the answer, on pause, and when the run ends. The music is one track per screen: the menu track on Home and menus, the map's own track during a run (changing as the map changes), and back to the menu track after. Every music generator is tracked, so stopping, changing track in the middle of a crossfade, or leaving the app (tab hidden, page hidden, native background) silences all of them.

**Locker:** four even tabs on one line: 🦸 Heroes, ✨ Trails, 🗺️ Maps and 👾 Monsters. The colors belong to the hero, not to a tab of their own: a card at the top of Heroes says who you are wearing and, if that hero can be recolored, has a *Change colors* button that opens the colors right there. A 🎨 beside a hero in the list means its colors can be changed (dimmed until you own it); tapping it equips the hero and opens the colors.

**Hero pictures:** on the Profile screen, *Change symbol* lists the heroes you own, as a face or the whole hero, above the symbols. A hero picture is stored as a short text (`hero:<hero id>:<face|body>`, under 30 characters) in the same field a symbol uses, so it costs no storage and adds nothing to what is sent to other players (the database already allows 64 characters). The images are 32 small portraits that ship with the app (`public/portraits`, about 140 KB in all, made from the hero models in their default colors by `tools/make-portraits.mjs`): nothing is uploaded. Only hero ids the app knows are accepted, and a missing image falls back to the hero's emoji, so a damaged value or an older install can never break a profile.

**Locker display:** the display at the top stays in view while the list scrolls. Tapping a trail (or its eye) streams it behind your runner, turned to face away as in the game; tapping a monster shows it in place of the runner; leaving the Trails & Monsters tab puts the runner back.

**Locker:** the Locker has three tabs. *Characters* lists the characters. *Customize* shows only what works on the equipped character (characters with recolorable parts get color pickers). *Trails & Monsters* works with every character. The original blocky characters, the vehicles and the original monsters are archived: they stay in the code (`ARCHIVE_CLASSIC` in `js/game/shopdata.js`) but are hidden from the Locker, and anyone who was using one is moved to Pager Pete or the Ghost.

**Performance work:** add `?debug=1` to the URL to expose the engine as `window.__game`; `renderer.info` then reports draw calls and triangles. A typical frame went from about 2,000 draw calls and 195,000 triangles to about 240 and 45,000 through: merging static scenery by material (`mergeStatic` in `js/game/materials.js`); merged, periodic scrolling decorations (fog handles the distance fade); one glowing point cloud for the atmosphere; cheaper box rounding (108 triangles, finer only for coins and gates); shared model geometry; and half-resolution bloom. Downloads shrank too: the 2.6 MB question database loads in the background after the first screen (`js/cardhub.js`; `js/cards.js` stays the synchronous source for tools and tests), and the animated character and monster models are 4.1 MB instead of 11.6 MB (`node tools/optimize-models.mjs` drops unused animation clips and applies meshopt compression; loaders use `js/game/gltfloader.js`). Settings has a Battery saver (30 fps) toggle, and the home screen always renders at 30 fps.

## Mobile app (Android and iOS)

**Publishing: start with [docs/RELEASE_GUIDE.md](docs/RELEASE_GUIDE.md)** (Google Play first, then the App Store; ready-to-paste listings are in `store/`, moderation in [docs/MODERATION.md](docs/MODERATION.md)). The game is wrapped with Capacitor, so the same code runs as a phone app. The Android project is in `android/` (build it with `npm run app:android`, or run the **Android app** workflow on GitHub for a downloadable APK). iOS is finished on a Mac; see **[docs/APP.md](docs/APP.md)** for the full guide, what only you can do (developer accounts, signing key, screenshots), the testing checklist and store steps, and [docs/STORE_LISTING.md](docs/STORE_LISTING.md) for draft store text and the privacy answers. Privacy Policy and Terms of Use pages are in `public/` and linked from Settings; players can delete their account in-app.

## Technology

- **Three.js** (r160) for rendering (bundled)
- **Web Audio API** for procedural sound effects and music
- **PeerJS** for multiplayer WebRTC connections (bundled, lazy-loaded)
- **Supabase** for leaderboard persistence (bundled, lazy-loaded, optional)
- **Vite** for dev server and production build (`npm run dev`, `npm run build`)

## Browser Support

- Chrome / Edge 90+
- Firefox 90+
- Safari 15+
- Mobile Chrome and Safari on Android and iOS

WebGL is required for the game renderer.

## License

This project is provided for educational purposes. The medical content is intended for board exam preparation and should not be used for clinical decision-making.

## Contributing

To add new cards, create or edit files in `js/cards/` following the existing card schema. Each card requires:

- `id` — unique identifier
- `subj` — one of the 15 canonical subjects
- `bw` — array of 2–4 buzzword strings
- `ans` — the correct diagnosis
- `d` — exactly 2 plausible distractors
- `tp` — a teaching point explanation
- `ww` — object mapping each distractor to a "why wrong" explanation

Cards are automatically validated and cleaned at import time. Duplicate IDs, missing fields, and answer-leaking buzzwords are caught and reported in the console.


## Rating and feedback

After a good run, once the player has played a while, the results screen asks "Are you enjoying Dx Dash?". Yes leads to
"Would you rate it?" and then the store's own rating box (Google Play's in-app review, or the iPhone's rating sheet),
with the store page as a back-up (`market://` or `itms-apps://`, then the web page, then a copied link). "Not really"
leads to a feedback form instead, never the store. Feedback goes to the `app_feedback` table (read it in
`feedback_inbox`); if the server cannot be reached the player is offered an email, then a copied message, so nothing is
lost. Settings > About & help has the same Send feedback and Rate buttons.

Build-time settings (repository variables on GitHub, environment variables in Codemagic or `.env.production` for the
Android build):

| Variable | What it does |
|---|---|
| `VITE_SUPPORT_EMAIL` | where feedback emails go when the server cannot be reached |
| `VITE_APPSTORE_ID` | the numeric App Store id, so Rate can open the App Store page (the in-app rating sheet works without it) |
| `VITE_REVIEW_URL` | an `https` page to rate on, as a last back-up (and the only option on the plain web) |


## Coins: what you earn and what things cost

Earning (about 50 coins for each minute on the track): a right answer pays 2 coins plus 1 for every 3 in your streak, and each coin picked up on the track is 1 (5 under Score Frenzy). Daily quests are a bonus on top: 20 to 70 coins each, so a full day of six is worth roughly 150 to 350 coins, a few minutes of play. The daily login reward, weekly goal (250) and Weekly Gauntlet clear (150) are small thank-yous. Prices run from 300 (caps) to 8,000 (the dearest heroes), so a first trail or map is a few days of casual play and the dearest items about a week. `tests/unit/economy.test.js` keeps these in proportion: change a price or a reward and it tells you if the balance has drifted.

The soft glowing specks that float across the track are off by default (Settings > Look > Floating glow particles).

## Analytics

First-party, anonymous, opt-in usage analytics (no third-party SDK). Events go to this project's Supabase database and are read with SQL views.
See [docs/ANALYTICS-GUIDE.md](docs/ANALYTICS-GUIDE.md) (setup, what to look at, launch checklist) and [docs/ANALYTICS.md](docs/ANALYTICS.md) (every event, generated from the code).
- Tip jar (in-app purchases for tips): [docs/TIP-JAR.md](docs/TIP-JAR.md)
- Dx Dash Pro (subscription, Library and Lifetime; ships on, with 300 free cards): [docs/PRO.md](docs/PRO.md), pricing rationale in [docs/MONETIZATION-STRATEGY.md](docs/MONETIZATION-STRATEGY.md)
- Marketing package (strategy, 24 ad scripts, copy, rendered ads and videos, production plan, channel playbooks, measurement, compliance): [docs/marketing/](docs/marketing/README.md)
