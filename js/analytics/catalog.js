/**
 * catalog.js — the dictionary of every analytics event the app can send.
 *
 * Nothing leaves the device unless it is listed here, and only the properties listed for it survive: a new
 * property that is not in the dictionary is dropped (so free text, names or e-mail addresses cannot ride along by
 * accident). docs/ANALYTICS.md is generated from this file (npm run analytics:docs) and a test keeps them in step.
 *
 * Property types (a trailing ! means the event is dropped without it):
 *   s<N>   a string of at most N characters (default 40); links, e-mail addresses and control characters are removed
 *   n      a finite number (3 decimals at most)         i   a whole number
 *   b      true or false
 *   e:a|b  one of the listed words (anything else becomes "other")
 *   m      a map of short names to numbers, e.g. { coins: 12, hearts: 1 } (up to 40 entries)
 *   sa     a short list of short strings (up to 20)
 *   rows   a list of short lists of numbers and short strings (up to 60 lists of up to 12), for packed per-question data
 *
 * Every event also carries, outside its properties: a unique id, the time, a sequence number, the install and
 * the session (see core.js). Device, version and attribution details live once per session (see context.js).
 */

var MODES = 'endless|study|weakness|daily|challenge|tournament|versus|mp_highscore|mp_suddendeath|mp_race|timed_practice|exam|flashcards';
var SCREENS = 'home|stats|shop|quests|profile|settings|subjects|flashcards|exam|mycards|leaderboard|friends|feed|postrun|results|tutorial|other';

