# Analytics guide

Dx Dash has its own first-party analytics. No third-party SDK, no ad networks: events go from the app to this project's own Supabase database, and you read them with ready-made SQL views. This guide covers setting it up, reading it, and extending it.

- The list of every event and property: [ANALYTICS.md](ANALYTICS.md) (generated; `npm run analytics:docs`).
- What players are told: `public/privacy.html` and the consent card (`js/analyticsui.js`).

## 1. Turn it on (once)

1. In the Supabase SQL editor run `database/analytics.sql`, then `database/analytics_views.sql`. Both are safe to run again.
2. The app already reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the same ones the leaderboard uses). With them set, the first-run card appears and analytics works. With them unset (a local build) nothing is sent and the card is skipped.
3. Schedule the retention job (Supabase → Database → Cron, or `pg_cron`): `select analytics_purge(790);` daily. The privacy policy promises at most 26 months.
4. Keep the **service_role key** for yourself. Nothing in the app can read the tables or views; only the SQL editor and the service key can.
5. Check it is arriving: play a run on a build with the keys, accept the card, then run `select * from analytics_v_event_volume;` and `select * from analytics_v_data_health;`.

## 2. Reading the data

- **SQL editor:** `select * from analytics_v_daily_overview order by day desc limit 14;`
- **From a terminal:** `SUPABASE_URL=… SUPABASE_SERVICE_KEY=… npm run analytics:report` prints every view as markdown. `-- --list` lists the views with a description, `-- --section 3` prints one section, `-- --view analytics_v_retention` one view.

### Questions and the view that answers them

| Question | View(s) |
|---|---|
| Is the app growing? | `daily_overview`, `stickiness`, `installs_by_week` |
| Do players come back? | `retention` (day 1/2/3/7/14/30 by arrival day), `retention_by_channel`, `retention_by_version`, `frequency`, `churn_risk` |
| **Which marketing channel brings players who stay?** | `acquisition` (installs and behaviour per channel/source/campaign), `retention_by_channel`, `landing`, `top_referrers` |
| Is sharing working? | `virality` (shares → referred installs → rough viral coefficient), `top_referrers` |
| Does the web app get installed to the home screen? | `pwa` |
| Where do new players quit? | `onboarding_funnel`, `tutorial_steps`, `tutorial_exits`, `time_to_milestone`, `first_session` |
| Is the game balanced? | `runs_daily`, `run_end_reasons`, `difficulty_curve`, `deaths`, `speed`, `continue`, `powerups`, `fusions`, `hazards`, `coin_stats`, `maps`, `map_progress` |
| Which questions are too easy/hard/confusing? | `card_difficulty`, `cards_too_hard`, `cards_too_easy`, `card_distractors`, `most_reported_cards`, `decision_time`, `lane_bias`, `subjects` |
| Is the economy healthy? | `economy_daily`, `coin_sources`, `coin_sinks`, `items`, `first_purchase`, `wallet`, `hoarders`, `quests`, `quest_swaps`, `daily_rewards` |
| Which settings/accessibility options are used? | `settings` views in section 12 |
| Does it run well on real devices? | `fps`, `load_times`, `tier_changes`, `devices`, `screens_and_hardware`, `connection` |
| Is it crashing? | `errors`, `crash_free`, `reliability_other`, `versions`, `updates` |
| Did the ratings/tip prompts work? | `rating_funnel`, `tip_funnel`, `tip_revenue`, `feedback`, `nudges`, `reminders` |
| Do people use accounts, friends, ranked, cloud save? | `ranked`, `cloud_sync`, `quests_all_done`, `data_actions` |
| Did an experiment win? | `experiments` |
| Can I trust the numbers? | `event_volume`, `data_health`, `ingest_lag`, `consent` |

### Reading it honestly

