# Analytics event dictionary

_Generated from `js/analytics/catalog.js` by `npm run analytics:docs`. Do not edit by hand._

Every event also carries (outside its properties): a unique id, the time, a sequence number, the install id and the session id, plus any experiment variants the install is in. Device, version and first/last-touch attribution are stored once per session. See [ANALYTICS-GUIDE.md](ANALYTICS-GUIDE.md) for how to use the data.

Total events: **101**.

## Acquisition

### `app_first_open`

The very first time this install opened. Once per install; carries the first-touch source.

| Property | Type |
|---|---|
| `install_kind` | one of: web, pwa, android, ios |
| `landing` | text (≤40) |
| `referrer_host` | text (≤60) |
| `utm_source` | text (≤40) |
| `utm_medium` | text (≤40) |
| `utm_campaign` | text (≤60) |
| `utm_content` | text (≤60) |
| `utm_term` | text (≤60) |
| `has_click_id` | true/false |
| `share_ref` | text (≤16) |
| `store` | one of: play, appstore, web, other |
| `first_open_hour` | whole number |

### `app_open`

The app was opened or came back after at least a minute away.

| Property | Type |
|---|---|
| `launch` | one of: cold, resume, reload |
| `days_since_last` | whole number |
| `days_since_install` | whole number |
| `visits_total` | whole number |
| `online` | true/false |
| `display` | one of: browser, standalone, native |

### `deep_link_opened`

Opened from a link: a shared challenge, an e-mail confirmation, an invite.

| Property | Type |
|---|---|
| `kind` | one of: challenge, auth, invite, share, store, other |
| `source` | text (≤40) |
| `share_ref` | text (≤16) |

### `pwa_prompt_available`

The browser offered to install the web app.

_No properties._

### `pwa_prompt_shown`

The install prompt was shown to the player.

| Property | Type |
|---|---|
| `surface` | text (≤30) |

### `pwa_prompt_choice`

The player accepted or dismissed the install prompt.

| Property | Type |
|---|---|
| `outcome` | one of: accepted, dismissed |

### `pwa_installed`

The web app was installed to the home screen.

_No properties._

### `app_update_available`

A new version finished downloading while the app was open.

| Property | Type |
|---|---|
| `from_version` | text (≤20) |
| `to_build` | text (≤20) |

### `app_update_applied`

The player reloaded into the new version.

| Property | Type |
|---|---|
| `from_version` | text (≤20) |

## Privacy

### `consent_prompt_shown`

The first-run analytics question was shown.

| Property | Type |
|---|---|
| `surface` | one of: first_run, settings |

### `consent_changed`

The player turned analytics on or off. (Off events are the last thing sent, with consent still on.)

| Property | Type |
|---|---|
| `granted` | true/false — required |
| `source` | one of: prompt, settings, dnt, gpc |

## Session

### `session_start`

A session began (the app opened, or came back after 30 minutes away).

| Property | Type |
|---|---|
| `reason` | one of: launch, resume_after_gap, first |
| `gap_minutes` | whole number |
| `session_number` | whole number |

### `session_end`

A session ended (sent when the app is hidden, so it may be the last event of a session).

| Property | Type |
|---|---|
| `duration_s` | whole number |
| `active_s` | whole number |
| `screens` | whole number |
| `runs` | whole number |
| `answers` | whole number |
| `errors` | whole number |
| `in_run` | true/false |
| `last_screen` | one of: home, stats, shop, quests, profile, settings, subjects, flashcards, exam, mycards, leaderboard, friends, feed, postrun, results, tutorial, other |

### `user_snapshot`

The player's progress at the start of a session, so any later event can be sliced by it.

