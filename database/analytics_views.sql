-- ================================================================
-- Dx Dash — analytics views: everything worth asking, as ready-made tables.
--
-- Run after analytics.sql. Safe to run again. Nothing here is readable by the app: only the project owner (the SQL
-- editor, or the service role key used by tools/analytics-report.mjs) can read the views.
-- Times are UTC days. "Mature" in a retention column means the install is old enough for that day to have happened.
-- docs/ANALYTICS.md explains what each view answers and which decisions it is for.
-- ================================================================

CREATE OR REPLACE FUNCTION analytics_pct(n numeric, d numeric) RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$ SELECT CASE WHEN coalesce(d, 0) = 0 THEN NULL ELSE round(100.0 * coalesce(n, 0) / d, 1) END $$;

-- ==================== BUILDING BLOCKS (other views are made from these) ====================

-- one row per run that ended
CREATE OR REPLACE VIEW analytics_v_runs AS
SELECT e.id, e.install_id, e.session_id, e.ts, e.ts::date AS day,
       e.props ->> 'run_id' AS run_id, e.props ->> 'mode' AS mode, e.props ->> 'reason' AS reason,
       analytics_num(e.props, 'duration_s') AS duration_s, analytics_num(e.props, 'active_s') AS active_s, analytics_num(e.props, 'paused_s') AS paused_s,
       analytics_num(e.props, 'pauses') AS pauses, analytics_num(e.props, 'score') AS score, analytics_num(e.props, 'answered') AS answered,
       analytics_num(e.props, 'correct') AS correct, analytics_num(e.props, 'wrong') AS wrong, analytics_num(e.props, 'accuracy') AS accuracy,
       analytics_num(e.props, 'best_streak') AS best_streak, analytics_num(e.props, 'avg_decision_ms') AS avg_decision_ms,
       analytics_num(e.props, 'median_decision_ms') AS median_decision_ms, analytics_num(e.props, 'fastest_decision_ms') AS fastest_decision_ms,
       analytics_num(e.props, 'rushes') AS rushes, analytics_num(e.props, 'auto_pilots') AS auto_pilots,
       analytics_num(e.props, 'obstacles_jumped') AS obstacles_jumped, analytics_num(e.props, 'obstacles_slid') AS obstacles_slid,
       analytics_num(e.props, 'obstacles_hit') AS obstacles_hit, analytics_num(e.props, 'lives_start') AS lives_start,
       analytics_num(e.props, 'lives_lost') AS lives_lost, analytics_num(e.props, 'lives_lost_gate') AS lives_lost_gate,
       analytics_num(e.props, 'lives_lost_obstacle') AS lives_lost_obstacle, analytics_num(e.props, 'coins_pickup') AS coins_pickup,
       analytics_num(e.props, 'coins_total') AS coins_total, analytics_num(e.props, 'coins_air') AS coins_air,
       analytics_num(e.props, 'coin_chain_max') AS coin_chain_max, analytics_num(e.props, 'secrets') AS secrets,
       analytics_bool(e.props, 'continue_offered') AS continue_offered, analytics_bool(e.props, 'continued') AS continued,
       analytics_bool(e.props, 'monster_caught') AS monster_caught, analytics_num(e.props, 'map_changes') AS map_changes,
       analytics_num(e.props, 'speed_start') AS speed_start, analytics_num(e.props, 'speed_end') AS speed_end, analytics_num(e.props, 'xp_gain') AS xp_gain,
       analytics_num(e.props, 'level_before') AS level_before, analytics_num(e.props, 'level_after') AS level_after,
       analytics_bool(e.props, 'new_best') AS new_best, analytics_bool(e.props, 'ranked') AS ranked, analytics_bool(e.props, 'custom') AS custom,
       analytics_num(e.props, 'unique_cards') AS unique_cards, analytics_num(e.props, 'fps_avg') AS fps_avg, analytics_num(e.props, 'fps_p5') AS fps_p5,
       e.props ->> 'tier_end' AS tier_end, analytics_num(e.props, 'run_number') AS run_number, analytics_num(e.props, 'session_run_index') AS session_run_index,
       analytics_num(e.props, 'coins_wallet_after') AS wallet_after,
       e.props -> 'powerups' AS powerups, e.props -> 'fusions' AS fusions, e.props -> 'hazards' AS hazards, e.props -> 'subjects' AS subjects,
       e.props -> 'subject_correct' AS subject_correct, e.props -> 'maps' AS maps
FROM analytics_events e WHERE e.name = 'run_end';

-- one row per run that started
CREATE OR REPLACE VIEW analytics_v_run_starts AS
SELECT e.id, e.install_id, e.session_id, e.ts, e.ts::date AS day,
       e.props ->> 'run_id' AS run_id, e.props ->> 'mode' AS mode, analytics_num(e.props, 'run_number') AS run_number,
       e.props ->> 'map' AS map, e.props ->> 'hero' AS hero, e.props ->> 'monster' AS monster, e.props ->> 'trail' AS trail,
       analytics_num(e.props, 'speed_dial') AS speed_dial, analytics_num(e.props, 'lives') AS lives,
       analytics_num(e.props, 'subjects_selected') AS subjects_selected, analytics_num(e.props, 'subjects_total') AS subjects_total,
       analytics_num(e.props, 'pool_size') AS pool_size, analytics_bool(e.props, 'relaxed_pace') AS relaxed_pace, analytics_bool(e.props, 'ranked') AS ranked,
       e.props ->> 'input' AS input, e.props ->> 'dash_control' AS dash_control, e.props ->> 'camera' AS camera, e.props ->> 'tier' AS tier,
       analytics_bool(e.props, 'music') AS music, analytics_bool(e.props, 'sfx') AS sfx, analytics_bool(e.props, 'haptics') AS haptics,
       analytics_bool(e.props, 'tts') AS tts, analytics_bool(e.props, 'night') AS night, analytics_bool(e.props, 'colorblind') AS colorblind,
       analytics_bool(e.props, 'dyslexia') AS dyslexia, analytics_bool(e.props, 'lefty') AS lefty, analytics_bool(e.props, 'reduced_motion') AS reduced_motion,
       analytics_bool(e.props, 'online') AS online, analytics_num(e.props, 'minutes_since_last_run') AS minutes_since_last_run,
       analytics_num(e.props, 'coins') AS coins, analytics_num(e.props, 'level') AS level, analytics_num(e.props, 'streak_days') AS streak_days,
       e.props -> 'custom_rules' AS custom_rules
FROM analytics_events e WHERE e.name = 'run_start';

-- the last summary of each session (the app sends one every time it is hidden, so the last one wins)
CREATE OR REPLACE VIEW analytics_v_session_summary AS
WITH last_end AS (
  SELECT DISTINCT ON (session_id) session_id, ts, props
  FROM analytics_events WHERE name = 'session_end' AND session_id IS NOT NULL
  ORDER BY session_id, ts DESC
)
SELECT s.session_id, s.install_id, s.started_at, s.started_at::date AS day, s.platform, s.version, s.os, s.os_major, s.browser, s.form, s.tier, s.language,
       s.tz_offset, s.screen_w, s.screen_h, s.connection, s.standalone, s.last_channel, s.last_source,
       analytics_num(l.props, 'duration_s') AS duration_s, analytics_num(l.props, 'active_s') AS active_s, analytics_num(l.props, 'runs') AS runs,
       analytics_num(l.props, 'answers') AS answers, analytics_num(l.props, 'screens') AS screens, analytics_num(l.props, 'errors') AS errors,
       analytics_bool(l.props, 'in_run') AS ended_in_run, l.props ->> 'last_screen' AS last_screen
FROM analytics_sessions s LEFT JOIN last_end l ON l.session_id = s.session_id;

-- the days each install was active
CREATE OR REPLACE VIEW analytics_v_active_days AS
SELECT DISTINCT install_id, ts::date AS day FROM analytics_events WHERE name = 'session_start';

-- the latest snapshot of each install's progress
CREATE OR REPLACE VIEW analytics_v_latest_snapshot AS
SELECT DISTINCT ON (install_id) install_id, ts,
       analytics_num(props, 'level') AS level, analytics_num(props, 'xp') AS xp, analytics_num(props, 'coins') AS coins,
       analytics_num(props, 'streak_days') AS streak_days, analytics_num(props, 'best_streak_days') AS best_streak_days,
       analytics_num(props, 'runs_total') AS runs_total, analytics_num(props, 'answered_total') AS answered_total,
       analytics_num(props, 'correct_total') AS correct_total, analytics_num(props, 'owned_items') AS owned_items,
       analytics_num(props, 'owned_maps') AS owned_maps, analytics_num(props, 'achievements') AS achievements,
       analytics_num(props, 'subjects_selected') AS subjects_selected, analytics_num(props, 'custom_cards') AS custom_cards,
       analytics_bool(props, 'has_account') AS has_account, analytics_bool(props, 'reminders_on') AS reminders_on,
       analytics_bool(props, 'exam_date_set') AS exam_date_set, analytics_bool(props, 'study_plan') AS study_plan,
       analytics_num(props, 'days_since_install') AS days_since_install, analytics_num(props, 'fsrs_due') AS fsrs_due
FROM analytics_events WHERE name = 'user_snapshot' ORDER BY install_id, ts DESC;

-- ==================== 1. GROWTH AT A GLANCE ====================

-- every day: new installs, active installs, sessions, runs, answers
CREATE OR REPLACE VIEW analytics_v_daily_overview AS
WITH days AS (SELECT d::date AS day FROM generate_series(
       (SELECT coalesce(min(first_seen)::date, current_date) FROM analytics_installs), current_date, interval '1 day') d),
new_installs AS (SELECT first_seen::date AS day, count(*) AS n FROM analytics_installs GROUP BY 1),
act AS (SELECT day, count(*) AS dau FROM analytics_v_active_days GROUP BY 1),
sess AS (SELECT day, count(*) AS sessions, round(avg(duration_s)) AS avg_session_s FROM analytics_v_session_summary GROUP BY 1),
runs AS (SELECT day, count(*) AS runs, sum(answered) AS answers, sum(correct) AS correct, sum(coins_pickup) AS coins_picked FROM analytics_v_runs GROUP BY 1)
SELECT d.day, coalesce(n.n, 0) AS new_installs, coalesce(a.dau, 0) AS dau, coalesce(s.sessions, 0) AS sessions, s.avg_session_s,
       coalesce(r.runs, 0) AS runs, coalesce(r.answers, 0) AS answers, analytics_pct(r.correct, r.answers) AS accuracy_pct, coalesce(r.coins_picked, 0) AS coins_picked,
       round(coalesce(r.runs, 0)::numeric / nullif(a.dau, 0), 2) AS runs_per_active_install
FROM days d LEFT JOIN new_installs n USING (day) LEFT JOIN act a USING (day) LEFT JOIN sess s USING (day) LEFT JOIN runs r USING (day)
ORDER BY d.day;

