# Gameplay analysis: engagement, excitement and "one more run"

Scope: the moment-to-moment run (the three-lane gate runner), the loops around it (levels, quests, daily reward,
ranks, shop, social) and the first week. The aim is a game people *want* to open, in service of studying more
cards, not a game that drives study down.

Method: read the engine and progression code (`js/game/engine*.js`, `js/progress.js`, `js/firstweek.js`,
`js/leagues.js`, quests in `js/storage.js`), the run stress tools' output (`tools/matrix.mjs`, `beta.mjs`, `soak.mjs`),
and the reports and sessions so far. Where something is a judgement rather than something measured, it says so.

## What is already working

| Loop | What exists | Why it works |
| --- | --- | --- |
| In the run | Streak adds points and a multiplier up to 8x every 5 right; coins scale with streak; fast answers trigger slow-motion and a camera kick; power-ups (shield, 2x, magnet, auto-pilot, frenzy); heart pickups; hazards | Immediate feedback on every decision, and a wrong answer genuinely costs something (streak, multiplier, a heart) |
| Between runs | Level and XP bar always visible; rank names with prestige stars every 25 levels; "next goal" line on the results screen; daily bonus subject (+4 coins per correct, capped at 80); quests with a claim step; daily reward track with a day-7 chest | There is always a next small goal and a variable reward |
| Habit | Today bar at the top of Home; streak flame; reminders; first-week checklist; discovery dots on unexplored menus | Gives a reason to return that is not a notification |
| Social | Challenge links, ranked ladder with 21 steps that remove helpers as you climb, friends/clans (behind flags) | Competition and comparison |
| Learning | Explain-the-miss (why the answer you chose was wrong), FSRS scheduling, weak-subject targeting, mastery bars | Makes a death useful, which is what stops losing from feeling like waste |

## Where the experience is weakest (ranked by expected effect)

1. **Question quality was the biggest engagement risk, and it was invisible.** A card whose clue is the answer
   removes the only decision in the game. Players learn quickly which cards are free, and that teaches them the
   questions do not matter. This is fixed in the deck and guarded by a test (see `CARD-QUALITY.md`); keep the
   report button prominent on the results screen.
2. **Dying ends the flow instead of feeding it.** The run is lost on the third mistake, and the results screen is a
   summary. Games with strong "one more run" pull make the *next* run the obvious next button, and show the
   smallest unmet goal ("2 answers from Level 14", "1 quest left").
3. **The early run is flat.** The first 30 seconds have no escalation: same speed, same hazards, same music. The
   multiplier is the only ramp and it needs five right answers in a row.
4. **Losing a streak feels worse than winning one feels good.** One wrong answer drops the multiplier by one and
   zeroes the streak, with no way to protect it besides the shield power-up.
5. **Variety within a session is thin.** The track, the monster and the music stay the same for a whole run.
6. **Social is mostly hidden.** Ranked, cohorts and friend feed are behind flags, so the strongest retention
   mechanic in this genre (a person you want to beat) is off for most players.
7. **No visible long-term identity for the *learner*.** Ranks reflect play, not mastery. Medical learners respond
   to "you are 82% ready on cardiology".

## Recommendations

Effort: S is under a day, M a few days, L a week or more. "Risk" is the risk to the learning goal.

### Do next (high value, low risk)

| # | Change | Effort | Why |
| --- | --- | --- | --- |
| 1 | **One-tap "Run it back" with a goal chip.** On the results screen the primary button starts the next run at once, and a chip beside it shows the single closest unmet goal (level, quest, daily-subject cap, streak best). Secondary actions (review misses, share) sit below. | S | The cheapest, most reliable "one more run" lever; the data to build the chip already exists in `nextGoalLine` |
| 2 | **Streak insurance, earned.** After every 10 right answers in a run, bank one "streak save" (max 1). The next wrong answer spends it: streak and multiplier survive, the heart is still lost. Show it as a small icon by the streak counter. | S/M | Turns a punishing moment into a story ("it saved me") and rewards accuracy rather than luck |
| 3 | **Escalation beats.** Every 10 answers: a short, visible change (track colour shift, a new hazard type, music layer, a named wave: "Rush hour"). Never changes difficulty of the questions, only atmosphere. | M | Breaks the flat middle; creates milestones inside a run |
| 4 | **Close-call moments.** When the player is on the last heart and answers right, a brief "Clutch!" with a coin burst and a haptic; track "clutch answers" as a stat and a quest ("3 clutch answers"). | S | Tension and release is the core of the genre, and it is easy to reward |
| 5 | **Mastery chip on Home.** One line: "Weakest: Nephrology 54%. Play a Nephrology-weighted run". Uses the stats thresholds (10 answers) already in place. | S | Connects the game loop to the exam goal, which is the real reason the app exists |

### Worth doing after that

| # | Change | Effort | Notes |
| --- | --- | --- | --- |
| 6 | **Weekly boss run.** A fixed seed, same for everyone, one attempt per day, shared leaderboard among friends. | M/L | Reuses `challenge.js` seeded runs; depends on enabling the friends layer |
| 7 | **Collection pull.** Cosmetic sets that unlock by *subject* (finish 50 correct Cardiology answers, unlock a stethoscope trail). | M | Gives every subject its own small reward, and nudges players to their weak ones |
| 8 | **Post-run "redeem a miss".** One tap replays the card you missed as a calm single question for half the coins. | S/M | Strong learning effect; also converts a loss into a small win |
| 9 | **Comeback offer.** If a player has not played for 3 days, the first run back is boosted (2x XP) and the Home tagline says so. | S | Retention without guilt; keep it rare so it is not trained |
| 10 | **Run summary share card** already exists; add the streak-save and clutch stats to it. | S | Cheap social surface |

### Things to avoid

- **Faster is not more exciting.** Raising speed without escalation just raises miss rates. The time to reach a
  gate is deliberately constant across the "look" speed-up.
- **Energy or hearts timers that block play.** They suppress the study time the product is for.
- **Streak loss that cannot be recovered at all.** One earned save (item 2) is the most you need; paid streak
  repair is a trust problem for a medical-education app and for the app stores' review rules.
- **Randomised rewards tied to *answering correctly*.** Rewarding luck on a correct answer risks teaching
  gambling-style behaviour; keep surprises on the day-7 chest and the daily bonus subject.

## How to know whether any of it worked

The game already records enough to measure these without new tracking: runs per session, sessions per day, day-1
and day-7 return, accuracy by subject after the 10-answer threshold, and the share of runs that end with a quest or
level goal one step away. Ship items 1 to 5 together behind one release, compare the week before and after, and
keep any change that does not reduce accuracy.
