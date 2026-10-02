# Study-buddy and group discovery (not released yet)

Players can opt in to be found, and find others, to study with. The database and the screens are finished and
tested, but the feature is hidden until there are enough players. Friends, the feed and private groups are
not affected.

| Piece | Where | Status |
| --- | --- | --- |
| Database: buddy listings, public groups, join requests, reports | `database/discovery.sql` | Done. 10 tests in `tests/unit/discovery.test.js` run it on a real Postgres engine. |
| Screens: the Discover tab and the owner's group settings | `js/discoveryui.js` | Done. 6 tests in `tests/unit/discoveryui.test.js`. |
| Switch | `FEATURES.discovery` in `js/features.js` | Off. |

## What a player sees (once released)

- **Discover tab** in Friends: a study-buddy listing (exam, exam date, subjects, pace; time zone is read from the device)
  that is **off until the player turns it on**, a ranked list of compatible players, and a search for public groups.
- **Groups tab**: an owner can make a group public, tag its exam, and choose open joining or approval of each person.

## Safety built in

- Off by default, and only a player with their own listing switched on can browse others.
- Contact is only a normal friend request, which the other person can ignore. No messages, no free text: a listing is
  a handful of preset choices, so the only text to moderate is a display name or a group name.
- Blocked players never see or match each other (both directions).
- Every row has a report button with preset reasons; reports go to `content_reports` (read it in the Supabase table
  editor; a person has to look at it).
- Nobody can read or write the tables directly; everything goes through functions that limit what is shown
  (name, picture and the listing fields) and rate-limit (5 pending join requests, 20 reports a day).

## Releasing it

1. In Supabase, open the SQL editor and run `database/discovery.sql` (after `schema.sql` and `policies.sql`; safe to run twice).
2. Add a repository variable `VITE_FEATURE_DISCOVERY` with the value `1` (the same place as `VITE_SUPABASE_URL`) and redeploy.

To try it locally: `VITE_FEATURE_DISCOVERY=1 npm run dev`.