-- daily, weekly and monthly active installs and how sticky the app is
CREATE OR REPLACE VIEW analytics_v_stickiness AS
WITH days AS (SELECT d::date AS day FROM generate_series(
       (SELECT coalesce(min(day), current_date) FROM analytics_v_active_days), current_date, interval '1 day') d)
SELECT d.day,
       count(DISTINCT a.install_id) FILTER (WHERE a.day = d.day) AS dau,
       count(DISTINCT a.install_id) FILTER (WHERE a.day BETWEEN d.day - 6 AND d.day) AS wau,
       count(DISTINCT a.install_id) AS mau,
       analytics_pct(count(DISTINCT a.install_id) FILTER (WHERE a.day = d.day), count(DISTINCT a.install_id)) AS dau_over_mau_pct
FROM days d LEFT JOIN analytics_v_active_days a ON a.day BETWEEN d.day - 29 AND d.day
GROUP BY d.day ORDER BY d.day;

-- ==================== 2. RETENTION ====================

-- by the day each install arrived: how many came back on day 1, 2, 3, 7, 14, 30
CREATE OR REPLACE VIEW analytics_v_retention AS
WITH cohort AS (SELECT install_id, first_seen::date AS d0 FROM analytics_installs)
SELECT c.d0 AS cohort_day, count(DISTINCT c.install_id) AS installs,
       count(DISTINCT c.install_id) FILTER (WHERE a.day - c.d0 = 1) AS d1,
       count(DISTINCT c.install_id) FILTER (WHERE a.day - c.d0 = 2) AS d2,
       count(DISTINCT c.install_id) FILTER (WHERE a.day - c.d0 = 3) AS d3,
       count(DISTINCT c.install_id) FILTER (WHERE a.day - c.d0 = 7) AS d7,
       count(DISTINCT c.install_id) FILTER (WHERE a.day - c.d0 = 14) AS d14,
       count(DISTINCT c.install_id) FILTER (WHERE a.day - c.d0 = 30) AS d30,
       analytics_pct(count(DISTINCT c.install_id) FILTER (WHERE a.day - c.d0 = 1), count(DISTINCT c.install_id)) AS d1_pct,
       analytics_pct(count(DISTINCT c.install_id) FILTER (WHERE a.day - c.d0 = 7), count(DISTINCT c.install_id)) AS d7_pct,
       analytics_pct(count(DISTINCT c.install_id) FILTER (WHERE a.day - c.d0 = 30), count(DISTINCT c.install_id)) AS d30_pct,
       current_date - c.d0 AS days_old
FROM cohort c LEFT JOIN analytics_v_active_days a ON a.install_id = c.install_id AND a.day >= c.d0
GROUP BY c.d0 ORDER BY c.d0;

-- retention by where installs came from, counting only installs old enough for each day
CREATE OR REPLACE VIEW analytics_v_retention_by_channel AS
WITH cohort AS (SELECT install_id, first_seen::date AS d0, coalesce(first_channel, 'unknown') AS channel, coalesce(first_source, '') AS source,
                       coalesce(platform, '') AS platform FROM analytics_installs)
SELECT c.channel, c.source, c.platform, count(DISTINCT c.install_id) AS installs,
       analytics_pct(count(DISTINCT c.install_id) FILTER (WHERE a.day - c.d0 = 1), count(DISTINCT c.install_id) FILTER (WHERE c.d0 <= current_date - 1)) AS d1_pct,
       analytics_pct(count(DISTINCT c.install_id) FILTER (WHERE a.day - c.d0 = 7), count(DISTINCT c.install_id) FILTER (WHERE c.d0 <= current_date - 7)) AS d7_pct,
       analytics_pct(count(DISTINCT c.install_id) FILTER (WHERE a.day - c.d0 = 30), count(DISTINCT c.install_id) FILTER (WHERE c.d0 <= current_date - 30)) AS d30_pct
FROM cohort c LEFT JOIN analytics_v_active_days a ON a.install_id = c.install_id AND a.day >= c.d0
GROUP BY c.channel, c.source, c.platform ORDER BY installs DESC;

-- retention by app version and by platform
CREATE OR REPLACE VIEW analytics_v_retention_by_version AS
WITH cohort AS (SELECT install_id, first_seen::date AS d0, coalesce(first_version, '') AS version, coalesce(platform, '') AS platform FROM analytics_installs)
SELECT c.version, c.platform, count(DISTINCT c.install_id) AS installs,
       analytics_pct(count(DISTINCT c.install_id) FILTER (WHERE a.day - c.d0 = 1), count(DISTINCT c.install_id) FILTER (WHERE c.d0 <= current_date - 1)) AS d1_pct,
       analytics_pct(count(DISTINCT c.install_id) FILTER (WHERE a.day - c.d0 = 7), count(DISTINCT c.install_id) FILTER (WHERE c.d0 <= current_date - 7)) AS d7_pct
FROM cohort c LEFT JOIN analytics_v_active_days a ON a.install_id = c.install_id AND a.day >= c.d0
GROUP BY c.version, c.platform ORDER BY installs DESC;

-- how often active installs come back: days active in the last 28
CREATE OR REPLACE VIEW analytics_v_frequency AS
WITH per AS (SELECT install_id, count(*) AS days_active FROM analytics_v_active_days WHERE day > current_date - 28 GROUP BY 1)
SELECT CASE WHEN days_active = 1 THEN '1 day' WHEN days_active <= 3 THEN '2-3 days' WHEN days_active <= 7 THEN '4-7 days'
            WHEN days_active <= 14 THEN '8-14 days' ELSE '15+ days' END AS days_active_in_last_28,
       count(*) AS installs, analytics_pct(count(*), sum(count(*)) OVER ()) AS share_pct
FROM per GROUP BY 1 ORDER BY min(days_active);

-- people who have stopped coming: by how long since their last session and how far they got
CREATE OR REPLACE VIEW analytics_v_churn_risk AS
WITH last AS (SELECT install_id, max(day) AS last_day, count(*) AS days_active FROM analytics_v_active_days GROUP BY 1)
SELECT CASE WHEN current_date - l.last_day <= 1 THEN 'active (today or yesterday)' WHEN current_date - l.last_day <= 3 THEN 'cooling (2-3 days)'
            WHEN current_date - l.last_day <= 7 THEN 'at risk (4-7 days)' WHEN current_date - l.last_day <= 30 THEN 'lapsed (8-30 days)' ELSE 'gone (30+ days)' END AS state,
       CASE WHEN coalesce(s.level, 1) >= 10 THEN 'level 10+' WHEN coalesce(s.level, 1) >= 5 THEN 'level 5-9' ELSE 'level 1-4' END AS level_band,
       count(*) AS installs, round(avg(l.days_active), 1) AS avg_days_active, round(avg(s.streak_days), 1) AS avg_streak_days
FROM last l LEFT JOIN analytics_v_latest_snapshot s ON s.install_id = l.install_id
GROUP BY 1, 2 ORDER BY 1, 2;

-- ==================== 3. WHERE INSTALLS COME FROM (MARKETING) ====================

-- each channel / source / campaign: installs and what they did
CREATE OR REPLACE VIEW analytics_v_acquisition AS
WITH i AS (SELECT install_id, first_seen, coalesce(first_channel, 'unknown') AS channel, coalesce(first_source, '') AS source, coalesce(first_medium, '') AS medium,
                  coalesce(first_campaign, '') AS campaign, coalesce(platform, '') AS platform FROM analytics_installs),
runs AS (SELECT install_id, count(*) AS runs, min(ts) AS first_run FROM analytics_v_run_starts GROUP BY 1),
sess AS (SELECT install_id, count(*) AS sessions FROM analytics_sessions GROUP BY 1),
tut AS (SELECT DISTINCT install_id FROM analytics_events WHERE name = 'tutorial_ended' AND props ->> 'outcome' = 'finished'),
buy AS (SELECT DISTINCT install_id FROM analytics_events WHERE name = 'purchase'),
shr AS (SELECT DISTINCT install_id FROM analytics_events WHERE name = 'share'),
ret1 AS (SELECT DISTINCT i2.install_id FROM i i2 JOIN analytics_v_active_days a ON a.install_id = i2.install_id AND a.day - i2.first_seen::date = 1),
ret7 AS (SELECT DISTINCT i2.install_id FROM i i2 JOIN analytics_v_active_days a ON a.install_id = i2.install_id AND a.day - i2.first_seen::date = 7)
SELECT i.channel, i.source, i.medium, i.campaign, i.platform, count(*) AS installs,
       analytics_pct(count(r.install_id) FILTER (WHERE r.first_run < i.first_seen + interval '1 day'), count(*)) AS ran_in_first_day_pct,
       analytics_pct(count(t.install_id), count(*)) AS finished_tutorial_pct,
       round(avg(r.runs), 1) AS runs_per_install, round(avg(s.sessions), 1) AS sessions_per_install,
       analytics_pct(count(b.install_id), count(*)) AS purchased_pct, analytics_pct(count(sh.install_id), count(*)) AS shared_pct,
       analytics_pct(count(r1.install_id), count(*) FILTER (WHERE i.first_seen::date <= current_date - 1)) AS d1_pct,
       analytics_pct(count(r7.install_id), count(*) FILTER (WHERE i.first_seen::date <= current_date - 7)) AS d7_pct
FROM i LEFT JOIN runs r ON r.install_id = i.install_id LEFT JOIN sess s ON s.install_id = i.install_id LEFT JOIN tut t ON t.install_id = i.install_id
     LEFT JOIN buy b ON b.install_id = i.install_id LEFT JOIN shr sh ON sh.install_id = i.install_id
     LEFT JOIN ret1 r1 ON r1.install_id = i.install_id LEFT JOIN ret7 r7 ON r7.install_id = i.install_id
GROUP BY i.channel, i.source, i.medium, i.campaign, i.platform ORDER BY installs DESC;

-- new installs each week by channel
CREATE OR REPLACE VIEW analytics_v_installs_by_week AS
SELECT date_trunc('week', first_seen)::date AS week, coalesce(first_channel, 'unknown') AS channel, coalesce(platform, '') AS platform, count(*) AS installs
FROM analytics_installs GROUP BY 1, 2, 3 ORDER BY 1 DESC, 4 DESC;

-- landing pages and the sites that sent people
CREATE OR REPLACE VIEW analytics_v_landing AS
SELECT coalesce(first_landing, '') AS landing, coalesce(first_referrer, '(none)') AS referrer, count(*) AS installs
FROM analytics_installs GROUP BY 1, 2 ORDER BY installs DESC;

-- the web app's install prompt: shown -> accepted -> installed
CREATE OR REPLACE VIEW analytics_v_pwa AS
SELECT date_trunc('week', e.ts)::date AS week, coalesce(s.browser, '') AS browser,
       count(DISTINCT e.install_id) FILTER (WHERE e.name = 'pwa_prompt_available') AS offered,
       count(DISTINCT e.install_id) FILTER (WHERE e.name = 'pwa_prompt_shown') AS shown,
       count(DISTINCT e.install_id) FILTER (WHERE e.name = 'pwa_prompt_choice' AND e.props ->> 'outcome' = 'accepted') AS accepted,
       count(DISTINCT e.install_id) FILTER (WHERE e.name = 'pwa_prompt_choice' AND e.props ->> 'outcome' = 'dismissed') AS dismissed,
       count(DISTINCT e.install_id) FILTER (WHERE e.name = 'pwa_installed') AS installed