| Property | Type |
|---|---|
| `level` | whole number |
| `xp` | whole number |
| `coins` | whole number |
| `streak_days` | whole number |
| `best_streak_days` | whole number |
| `runs_total` | whole number |
| `answered_total` | whole number |
| `correct_total` | whole number |
| `owned_items` | whole number |
| `owned_maps` | whole number |
| `achievements` | whole number |
| `quests_done_today` | whole number |
| `subjects_selected` | whole number |
| `subjects_total` | whole number |
| `exam_filters` | list of short text |
| `has_account` | true/false |
| `has_name` | true/false |
| `custom_cards` | whole number |
| `fsrs_due` | whole number |
| `days_since_install` | whole number |
| `best_score` | whole number |
| `daily_done` | true/false |
| `study_plan` | true/false |
| `exam_date_set` | true/false |
| `reminders_on` | true/false |
| `friends` | whole number |

## Navigation

### `screen_view`

A screen was shown.

| Property | Type |
|---|---|
| `screen` | one of: home, stats, shop, quests, profile, settings, subjects, flashcards, exam, mycards, leaderboard, friends, feed, postrun, results, tutorial, other — required |
| `from` | one of: home, stats, shop, quests, profile, settings, subjects, flashcards, exam, mycards, leaderboard, friends, feed, postrun, results, tutorial, other |
| `via` | one of: tab, button, swipe, back, auto, link, run_end |

### `sheet_opened`

A pop-up or sheet was opened (mode picker, filters, tip, account...).

| Property | Type |
|---|---|
| `kind` | text (≤30) — required |
| `from` | one of: home, stats, shop, quests, profile, settings, subjects, flashcards, exam, mycards, leaderboard, friends, feed, postrun, results, tutorial, other |

### `tab_changed`

A tab inside a screen was changed (Locker tabs, Settings sections, Stats views).

| Property | Type |
|---|---|
| `screen` | one of: home, stats, shop, quests, profile, settings, subjects, flashcards, exam, mycards, leaderboard, friends, feed, postrun, results, tutorial, other |
| `tab` | text (≤30) — required |

## Onboarding

### `tutorial_started`

A tutorial began.

| Property | Type |
|---|---|
| `kind` | one of: real_track, practice, tour, replay — required |
| `first_time` | true/false |

### `tutorial_step`

A tutorial step was viewed, completed or skipped.

| Property | Type |
|---|---|
| `step` | text (≤24) — required |
| `index` | whole number |
| `outcome` | one of: viewed, completed, skipped, failed |
| `attempts` | whole number |
| `ms` | whole number |
| `kind` | one of: real_track, practice, tour |

### `tutorial_ended`

The tutorial finished or was left.

| Property | Type |
|---|---|
| `outcome` | one of: finished, exited, replaced |
| `last_step` | text (≤24) |
| `steps_done` | whole number |
| `ms` | whole number |
| `exit_confirm_shown` | true/false |
| `kind` | one of: real_track, practice, tour |

### `first_run_milestone`

A first for this install: first run started, first answer, first correct, first purchase, first quest claim...

| Property | Type |
|---|---|
| `milestone` | one of: run_started, answer, correct_answer, run_ended, coin, powerup, purchase, equip, quest_claim, map_change, achievement, share, flashcards, exam, custom_card, account, level_up, study_day, streak_3, day2_return — required |
| `seconds_since_install` | whole number |
| `sessions_so_far` | whole number |

### `tour_step`

A step of the spotlight tour of the app.

| Property | Type |
|---|---|
| `step` | text (≤24) — required |
| `index` | whole number |
| `outcome` | one of: viewed, completed, skipped |

## Gameplay

### `mode_selected`

A game mode was chosen (before it started).

| Property | Type |
|---|---|
| `mode` | one of: endless, study, weakness, daily, challenge, tournament, versus, mp_highscore, mp_suddendeath, mp_race, timed_practice, exam, flashcards — required |
| `from` | text (≤30) |
| `blocked` | one of: none, daily_done, not_enough_cards, no_webgl, cards_loading, offline |

### `run_start`

A run began: everything about how it was set up.