/** group, description, props */
export var EVENTS = {
  // ───────────────────────── acquisition and install ─────────────────────────
  app_first_open: ['acquisition', 'The very first time this install opened. Once per install; carries the first-touch source.', {
    install_kind: 'e:web|pwa|android|ios', landing: 's40', referrer_host: 's60', utm_source: 's40', utm_medium: 's40', utm_campaign: 's60',
    utm_content: 's60', utm_term: 's60', has_click_id: 'b', share_ref: 's16', store: 'e:play|appstore|web|other', first_open_hour: 'i'
  }],
  app_open: ['acquisition', 'The app was opened or came back after at least a minute away.', {
    launch: 'e:cold|resume|reload', days_since_last: 'i', days_since_install: 'i', visits_total: 'i', online: 'b', display: 'e:browser|standalone|native'
  }],
  deep_link_opened: ['acquisition', 'Opened from a link: a shared challenge, an e-mail confirmation, an invite.', {
    kind: 'e:challenge|auth|invite|share|store|other', source: 's40', share_ref: 's16'
  }],
  pwa_prompt_available: ['acquisition', 'The browser offered to install the web app.', {}],
  pwa_installed: ['acquisition', 'The web app was installed to the home screen.', {}],
  app_update_available: ['acquisition', 'A new version finished downloading while the app was open.', { from_version: 's20', to_build: 's20' }],
  app_update_applied: ['acquisition', 'The player reloaded into the new version.', { from_version: 's20' }],
  consent_changed: ['privacy', 'The player turned analytics on or off. (Off events are the last thing sent, with consent still on.)', {
    granted: 'b!', source: 'e:prompt|settings|dnt|gpc'
  }],

  // ───────────────────────── sessions ─────────────────────────
  session_start: ['session', 'A session began (the app opened, or came back after 30 minutes away).', {
    reason: 'e:launch|resume_after_gap|first', gap_minutes: 'i', session_number: 'i'
  }],
  session_end: ['session', 'A session ended (sent when the app is hidden, so it may be the last event of a session).', {
    duration_s: 'i', active_s: 'i', screens: 'i', runs: 'i', answers: 'i', errors: 'i', in_run: 'b', last_screen: 'e:' + SCREENS
  }],
  user_snapshot: ['session', 'The player\'s progress at the start of a session, so any later event can be sliced by it.', {
    level: 'i', xp: 'i', coins: 'i', streak_days: 'i', best_streak_days: 'i', runs_total: 'i', answered_total: 'i', correct_total: 'i',
    owned_items: 'i', owned_maps: 'i', achievements: 'i', quests_done_today: 'i', subjects_selected: 'i', subjects_total: 'i',
    exam_filters: 'sa', has_account: 'b', has_name: 'b', custom_cards: 'i', fsrs_due: 'i', days_since_install: 'i', best_score: 'i',
    daily_done: 'b', study_plan: 'b', exam_date_set: 'b', reminders_on: 'b', friends: 'i'
  }],
  screen_view: ['navigation', 'A screen was shown.', { screen: 'e:' + SCREENS + '!', from: 'e:' + SCREENS, via: 'e:tab|button|swipe|back|auto|link|run_end' }],
  sheet_opened: ['navigation', 'A pop-up or sheet was opened (mode picker, filters, tip, account...).', { kind: 's30!', from: 'e:' + SCREENS }],
  tab_changed: ['navigation', 'A tab inside a screen was changed (Locker tabs, Settings sections, Stats views).', { screen: 'e:' + SCREENS, tab: 's30!' }],

  // ───────────────────────── onboarding funnel ─────────────────────────
  tutorial_started: ['onboarding', 'A tutorial began.', { kind: 'e:real_track|practice|tour|lesson|replay!', first_time: 'b' }],
  tutorial_step: ['onboarding', 'A tutorial step was viewed, completed or skipped.', {
    step: 's24!', index: 'i', outcome: 'e:viewed|completed|skipped|failed', attempts: 'i', ms: 'i', kind: 'e:real_track|practice|tour|lesson'
  }],
  tutorial_ended: ['onboarding', 'The tutorial finished or was left.', {
    outcome: 'e:finished|exited|replaced', last_step: 's24', steps_done: 'i', ms: 'i', exit_confirm_shown: 'b', kind: 'e:real_track|practice|tour|lesson'
  }],
  first_run_milestone: ['onboarding', 'A first for this install: first run started, first answer, first correct, first purchase, first quest claim...', {
    milestone: 'e:run_started|answer|correct_answer|run_ended|coin|powerup|purchase|equip|quest_claim|map_change|achievement|share|flashcards|exam|custom_card|account|level_up|study_day|streak_3|day2_return!',
    seconds_since_install: 'i', sessions_so_far: 'i'
  }],

  // ───────────────────────── runs ─────────────────────────
  mode_selected: ['gameplay', 'A game mode was chosen (before it started).', { mode: 'e:' + MODES + '!', from: 's30', blocked: 'e:none|daily_done|not_enough_cards|no_webgl|cards_loading|offline' }],
  run_start: ['gameplay', 'A run began: everything about how it was set up.', {
    run_id: 's40!', mode: 'e:' + MODES + '!', run_number: 'i', map: 's40', hero: 's40', monster: 's40', trail: 's40', speed_dial: 'n', lives: 'i',
    subjects_selected: 'i', subjects_total: 'i', exam_filters: 'sa', pool_size: 'i', custom_rules: 'sa', relaxed_pace: 'b', ranked: 'b',
    input: 'e:touch|keyboard|mixed', dash_control: 'e:double|button|off|auto', camera: 'e:default|close|far', tier: 'e:low|medium|high', fps_cap: 'i',
    music: 'b', sfx: 'b', haptics: 'b', tts: 'b', night: 'b', colorblind: 'b', dyslexia: 'b', lefty: 'b', reduced_motion: 'b', online: 'b',
    seeded: 'b', start_screen: 'e:' + SCREENS, minutes_since_last_run: 'i', coins: 'i', level: 'i', streak_days: 'i'
  }],
  run_end: ['gameplay', 'A run ended: the full result. The most important event for product and balance work.', {
    run_id: 's40!', mode: 'e:' + MODES + '!', reason: 'e:out_of_lives|manual_end|no_matching_cards|daily_complete|challenge_complete|timer_expired|sudden_death_elimination|race_finished|opponent_forfeit|match_decided|local_forfeit|disconnected|fatal_error|app_closed|other',
    duration_s: 'i', active_s: 'i', paused_s: 'i', pauses: 'i', score: 'i', answered: 'i', correct: 'i', wrong: 'i', accuracy: 'n', best_streak: 'i', streak_end: 'i',
    avg_decision_ms: 'i', median_decision_ms: 'i', fastest_decision_ms: 'i', slowest_decision_ms: 'i', rushes: 'i', auto_pilots: 'i',
    obstacles_jumped: 'i', obstacles_slid: 'i', obstacles_hit: 'i', lives_start: 'i', lives_lost: 'i', lives_lost_gate: 'i', lives_lost_obstacle: 'i',
    coins_pickup: 'i', coins_total: 'i', coins_air: 'i', coin_chain_max: 'i', coins_missed: 'i', powerups: 'm', fusions: 'm', secrets: 'i',
    continue_offered: 'b', continued: 'b', monster_caught: 'b', monster_warnings: 'i', hazards: 'm', maps: 'sa', map_changes: 'i',
    speed_start: 'n', speed_end: 'n', xp_gain: 'i', level_before: 'i', level_after: 'i', new_best: 'b', ranked: 'b', custom: 'b',
    unique_cards: 'i', repeat_cards: 'i', subjects: 'm', subject_correct: 'm', fps_avg: 'i', fps_p5: 'i', frames_slow: 'i', tier_end: 'e:low|medium|high', res_scale: 'n',
    scenery_density: 'n', coins_wallet_after: 'i', quests_completed: 'i', achievements: 'i', session_run_index: 'i', run_number: 'i'
  }],
  run_cards: ['gameplay', 'The questions of a run, packed: [card_id, correct 0/1, decision ms, lane chosen, correct lane, wrong-answer index or -1, rush 0/1, streak]. Several events when a run is long.', {
    run_id: 's40!', mode: 'e:' + MODES, part: 'i', parts: 'i', rows: 'rows!', subjects: 'sa'
  }],
  run_paused: ['gameplay', 'A run was paused.', { run_id: 's40', reason: 'e:button|key|blur|visibility|interruption|back', second_into_run: 'i' }],
  run_resumed: ['gameplay', 'A paused run carried on.', { run_id: 's40', paused_s: 'i' }],
  continue_prompt: ['gameplay', 'The out-of-lives "continue?" offer.', { run_id: 's40', cost: 'i', coins: 'i', affordable: 'b', accepted: 'b', score: 'i' }],
  powerup_collected: ['gameplay', 'A power-up was picked up.', { type: 's20!', run_id: 's40', second_into_run: 'i', held: 'sa' }],
  powerup_fused: ['gameplay', 'Two power-ups fused.', { fusion: 's24!', run_id: 's40' }],
  auto_pilot_used: ['gameplay', 'The player used a held Auto-Pilot.', { run_id: 's40', via: 'e:key|button|tap' }],
  secret_found: ['gameplay', 'The hidden secret on a map was found.', { map: 's40', first_time: 'b', coins: 'i' }],
  streak_milestone: ['gameplay', 'A streak milestone (5, 10, 15...) was hit.', { streak: 'i', multiplier: 'i', run_id: 's40' }],
  map_changed: ['gameplay', 'The track changed to another map mid-run.', { from: 's40', to: 's40', run_id: 's40' }],
  hazard_started: ['gameplay', 'A map hazard (blackout, tremor, fog...) began.', { kind: 's24!', map: 's40', run_id: 's40' }],
  monster_event: ['gameplay', 'The exam monster warned, closed in or caught the runner.', { kind: 'e:warning|close|caught|slip', run_id: 's40' }],
  obstacle_outcome: ['gameplay', 'An obstacle was cleared or hit (sampled: 1 in 5).', { kind: 'e:jump|slide', outcome: 'e:cleared|hit', run_id: 's40' }],
  coin_chain: ['gameplay', 'A coin chain of 10 or more ended.', { length: 'i', air: 'i', run_id: 's40' }],

  // ───────────────────────── progression and economy ─────────────────────────
  level_up: ['progression', 'The player reached a new level.', { level: 'i!', rank: 's24', via: 'e:run|study|quest|other', maps_unlocked: 'sa' }],
  achievement_unlocked: ['progression', 'A badge was earned.', { id: 's40!', total: 'i' }],
  map_unlocked: ['progression', 'A map became available (by level or by purchase).', { map: 's40!', via: 'e:level|purchase|start', level: 'i' }],
  streak_changed: ['progression', 'The study streak grew, was saved by a shield or was lost.', { kind: 'e:extended|shield_used|lost|started', days: 'i', best: 'i' }],
  daily_reward_claimed: ['economy', 'The daily login reward.', { day: 'i', coins: 'i', chest: 'b', login_streak: 'i' }],
  quest_completed: ['economy', 'A daily quest was completed.', { id: 's40!', category: 's20', reward: 'i', swapped_in: 'b' }],
  quest_claimed: ['economy', 'A quest reward was claimed.', { id: 's40!', category: 's20', reward: 'i', late: 'b' }],
  quest_swapped: ['economy', 'A quest was swapped for a new one (costs coins).', { from: 's40!', to: 's40', cost: 'i', ok: 'b', reason: 'e:ok|not_enough_coins|done|none_left|other', progress: 'n' }],
  quests_all_done: ['economy', 'All of a day\'s quests were done.', { count: 'i' }],
  purchase: ['economy', 'Something was bought with coins.', {
    item_id: 's40!', item_type: 'e:skin|trail|monster|map|hat|gear|clothing|pal|other', price: 'i', coins_before: 'i', coins_after: 'i', owned_before: 'i',
    via: 'e:locker|map_early|tutorial|other', affordable_pct: 'i', days_since_install: 'i'
  }],
  purchase_blocked: ['economy', 'Tapped Buy without enough coins.', { item_id: 's40!', item_type: 's20', price: 'i', coins: 'i', short_by: 'i' }],
  item_equipped: ['economy', 'A hero, trail, monster or map was chosen.', { item_id: 's40!', item_type: 's20', owned_via: 'e:free|bought|reward|other' }],
  item_previewed: ['economy', 'An item was previewed in the Locker.', { item_id: 's40!', item_type: 's20', owned: 'b', affordable: 'b' }],
  locker_opened: ['economy', 'The Locker was opened.', { tab: 's20', coins: 'i', affordable_items: 'i', new_items: 'i', owned_items: 'i' }],
  coins_spent: ['economy', 'Coins spent on something that is not a Locker item (continue, quest swap).', { on: 'e:continue|quest_swap|other!', amount: 'i', coins_before: 'i' }],
  coins_earned: ['economy', 'Coins from a source outside the run (login, quest, subject bonus, mastery, secrets, gift).', { source: 'e:login|quest|subject_bonus|mastery|secret|flashcards|gauntlet|gift|other!', amount: 'i' }],

  // ───────────────────────── study and content ─────────────────────────
  subjects_changed: ['study', 'The subject, exam or source filters changed.', { subjects: 'i', total: 'i', exams: 'sa', sources: 'sa', cards_in_pool: 'i' }],
  flashcard_session: ['study', 'A flashcard session ended.', { cards: 'i', correct: 'i', duration_s: 'i', kind: 'e:review|new|weak|due|custom|other', subjects: 'i' }],
  exam_started: ['study', 'The exam simulator was started.', { questions: 'i', minutes: 'i', blocks: 'i', filters: 'sa' }],
  exam_ended: ['study', 'The exam simulator finished or was left.', { questions: 'i', answered: 'i', correct: 'i', duration_s: 'i', outcome: 'e:finished|left|timeout', flagged: 'i' }],
  study_plan_changed: ['study', 'The exam date or study plan was set or changed.', { action: 'e:created|changed|cleared|run_started', days_out: 'i', exam: 's30' }],
  review_session: ['study', 'The quick-review of missed cards.', { cards: 'i', correct: 'i', trigger: 'e:postrun|home|reminder|other' }],
  explain_viewed: ['study', 'The "why" explanation for a missed card was opened.', { card_id: 's40', source: 'e:postrun|study|review|flashcards|other' }],
  card_reported: ['study', 'A card was reported (the reason, never the text).', { card_id: 's40', reason: 's40', source: 'e:postrun|browser|flashcards|other' }],
  card_browser: ['study', 'The card browser was used.', { action: 'e:opened|searched|filtered|opened_card', results: 'i' }],
  custom_card: ['study', 'The player made or removed their own card.', { action: 'e:created|edited|deleted|exported|shared|imported', count: 'i', cards_total: 'i' }],
  anki_import: ['study', 'An Anki or text deck import.', { outcome: 'e:ok|empty|error|cancelled', cards: 'i', skipped: 'i', kind: 's20' }],
  deck_shared: ['study', 'A card deck was shared or fetched by code.', { action: 'e:published|fetched|failed', cards: 'i' }],
  readiness_viewed: ['study', 'The readiness / mastery overview was opened.', { subjects_new: 'i', subjects_learning: 'i', subjects_solid: 'i', subjects_mastered: 'i' }],
  daily_goal: ['study', 'The daily card goal was met or changed.', { action: 'e:met|changed', goal: 'i', cards_today: 'i' }],

  // ───────────────────────── settings and accessibility ─────────────────────────
  setting_changed: ['settings', 'A setting was changed (an allow-list of settings, with the new value). Never text the player typed.', {
    key: 's30!', value: 's24', prev: 's24', screen: 'e:' + SCREENS
  }],
  reminder_state: ['settings', 'Daily reminder permission and schedule.', { action: 'e:enabled|disabled|permission_granted|permission_denied|unsupported|time_changed', hour: 'i', native: 'b' }],
  offline_pack: ['settings', 'The "play with no connection" download.', { ok: 'b', files: 'i', failed: 'i', mb: 'n', ms: 'i' }],
  data_action: ['settings', 'Backup, restore, report export.', { action: 'e:backup_saved|restored|restore_failed|report_copied|report_csv|analytics_deleted|reset', ok: 'b' }],
  keybinding_changed: ['settings', 'A keyboard binding was changed or reset.', { action: 'e:set|cleared|reset', key_action: 's24' }],

  // ───────────────────────── accounts and social ─────────────────────────
  account_event: ['social', 'Sign-up, sign-in, sign-out or deletion. No identifiers.', { action: 'e:signup_started|signup_ok|signin_ok|signin_failed|signout|delete_requested|password_reset|profile_saved|name_set|picture_set|oauth_started|oauth_failed|signin_link_sent|signin_link_failed', method: 'e:email|google|apple|azure|discord|facebook|other', ok: 'b' }],
  cloud_sync: ['social', 'Cloud save sync.', { direction: 'e:up|down|conflict|restore', ok: 'b', bytes_kb: 'i' }],
  leaderboard_viewed: ['social', 'The leaderboard was opened.', { tab: 's24', scope: 's24', rank_known: 'b' }],
  friend_event: ['social', 'Friends and invites.', { action: 'e:search|request_sent|accepted|declined|removed|blocked|invite_link_copied|feed_opened|kudos_sent|group_joined|group_created', count: 'i' }],
  multiplayer_event: ['social', 'Head-to-head play.', { action: 'e:queued|match_found|started|ended|forfeit|invite_sent|invite_accepted|invite_declined|rematch', mode: 'e:' + MODES, result: 'e:win|loss|draw|none', ms: 'i' }],
  challenge_event: ['social', 'Challenge links (a shared set of cards).', { action: 'e:created|shared|opened|started|completed|banner_shown', score: 'i', beat: 'b', count: 'i' }],
  ranked_event: ['social', 'Ranked ladder.', { action: 'e:viewed|promoted|demoted|season_reward', league: 's24', trophies: 'i' }],
  share: ['growth', 'A share: what, how, and whether it worked. The share link carries a referral code so installs can be traced back.', {
    kind: 'e:score_image|challenge|invite|streak|deck|results|app|other!', method: 'e:native|copy|download|link|other', ok: 'b', surface: 's30', score: 'i'
  }],
  referral_landed: ['growth', 'This install came from someone else\'s share link.', { share_ref: 's16!', kind: 's24' }],

  // ───────────────────────── feedback, ratings, money ─────────────────────────
  rating_prompt: ['growth', 'The "enjoying Dx Dash?" prompt and where it led.', { step: 'e:shown|enjoying_yes|enjoying_no|store_opened|feedback_opened|dismissed|later!', trigger: 's30', runs_total: 'i', days_since_install: 'i' }],
  feedback_sent: ['growth', 'Feedback was sent (never the text).', { mood: 'e:unhappy|idea|bug', length: 'i', has_contact: 'b', ok: 'b' }],
  paywall_viewed: ['monetization', 'The Dx Dash Pro screen was opened (only once Pro is launched).', { trigger: 's30', feature: 's24', plans: 'sa', variant: 's20', pro: 'b' }],
  paywall_action: ['monetization', 'What the player did on the Pro screen, with the plan and the store price.', {
    action: 'e:plan_selected|purchase_started|purchased|cancelled|failed|restore_started|restore_ok|restore_none|code_ok|code_failed|web_opened|manage_opened|closed!',
    plan: 's24', trigger: 's30', price: 's16', micros: 'i', currency: 's3', trial_days: 'i'
  }],
  pro_gate_hit: ['monetization', 'A free player reached a Pro limit (a locked feature, or the daily/weekly/total limit).', { feature: 's24!', mode: 'e:limit|locked', used: 'i', limit: 'i' }],
  subscription_cancel_check: ['monetization', 'After a member went to cancel: what the billing system says (cancelled, or still renewing).', { cancelled: 'b!', ends_at: 's10' }],
  premium_item: ['monetization', 'A premium (real-money) Locker item: the buy button was pressed and confirmed, or the purchase failed to start.', { item: 's40', action: 'e:started|failed' }],
  pro_gift_claimed: ['monetization', 'A Pro member used their free monthly Locker item.', { item: 's40' }],
  pro_status: ['monetization', 'Whether this install has Pro, at the start of a session (only once Pro is launched).', { active: 'b!', source: 'e:store|server|code|debug|none', plan: 's24', trial: 'b', days_left: 'i' }],
  tip_purchase: ['monetization', 'An in-app tip (phone apps only): started, completed, cancelled or failed, with the store price.', { outcome: 'e:started|completed|cancelled|failed!', product: 's40', price: 's16', micros: 'i', currency: 's3' }],
  tip_prompt: ['monetization', 'The tip jar: shown, clicked, dismissed.', { step: 'e:shown|clicked|dismissed|opened_settings|opened_jar!', trigger: 's30', runs_total: 'i', days_since_install: 'i' }],
  next_goal_shown: ['engagement', 'The "next goal" nudge after a run.', { kind: 's24', clicked: 'b' }],
  nudge_shown: ['engagement', 'Any in-app nudge or smart prompt, and whether it worked.', { kind: 's30!', acted: 'b' }],
  review_tip: ['engagement', 'The one-time pointer at the review section.', { acted: 'b' }],

  // ───────────────────────── performance and reliability ─────────────────────────
  perf_load: ['performance', 'How long the app took to get going.', {
    ttfb_ms: 'i', dom_ready_ms: 'i', load_ms: 'i', first_paint_ms: 'i', cards_ready_ms: 'i', boot_ms: 'i', transfer_kb: 'i', cached: 'b', sw: 'b', connection: 'e:slow-2g|2g|3g|4g|wifi|unknown'
  }],
  perf_sample: ['performance', 'Frame rate over a stretch of a run on this device.', { fps_avg: 'i', fps_p5: 'i', frames: 'i', tier: 'e:low|medium|high', res_scale: 'n', density: 'n', map: 's40', seconds: 'i' }],
  tier_changed: ['performance', 'The graphics level changed.', { from: 'e:low|medium|high', to: 'e:low|medium|high', reason: 'e:auto_perf|battery|user|boot|other!' }],
  error: ['reliability', 'A crash or handled error: where, and a short message (no stack, no data).', {
    system: 's30', operation: 's40', message: 's120', fingerprint: 's16', count: 'i', screen: 'e:' + SCREENS, mode: 's20', recoverable: 'b', in_run: 'b'
  }],
  chunk_failed: ['reliability', 'Part of the app failed to download.', { chunk: 's40', online: 'b' }],
  webgl_unavailable: ['reliability', 'The runner cannot start here (no 3D).', { reason: 's40' }],
  connection_changed: ['reliability', 'The device went offline or came back.', { online: 'b!', seconds_offline: 'i' }],
  storage_problem: ['reliability', 'Saving failed or the save had to be repaired.', { kind: 'e:quota|corrupt|repaired|migration|other!', detail: 's40' }],
  remote_config: ['reliability', 'The remote switch file was read.', { killed: 'sa', experiments: 'i', ok: 'b' }],

  // ───────────────────────── experiments ─────────────────────────
  experiment_exposed: ['experiments', 'This install was put in a variant of an experiment (once per install per experiment).', { experiment: 's40!', variant: 's24!' }],

  // ───────────────────────── the analytics system itself ─────────────────────────
  analytics_health: ['system', 'How the analytics queue is doing, so missing data is noticed (sent at most once per session).', {
    queued: 'i', dropped_invalid: 'i', dropped_full: 'i', send_failures: 'i', sent: 'i', oldest_queued_min: 'i'
  }]
};