FROM analytics_events e LEFT JOIN analytics_sessions s ON s.session_id = e.session_id
WHERE e.name IN ('pwa_prompt_available', 'pwa_prompt_shown', 'pwa_prompt_choice', 'pwa_installed') GROUP BY 1, 2 ORDER BY 1 DESC;

-- sharing and virality: shares, referred installs, and a rough viral coefficient
CREATE OR REPLACE VIEW analytics_v_virality AS
WITH shares AS (SELECT date_trunc('week', ts)::date AS week, props ->> 'kind' AS kind, count(*) AS shares, count(DISTINCT install_id) AS sharers,
                       count(*) FILTER (WHERE analytics_bool(props, 'ok')) AS shares_ok
                FROM analytics_events WHERE name = 'share' GROUP BY 1, 2),
referred AS (SELECT date_trunc('week', first_seen)::date AS week, count(*) AS referred_installs FROM analytics_installs WHERE referred_by_code IS NOT NULL OR first_channel = 'share' GROUP BY 1),
active AS (SELECT date_trunc('week', day)::date AS week, count(DISTINCT install_id) AS active_installs FROM analytics_v_active_days GROUP BY 1)
SELECT s.week, s.kind, s.shares, s.shares_ok, s.sharers, coalesce(r.referred_installs, 0) AS referred_installs_that_week, a.active_installs,
       round(coalesce(r.referred_installs, 0)::numeric / nullif(a.active_installs, 0), 3) AS referred_per_active_install
FROM shares s LEFT JOIN referred r USING (week) LEFT JOIN active a USING (week) ORDER BY s.week DESC, s.shares DESC;

-- who brought the most new players (by share code); no names, just the code
CREATE OR REPLACE VIEW analytics_v_top_referrers AS
SELECT r.ref_code, r.platform AS referrer_platform, r.events_total AS referrer_events, count(n.install_id) AS installs_brought,
       count(n.install_id) FILTER (WHERE EXISTS (SELECT 1 FROM analytics_events e WHERE e.install_id = n.install_id AND e.name = 'run_start')) AS who_played
FROM analytics_installs r JOIN analytics_installs n ON n.referred_by_code = r.ref_code
GROUP BY r.ref_code, r.platform, r.events_total ORDER BY installs_brought DESC;

-- the question about analytics itself: how many said yes
CREATE OR REPLACE VIEW analytics_v_consent AS
SELECT day, platform, version,
       sum(n) FILTER (WHERE outcome = 'shown') AS shown, sum(n) FILTER (WHERE outcome = 'granted') AS granted, sum(n) FILTER (WHERE outcome = 'denied') AS denied,
       analytics_pct(sum(n) FILTER (WHERE outcome = 'granted'), sum(n) FILTER (WHERE outcome IN ('granted', 'denied'))) AS opt_in_pct
FROM analytics_consent_counts GROUP BY day, platform, version ORDER BY day DESC;

-- ==================== 4. ONBOARDING: WHERE NEW PLAYERS DROP OFF ====================

-- one row: how many installs reached each step of the first experience
CREATE OR REPLACE VIEW analytics_v_onboarding_funnel AS
WITH reached AS (
  SELECT i.install_id,
    EXISTS (SELECT 1 FROM analytics_events e WHERE e.install_id = i.install_id AND e.name = 'tutorial_started') AS tutorial_started,
    EXISTS (SELECT 1 FROM analytics_events e WHERE e.install_id = i.install_id AND e.name = 'tutorial_ended' AND e.props ->> 'outcome' = 'finished') AS tutorial_finished,
    EXISTS (SELECT 1 FROM analytics_events e WHERE e.install_id = i.install_id AND e.name = 'run_start') AS run_started,
    EXISTS (SELECT 1 FROM analytics_events e WHERE e.install_id = i.install_id AND e.name = 'first_run_milestone' AND e.props ->> 'milestone' = 'correct_answer') AS first_correct,
    EXISTS (SELECT 1 FROM analytics_events e WHERE e.install_id = i.install_id AND e.name = 'run_end') AS run_ended,
    (SELECT count(*) FROM analytics_events e WHERE e.install_id = i.install_id AND e.name = 'run_end') >= 3 AS three_runs,
    EXISTS (SELECT 1 FROM analytics_events e WHERE e.install_id = i.install_id AND e.name = 'purchase') AS purchased,
    EXISTS (SELECT 1 FROM analytics_events e WHERE e.install_id = i.install_id AND e.name = 'quest_claimed') AS claimed_quest,
    EXISTS (SELECT 1 FROM analytics_v_active_days a WHERE a.install_id = i.install_id AND a.day > i.first_seen::date) AS came_back,
    EXISTS (SELECT 1 FROM analytics_v_active_days a WHERE a.install_id = i.install_id AND a.day - i.first_seen::date = 1) AS back_day_1
  FROM analytics_installs i)
SELECT count(*) AS installs,
       count(*) FILTER (WHERE tutorial_started) AS tutorial_started, count(*) FILTER (WHERE tutorial_finished) AS tutorial_finished,
       count(*) FILTER (WHERE run_started) AS run_started, count(*) FILTER (WHERE first_correct) AS first_correct_answer,
       count(*) FILTER (WHERE run_ended) AS first_run_finished, count(*) FILTER (WHERE three_runs) AS three_runs,
       count(*) FILTER (WHERE purchased) AS first_purchase, count(*) FILTER (WHERE claimed_quest) AS claimed_a_quest,
       count(*) FILTER (WHERE came_back) AS came_back_later, count(*) FILTER (WHERE back_day_1) AS back_on_day_1,
       analytics_pct(count(*) FILTER (WHERE tutorial_finished), count(*) FILTER (WHERE tutorial_started)) AS tutorial_completion_pct,
       analytics_pct(count(*) FILTER (WHERE run_started), count(*)) AS started_a_run_pct,
       analytics_pct(count(*) FILTER (WHERE came_back), count(*)) AS came_back_pct
FROM reached;

-- tutorial steps: how many viewed, finished, skipped, failed; how long they took
CREATE OR REPLACE VIEW analytics_v_tutorial_steps AS
SELECT coalesce(e.props ->> 'kind', '') AS kind, e.props ->> 'step' AS step, round(avg(analytics_num(e.props, 'index')), 1) AS position,
       count(DISTINCT e.install_id) FILTER (WHERE e.props ->> 'outcome' = 'viewed') AS viewed,
       count(DISTINCT e.install_id) FILTER (WHERE e.props ->> 'outcome' = 'completed') AS completed,
       count(DISTINCT e.install_id) FILTER (WHERE e.props ->> 'outcome' = 'skipped') AS skipped,
       count(DISTINCT e.install_id) FILTER (WHERE e.props ->> 'outcome' = 'failed') AS failed,
       analytics_pct(count(DISTINCT e.install_id) FILTER (WHERE e.props ->> 'outcome' = 'completed'), count(DISTINCT e.install_id) FILTER (WHERE e.props ->> 'outcome' = 'viewed')) AS completed_pct,
       round(avg(analytics_num(e.props, 'attempts')) FILTER (WHERE e.props ->> 'outcome' = 'completed'), 2) AS avg_attempts,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY analytics_num(e.props, 'ms')) FILTER (WHERE e.props ->> 'outcome' = 'completed') AS median_ms
FROM analytics_events e WHERE e.name = 'tutorial_step' GROUP BY 1, 2 ORDER BY 1, 3;

-- where the tutorial is left
CREATE OR REPLACE VIEW analytics_v_tutorial_exits AS
SELECT coalesce(props ->> 'kind', '') AS kind, props ->> 'outcome' AS outcome, coalesce(props ->> 'last_step', '(none)') AS last_step, count(*) AS tutorials,
       round(avg(analytics_num(props, 'steps_done')), 1) AS avg_steps_done, percentile_cont(0.5) WITHIN GROUP (ORDER BY analytics_num(props, 'ms')) AS median_ms,
       count(*) FILTER (WHERE analytics_bool(props, 'exit_confirm_shown')) AS saw_exit_question
FROM analytics_events WHERE name = 'tutorial_ended' GROUP BY 1, 2, 3 ORDER BY tutorials DESC;

-- how soon after install each first milestone is reached
CREATE OR REPLACE VIEW analytics_v_time_to_milestone AS
SELECT props ->> 'milestone' AS milestone, count(DISTINCT install_id) AS installs,
       percentile_cont(0.25) WITHIN GROUP (ORDER BY analytics_num(props, 'seconds_since_install')) AS p25_seconds,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY analytics_num(props, 'seconds_since_install')) AS median_seconds,
       percentile_cont(0.9) WITHIN GROUP (ORDER BY analytics_num(props, 'seconds_since_install')) AS p90_seconds,
       round(avg(analytics_num(props, 'sessions_so_far')), 1) AS avg_sessions_so_far
FROM analytics_events WHERE name = 'first_run_milestone' GROUP BY 1 ORDER BY median_seconds;

-- the first session: how long, how many runs
CREATE OR REPLACE VIEW analytics_v_first_session AS
SELECT s.platform, count(*) AS first_sessions, percentile_cont(0.5) WITHIN GROUP (ORDER BY s.duration_s) AS median_seconds,
       percentile_cont(0.9) WITHIN GROUP (ORDER BY s.duration_s) AS p90_seconds, round(avg(s.runs), 2) AS avg_runs, round(avg(s.answers), 1) AS avg_answers,
       analytics_pct(count(*) FILTER (WHERE coalesce(s.runs, 0) = 0), count(*)) AS no_run_pct, analytics_pct(count(*) FILTER (WHERE s.duration_s < 60), count(*)) AS under_a_minute_pct
FROM analytics_v_session_summary s
WHERE s.session_id IN (SELECT DISTINCT ON (install_id) session_id FROM analytics_sessions ORDER BY install_id, started_at)
GROUP BY s.platform ORDER BY first_sessions DESC;

-- ==================== 5. SESSIONS AND SCREENS ====================

CREATE OR REPLACE VIEW analytics_v_session_stats AS
SELECT day, platform, count(*) AS sessions, round(avg(duration_s)) AS avg_seconds, percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_s) AS median_seconds,
       percentile_cont(0.9) WITHIN GROUP (ORDER BY duration_s) AS p90_seconds, round(avg(active_s)) AS avg_active_seconds, round(avg(runs), 2) AS runs_per_session,
       round(avg(answers), 1) AS answers_per_session, round(avg(screens), 1) AS screens_per_session,
       analytics_pct(count(*) FILTER (WHERE coalesce(runs, 0) = 0), count(*)) AS sessions_without_a_run_pct,
       analytics_pct(count(*) FILTER (WHERE coalesce(errors, 0) > 0), count(*)) AS sessions_with_error_pct
