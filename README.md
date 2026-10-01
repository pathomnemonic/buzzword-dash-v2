# Dx Dash

**Run the list.**

A 3D endless-runner game for USMLE & COMLEX board prep. Recognize medical buzzwords, swipe into the correct diagnosis lane, dodge obstacles, collect coins, and build your streak.

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
| **Daily** | A fixed 15-card challenge. One attempt per day. |
| **Versus** | Multiplayer via peer-to-peer WebRTC. |

### Multiplayer Modes

| Mode | Rule |
|------|------|
| **High Score** | Most points when the timer expires wins. |
| **Sudden Death** | First wrong answer eliminates that player. |
| **Race** | First to reach the target number of correct answers wins. |

## Power-ups

| Power-up | Effect |
|----------|--------|
| 🛡 Shield | Absorbs one hit from an obstacle or wrong answer |
| 🧲 Magnet | Attracts nearby coins to you for 10 seconds |
| 2× Score | Doubles points earned for 15 seconds |
| 🤖 Auto-Pilot | Automatically steers to the correct lane for 1 gate |
| 💎 Frenzy | Multiplies coin value by 5 for 8 seconds |

## Hearts

When you are down to 1 life, heart pickups may appear on the track. Collecting one restores a life (up to the starting maximum of 3).

## The Exam Monster

An exam monster chases you from behind. It gets closer when you answer incorrectly and falls back when you answer correctly. If it catches you, your run ends with a dramatic animation.

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
- **Achievements and quests** — daily quests with coin rewards and 50+ achievement badges
- **Profile** — set a display name, select badges, and track lifetime stats
- **Leaderboard** — global and friends leaderboard (requires Supabase setup)
- **Multiplayer** — real-time versus mode via PeerJS WebRTC
- **Procedural music** — each track skin has its own generated music style
- **Night mode** — darker color palette for low-light studying
- **Text-to-speech** — optional TTS reads buzzwords aloud
- **Study streak calendar** — tracks daily study activity
- **Continue system** — spend coins to continue after losing all lives
- **Speed dial** — adjust game speed from 1× to 10× for more points
- **Spaced repetition** — each card is scheduled (SM-2 style); due cards surface first and the home screen shows how many are due
- **Missed-card remediation** — a card you miss comes back a few encounters later in the same run
- **Daily study goal** — configurable cards-per-day target with a progress bar, plus a "focus area" (weakest subject) after each run
- **Weekly leaderboards** — this-week and all-time boards per mode, with friends, requests and match invites
- **Accessibility** — colorblind-safe palette, keyboard-operable switches, and keyboard flashcards (Space to reveal, arrow keys or 1/2 to rate)
- **Card reports** — flag a card from the post-run review; reports are saved locally and sent to Supabase when signed in
- **Exam simulation** — timed blocks (10/20/40 questions) with no instant feedback, flagging, a question map, and a report by subject with a practice readiness band
- **Weak-spot dashboard** — today's study plan, 7-day review forecast, and accuracy by question type, with one-tap review of due cards
- **Streak shields and weekly goal** — earn a shield every 7-day daily streak; hit your daily goal on 5 days a week for a coin reward; optional daily reminder notification
- **Async challenges** — play 15 seeded questions, share a link with your score, and a friend plays the same cards to beat it (no server needed)
- **Study groups** — private class leaderboards joined by code (needs Supabase)
- **Deck sharing** — publish your custom cards and share a code; import by code (needs Supabase)
- **Hands-free audio review** — the game reads clues and answers aloud, for commutes
- **Visual polish** — bloom glow, subject icons on gates, a run-start fly-in, slow motion on lightning-fast answers, screen feedback and streak flames, recolorable characters in the Locker, and a redesigned exam monster
- **Animated 3D avatar** — "Robo Resident" uses a real glTF model with authored run, jump and death animation clips (CC0 model by Tomás Laulhé, via the three.js examples)
- **Purchasable exam monsters** — Pager Wraith, Textbook Golem and Caffeine Kraken, each with its own back-view design
- **Per-map hazards** — each track has a signature hazard (blackout, fog, tremor, pulse, glitch, flare, speed surge) in solo runs; never in seeded or competitive modes and skipped for reduced motion
- **Adaptive music** — layers build with your streak and a tense drone rises as the monster closes in
- **Share image** — save or share a styled picture of your run result
- **Weekly tournament** — the same 20 cards for everyone each week, a weekly board, your rank and a top-10% badge
- **Friend activity feed** — see friends' new bests, streaks and tournament finishes, with a one-tap challenge
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

## Development

```bash
npm ci
npm run dev            # local dev server
npm run lint && npm run typecheck && npm test
npm run validate:cards # validate card data
npm run build          # production build into dist/
npm run test:e2e       # Playwright (needs a build)
```

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