/** Event names, for validation and docs. */
export function eventNames() { return Object.keys(EVENTS); }

var EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
var LINK = /\b(?:https?:\/\/|www\.)\S+/gi;

function stripControl(text) {
  var out = '';
  for (var i = 0; i < text.length; i++) { var c = text.charCodeAt(i); out += c < 32 || c === 127 ? ' ' : text.charAt(i); }
  return out;
}

/** Make a string safe to keep: no links, no e-mail addresses, no control characters, at most `max` characters. */
export function scrubString(value, max) {
  var s = stripControl(String(value == null ? '' : value)).replace(EMAIL, '[email]').replace(LINK, '[link]').trim();
  return s.length > max ? s.slice(0, max) : s;
}

function parseType(spec) {
  var required = false;
  if (spec.charAt(spec.length - 1) === '!') { required = true; spec = spec.slice(0, -1); }
  if (spec.indexOf('e:') === 0) return { t: 'e', words: spec.slice(2).split('|'), required: required };
  if (spec === 'sa') return { t: 'sa', required: required };
  if (spec === 'rows') return { t: 'rows', required: required };
  if (spec === 'm') return { t: 'm', required: required };
  if (spec.charAt(0) === 's') return { t: 's', max: Number(spec.slice(1)) || 40, required: required };
  return { t: spec, required: required };
}