FROM analytics_v_session_summary GROUP BY day, platform ORDER BY day DESC, sessions DESC;

-- where sessions end (the last screen seen)
CREATE OR REPLACE VIEW analytics_v_session_exits AS
SELECT coalesce(last_screen, '(unknown)') AS last_screen, coalesce(ended_in_run, false) AS ended_in_a_run, count(*) AS sessions,
       analytics_pct(count(*), sum(count(*)) OVER ()) AS share_pct
FROM analytics_v_session_summary GROUP BY 1, 2 ORDER BY sessions DESC;

-- how many sessions a person has had, by days since install (are they coming back more than once a day?)
CREATE OR REPLACE VIEW analytics_v_sessions_per_active_day AS
SELECT day, round(count(*)::numeric / nullif(count(DISTINCT install_id), 0), 2) AS sessions_per_active_install, count(DISTINCT install_id) AS active_installs
FROM analytics_v_session_summary GROUP BY day ORDER BY day DESC;

CREATE OR REPLACE VIEW analytics_v_screens AS
SELECT ts::date AS day, props ->> 'screen' AS screen, count(*) AS views, count(DISTINCT install_id) AS installs,
       round(count(*)::numeric / nullif(count(DISTINCT session_id), 0), 2) AS views_per_session
FROM analytics_events WHERE name = 'screen_view' GROUP BY 1, 2 ORDER BY 1 DESC, views DESC;

-- how people move between screens
CREATE OR REPLACE VIEW analytics_v_screen_flow AS
SELECT coalesce(props ->> 'from', '(start)') AS from_screen, props ->> 'screen' AS to_screen, coalesce(props ->> 'via', '') AS via, count(*) AS moves,
       analytics_pct(count(*), sum(count(*)) OVER (PARTITION BY coalesce(props ->> 'from', '(start)'))) AS share_of_from_pct
FROM analytics_events WHERE name = 'screen_view' GROUP BY 1, 2, 3 ORDER BY moves DESC;

-- which tabs and pop-ups are used
CREATE OR REPLACE VIEW analytics_v_tabs_and_sheets AS
SELECT name AS kind, coalesce(props ->> 'screen', props ->> 'from', '') AS where_, coalesce(props ->> 'tab', props ->> 'kind') AS item, count(*) AS opens, count(DISTINCT install_id) AS installs
FROM analytics_events WHERE name IN ('tab_changed', 'sheet_opened') GROUP BY 1, 2, 3 ORDER BY opens DESC;

-- ==================== 6. FEATURE ADOPTION ====================

-- last 30 days: how many active installs used each feature at least once
CREATE OR REPLACE VIEW analytics_v_features AS
WITH feature(name, feature) AS (VALUES
  ('run_start', 'play a run'), ('flashcard_session', 'flashcards'), ('exam_started', 'exam simulator'), ('study_plan_changed', 'study plan / exam date'),
  ('custom_card', 'own cards'), ('anki_import', 'Anki import'), ('deck_shared', 'shared decks'), ('locker_opened', 'Locker'), ('purchase', 'buying items'),
  ('item_equipped', 'equipping items'), ('quest_claimed', 'claiming quests'), ('quest_swapped', 'swapping quests'), ('daily_reward_claimed', 'daily login reward'),
  ('share', 'sharing'), ('challenge_event', 'challenges'), ('multiplayer_event', 'versus'), ('leaderboard_viewed', 'leaderboard'), ('friend_event', 'friends'),
  ('setting_changed', 'changing settings'), ('review_session', 'quick review'), ('explain_viewed', 'explanations'), ('readiness_viewed', 'readiness view'),
  ('card_browser', 'card browser'), ('card_reported', 'reporting cards'), ('offline_pack', 'offline download'), ('account_event', 'account'),
  ('feedback_sent', 'sending feedback'), ('secret_found', 'finding secrets'), ('powerup_fused', 'power-up fusions'), ('map_mastered', 'map mastery'))
SELECT f.feature, count(DISTINCT e.install_id) AS installs, analytics_pct(count(DISTINCT e.install_id), (SELECT count(DISTINCT install_id) FROM analytics_v_active_days WHERE day > current_date - 30)) AS pct_of_active_installs,
       count(*) AS uses
FROM feature f JOIN analytics_events e ON e.name = f.name AND e.ts > now() - interval '30 days'
GROUP BY f.feature ORDER BY installs DESC;

-- each game mode: how much it is played and how it goes
CREATE OR REPLACE VIEW analytics_v_modes AS
SELECT mode, count(*) AS runs, count(DISTINCT install_id) AS installs, round(avg(duration_s)) AS avg_seconds, round(avg(score)) AS avg_score,
       round(avg(answered), 1) AS avg_answered, analytics_pct(sum(correct), sum(answered)) AS accuracy_pct,
       analytics_pct(count(*) FILTER (WHERE reason IN ('daily_complete', 'challenge_complete', 'race_finished')), count(*)) AS completed_pct,
       analytics_pct(count(*), sum(count(*)) OVER ()) AS share_of_runs_pct
FROM analytics_v_runs GROUP BY mode ORDER BY runs DESC;

-- modes players pick and cannot start (daily already done, no cards...)
CREATE OR REPLACE VIEW analytics_v_mode_blocked AS
SELECT props ->> 'mode' AS mode, coalesce(props ->> 'blocked', 'none') AS blocked, count(*) AS times, count(DISTINCT install_id) AS installs
FROM analytics_events WHERE name = 'mode_selected' GROUP BY 1, 2 ORDER BY times DESC;

-- ==================== 7. GAMEPLAY AND BALANCE ====================

CREATE OR REPLACE VIEW analytics_v_runs_daily AS
SELECT day, mode, count(*) AS runs, count(DISTINCT install_id) AS installs, round(avg(duration_s)) AS avg_seconds, round(avg(score)) AS avg_score,
       round(avg(answered), 1) AS avg_answered, analytics_pct(sum(correct), sum(answered)) AS accuracy_pct, round(avg(best_streak), 1) AS avg_best_streak,
       round(avg(coins_pickup)) AS avg_coins_picked, round(avg(lives_lost), 2) AS avg_lives_lost
FROM analytics_v_runs GROUP BY day, mode ORDER BY day DESC, runs DESC;

-- why runs end
CREATE OR REPLACE VIEW analytics_v_run_end_reasons AS
SELECT mode, coalesce(reason, 'unknown') AS reason, count(*) AS runs, analytics_pct(count(*), sum(count(*)) OVER (PARTITION BY mode)) AS share_of_mode_pct,
       round(avg(duration_s)) AS avg_seconds, round(avg(answered), 1) AS avg_answered
FROM analytics_v_runs GROUP BY mode, reason ORDER BY mode, runs DESC;

-- the first 30 runs: does the game get easier or harder, and who keeps going?
CREATE OR REPLACE VIEW analytics_v_difficulty_curve AS
WITH r AS (SELECT * FROM analytics_v_runs WHERE mode = 'endless' AND run_number BETWEEN 1 AND 30),
per AS (SELECT run_number, count(*) AS runs, count(DISTINCT install_id) AS installs, round(avg(duration_s)) AS avg_seconds, round(avg(answered), 1) AS avg_answered,
               analytics_pct(sum(correct), sum(answered)) AS accuracy_pct, round(avg(lives_lost), 2) AS avg_lives_lost, round(avg(score)) AS avg_score,
               round(avg(coins_pickup)) AS avg_coins_picked, analytics_pct(count(*) FILTER (WHERE monster_caught), count(*)) AS monster_caught_pct
        FROM r GROUP BY run_number)
SELECT p.*, analytics_pct(n.installs, p.installs) AS went_on_to_next_run_pct
FROM per p LEFT JOIN per n ON n.run_number = p.run_number + 1 ORDER BY p.run_number;

-- how the run was set up: input, graphics level, speed, camera
CREATE OR REPLACE VIEW analytics_v_run_setup AS
SELECT coalesce(s.input, 'unknown') AS input, coalesce(s.tier, 'unknown') AS tier, coalesce(s.camera, 'default') AS camera, coalesce(s.dash_control, 'auto') AS dash_control,
       count(*) AS runs, analytics_pct(sum(r.correct), sum(r.answered)) AS accuracy_pct, round(avg(r.duration_s)) AS avg_seconds, round(avg(r.lives_lost), 2) AS avg_lives_lost,
       analytics_pct(count(*) FILTER (WHERE r.reason = 'manual_end'), count(*)) AS quit_pct
FROM analytics_v_run_starts s JOIN analytics_v_runs r ON r.run_id = s.run_id AND r.install_id = s.install_id
GROUP BY 1, 2, 3, 4 ORDER BY runs DESC;

-- speed dial: what players choose and how it goes
CREATE OR REPLACE VIEW analytics_v_speed AS
SELECT s.speed_dial, count(*) AS runs, count(DISTINCT s.install_id) AS installs, analytics_pct(sum(r.correct), sum(r.answered)) AS accuracy_pct,
       round(avg(r.duration_s)) AS avg_seconds, round(avg(r.score)) AS avg_score, analytics_pct(count(*) FILTER (WHERE s.relaxed_pace), count(*)) AS relaxed_pace_pct
FROM analytics_v_run_starts s JOIN analytics_v_runs r ON r.run_id = s.run_id AND r.install_id = s.install_id
GROUP BY s.speed_dial ORDER BY s.speed_dial;

-- what takes lives: wrong gates, obstacles, the exam monster
CREATE OR REPLACE VIEW analytics_v_deaths AS
SELECT day, count(*) AS runs, sum(lives_lost) AS lives_lost, analytics_pct(sum(lives_lost_gate), sum(lives_lost)) AS from_wrong_answers_pct,
       analytics_pct(sum(lives_lost_obstacle), sum(lives_lost)) AS from_obstacles_pct, analytics_pct(count(*) FILTER (WHERE monster_caught), count(*)) AS runs_ending_in_monster_pct,
       analytics_pct(sum(obstacles_hit), sum(obstacles_hit + obstacles_jumped + obstacles_slid)) AS obstacles_hit_pct
FROM analytics_v_runs GROUP BY day ORDER BY day DESC;

-- the continue offer: shown, taken, and what it did to the run
CREATE OR REPLACE VIEW analytics_v_continue AS
SELECT date_trunc('week', ts)::date AS week, count(*) AS offers, count(*) FILTER (WHERE analytics_bool(props, 'accepted')) AS accepted,
       analytics_pct(count(*) FILTER (WHERE analytics_bool(props, 'accepted')), count(*)) AS accepted_pct,
       count(*) FILTER (WHERE NOT coalesce(analytics_bool(props, 'affordable'), true)) AS could_not_afford, round(avg(analytics_num(props, 'cost'))) AS avg_cost,
       round(avg(analytics_num(props, 'score'))) AS avg_score_at_offer
FROM analytics_events WHERE name = 'continue_prompt' GROUP BY 1 ORDER BY 1 DESC;