| Property | Type |
|---|---|
| `run_id` | text (≤40) — required |
| `mode` | one of: endless, study, weakness, daily, challenge, tournament, versus, mp_highscore, mp_suddendeath, mp_race, timed_practice, exam, flashcards — required |
| `run_number` | whole number |
| `map` | text (≤40) |
| `hero` | text (≤40) |
| `monster` | text (≤40) |
| `trail` | text (≤40) |
| `speed_dial` | number |
| `lives` | whole number |
| `subjects_selected` | whole number |
| `subjects_total` | whole number |
| `exam_filters` | list of short text |
| `pool_size` | whole number |
| `custom_rules` | list of short text |
| `relaxed_pace` | true/false |
| `ranked` | true/false |
| `input` | one of: touch, keyboard, mixed |
| `dash_control` | one of: double, button, off, auto |
| `camera` | one of: default, close, far |
| `tier` | one of: low, medium, high |
| `fps_cap` | whole number |
| `music` | true/false |
| `sfx` | true/false |
| `haptics` | true/false |
| `tts` | true/false |
| `night` | true/false |
| `colorblind` | true/false |
| `dyslexia` | true/false |
| `lefty` | true/false |
| `reduced_motion` | true/false |
| `online` | true/false |
| `seeded` | true/false |
| `start_screen` | one of: home, stats, shop, quests, profile, settings, subjects, flashcards, exam, mycards, leaderboard, friends, feed, postrun, results, tutorial, other |
| `minutes_since_last_run` | whole number |
| `coins` | whole number |
| `level` | whole number |
| `streak_days` | whole number |

### `run_end`

A run ended: the full result. The most important event for product and balance work.

| Property | Type |
|---|---|
| `run_id` | text (≤40) — required |
| `mode` | one of: endless, study, weakness, daily, challenge, tournament, versus, mp_highscore, mp_suddendeath, mp_race, timed_practice, exam, flashcards — required |
| `reason` | one of: out_of_lives, manual_end, no_matching_cards, daily_complete, challenge_complete, timer_expired, sudden_death_elimination, race_finished, opponent_forfeit, match_decided, local_forfeit, disconnected, fatal_error, app_closed, other |
| `duration_s` | whole number |
| `active_s` | whole number |
| `paused_s` | whole number |
| `pauses` | whole number |
| `score` | whole number |
| `answered` | whole number |
| `correct` | whole number |
| `wrong` | whole number |
| `accuracy` | number |
| `best_streak` | whole number |
| `streak_end` | whole number |
| `avg_decision_ms` | whole number |
| `median_decision_ms` | whole number |
| `fastest_decision_ms` | whole number |
| `slowest_decision_ms` | whole number |
| `rushes` | whole number |
| `auto_pilots` | whole number |
| `obstacles_jumped` | whole number |
| `obstacles_slid` | whole number |
| `obstacles_hit` | whole number |
| `lives_start` | whole number |
| `lives_lost` | whole number |
| `lives_lost_gate` | whole number |
| `lives_lost_obstacle` | whole number |
| `coins_pickup` | whole number |
| `coins_total` | whole number |
| `coins_air` | whole number |
| `coin_chain_max` | whole number |
| `coins_missed` | whole number |
| `powerups` | map of name → number |
| `fusions` | map of name → number |
| `secrets` | whole number |
| `continue_offered` | true/false |
| `continued` | true/false |
| `monster_caught` | true/false |
| `monster_warnings` | whole number |
| `hazards` | map of name → number |
| `maps` | list of short text |
| `map_changes` | whole number |
| `speed_start` | number |
| `speed_end` | number |
| `xp_gain` | whole number |
| `level_before` | whole number |
| `level_after` | whole number |
| `new_best` | true/false |
| `ranked` | true/false |
| `custom` | true/false |
| `unique_cards` | whole number |
| `repeat_cards` | whole number |
| `subjects` | map of name → number |
| `subject_correct` | map of name → number |
| `fps_avg` | whole number |
| `fps_p5` | whole number |
| `frames_slow` | whole number |
| `tier_end` | one of: low, medium, high |
| `res_scale` | number |
| `scenery_density` | number |
| `coins_wallet_after` | whole number |
| `quests_completed` | whole number |
| `achievements` | whole number |
| `map_masteries` | whole number |
| `session_run_index` | whole number |
| `run_number` | whole number |