function round3(n) { return Math.round(n * 1000) / 1000; }

function cleanValue(def, v) {
  var i;
  switch (def.t) {
    case 'b': return typeof v === 'boolean' ? v : undefined;
    case 'n': return typeof v === 'number' && isFinite(v) ? round3(v) : undefined;
    case 'i': return typeof v === 'number' && isFinite(v) ? Math.round(v) : undefined;
    case 's': { if (v == null || typeof v === 'object') return undefined; var s = scrubString(v, def.max); return s === '' ? undefined : s; }
    case 'e': { if (v == null) return undefined; var w = String(v); return def.words.indexOf(w) >= 0 ? w : 'other'; }
    case 'm': {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
      var out = {}; var n = 0;
      Object.keys(v).forEach(function (k) {
        if (n >= 40 || typeof v[k] !== 'number' || !isFinite(v[k])) return;
        var key = scrubString(k, 40); if (!key) return;
        out[key] = round3(v[k]); n++;
      });
      return n ? out : undefined;
    }
    case 'sa': {
      if (!Array.isArray(v)) return undefined;
      var list = [];
      for (i = 0; i < v.length && list.length < 20; i++) { var item = scrubString(v[i], 30); if (item) list.push(item); }
      return list.length ? list : undefined;
    }
    case 'rows': {
      if (!Array.isArray(v)) return undefined;
      var rows = [];
      for (i = 0; i < v.length && rows.length < 60; i++) {
        if (!Array.isArray(v[i])) continue;
        var row = [];
        for (var j = 0; j < v[i].length && row.length < 12; j++) {
          var x = v[i][j];
          if (typeof x === 'number' && isFinite(x)) row.push(round3(x));
          else if (typeof x === 'string') row.push(scrubString(x, 24));
          else if (typeof x === 'boolean') row.push(x ? 1 : 0);
        }
        if (row.length) rows.push(row);
      }
      return rows.length ? rows : undefined;
    }
    default: return undefined;
  }
}