-- power-ups per run
CREATE OR REPLACE VIEW analytics_v_powerups AS
SELECT p.key AS powerup, count(*) AS runs_with_it, sum(p.value::numeric) AS collected, round(avg(p.value::numeric), 2) AS avg_per_run_that_had_it,
       analytics_pct(count(*), (SELECT count(*) FROM analytics_v_runs)) AS pct_of_runs
FROM analytics_v_runs r, LATERAL jsonb_each_text(CASE WHEN jsonb_typeof(r.powerups) = 'object' THEN r.powerups ELSE '{}'::jsonb END) AS p(key, value)
GROUP BY p.key ORDER BY collected DESC;

CREATE OR REPLACE VIEW analytics_v_fusions AS
SELECT p.key AS fusion, count(*) AS runs_with_it, sum(p.value::numeric) AS times
FROM analytics_v_runs r, LATERAL jsonb_each_text(CASE WHEN jsonb_typeof(r.fusions) = 'object' THEN r.fusions ELSE '{}'::jsonb END) AS p(key, value)
GROUP BY p.key ORDER BY times DESC;

CREATE OR REPLACE VIEW analytics_v_hazards AS
SELECT p.key AS hazard, count(*) AS runs, sum(p.value::numeric) AS times
FROM analytics_v_runs r, LATERAL jsonb_each_text(CASE WHEN jsonb_typeof(r.hazards) = 'object' THEN r.hazards ELSE '{}'::jsonb END) AS p(key, value)
GROUP BY p.key ORDER BY times DESC;

-- coins picked up on the track: how much, how often in the air, how long the chains are
CREATE OR REPLACE VIEW analytics_v_coin_stats AS
SELECT day, count(*) AS runs, round(avg(coins_pickup)) AS avg_picked, percentile_cont(0.5) WITHIN GROUP (ORDER BY coins_pickup) AS median_picked,
       percentile_cont(0.9) WITHIN GROUP (ORDER BY coins_pickup) AS p90_picked, round(avg(coins_air), 1) AS avg_air_coins, round(avg(coin_chain_max), 1) AS avg_longest_chain,
       round(avg(coins_pickup / nullif(duration_s, 0) * 60)) AS avg_coins_per_minute
FROM analytics_v_runs GROUP BY day ORDER BY day DESC;

-- maps: how often they are played and how it goes
CREATE OR REPLACE VIEW analytics_v_maps AS
SELECT s.map, count(*) AS runs, count(DISTINCT s.install_id) AS installs, round(avg(r.duration_s)) AS avg_seconds, analytics_pct(sum(r.correct), sum(r.answered)) AS accuracy_pct,
       round(avg(r.lives_lost), 2) AS avg_lives_lost, analytics_pct(count(*), sum(count(*)) OVER ()) AS share_of_runs_pct
FROM analytics_v_run_starts s LEFT JOIN analytics_v_runs r ON r.run_id = s.run_id AND r.install_id = s.install_id
WHERE s.map IS NOT NULL GROUP BY s.map ORDER BY runs DESC;

CREATE OR REPLACE VIEW analytics_v_map_progress AS
SELECT name, props ->> 'map' AS map, coalesce(props ->> 'via', '') AS via, count(*) AS events, count(DISTINCT install_id) AS installs
FROM analytics_events WHERE name IN ('map_unlocked', 'map_mastered', 'secret_found') GROUP BY 1, 2, 3 ORDER BY events DESC;

-- heroes, monsters and trails in use
CREATE OR REPLACE VIEW analytics_v_cosmetics_in_use AS
SELECT 'hero' AS kind, hero AS item, count(*) AS runs, count(DISTINCT install_id) AS installs FROM analytics_v_run_starts WHERE hero IS NOT NULL GROUP BY 2
UNION ALL SELECT 'monster', monster, count(*), count(DISTINCT install_id) FROM analytics_v_run_starts WHERE monster IS NOT NULL GROUP BY 2
UNION ALL SELECT 'trail', trail, count(*), count(DISTINCT install_id) FROM analytics_v_run_starts WHERE trail IS NOT NULL GROUP BY 2
ORDER BY kind, runs DESC;

-- rules changed by the player (power-ups off, no hazards...) and how often
CREATE OR REPLACE VIEW analytics_v_custom_rules AS
SELECT r.value AS rule, count(*) AS runs, count(DISTINCT s.install_id) AS installs
FROM analytics_v_run_starts s, LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(s.custom_rules) = 'array' THEN s.custom_rules ELSE '[]'::jsonb END) AS r(value)
GROUP BY r.value ORDER BY runs DESC;

-- ==================== 8. CONTENT: WHAT PEOPLE KNOW AND WHAT TRIPS THEM ====================

-- per subject: questions answered and accuracy, from every run
CREATE OR REPLACE VIEW analytics_v_subjects AS
SELECT a.key AS subject, sum(a.value::numeric) AS answered, sum(coalesce(c.value::numeric, 0)) AS correct, analytics_pct(sum(coalesce(c.value::numeric, 0)), sum(a.value::numeric)) AS accuracy_pct,
       count(DISTINCT r.install_id) AS installs, round(sum(a.value::numeric) / nullif(count(DISTINCT r.install_id), 0), 1) AS answered_per_install
FROM analytics_v_runs r
JOIN LATERAL jsonb_each_text(CASE WHEN jsonb_typeof(r.subjects) = 'object' THEN r.subjects ELSE '{}'::jsonb END) AS a(key, value) ON true
LEFT JOIN LATERAL jsonb_each_text(CASE WHEN jsonb_typeof(r.subject_correct) = 'object' THEN r.subject_correct ELSE '{}'::jsonb END) AS c(key, value) ON c.key = a.key
GROUP BY a.key ORDER BY answered DESC;

-- how many subjects players keep on, and which exam filters they use
CREATE OR REPLACE VIEW analytics_v_subject_filters AS
SELECT coalesce(subjects_selected::text, '?') AS subjects_selected, count(*) AS runs, count(DISTINCT install_id) AS installs
FROM analytics_v_run_starts GROUP BY 1 ORDER BY 2 DESC;

CREATE OR REPLACE VIEW analytics_v_exam_filters AS
SELECT f.value AS exam_filter, count(*) AS runs, count(DISTINCT s.install_id) AS installs
FROM analytics_events s, LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(s.props -> 'exam_filters') = 'array' THEN s.props -> 'exam_filters' ELSE '[]'::jsonb END) AS f(value)
WHERE s.name = 'run_start' GROUP BY f.value ORDER BY runs DESC;

-- every card: how often it is asked, how often it is right, how long it takes (cards seen at least 10 times)
CREATE OR REPLACE VIEW analytics_v_card_difficulty AS
WITH rows AS (
  SELECT e.install_id, row_.value AS r FROM analytics_events e, LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(e.props -> 'rows') = 'array' THEN e.props -> 'rows' ELSE '[]'::jsonb END) AS row_(value)
  WHERE e.name = 'run_cards')
SELECT r ->> 0 AS card_id, count(*) AS asked, count(DISTINCT install_id) AS installs, round(avg((r ->> 1)::numeric) * 100, 1) AS correct_pct,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY (r ->> 2)::numeric) AS median_ms, round(avg((r ->> 6)::numeric) * 100, 1) AS dashed_pct
FROM rows GROUP BY 1 HAVING count(*) >= 10 ORDER BY correct_pct;

-- cards that are too easy (nearly always right, answered fast): candidates to retire or harden
CREATE OR REPLACE VIEW analytics_v_cards_too_easy AS
SELECT * FROM analytics_v_card_difficulty WHERE correct_pct >= 97 AND asked >= 30 ORDER BY asked DESC;

-- cards that are too hard or unfair (mostly wrong): candidates to rewrite
CREATE OR REPLACE VIEW analytics_v_cards_too_hard AS
SELECT * FROM analytics_v_card_difficulty WHERE correct_pct <= 35 AND asked >= 30 ORDER BY correct_pct;

-- which wrong answer players choose, per card: a distractor that wins more than chance is a sign the card is unclear
CREATE OR REPLACE VIEW analytics_v_card_distractors AS
WITH rows AS (
  SELECT e.install_id, row_.value AS r FROM analytics_events e, LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(e.props -> 'rows') = 'array' THEN e.props -> 'rows' ELSE '[]'::jsonb END) AS row_(value)
  WHERE e.name = 'run_cards')
SELECT r ->> 0 AS card_id, (r ->> 5)::int AS wrong_answer_index, count(*) AS times_chosen,
       analytics_pct(count(*), sum(count(*)) OVER (PARTITION BY r ->> 0)) AS share_of_wrong_answers_pct
FROM rows WHERE (r ->> 1)::int = 0 AND (r ->> 5)::int >= 0 GROUP BY 1, 2 HAVING count(*) >= 5 ORDER BY card_id, times_chosen DESC;

-- do players favour a lane regardless of the answer? (the correct lane is random, so the share should be even)
CREATE OR REPLACE VIEW analytics_v_lane_bias AS
WITH rows AS (
  SELECT row_.value AS r FROM analytics_events e, LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(e.props -> 'rows') = 'array' THEN e.props -> 'rows' ELSE '[]'::jsonb END) AS row_(value)
  WHERE e.name = 'run_cards')
SELECT (r ->> 3)::int AS lane_chosen, count(*) AS answers, analytics_pct(count(*), sum(count(*)) OVER ()) AS share_pct,
       count(*) FILTER (WHERE (r ->> 3) = (r ->> 4)) AS right_when_chosen, analytics_pct(count(*) FILTER (WHERE (r ->> 3) = (r ->> 4)), count(*)) AS accuracy_pct
FROM rows GROUP BY 1 ORDER BY 1;

-- how decision time relates to being right
CREATE OR REPLACE VIEW analytics_v_decision_time AS
WITH rows AS (
  SELECT row_.value AS r FROM analytics_events e, LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(e.props -> 'rows') = 'array' THEN e.props -> 'rows' ELSE '[]'::jsonb END) AS row_(value)
  WHERE e.name = 'run_cards')
SELECT CASE WHEN (r ->> 2)::numeric < 1000 THEN '< 1 s' WHEN (r ->> 2)::numeric < 2000 THEN '1-2 s' WHEN (r ->> 2)::numeric < 4000 THEN '2-4 s' WHEN (r ->> 2)::numeric < 8000 THEN '4-8 s' ELSE '8 s +' END AS decision_time,
       count(*) AS answers, analytics_pct(count(*) FILTER (WHERE (r ->> 1)::int = 1), count(*)) AS correct_pct
FROM rows GROUP BY 1 ORDER BY min((r ->> 2)::numeric);

CREATE OR REPLACE VIEW analytics_v_explanations AS
SELECT props ->> 'source' AS source, count(*) AS opened, count(DISTINCT install_id) AS installs, count(DISTINCT props ->> 'card_id') AS different_cards
FROM analytics_events WHERE name = 'explain_viewed' GROUP BY 1 ORDER BY opened DESC;