### `run_cards`

The questions of a run, packed: [card_id, correct 0/1, decision ms, lane chosen, correct lane, wrong-answer index or -1, rush 0/1, streak]. Several events when a run is long.

| Property | Type |
|---|---|
| `run_id` | text (≤40) — required |
| `mode` | one of: endless, study, weakness, daily, challenge, tournament, versus, mp_highscore, mp_suddendeath, mp_race, timed_practice, exam, flashcards |
| `part` | whole number |
| `parts` | whole number |
| `rows` | packed rows — required |
| `subjects` | list of short text |

### `run_paused`

A run was paused.

| Property | Type |
|---|---|
| `run_id` | text (≤40) |
| `reason` | one of: button, key, blur, visibility, interruption, back |
| `second_into_run` | whole number |

### `run_resumed`

A paused run carried on.

| Property | Type |
|---|---|
| `run_id` | text (≤40) |
| `paused_s` | whole number |

### `continue_prompt`

The out-of-lives "continue?" offer.

| Property | Type |
|---|---|
| `run_id` | text (≤40) |
| `cost` | whole number |
| `coins` | whole number |
| `affordable` | true/false |
| `accepted` | true/false |
| `score` | whole number |

### `powerup_collected`

A power-up was picked up.

| Property | Type |
|---|---|
| `type` | text (≤20) — required |
| `run_id` | text (≤40) |
| `second_into_run` | whole number |
| `held` | list of short text |

### `powerup_fused`

Two power-ups fused.

| Property | Type |
|---|---|
| `fusion` | text (≤24) — required |
| `run_id` | text (≤40) |

### `auto_pilot_used`

The player used a held Auto-Pilot.

| Property | Type |
|---|---|
| `run_id` | text (≤40) |
| `via` | one of: key, button, tap |

### `secret_found`

The hidden secret on a map was found.

| Property | Type |
|---|---|
| `map` | text (≤40) |
| `first_time` | true/false |
| `coins` | whole number |

### `streak_milestone`

A streak milestone (5, 10, 15...) was hit.

| Property | Type |
|---|---|
| `streak` | whole number |
| `multiplier` | whole number |
| `run_id` | text (≤40) |

### `map_changed`

The track changed to another map mid-run.

| Property | Type |
|---|---|
| `from` | text (≤40) |
| `to` | text (≤40) |
| `run_id` | text (≤40) |
| `answers_on_from` | whole number |

### `hazard_started`

A map hazard (blackout, tremor, fog...) began.

| Property | Type |
|---|---|
| `kind` | text (≤24) — required |
| `map` | text (≤40) |
| `run_id` | text (≤40) |

### `monster_event`

The exam monster warned, closed in or caught the runner.

| Property | Type |
|---|---|
| `kind` | one of: warning, close, caught, slip |
| `run_id` | text (≤40) |

### `obstacle_outcome`

An obstacle was cleared or hit (sampled: 1 in 5).

| Property | Type |
|---|---|
| `kind` | one of: jump, slide |
| `outcome` | one of: cleared, hit |
| `run_id` | text (≤40) |

### `coin_chain`

A coin chain of 10 or more ended.

| Property | Type |
|---|---|
| `length` | whole number |
| `air` | whole number |
| `run_id` | text (≤40) |

## Progression

### `level_up`

The player reached a new level.

| Property | Type |
|---|---|
| `level` | whole number — required |
| `rank` | text (≤24) |
| `via` | one of: run, study, quest, other |
| `maps_unlocked` | list of short text |

### `achievement_unlocked`