- **Only people who said yes are counted.** The consent view shows the opt-in rate. If it is far from 100%, the numbers describe opted-in players and may skew toward engaged ones. Compare store-console installs with `analytics_v_acquisition` installs to see the gap.
- **Small numbers wobble.** With under a few hundred installs per cohort, retention differences of a few points are noise.
- **Retention percentages count only installs old enough** for that day to have happened ("mature" installs).
- **Rates are corrected for sampling.** Events the remote config samples (for example `obstacle_outcome` at 20%) carry their rate, and the views scale counts back up.
- **Android store installs** show up as source `store` unless the link had campaign tags: the Play install referrer is not read (it would need a native plugin). Use tagged links (`?utm_source=…&utm_medium=…&utm_campaign=…`) for web campaigns, and a landing page with tags for store campaigns. iOS gives no campaign data to the app.
- **Share links** carry `utm_source=dxdash_share`, `utm_medium=<what was shared>` and `r=<short code>`; `virality` and `top_referrers` use them. The code is a one-way hash of the sharer's install id.

## 3. Remote switches and experiments (no store release)

`public/remote-config.json` (also served by the site) has an `analytics` section:

```json
{ "killed": [],
  "analytics": {
    "enabled": true,
    "sample": 1,
    "killed": ["obstacle_outcome"],
    "rates": { "obstacle_outcome": 0.2 },
    "flushMs": 15000,
    "experiments": { "swap_price": { "variants": { "control": 50, "cheap": 50 } } }
  } }
```

- `enabled: false` stops all analytics for everyone. `sample` (0–1) keeps a stable share of installs. `killed` stops named events. `rates` samples named events.
- An experiment is read in code with `variant('swap_price')` from `js/analytics/index.js`. The first ask records `experiment_exposed`; every later event carries the variant, and `analytics_v_experiments` compares day-1/day-7 retention, runs per install and purchase rate by variant. Weights are relative; an install always gets the same variant.

## 4. Adding or changing an event

1. Add it to `js/analytics/catalog.js` (group, description, property types; `!` marks a required property). Anything not in the catalog is dropped on the device.
2. Call `track('name', { … })` from `js/analytics/index.js` where it happens.
3. `npm run analytics:docs` to regenerate `docs/ANALYTICS.md` (a test fails if it is stale).
4. Add a view to `analytics_views.sql` if you want it as a table, and keep names matching `^[a-z][a-z0-9_]{1,39}$`.
5. **Never** add free text a player typed, names, e-mail addresses, or anything that could identify someone. Update `public/privacy.html` if a new kind of data is collected.

## 5. Launch checklist

- [ ] `analytics.sql` and `analytics_views.sql` run; `select analytics_purge(790)` scheduled.
- [ ] `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` set for the web deploy and the Android/iOS builds.
- [ ] A real run on each platform shows in `analytics_v_event_volume`; `data_health` is clean.
- [ ] Consent card shows once on a fresh install, "No thanks" sends nothing (check the network tab), Settings → Data toggle and "Delete my analytics data" work.
- [ ] Privacy policy deployed; Play Data safety and App Store privacy label updated from `store/*`.
- [ ] Every campaign link is tagged with `utm_source`, `utm_medium`, `utm_campaign`.
- [ ] You know your baseline opt-in rate (`analytics_v_consent`).

## 6. How it works (for maintainers)

- `js/analytics/core.js` — consent, install and session ids, offline queue (survives restarts; 5 days, 500 events), batches of 40 every 15 s and on hide, backoff on failure, 4xx batches dropped, `delete`.
- `js/analytics/catalog.js` — the schema. `context.js` — bucketed device details sent once per session. `attribution.js` — first/last touch, share codes. `experiments.js` — variants.
- `js/analytics/runtracker.js` — turns the engine's event stream into `run_start`, `run_end`, `run_cards` and in-run events. `steptracker.js` — tutorial/tour steps. `instrument.js` — hooks (screens, storage, errors, lifecycle, milestones).
- `database/analytics.sql` — tables (no access for the app), `ingest_analytics` (validates, dedupes by event id, rate-limits to 4000 events/hour/install, corrects clock skew), `delete_analytics`, `count_consent`, `analytics_purge`. Tested in `tests/unit/analyticssql.test.js`.