CREATE OR REPLACE VIEW analytics_v_card_reports AS
SELECT props ->> 'reason' AS reason, coalesce(props ->> 'source', '') AS source, count(*) AS reports, count(DISTINCT props ->> 'card_id') AS cards, count(DISTINCT install_id) AS installs
FROM analytics_events WHERE name = 'card_reported' GROUP BY 1, 2 ORDER BY reports DESC;

CREATE OR REPLACE VIEW analytics_v_most_reported_cards AS
SELECT props ->> 'card_id' AS card_id, count(*) AS reports, count(DISTINCT install_id) AS installs, mode() WITHIN GROUP (ORDER BY props ->> 'reason') AS main_reason
FROM analytics_events WHERE name = 'card_reported' AND props ->> 'card_id' IS NOT NULL GROUP BY 1 ORDER BY reports DESC;

CREATE OR REPLACE VIEW analytics_v_flashcards AS
SELECT ts::date AS day, coalesce(props ->> 'kind', 'other') AS kind, count(*) AS sessions, count(DISTINCT install_id) AS installs, round(avg(analytics_num(props, 'cards')), 1) AS avg_cards,
       analytics_pct(sum(analytics_num(props, 'correct')), sum(analytics_num(props, 'cards'))) AS correct_pct, round(avg(analytics_num(props, 'duration_s'))) AS avg_seconds
FROM analytics_events WHERE name = 'flashcard_session' GROUP BY 1, 2 ORDER BY 1 DESC;

CREATE OR REPLACE VIEW analytics_v_exam_sim AS
SELECT date_trunc('week', ts)::date AS week, count(*) FILTER (WHERE name = 'exam_started') AS started, count(*) FILTER (WHERE name = 'exam_ended' AND props ->> 'outcome' = 'finished') AS finished,
       count(*) FILTER (WHERE name = 'exam_ended' AND props ->> 'outcome' = 'left') AS left_early,
       analytics_pct(sum(analytics_num(props, 'correct')) FILTER (WHERE name = 'exam_ended'), sum(analytics_num(props, 'answered')) FILTER (WHERE name = 'exam_ended')) AS accuracy_pct,
       round(avg(analytics_num(props, 'duration_s')) FILTER (WHERE name = 'exam_ended')) AS avg_seconds
FROM analytics_events WHERE name IN ('exam_started', 'exam_ended') GROUP BY 1 ORDER BY 1 DESC;

CREATE OR REPLACE VIEW analytics_v_study_plans AS
SELECT props ->> 'action' AS action, count(*) AS events, count(DISTINCT install_id) AS installs, round(avg(analytics_num(props, 'days_out'))) AS avg_days_out,
       mode() WITHIN GROUP (ORDER BY props ->> 'exam') AS main_exam
FROM analytics_events WHERE name = 'study_plan_changed' GROUP BY 1 ORDER BY events DESC;

CREATE OR REPLACE VIEW analytics_v_custom_cards AS
SELECT props ->> 'action' AS action, count(*) AS events, count(DISTINCT install_id) AS installs, sum(coalesce(analytics_num(props, 'count'), 1)) AS cards
FROM analytics_events WHERE name IN ('custom_card', 'anki_import', 'deck_shared') GROUP BY 1 ORDER BY events DESC;

-- ==================== 9. ECONOMY ====================

-- coins in and out each day
CREATE OR REPLACE VIEW analytics_v_economy_daily AS
WITH picked AS (SELECT day, sum(coins_pickup) AS picked, sum(coins_total) AS run_total FROM analytics_v_runs GROUP BY 1),
other_in AS (SELECT ts::date AS day, sum(analytics_num(props, 'amount')) AS earned FROM analytics_events WHERE name = 'coins_earned' GROUP BY 1),
bought AS (SELECT ts::date AS day, sum(analytics_num(props, 'price')) AS spent_on_items, count(*) AS purchases FROM analytics_events WHERE name = 'purchase' GROUP BY 1),
other_out AS (SELECT ts::date AS day, sum(analytics_num(props, 'amount')) AS spent_other FROM analytics_events WHERE name = 'coins_spent' GROUP BY 1),
days AS (SELECT day FROM picked UNION SELECT day FROM other_in UNION SELECT day FROM bought UNION SELECT day FROM other_out)
SELECT d.day, coalesce(p.picked, 0) AS from_track_pickups, coalesce(p.run_total, 0) AS run_totals, coalesce(o.earned, 0) AS from_other_sources, coalesce(b.spent_on_items, 0) AS spent_on_items,
       coalesce(b.purchases, 0) AS purchases, coalesce(x.spent_other, 0) AS spent_on_continues_and_swaps,
       coalesce(p.picked, 0) + coalesce(o.earned, 0) - coalesce(b.spent_on_items, 0) - coalesce(x.spent_other, 0) AS net
FROM days d LEFT JOIN picked p USING (day) LEFT JOIN other_in o USING (day) LEFT JOIN bought b USING (day) LEFT JOIN other_out x USING (day) ORDER BY d.day DESC;

-- coins from sources outside runs
CREATE OR REPLACE VIEW analytics_v_coin_sources AS
SELECT props ->> 'source' AS source, count(*) AS events, count(DISTINCT install_id) AS installs, sum(analytics_num(props, 'amount')) AS coins, round(avg(analytics_num(props, 'amount'))) AS avg_amount
FROM analytics_events WHERE name = 'coins_earned' GROUP BY 1 ORDER BY coins DESC;

CREATE OR REPLACE VIEW analytics_v_coin_sinks AS
SELECT 'item: ' || coalesce(props ->> 'item_type', 'other') AS spent_on, count(*) AS purchases, count(DISTINCT install_id) AS installs, sum(analytics_num(props, 'price')) AS coins
FROM analytics_events WHERE name = 'purchase' GROUP BY 1
UNION ALL SELECT props ->> 'on', count(*), count(DISTINCT install_id), sum(analytics_num(props, 'amount')) FROM analytics_events WHERE name = 'coins_spent' GROUP BY 1 ORDER BY coins DESC;

-- every item: bought, previewed, equipped, wanted-but-too-dear
CREATE OR REPLACE VIEW analytics_v_items AS
WITH p AS (SELECT props ->> 'item_id' AS item, props ->> 'item_type' AS item_type, count(*) AS purchases, count(DISTINCT install_id) AS buyers, round(avg(analytics_num(props, 'price'))) AS price,
                  round(avg(analytics_num(props, 'days_since_install')), 1) AS avg_days_since_install, round(avg(analytics_num(props, 'coins_after'))) AS avg_coins_left
           FROM analytics_events WHERE name = 'purchase' GROUP BY 1, 2),
v AS (SELECT props ->> 'item_id' AS item, count(DISTINCT install_id) AS previewers FROM analytics_events WHERE name = 'item_previewed' GROUP BY 1),
b AS (SELECT props ->> 'item_id' AS item, count(*) AS blocked, count(DISTINCT install_id) AS blocked_installs, round(avg(analytics_num(props, 'short_by'))) AS avg_short_by
      FROM analytics_events WHERE name = 'purchase_blocked' GROUP BY 1),
q AS (SELECT props ->> 'item_id' AS item, count(*) AS equips, count(DISTINCT install_id) AS equippers FROM analytics_events WHERE name = 'item_equipped' GROUP BY 1)
SELECT coalesce(p.item, v.item, b.item, q.item) AS item, p.item_type, p.price, coalesce(p.purchases, 0) AS purchases, coalesce(p.buyers, 0) AS buyers, coalesce(v.previewers, 0) AS previewers,
       coalesce(b.blocked_installs, 0) AS tried_to_buy_without_coins, b.avg_short_by, coalesce(q.equippers, 0) AS equippers, p.avg_days_since_install, p.avg_coins_left,
       analytics_pct(p.buyers, v.previewers) AS preview_to_buy_pct
FROM p FULL JOIN v USING (item) FULL JOIN b USING (item) FULL JOIN q USING (item) ORDER BY purchases DESC NULLS LAST;

-- how soon people buy their first thing, and what it is
CREATE OR REPLACE VIEW analytics_v_first_purchase AS
WITH first_buy AS (SELECT DISTINCT ON (e.install_id) e.install_id, e.ts, e.props ->> 'item_id' AS item, analytics_num(e.props, 'price') AS price
                   FROM analytics_events e WHERE e.name = 'purchase' ORDER BY e.install_id, e.ts)
SELECT f.item, count(*) AS installs, round(avg(f.price)) AS price,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM f.ts - i.first_seen) / 3600) AS median_hours_after_install,
       percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM f.ts - i.first_seen) / 3600) AS p90_hours_after_install
FROM first_buy f JOIN analytics_installs i ON i.install_id = f.install_id GROUP BY f.item ORDER BY installs DESC;

-- how many coins players are sitting on, by how long they have played
CREATE OR REPLACE VIEW analytics_v_wallet AS
SELECT CASE WHEN days_since_install < 1 THEN 'day 0' WHEN days_since_install < 3 THEN 'days 1-2' WHEN days_since_install < 7 THEN 'days 3-6'
            WHEN days_since_install < 30 THEN 'days 7-29' ELSE 'day 30+' END AS install_age, count(*) AS installs,
       percentile_cont(0.25) WITHIN GROUP (ORDER BY coins) AS p25_coins, percentile_cont(0.5) WITHIN GROUP (ORDER BY coins) AS median_coins,
       percentile_cont(0.75) WITHIN GROUP (ORDER BY coins) AS p75_coins, round(avg(owned_items), 1) AS avg_owned_items,
       analytics_pct(count(*) FILTER (WHERE coins >= 500), count(*)) AS can_afford_500_pct, analytics_pct(count(*) FILTER (WHERE coins >= 2000), count(*)) AS can_afford_2000_pct
FROM analytics_v_latest_snapshot WHERE days_since_install IS NOT NULL GROUP BY 1 ORDER BY min(days_since_install);

-- when the coin supply does not match the shop: stuck players hoarding many coins and buying nothing
CREATE OR REPLACE VIEW analytics_v_hoarders AS
SELECT count(*) FILTER (WHERE coins >= 3000) AS hoarding_3000_plus, count(*) FILTER (WHERE coins >= 3000 AND owned_items <= 10) AS hoarding_and_few_items,
       count(*) AS installs, analytics_pct(count(*) FILTER (WHERE coins >= 3000), count(*)) AS hoarding_pct
FROM analytics_v_latest_snapshot;

-- quests
CREATE OR REPLACE VIEW analytics_v_quests AS
WITH c AS (SELECT props ->> 'id' AS quest, count(*) AS completed, count(DISTINCT install_id) AS completers FROM analytics_events WHERE name = 'quest_completed' GROUP BY 1),
k AS (SELECT props ->> 'id' AS quest, count(*) AS claimed, sum(analytics_num(props, 'reward')) AS coins_paid FROM analytics_events WHERE name = 'quest_claimed' GROUP BY 1),
s AS (SELECT props ->> 'from' AS quest, count(*) FILTER (WHERE analytics_bool(props, 'ok')) AS swapped_away, count(*) FILTER (WHERE NOT coalesce(analytics_bool(props, 'ok'), false)) AS swap_refused FROM analytics_events WHERE name = 'quest_swapped' GROUP BY 1)
SELECT coalesce(c.quest, k.quest, s.quest) AS quest, coalesce(c.completed, 0) AS completed, coalesce(k.claimed, 0) AS claimed, coalesce(k.coins_paid, 0) AS coins_paid,
       coalesce(s.swapped_away, 0) AS swapped_away, coalesce(s.swap_refused, 0) AS swap_refused,
       analytics_pct(coalesce(s.swapped_away, 0), coalesce(s.swapped_away, 0) + coalesce(c.completed, 0)) AS disliked_pct