A badge was earned.

| Property | Type |
|---|---|
| `id` | text (≤40) — required |
| `total` | whole number |

### `map_unlocked`

A map became available (by level or by purchase).

| Property | Type |
|---|---|
| `map` | text (≤40) — required |
| `via` | one of: level, purchase, start |
| `level` | whole number |

### `map_mastered`

A map reached gold mastery.

| Property | Type |
|---|---|
| `map` | text (≤40) — required |
| `answers` | whole number |

### `streak_changed`

The study streak grew, was saved by a shield or was lost.

| Property | Type |
|---|---|
| `kind` | one of: extended, shield_used, lost, started |
| `days` | whole number |
| `best` | whole number |

## Economy

### `daily_reward_claimed`

The daily login reward.

| Property | Type |
|---|---|
| `day` | whole number |
| `coins` | whole number |
| `chest` | true/false |
| `login_streak` | whole number |

### `quest_completed`

A daily quest was completed.

| Property | Type |
|---|---|
| `id` | text (≤40) — required |
| `category` | text (≤20) |
| `reward` | whole number |
| `swapped_in` | true/false |

### `quest_claimed`

A quest reward was claimed.

| Property | Type |
|---|---|
| `id` | text (≤40) — required |
| `category` | text (≤20) |
| `reward` | whole number |
| `late` | true/false |

### `quest_swapped`

A quest was swapped for a new one (costs coins).

| Property | Type |
|---|---|
| `from` | text (≤40) — required |
| `to` | text (≤40) |
| `cost` | whole number |
| `ok` | true/false |
| `reason` | one of: ok, not_enough_coins, done, none_left, other |
| `progress` | number |

### `quests_all_done`

All of a day's quests were done.

| Property | Type |
|---|---|
| `count` | whole number |

### `purchase`

Something was bought with coins.

| Property | Type |
|---|---|
| `item_id` | text (≤40) — required |
| `item_type` | one of: skin, trail, monster, map, hat, gear, clothing, pal, other |
| `price` | whole number |
| `coins_before` | whole number |
| `coins_after` | whole number |
| `owned_before` | whole number |
| `via` | one of: locker, map_early, tutorial, other |
| `affordable_pct` | whole number |
| `days_since_install` | whole number |

### `purchase_blocked`

Tapped Buy without enough coins.

| Property | Type |
|---|---|
| `item_id` | text (≤40) — required |
| `item_type` | text (≤20) |
| `price` | whole number |
| `coins` | whole number |
| `short_by` | whole number |

### `item_equipped`

A hero, trail, monster or map was chosen.

| Property | Type |
|---|---|
| `item_id` | text (≤40) — required |
| `item_type` | text (≤20) |
| `owned_via` | one of: free, bought, reward, other |

### `item_previewed`

An item was previewed in the Locker.

| Property | Type |
|---|---|
| `item_id` | text (≤40) — required |
| `item_type` | text (≤20) |
| `owned` | true/false |
| `affordable` | true/false |

### `locker_opened`

The Locker was opened.

| Property | Type |
|---|---|
| `tab` | text (≤20) |
| `coins` | whole number |
| `affordable_items` | whole number |
| `new_items` | whole number |
| `owned_items` | whole number |

### `coins_spent`

Coins spent on something that is not a Locker item (continue, quest swap).

| Property | Type |
|---|---|
| `on` | one of: continue, quest_swap, other — required |
| `amount` | whole number |
| `coins_before` | whole number |

### `coins_earned`

Coins from a source outside the run (login, quest, subject bonus, mastery, secrets, gift).

| Property | Type |
|---|---|
| `source` | one of: login, quest, subject_bonus, mastery, secret, flashcards, gauntlet, gift, other — required |
| `amount` | whole number |

## Study

### `subjects_changed`

The subject, exam or source filters changed.

| Property | Type |
|---|---|
| `subjects` | whole number |
| `total` | whole number |
| `exams` | list of short text |
| `sources` | list of short text |
| `cards_in_pool` | whole number |