var _parsed = {};
function schemaOf(name) {
  if (_parsed[name]) return _parsed[name];
  var entry = EVENTS[name];
  if (!entry) return null;
  var out = {};
  Object.keys(entry[2]).forEach(function (k) { out[k] = parseType(entry[2][k]); });
  _parsed[name] = out;
  return out;
}

/**
 * Keep only what the dictionary allows.
 * @param {string} name
 * @param {object} props
 * @returns {{ok: boolean, props?: object, reason?: string}}
 */
export function cleanEvent(name, props) {
  var schema = schemaOf(name);
  if (!schema) return { ok: false, reason: 'unknown event ' + name };
  var out = {};
  props = props && typeof props === 'object' ? props : {};
  var keys = Object.keys(schema);
  for (var i = 0; i < keys.length; i++) {
    var def = schema[keys[i]];
    var v = cleanValue(def, props[keys[i]]);
    if (v === undefined) {
      if (def.required) return { ok: false, reason: name + ' is missing ' + keys[i] };
      continue;
    }
    out[keys[i]] = v;
  }
  return { ok: true, props: out };
}

/** Settings that may be reported when they change, and how their value is reported. Anything else is never sent. */
export var REPORTABLE_SETTINGS = {
  musicOn: 'b', ttsEnabled: 'b', hapticsEnabled: 'b', characterVoices: 'b', nightMode: 'b', colorblindMode: 'b', dyslexiaFont: 'b',
  handedness: 'e', dashControl: 'e', cameraView: 'e', quality: 'e', batterySaver: 'b', ambientParticles: 'b', glowEffects: 'b',
  reducedMotion: 'b', relaxedPace: 'b', uiTheme: 'e', reminders: 'b', reminderHour: 'n', dailyGoal: 'n', cardFreshnessWeight: 'n',
  userSpeed: 'n', speedTimerEnabled: 'b', hazardsOff: 'b', monsterOff: 'b', sendDiagnostics: 'b', masterVolume: 'q', sfxVolume: 'q', musicVolume: 'q',
  preferredMap: 'e', speedRamp: 'o'
};
