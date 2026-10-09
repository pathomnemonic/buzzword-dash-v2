# Store listing (drafts)

> **Publishing? Start with `docs/RELEASE_GUIDE.md`.** The ready-to-paste text and policy answers are in `store/google-play/` and `store/app-store/`. This page keeps the background and the rules about what the listing may claim.

Edit freely. Keep claims honest: the game is a study aid and does not guarantee exam results.

## Name and short description

**Title:** Dx Dash: Board Exam Runner (30 characters max on Google Play; "Dx Dash" alone also works)

**Tagline:** Run the list.

**App Store subtitle (30 chars):** Board questions, at a sprint

**Short description (80 chars):** Run the list. Dodge, dash and Dx USMLE & COMLEX questions.

## Full description

Run the list. Study for your boards by playing.

Dx Dash shows you the clues from a classic exam vignette (the "buzzwords") and asks you to run into the correct diagnosis. Pick a lane, dodge the obstacles, keep your streak alive, and learn something every run.

- **Challenge a friend, live.** Head-to-head multiplayer with a room code. No account needed.
- **3,000+ board-style questions** across 15 subjects, with a quick explanation after every miss.
- **Learn from your misses.** Spaced repetition (FSRS, the open algorithm Anki offers) brings back each card just before you would forget it.
- **Flashcards and a timed exam simulator** for when you want to slow down and test yourself.
- **Daily goals, streaks and a study plan** with your exam date, a mastery level for each subject and a pace for the days you have left.
- **A friends feed with kudos.** Share your runs with friends or keep them private, cheer each other on, and join private study groups.
- **An exam monster that chases you** when your streak slips, and drifts away when you get back on track.
- **Earn coins and unlock** animated characters, monsters, trails and themed tracks.
- **Solo play needs no internet.** No ads. No tracking.

Dx Dash is an educational game, not medical advice. Content may contain errors; verify important facts with authoritative sources.

## What the listing may claim (and what it may not yet)

Only list a feature once it has been checked end to end. As of the last check:

**Checked, safe to list** (the list above): live multiplayer (two real browsers connected, played a match and saw each other's scores), the question bank size and subjects, the run, the case review after a run, flashcards and the exam simulator (automated browser tests), daily goals and the study plan (unit tests), the exam monster and characters (seen in play), solo play making no network requests other than to the app itself.

**Built and tested, but not yet checked against the live online service, so do not list yet:**
- Ranked matches, trophies and leagues: built and tested but hidden for now (not mentioned in the store listings). Versus works with a room code.
- Friends, the friend feed, study groups, weekly tournaments and cloud save (database rules and the screens are tested against a fake service; they need a live Supabase project to check). The global leaderboard is hidden in the app for now (`FEATURES.globalLeaderboard`), so do not list it.
- Cohorts and cohort wars (finished and hidden on purpose; see `docs/COHORTS.md`).
- Study-buddy and public-group discovery (finished and hidden on purpose; see `docs/DISCOVERY.md`).

Do not list map events (blackouts, tremors) until you have seen them in a real session on the device.

## Categories and rating

- Category: Education (Google Play) / Education (App Store); secondary: Games, Trivia.
- Content rating questionnaire: no violence beyond cartoon monsters chasing a character, no gambling, no user-to-user free-text chat (friend requests and display names only). Expect a low rating (for example Everyone / 4+ or 9+). Answer the questionnaires truthfully.

## Privacy answers

Match these to `public/privacy.html`.

**Google Play → Data safety**
- Data collected only if the player uses online features: *Email address* (optional account), *User IDs* (account identifier), *Name* (display name), *App activity* (scores, streaks, game progress, shared run summaries and kudos).
- *Crash logs* and *Diagnostics* only if the player switches on "Help fix problems" in Settings (off by default): anonymous, not linked to the user.
- Purpose: app functionality and account management. Not used for advertising or analytics. Not sold.
- Encrypted in transit: yes. Users can request deletion: yes (in-app **Delete my account**).
- Data shared with third parties: no (Supabase acts as a processor hosting the data).

**Apple → App Privacy ("nutrition label")**
- Data linked to the user (only with online features): Contact Info (email address), Identifiers (user ID), User Content (display name), Usage Data (scores, progress and the run summaries and kudos shared with friends).
- Data not linked to the user, only if the player switches it on: Diagnostics (crash and performance reports).
- Used for: App Functionality. Not used for tracking.
- Account deletion: available in the app.

## Assets you need to make

- App icon: generated (`assets/icon-only.png`, 1024x1024; Dx monogram with a pulse line).
- Google Play feature graphic: generated (`assets/store/feature-graphic.png`, 1024x500).
- Link-preview card: generated (`public/og.png`, 1200x630).
- Screenshots: generated by `node tools/make-screenshots.mjs` into `assets/store/screenshots/` (portrait, captioned). Replace them with real-device captures before launch if you prefer.
- Privacy Policy URL: `https://pathomnemonic.github.io/buzzword-dash-v2/privacy.html`
- Support URL / contact: `https://pathomnemonic.github.io/buzzword-dash-v2/` with the contact email `patho.mnemonic1@gmail.com`.