### `flashcard_session`

A flashcard session ended.

| Property | Type |
|---|---|
| `cards` | whole number |
| `correct` | whole number |
| `duration_s` | whole number |
| `kind` | one of: review, new, weak, due, custom, other |
| `subjects` | whole number |

### `exam_started`

The exam simulator was started.

| Property | Type |
|---|---|
| `questions` | whole number |
| `minutes` | whole number |
| `blocks` | whole number |
| `filters` | list of short text |

### `exam_ended`

The exam simulator finished or was left.

| Property | Type |
|---|---|
| `questions` | whole number |
| `answered` | whole number |
| `correct` | whole number |
| `duration_s` | whole number |
| `outcome` | one of: finished, left, timeout |
| `flagged` | whole number |

### `study_plan_changed`

The exam date or study plan was set or changed.

| Property | Type |
|---|---|
| `action` | one of: created, changed, cleared, run_started |
| `days_out` | whole number |
| `exam` | text (≤30) |

### `review_session`

The quick-review of missed cards.

| Property | Type |
|---|---|
| `cards` | whole number |
| `correct` | whole number |
| `trigger` | one of: postrun, home, reminder, other |

### `explain_viewed`

The "why" explanation for a missed card was opened.

| Property | Type |
|---|---|
| `card_id` | text (≤40) |
| `source` | one of: postrun, study, review, flashcards, other |

### `card_reported`

A card was reported (the reason, never the text).

| Property | Type |
|---|---|
| `card_id` | text (≤40) |
| `reason` | text (≤40) |
| `source` | one of: postrun, browser, flashcards, other |

### `card_browser`

The card browser was used.

| Property | Type |
|---|---|
| `action` | one of: opened, searched, filtered, opened_card |
| `results` | whole number |

### `custom_card`

The player made or removed their own card.

| Property | Type |
|---|---|
| `action` | one of: created, edited, deleted, exported, shared, imported |
| `count` | whole number |
| `cards_total` | whole number |

### `anki_import`

An Anki or text deck import.

| Property | Type |
|---|---|
| `outcome` | one of: ok, empty, error, cancelled |
| `cards` | whole number |
| `skipped` | whole number |
| `kind` | text (≤20) |

### `deck_shared`

A card deck was shared or fetched by code.

| Property | Type |
|---|---|
| `action` | one of: published, fetched, failed |
| `cards` | whole number |

### `readiness_viewed`

The readiness / mastery overview was opened.

| Property | Type |
|---|---|
| `subjects_new` | whole number |
| `subjects_learning` | whole number |
| `subjects_solid` | whole number |
| `subjects_mastered` | whole number |

### `daily_goal`

The daily card goal was met or changed.

| Property | Type |
|---|---|
| `action` | one of: met, changed |
| `goal` | whole number |
| `cards_today` | whole number |

## Settings

### `setting_changed`

A setting was changed (an allow-list of settings, with the new value). Never text the player typed.

| Property | Type |
|---|---|
| `key` | text (≤30) — required |
| `value` | text (≤24) |
| `prev` | text (≤24) |
| `screen` | one of: home, stats, shop, quests, profile, settings, subjects, flashcards, exam, mycards, leaderboard, friends, feed, postrun, results, tutorial, other |

### `reminder_state`

Daily reminder permission and schedule.

| Property | Type |
|---|---|
| `action` | one of: enabled, disabled, permission_granted, permission_denied, unsupported, time_changed |
| `hour` | whole number |
| `native` | true/false |

### `offline_pack`

The "play with no connection" download.

| Property | Type |
|---|---|
| `ok` | true/false |
| `files` | whole number |
| `failed` | whole number |
| `mb` | number |
| `ms` | whole number |

### `data_action`

Backup, restore, report export.