FROM c FULL JOIN k USING (quest) FULL JOIN s USING (quest) ORDER BY swapped_away DESC NULLS LAST, completed DESC;

CREATE OR REPLACE VIEW analytics_v_quest_swaps AS
SELECT date_trunc('week', ts)::date AS week, count(*) AS tries, count(*) FILTER (WHERE analytics_bool(props, 'ok')) AS swapped,
       count(*) FILTER (WHERE props ->> 'reason' = 'not_enough_coins') AS not_enough_coins, round(avg(analytics_num(props, 'cost'))) AS avg_cost,
       round(avg(analytics_num(props, 'progress')), 2) AS avg_progress_when_swapped, count(DISTINCT install_id) AS installs
FROM analytics_events WHERE name = 'quest_swapped' GROUP BY 1 ORDER BY 1 DESC;

CREATE OR REPLACE VIEW analytics_v_daily_rewards AS
SELECT ts::date AS day, count(*) AS claims, count(DISTINCT install_id) AS installs, round(avg(analytics_num(props, 'login_streak')), 1) AS avg_login_streak,
       count(*) FILTER (WHERE analytics_bool(props, 'chest')) AS chests, sum(analytics_num(props, 'coins')) AS coins
FROM analytics_events WHERE name = 'daily_reward_claimed' GROUP BY 1 ORDER BY 1 DESC;

-- ==================== 10. PROGRESSION AND HABITS ====================

CREATE OR REPLACE VIEW analytics_v_levels AS
SELECT level::int AS level, count(*) AS installs, analytics_pct(count(*), sum(count(*)) OVER ()) AS share_pct, round(avg(runs_total), 1) AS avg_runs, round(avg(days_since_install), 1) AS avg_days_in
FROM analytics_v_latest_snapshot WHERE level IS NOT NULL GROUP BY 1 ORDER BY 1;

-- how long reaching each level takes
CREATE OR REPLACE VIEW analytics_v_time_to_level AS
SELECT analytics_num(e.props, 'level')::int AS level, count(*) AS installs,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM e.ts - i.first_seen) / 86400) AS median_days, percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM e.ts - i.first_seen) / 86400) AS p90_days
FROM analytics_events e JOIN analytics_installs i ON i.install_id = e.install_id WHERE e.name = 'level_up' GROUP BY 1 ORDER BY 1;

CREATE OR REPLACE VIEW analytics_v_streaks AS
SELECT CASE WHEN streak_days = 0 THEN '0' WHEN streak_days <= 2 THEN '1-2' WHEN streak_days <= 6 THEN '3-6' WHEN streak_days <= 13 THEN '7-13' WHEN streak_days <= 29 THEN '14-29' ELSE '30+' END AS study_streak_days,
       count(*) AS installs, analytics_pct(count(*), sum(count(*)) OVER ()) AS share_pct
FROM analytics_v_latest_snapshot WHERE streak_days IS NOT NULL GROUP BY 1 ORDER BY min(streak_days);

CREATE OR REPLACE VIEW analytics_v_streak_events AS
SELECT props ->> 'kind' AS kind, count(*) AS events, count(DISTINCT install_id) AS installs, round(avg(analytics_num(props, 'days')), 1) AS avg_days
FROM analytics_events WHERE name = 'streak_changed' GROUP BY 1 ORDER BY events DESC;

CREATE OR REPLACE VIEW analytics_v_achievements AS
SELECT props ->> 'id' AS badge, count(*) AS earned, count(DISTINCT install_id) AS installs, analytics_pct(count(DISTINCT install_id), (SELECT count(*) FROM analytics_installs)) AS pct_of_installs
FROM analytics_events WHERE name = 'achievement_unlocked' GROUP BY 1 ORDER BY earned DESC;

CREATE OR REPLACE VIEW analytics_v_daily_goal AS
SELECT props ->> 'action' AS action, round(avg(analytics_num(props, 'goal'))) AS avg_goal, count(*) AS events, count(DISTINCT install_id) AS installs
FROM analytics_events WHERE name = 'daily_goal' GROUP BY 1;

-- ==================== 11. RATINGS, FEEDBACK, TIPS, NOTIFICATIONS ====================

CREATE OR REPLACE VIEW analytics_v_rating_funnel AS
SELECT props ->> 'step' AS step, coalesce(props ->> 'trigger', '') AS trigger, count(*) AS events, count(DISTINCT install_id) AS installs, round(avg(analytics_num(props, 'runs_total')), 1) AS avg_runs_at_prompt,
       round(avg(analytics_num(props, 'days_since_install')), 1) AS avg_days_at_prompt
FROM analytics_events WHERE name = 'rating_prompt' GROUP BY 1, 2 ORDER BY events DESC;

CREATE OR REPLACE VIEW analytics_v_feedback AS
SELECT props ->> 'mood' AS mood, count(*) AS sent, round(avg(analytics_num(props, 'length'))) AS avg_length, analytics_pct(count(*) FILTER (WHERE analytics_bool(props, 'has_contact')), count(*)) AS left_contact_pct
FROM analytics_events WHERE name = 'feedback_sent' GROUP BY 1 ORDER BY sent DESC;

CREATE OR REPLACE VIEW analytics_v_tip_funnel AS
SELECT props ->> 'step' AS step, coalesce(props ->> 'trigger', '') AS trigger, count(*) AS events, count(DISTINCT install_id) AS installs, round(avg(analytics_num(props, 'runs_total')), 1) AS avg_runs, round(avg(analytics_num(props, 'days_since_install')), 1) AS avg_days
FROM analytics_events WHERE name = 'tip_prompt' GROUP BY 1, 2 ORDER BY events DESC;

CREATE OR REPLACE VIEW analytics_v_reminders AS
SELECT props ->> 'action' AS action, coalesce(analytics_bool(props, 'native'), false) AS native, count(*) AS events, count(DISTINCT install_id) AS installs, round(avg(analytics_num(props, 'hour')), 1) AS avg_hour
FROM analytics_events WHERE name = 'reminder_state' GROUP BY 1, 2 ORDER BY events DESC;

CREATE OR REPLACE VIEW analytics_v_nudges AS
SELECT coalesce(props ->> 'kind', name) AS nudge, name AS source_event, count(*) AS shown, count(*) FILTER (WHERE analytics_bool(props, 'acted') OR analytics_bool(props, 'clicked')) AS acted,
       analytics_pct(count(*) FILTER (WHERE analytics_bool(props, 'acted') OR analytics_bool(props, 'clicked')), count(*)) AS acted_pct
FROM analytics_events WHERE name IN ('nudge_shown', 'next_goal_shown', 'review_tip') GROUP BY 1, 2 ORDER BY shown DESC;

-- ==================== 12. SETTINGS AND ACCESSIBILITY ====================

-- the latest value each install chose for each setting, and how many chose each
CREATE OR REPLACE VIEW analytics_v_settings AS
WITH latest AS (SELECT DISTINCT ON (install_id, props ->> 'key') install_id, props ->> 'key' AS key, props ->> 'value' AS value
                FROM analytics_events WHERE name = 'setting_changed' ORDER BY install_id, props ->> 'key', ts DESC)
SELECT key, coalesce(value, '') AS value, count(*) AS installs, analytics_pct(count(*), sum(count(*)) OVER (PARTITION BY key)) AS share_of_changers_pct
FROM latest GROUP BY key, value ORDER BY key, installs DESC;

CREATE OR REPLACE VIEW analytics_v_setting_changes AS
SELECT props ->> 'key' AS key, count(*) AS changes, count(DISTINCT install_id) AS installs, count(*) FILTER (WHERE ts > now() - interval '7 days') AS last_7_days
FROM analytics_events WHERE name = 'setting_changed' GROUP BY 1 ORDER BY changes DESC;

-- accessibility and comfort features in use, from runs
CREATE OR REPLACE VIEW analytics_v_accessibility AS
SELECT count(*) AS runs, count(DISTINCT install_id) AS installs,
       analytics_pct(count(*) FILTER (WHERE dyslexia), count(*)) AS dyslexia_font_pct, analytics_pct(count(*) FILTER (WHERE lefty), count(*)) AS left_hand_layout_pct,
       analytics_pct(count(*) FILTER (WHERE colorblind), count(*)) AS colorblind_pct, analytics_pct(count(*) FILTER (WHERE reduced_motion), count(*)) AS reduced_motion_pct,
       analytics_pct(count(*) FILTER (WHERE relaxed_pace), count(*)) AS relaxed_pace_pct, analytics_pct(count(*) FILTER (WHERE tts), count(*)) AS read_aloud_pct,
       analytics_pct(count(*) FILTER (WHERE night), count(*)) AS night_shift_pct, analytics_pct(count(*) FILTER (WHERE haptics), count(*)) AS vibration_pct,
       analytics_pct(count(*) FILTER (WHERE music), count(*)) AS music_on_pct, analytics_pct(count(*) FILTER (WHERE sfx), count(*)) AS sound_effects_on_pct
FROM analytics_v_run_starts;

-- ==================== 13. PERFORMANCE AND RELIABILITY ====================

-- frame rate by device kind and graphics level
CREATE OR REPLACE VIEW analytics_v_fps AS
SELECT coalesce(s.form, '') AS form, coalesce(s.os, '') AS os, coalesce(s.browser, '') AS browser, coalesce(r.tier_end, s.tier, '') AS tier, count(*) AS runs,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY r.fps_avg) AS median_fps, percentile_cont(0.1) WITHIN GROUP (ORDER BY r.fps_avg) AS p10_fps, round(avg(r.fps_p5)) AS avg_fps_p5,
       analytics_pct(count(*) FILTER (WHERE r.fps_avg < 30), count(*)) AS runs_under_30fps_pct
FROM analytics_v_runs r LEFT JOIN analytics_sessions s ON s.session_id = r.session_id WHERE r.fps_avg IS NOT NULL GROUP BY 1, 2, 3, 4 ORDER BY runs DESC;

-- how long the app takes to start
CREATE OR REPLACE VIEW analytics_v_load_times AS
SELECT e.ts::date AS day, coalesce(s.platform, '') AS platform, coalesce(analytics_bool(e.props, 'cached'), false) AS repeat_visit, coalesce(e.props ->> 'connection', 'unknown') AS connection, count(*) AS loads,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY analytics_num(e.props, 'boot_ms')) AS median_boot_ms, percentile_cont(0.9) WITHIN GROUP (ORDER BY analytics_num(e.props, 'boot_ms')) AS p90_boot_ms,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY analytics_num(e.props, 'cards_ready_ms')) AS median_cards_ready_ms, percentile_cont(0.5) WITHIN GROUP (ORDER BY analytics_num(e.props, 'first_paint_ms')) AS median_first_paint_ms,
       round(avg(analytics_num(e.props, 'transfer_kb'))) AS avg_transfer_kb
