# Cohorts and cohort wars (built, not released)

Cohorts are teams of up to 50 players (a class, a study group, a whole school year). Schools are a tag on a cohort, so schools can be ranked against each other. The feature is finished and tested but **hidden** in the app until there are enough players for it to feel alive. A war ladder with three cohorts on it is worse than no ladder.

## What exists today

| Piece | File | State |
|---|---|---|
| Database: schools, cohorts, roster, weekly war points, leaderboards | `database/cohorts.sql` | Done. 9 tests in `tests/unit/cohorts.test.js` run it on a real Postgres engine. |
| Client calls | `js/cohorts.js` | Done, tested. |
| Screen: my cohort, war ladder, school ladder | `js/cohortsui.js`, `#screenCohorts` in `index.html` | Done, tested in `tests/unit/cohortsui.test.js`. Not checked on a phone or against a live Supabase project. |
| The switch | `js/features.js` (`FEATURES.cohorts`) | Off. The Cohorts button has the `hidden` attribute and `main.js` only reveals it when the switch is on. A test guards this. |

Nothing in the shipped app mentions cohorts, and the SQL file is not part of the normal setup (`schema.sql` + `policies.sql`), so a live project has no cohort tables until you run it.

## How the war works

- Each ISO week is one war.
- A **ranked match win** scores 10 points for the winner's cohort; a draw scores 3 for each player's cohort.
- One player can bring in at most **100 points per week** (ten wins), so one grinder cannot carry a cohort and every member has a reason to play.
- Cohort standing = war points this week. School standing = the war points of all of that school's cohorts.
- Points are written by a database trigger when a ranked match settles. They never come from a player's device, so the same checks that protect trophies protect war points.

This is the same shape as Clash Royale clan wars: a team score built from many players' individual contributions, reset weekly, with caps so participation matters more than one star.

## Rules built into the database

- One cohort per player. Names are unique (case-insensitive). Join with a 5-character code, or find an open cohort by searching its name or school.
- Roles: leader, officer, member. Only the leader can promote or hand over the cohort. Officers can remove plain members.
- If the leader leaves (or deletes their account) the longest-serving officer or member inherits. When the last member leaves the cohort closes.
- Players cannot read or write the cohort tables directly; they use the functions. Only members can see their roster.

## How to release it

Do this when there are enough players. A rough guide: a few hundred weekly ranked players and at least a handful of schools that have asked for it.

1. In Supabase, open the SQL editor and run `database/cohorts.sql` (after `schema.sql` and `policies.sql`; safe to run twice).
2. Add a repository variable `VITE_FEATURE_COHORTS` with the value `1` (GitHub: Settings, Secrets and variables, Actions, Variables), the same place as `VITE_SUPABASE_URL`.
3. Push. (The deploy and Android workflows already pass the variable to the build.) The Cohorts button appears on the home screen.
4. Check it with two accounts on a real phone first: create, join by code, win a ranked match, watch the points move.

To try it locally: `VITE_FEATURE_COHORTS=1 npm run dev`.

## Built into the current app on purpose

- Ranked matches already settle through one server-side path (`ranked_matches` → trophies), which is the single place war points hang off. No later rewrite of ranked play is needed.
- Trophies and war points live in separate tables, so the first season of ranked play is not affected by cohorts arriving later.

## Not built yet (decide with real players)

- **Brackets.** Today all cohorts share one weekly ladder. With many cohorts, group them into brackets of similar strength (like clan war leagues) so small cohorts are not buried.
- **School verification.** A school name is whatever the creator types. If schools compete for bragging rights, verify through school email domains (for example `.edu`) before the first public school ranking.
- **Rewards.** Weekly coin or cosmetic rewards for the top cohorts and a school banner.
- **Moderation.** Cohort names and descriptions are free text. Reuse the existing report flow and add a way to hide a cohort.
- **Cohort chat.** Deliberately left out (safety and moderation burden). Cohorts are about competing together, not talking.