| Property | Type |
|---|---|
| `action` | one of: backup_saved, restored, restore_failed, report_copied, report_csv, analytics_deleted, reset |
| `ok` | true/false |

### `keybinding_changed`

A keyboard binding was changed or reset.

| Property | Type |
|---|---|
| `action` | one of: set, cleared, reset |
| `key_action` | text (≤24) |

## Social

### `account_event`

Sign-up, sign-in, sign-out or deletion. No identifiers.

| Property | Type |
|---|---|
| `action` | one of: signup_started, signup_ok, signin_ok, signin_failed, signout, delete_requested, password_reset, profile_saved, name_set, picture_set |
| `method` | one of: email, other |
| `ok` | true/false |

### `cloud_sync`

Cloud save sync.

| Property | Type |
|---|---|
| `direction` | one of: up, down, conflict, restore |
| `ok` | true/false |
| `bytes_kb` | whole number |

### `leaderboard_viewed`

The leaderboard was opened.

| Property | Type |
|---|---|
| `tab` | text (≤24) |
| `scope` | text (≤24) |
| `rank_known` | true/false |

### `friend_event`

Friends and invites.

| Property | Type |
|---|---|
| `action` | one of: search, request_sent, accepted, declined, removed, blocked, invite_link_copied, feed_opened, kudos_sent, group_joined, group_created |
| `count` | whole number |

### `multiplayer_event`

Head-to-head play.

| Property | Type |
|---|---|
| `action` | one of: queued, match_found, started, ended, forfeit, invite_sent, invite_accepted, invite_declined, rematch |
| `mode` | one of: endless, study, weakness, daily, challenge, tournament, versus, mp_highscore, mp_suddendeath, mp_race, timed_practice, exam, flashcards |
| `result` | one of: win, loss, draw, none |
| `ms` | whole number |

### `challenge_event`

Challenge links (a shared set of cards).

| Property | Type |
|---|---|
| `action` | one of: created, shared, opened, started, completed, banner_shown |
| `score` | whole number |
| `beat` | true/false |
| `count` | whole number |

### `ranked_event`

Ranked ladder.

| Property | Type |
|---|---|
| `action` | one of: viewed, promoted, demoted, season_reward |
| `league` | text (≤24) |
| `trophies` | whole number |

## Growth

### `share`

A share: what, how, and whether it worked. The share link carries a referral code so installs can be traced back.

| Property | Type |
|---|---|
| `kind` | one of: score_image, challenge, invite, streak, deck, results, app, other — required |
| `method` | one of: native, copy, download, link, other |
| `ok` | true/false |
| `surface` | text (≤30) |
| `score` | whole number |

### `referral_landed`

This install came from someone else's share link.

| Property | Type |
|---|---|
| `share_ref` | text (≤16) — required |
| `kind` | text (≤24) |

### `rating_prompt`

The "enjoying Dx Dash?" prompt and where it led.

| Property | Type |
|---|---|
| `step` | one of: shown, enjoying_yes, enjoying_no, store_opened, feedback_opened, dismissed, later — required |
| `trigger` | text (≤30) |
| `runs_total` | whole number |
| `days_since_install` | whole number |

### `feedback_sent`

Feedback was sent (never the text).

| Property | Type |
|---|---|
| `mood` | one of: unhappy, idea, bug |
| `length` | whole number |
| `has_contact` | true/false |
| `ok` | true/false |

## Monetization

### `tip_prompt`

The tip jar: shown, clicked, dismissed.

| Property | Type |
|---|---|
| `step` | one of: shown, clicked, dismissed, opened_settings — required |
| `trigger` | text (≤30) |
| `runs_total` | whole number |
| `days_since_install` | whole number |

## Engagement

### `next_goal_shown`

The "next goal" nudge after a run.

| Property | Type |
|---|---|
| `kind` | text (≤24) |
| `clicked` | true/false |

### `nudge_shown`

Any in-app nudge or smart prompt, and whether it worked.