- `public/models/RobotExpressive.glb` — Robot Expressive by Tomás Laulhé (CC0 1.0), with modifications by Don McCurdy, from the [three.js examples](https://github.com/mrdoob/three.js/tree/r160/examples/models/gltf/RobotExpressive).

- `public/models/characters/*.glb` and `public/models/monsters/*.glb` — animated characters and monsters by [Quaternius](https://quaternius.com/) (CC0 1.0, public domain), downloaded from [Poly Pizza](https://poly.pizza/). Twelve characters (Explorer, Ranger, Adventurer, Hooded Rogue, Night-Shift Zombie, Ninja, Bones, Orc, Archmage, Alien, Mecha Medic, King) and six monsters (Ghost, Flying Skull, Yeti, Brute, Demon, Dragon). Catalog and clip mapping live in `js/game/modelcatalog.js` and `js/game/charactermodel.js`.

- `public/models/obstacles/*.glb`, `public/models/props/*.glb` — small props (hospital bed, traffic cone, cardboard boxes, traffic barrier, trash can, street light, air conditioner) by [Quaternius](https://quaternius.com/), and a computer screen and hospital sign by [Kenney](https://kenney.nl/), and a telescope by CreativeTrio; all CC0 1.0, from [Poly Pizza](https://poly.pizza/).

- `public/models/obstacles/*.glb` (crate, traffic light, chandelier, spot light, sign) and `public/models/props/*.glb` (heart, first aid kit, potion bottle, skull, bone, tree) — by Quaternius (CC0 1.0) except the chandelier (CreativeTrio) and spot light (iPoly3D), all CC0 1.0 from [Poly Pizza](https://poly.pizza/); the tree is by Kenney.

- `public/models/medical/*.glb` — set dressing for the hospital hallway, operating room, research lab and ambulance bay, downloaded from [Poly Pizza](https://poly.pizza/). Licensed CC BY 3.0 (credit required): Wheelchair by Poly by Google, IV stand ("15") by Daisuke Takeoka, Doctor by jeremy, Wet Floor Sign by J-Toastie, Microscope by Colonel Cthulu, Science Tubes by Ryan Donaldson, Lab Desk by Colonel Cthulu, Ambulance (two) by Poly by Google and jeremy, Fire Extinguisher by Jarlan Perez. The hospital bed and traffic cone in the rooms are the CC0 Quaternius ones listed above. These credits are also shown in Settings -> About.

## Graphics

The world is lit with physically based materials, a soft studio reflection map and ACES tone mapping (`js/game/materials.js`). Tracks have a gradient sky with stars, distance haze and a glossy floor; walls, obstacles, gates, coins and power-ups use lit materials and rounded geometry so they match the animated characters. Every obstacle, all floating scenery and the street lights and trees along the track are real 3D models (`js/game/scenery.js`).

**Graphics tiers:** Settings -> Graphics chooses Auto, High, Medium or Low. *High* is everything (3D characters and monsters, 3D obstacles and scenery, glow, shadows). *Medium* keeps the animated 3D character and monster, the sky, reflections and lit materials, but uses simple built-in obstacles and scenery, no glow or shadows, and caps resolution at 1.5x. *Low* is the fast backup: the simple built-in characters and obstacles, no model downloads, and normal resolution. Auto picks Low for software rendering, very little memory or 2 or fewer cores or data-saver, Medium for modest devices (4 GB or fewer, 4 cores or fewer, or touch-first), otherwise High, and steps down a tier after repeated slow sessions. Adaptive resolution also trims the render resolution in small steps while the game runs slowly and restores it when there is headroom. Cached model geometry is shared between copies and never freed by one copy, shader compilation is warmed up during the countdown, and the service worker caches model files after first use.

**Locker:** the Locker has three tabs. *Characters* sorts characters into animated 3D, classic (blocky) and vehicles, with what each can wear. *Customize* shows only what works on the equipped character (3D characters can wear hats; classic characters also get colors, clothing and gear; vehicles cannot be customized). *Trails & Monsters* works with every character.

**Performance work:** add `?debug=1` to the URL to expose the engine as `window.__game`; `renderer.info` then reports draw calls and triangles. A typical frame went from about 2,000 draw calls and 195,000 triangles to about 240 and 45,000 through: merging static scenery by material (`mergeStatic` in `js/game/materials.js`); merged, periodic scrolling decorations (fog handles the distance fade); one glowing point cloud for the atmosphere; cheaper box rounding (108 triangles, finer only for coins and gates); shared model geometry; and half-resolution bloom. Downloads shrank too: the 2.6 MB question database loads in the background after the first screen (`js/cardhub.js`; `js/cards.js` stays the synchronous source for tools and tests), and the animated character and monster models are 4.1 MB instead of 11.6 MB (`node tools/optimize-models.mjs` drops unused animation clips and applies meshopt compression; loaders use `js/game/gltfloader.js`). Settings has a Battery saver (30 fps) toggle, and the home screen always renders at 30 fps.

## Mobile app (Android and iOS)

The game is wrapped with Capacitor, so the same code runs as a phone app. The Android project is in `android/` (build it with `npm run app:android`, or run the **Android app** workflow on GitHub for a downloadable APK). iOS is finished on a Mac; see **[docs/APP.md](docs/APP.md)** for the full guide, what only you can do (developer accounts, signing key, screenshots), the testing checklist and store steps, and [docs/STORE_LISTING.md](docs/STORE_LISTING.md) for draft store text and the privacy answers. Privacy Policy and Terms of Use pages are in `public/` and linked from Settings; players can delete their account in-app.

## Technology

- **Three.js** (r160) for 3D rendering (bundled)
- **Web Audio API** for procedural sound effects and music
- **PeerJS** for multiplayer WebRTC connections (bundled, lazy-loaded)
- **Supabase** for leaderboard persistence (bundled, lazy-loaded, optional)
- **Vite** for dev server and production build (`npm run dev`, `npm run build`)

## Browser Support

- Chrome / Edge 90+
- Firefox 90+
- Safari 15+
- Mobile Chrome and Safari on Android and iOS

WebGL is required for the 3D renderer.

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