FROM analytics_events e LEFT JOIN analytics_sessions s ON s.session_id = e.session_id WHERE e.name = 'perf_load' GROUP BY 1, 2, 3, 4 ORDER BY 1 DESC;

CREATE OR REPLACE VIEW analytics_v_tier_changes AS
SELECT props ->> 'from' AS from_tier, props ->> 'to' AS to_tier, props ->> 'reason' AS reason, count(*) AS changes, count(DISTINCT install_id) AS installs
FROM analytics_events WHERE name = 'tier_changed' GROUP BY 1, 2, 3 ORDER BY changes DESC;

-- errors: what, where, how many people, which versions
CREATE OR REPLACE VIEW analytics_v_errors AS
SELECT coalesce(e.props ->> 'fingerprint', left(e.props ->> 'message', 40)) AS fingerprint, e.props ->> 'system' AS system, e.props ->> 'operation' AS operation, left(max(e.props ->> 'message'), 120) AS message,
       count(*) AS occurrences, count(DISTINCT e.install_id) AS installs, min(e.ts) AS first_seen, max(e.ts) AS last_seen, array_agg(DISTINCT s.version) FILTER (WHERE s.version IS NOT NULL) AS versions,
       count(*) FILTER (WHERE analytics_bool(e.props, 'in_run')) AS during_runs
FROM analytics_events e LEFT JOIN analytics_sessions s ON s.session_id = e.session_id WHERE e.name = 'error' GROUP BY 1, 2, 3 ORDER BY installs DESC, occurrences DESC;

-- how stable each version is: share of sessions with no error
CREATE OR REPLACE VIEW analytics_v_crash_free AS
SELECT coalesce(version, '') AS version, count(*) AS sessions, count(*) FILTER (WHERE coalesce(errors, 0) = 0) AS clean_sessions,
       analytics_pct(count(*) FILTER (WHERE coalesce(errors, 0) = 0), count(*)) AS crash_free_sessions_pct, count(DISTINCT install_id) AS installs
FROM analytics_v_session_summary GROUP BY 1 ORDER BY min(started_at) DESC;

CREATE OR REPLACE VIEW analytics_v_reliability_other AS
SELECT name, coalesce(props ->> 'chunk', props ->> 'reason', props ->> 'kind', '') AS detail, count(*) AS events, count(DISTINCT install_id) AS installs
FROM analytics_events WHERE name IN ('chunk_failed', 'webgl_unavailable', 'storage_problem') GROUP BY 1, 2 ORDER BY events DESC;

CREATE OR REPLACE VIEW analytics_v_offline AS
SELECT ts::date AS day, count(*) FILTER (WHERE NOT analytics_bool(props, 'online')) AS went_offline, count(*) FILTER (WHERE analytics_bool(props, 'online')) AS came_back,
       round(avg(analytics_num(props, 'seconds_offline')) FILTER (WHERE analytics_bool(props, 'online'))) AS avg_seconds_offline, count(DISTINCT install_id) AS installs
FROM analytics_events WHERE name = 'connection_changed' GROUP BY 1 ORDER BY 1 DESC;

CREATE OR REPLACE VIEW analytics_v_offline_pack AS
SELECT ts::date AS day, count(*) AS tries, count(*) FILTER (WHERE analytics_bool(props, 'ok')) AS ok, round(avg(analytics_num(props, 'mb')), 1) AS avg_mb, round(avg(analytics_num(props, 'ms'))) AS avg_ms
FROM analytics_events WHERE name = 'offline_pack' GROUP BY 1 ORDER BY 1 DESC;

-- which versions are out there, and how quickly updates reach people
CREATE OR REPLACE VIEW analytics_v_versions AS
SELECT day, coalesce(version, '') AS version, count(DISTINCT install_id) AS active_installs, count(*) AS sessions,
       analytics_pct(count(DISTINCT install_id), sum(count(DISTINCT install_id)) OVER (PARTITION BY day)) AS share_of_day_pct
FROM analytics_v_session_summary GROUP BY day, version ORDER BY day DESC, active_installs DESC;

CREATE OR REPLACE VIEW analytics_v_updates AS
SELECT ts::date AS day, count(*) FILTER (WHERE name = 'app_update_available') AS update_ready, count(*) FILTER (WHERE name = 'app_update_applied') AS update_applied,
       analytics_pct(count(*) FILTER (WHERE name = 'app_update_applied'), count(*) FILTER (WHERE name = 'app_update_available')) AS applied_pct
FROM analytics_events WHERE name IN ('app_update_available', 'app_update_applied') GROUP BY 1 ORDER BY 1 DESC;

-- ==================== 14. WHO PLAYS ON WHAT (DEVICES, LANGUAGE, REGION BY TIME ZONE) ====================

CREATE OR REPLACE VIEW analytics_v_devices AS
SELECT coalesce(form, '') AS form, coalesce(os, '') AS os, os_major, coalesce(browser, '') AS browser, count(DISTINCT install_id) AS installs, analytics_pct(count(DISTINCT install_id), (SELECT count(*) FROM analytics_installs)) AS share_pct
FROM analytics_sessions GROUP BY 1, 2, 3, 4 ORDER BY installs DESC;

CREATE OR REPLACE VIEW analytics_v_screens_and_hardware AS
SELECT coalesce(screen_w, 0) || 'x' || coalesce(screen_h, 0) AS screen, coalesce(dpr, 1) AS dpr, memory_gb, cores, count(DISTINCT install_id) AS installs
FROM analytics_sessions GROUP BY 1, 2, 3, 4 ORDER BY installs DESC;

CREATE OR REPLACE VIEW analytics_v_languages AS
SELECT coalesce(language, 'und') AS language, count(DISTINCT install_id) AS installs, analytics_pct(count(DISTINCT install_id), (SELECT count(*) FROM analytics_installs)) AS share_pct
FROM analytics_sessions GROUP BY 1 ORDER BY installs DESC;

-- time zone offset is a coarse stand-in for region (no IP geolocation is stored)
CREATE OR REPLACE VIEW analytics_v_time_zones AS
SELECT tz_offset AS utc_offset_hours, count(DISTINCT install_id) AS installs, analytics_pct(count(DISTINCT install_id), (SELECT count(*) FROM analytics_installs)) AS share_pct
FROM analytics_sessions WHERE tz_offset IS NOT NULL GROUP BY 1 ORDER BY installs DESC;

-- when people play: hour of day (UTC) and day of week
CREATE OR REPLACE VIEW analytics_v_play_times AS
SELECT extract(dow FROM ts)::int AS day_of_week, extract(hour FROM ts)::int AS hour_utc, count(*) AS runs, count(DISTINCT install_id) AS installs
FROM analytics_v_run_starts GROUP BY 1, 2 ORDER BY 1, 2;

CREATE OR REPLACE VIEW analytics_v_connection AS
SELECT coalesce(connection, 'unknown') AS connection, coalesce(standalone, false) AS installed_app, count(DISTINCT install_id) AS installs, count(*) AS sessions
FROM analytics_sessions GROUP BY 1, 2 ORDER BY installs DESC;

-- ==================== 15. EXPERIMENTS ====================

-- each experiment variant: who was in it and how they did
CREATE OR REPLACE VIEW analytics_v_experiments AS
WITH exposed AS (SELECT DISTINCT ON (install_id, props ->> 'experiment') install_id, props ->> 'experiment' AS experiment, props ->> 'variant' AS variant, ts AS exposed_at
                 FROM analytics_events WHERE name = 'experiment_exposed' ORDER BY install_id, props ->> 'experiment', ts)
SELECT x.experiment, x.variant, count(*) AS installs,
       analytics_pct(count(*) FILTER (WHERE EXISTS (SELECT 1 FROM analytics_v_active_days a WHERE a.install_id = x.install_id AND a.day - x.exposed_at::date = 1)), count(*) FILTER (WHERE x.exposed_at::date <= current_date - 1)) AS d1_pct,
       analytics_pct(count(*) FILTER (WHERE EXISTS (SELECT 1 FROM analytics_v_active_days a WHERE a.install_id = x.install_id AND a.day - x.exposed_at::date = 7)), count(*) FILTER (WHERE x.exposed_at::date <= current_date - 7)) AS d7_pct,
       round(avg((SELECT count(*) FROM analytics_v_run_starts r WHERE r.install_id = x.install_id AND r.ts >= x.exposed_at)), 2) AS runs_per_install,
       analytics_pct(count(*) FILTER (WHERE EXISTS (SELECT 1 FROM analytics_events e WHERE e.install_id = x.install_id AND e.name = 'purchase' AND e.ts >= x.exposed_at)), count(*)) AS purchased_pct
FROM exposed x GROUP BY x.experiment, x.variant ORDER BY x.experiment, x.variant;

-- ==================== 16. IS THE DATA ITSELF HEALTHY? ====================

-- every event: how many, how recent. An event that stops arriving is a bug in the app
CREATE OR REPLACE VIEW analytics_v_event_volume AS
SELECT name, count(*) AS total, count(*) FILTER (WHERE ts > now() - interval '1 day') AS last_24h, count(*) FILTER (WHERE ts > now() - interval '7 days') AS last_7d,
       count(DISTINCT install_id) AS installs, min(ts) AS first_seen, max(ts) AS last_seen, round(avg(sample_rate)::numeric, 2) AS avg_sample_rate
FROM analytics_events GROUP BY name ORDER BY total DESC;

-- the app's own report of dropped or failed sends
CREATE OR REPLACE VIEW analytics_v_data_health AS
SELECT ts::date AS day, count(*) AS reports, sum(analytics_num(props, 'dropped_invalid')) AS dropped_invalid, sum(analytics_num(props, 'dropped_full')) AS dropped_queue_full,
       sum(analytics_num(props, 'send_failures')) AS send_failures, round(avg(analytics_num(props, 'oldest_queued_min'))) AS avg_oldest_queued_min, count(DISTINCT install_id) AS installs
FROM analytics_events WHERE name = 'analytics_health' GROUP BY 1 ORDER BY 1 DESC;

CREATE OR REPLACE VIEW analytics_v_ingest_lag AS
SELECT received_at::date AS day, percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM received_at - ts)) AS median_lag_seconds,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM received_at - ts)) AS p95_lag_seconds, count(*) AS events
FROM analytics_events GROUP BY 1 ORDER BY 1 DESC;

-- ==================== PERMISSIONS ====================
-- the views are for the project owner only

DO $$
DECLARE v record;
BEGIN
  FOR v IN SELECT viewname FROM pg_views WHERE schemaname = 'public' AND viewname LIKE 'analytics\_v\_%' LOOP
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC, anon, authenticated', v.viewname);
  END LOOP;
END $$;