| Property | Type |
|---|---|
| `kind` | text (≤30) — required |
| `acted` | true/false |

### `review_tip`

The one-time pointer at the review section.

| Property | Type |
|---|---|
| `acted` | true/false |

## Performance

### `perf_load`

How long the app took to get going.

| Property | Type |
|---|---|
| `ttfb_ms` | whole number |
| `dom_ready_ms` | whole number |
| `load_ms` | whole number |
| `first_paint_ms` | whole number |
| `cards_ready_ms` | whole number |
| `boot_ms` | whole number |
| `transfer_kb` | whole number |
| `cached` | true/false |
| `sw` | true/false |
| `connection` | one of: slow-2g, 2g, 3g, 4g, wifi, unknown |

### `perf_sample`

Frame rate over a stretch of a run on this device.

| Property | Type |
|---|---|
| `fps_avg` | whole number |
| `fps_p5` | whole number |
| `frames` | whole number |
| `tier` | one of: low, medium, high |
| `res_scale` | number |
| `density` | number |
| `map` | text (≤40) |
| `seconds` | whole number |

### `tier_changed`

The graphics level changed.

| Property | Type |
|---|---|
| `from` | one of: low, medium, high |
| `to` | one of: low, medium, high |
| `reason` | one of: auto_perf, battery, user, boot, other — required |

## Reliability

### `error`

A crash or handled error: where, and a short message (no stack, no data).

| Property | Type |
|---|---|
| `system` | text (≤30) |
| `operation` | text (≤40) |
| `message` | text (≤120) |
| `fingerprint` | text (≤16) |
| `count` | whole number |
| `screen` | one of: home, stats, shop, quests, profile, settings, subjects, flashcards, exam, mycards, leaderboard, friends, feed, postrun, results, tutorial, other |
| `mode` | text (≤20) |
| `recoverable` | true/false |
| `in_run` | true/false |

### `chunk_failed`

Part of the app failed to download.

| Property | Type |
|---|---|
| `chunk` | text (≤40) |
| `online` | true/false |

### `webgl_unavailable`

The runner cannot start here (no 3D).

| Property | Type |
|---|---|
| `reason` | text (≤40) |

### `connection_changed`

The device went offline or came back.

| Property | Type |
|---|---|
| `online` | true/false — required |
| `seconds_offline` | whole number |

### `storage_problem`

Saving failed or the save had to be repaired.

| Property | Type |
|---|---|
| `kind` | one of: quota, corrupt, repaired, migration, other — required |
| `detail` | text (≤40) |

### `remote_config`

The remote switch file was read.

| Property | Type |
|---|---|
| `killed` | list of short text |
| `experiments` | whole number |
| `ok` | true/false |

## Experiments

### `experiment_exposed`

This install was put in a variant of an experiment (once per install per experiment).

| Property | Type |
|---|---|
| `experiment` | text (≤40) — required |
| `variant` | text (≤24) — required |

## System

### `analytics_health`

How the analytics queue is doing, so missing data is noticed (sent at most once per session).

| Property | Type |
|---|---|
| `queued` | whole number |
| `dropped_invalid` | whole number |
| `dropped_full` | whole number |
| `send_failures` | whole number |
| `sent` | whole number |
| `oldest_queued_min` | whole number |

## Settings reported by `setting_changed`

`musicOn`, `ttsEnabled`, `hapticsEnabled`, `characterVoices`, `nightMode`, `colorblindMode`, `dyslexiaFont`, `handedness`, `dashControl`, `cameraView`, `quality`, `batterySaver`, `ambientParticles`, `glowEffects`, `reducedMotion`, `relaxedPace`, `uiTheme`, `reminders`, `reminderHour`, `dailyGoal`, `cardFreshnessWeight`, `userSpeed`, `speedTimerEnabled`, `hazardsOff`, `monsterOff`, `sendDiagnostics`, `masterVolume`, `sfxVolume`, `musicVolume`, `preferredMap`, `speedRamp`
