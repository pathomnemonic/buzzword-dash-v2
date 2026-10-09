-- ================================================================
-- Lockdown: who may call what, and who may touch which table. RUN THIS LAST, after every other file. Safe to run again.
--
-- Why it exists: Supabase hands every new function and table to the signed-in (authenticated) and signed-out (anon)
-- roles by default, and "REVOKE ... FROM PUBLIC" does not take that away. Left like that, anyone with the public app
-- key could call functions meant only for the payment server, for example the one that grants Pro. So this file closes
-- EVERYTHING first, then opens only the short lists below: the functions the app calls and the tables it reads.
-- A function or table that is not on a list stays closed. The Edge Functions use the service role, which is untouched.
--
-- tests/unit/dbprivileges.test.js runs this against a database that has Supabase's default grants, and fails if anything
-- else is open. Adding a function the app should call means adding its name to the list below (and to that test).
-- ================================================================

-- Anything created from now on starts closed.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

DO $lock$
DECLARE
  r record;
  fn text;
  -- the functions the signed-in app calls (and the helpers its row-security rules use)
  signed_in text[] := ARRAY[
    'cancel_group_request', 'can_see_activity', 'can_see_post', 'cohort_create', 'cohort_join', 'cohort_kick', 'cohort_leave',
    'cohort_search', 'cohort_set_role', 'cohort_war_standings', 'create_group', 'delete_my_account', 'discover_groups',
    'find_buddies', 'force_save', 'get_feed', 'get_my_pro', 'get_shared_deck', 'give_kudos', 'group_goal_status',
    'group_leaderboard', 'group_requests', 'has_block_between', 'is_group_member', 'join_group', 'join_public_group',
    'leave_group', 'my_buddy_listing', 'my_cohort', 'my_groups', 'my_recent_kudos', 'publish_deck', 'push_save',
    'ranked_cancel', 'ranked_find_match', 'ranked_my_stats', 'ranked_poll_match', 'ranked_report', 'ranked_settle_stale',
    'ranked_top', 'redeem_pro_code', 'remove_buddy_listing', 'remove_kudos', 'report_content', 'report_diagnostic',
    'report_study', 'resolve_group_request', 'restore_backup_save', 'school_standings', 'season_standing',
    'set_activity_visibility', 'set_buddy_listing', 'set_group_discovery', 'set_group_goal', 'start_my_trial',
    'submit_feedback', 'upsert_player_profile'
  ];
  -- the three that work with no sign-in at all (anonymous, consent-based usage statistics)
  open_to_all text[] := ARRAY['ingest_analytics', 'delete_analytics', 'count_consent'];
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig, p.proname AS name
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    IF r.name = ANY (signed_in) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    ELSIF r.name = ANY (open_to_all) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', r.sig);
    END IF;
  END LOOP;
END
$lock$;

-- ---------- tables and views ----------
-- Nobody signed out may write anything, and nobody may truncate or re-shape a table. What the signed-in app reads and
-- writes directly is listed; every row is still limited by the row-security rules in policies.sql.
DO $lock$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT c.oid::regclass AS rel, c.relname AS name
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm', 'p') LOOP
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC, anon, authenticated', r.rel);
  END LOOP;
END
$lock$;

DO $lock$
DECLARE
  g record;
BEGIN
  FOR g IN SELECT * FROM (VALUES
    -- table,             anon,    signed in
    ('activity_events',   '',       'SELECT, INSERT, DELETE'),
    ('card_reports',      '',       'SELECT, INSERT'),
    ('friend_blocks',     '',       'SELECT, INSERT, DELETE'),
    ('friends',           '',       'SELECT, INSERT, UPDATE (status), DELETE'),   -- (only the status: never who the two people are)
    ('group_members',     '',       'SELECT'),
    ('leaderboard_alltime', 'SELECT', 'SELECT'),
    ('leaderboard_best',  'SELECT', 'SELECT'),
    ('match_invites',     '',       'SELECT, INSERT, UPDATE (status)'),
    ('player_profiles',   'SELECT', 'SELECT'),                       -- (written only through upsert_player_profile, which keeps bests from going down)
    ('player_saves',      '',       'SELECT'),                      -- (never deleted from the app: only by deleting the whole account)
    ('scores',            'SELECT', 'SELECT, INSERT'),
    ('shared_decks',      '',       'SELECT, DELETE'),
    ('study_groups',      '',       'SELECT'),
    ('user_reports',      '',       'SELECT, INSERT')
  ) AS t(tbl, anon_priv, user_priv) LOOP
    IF to_regclass('public.' || g.tbl) IS NOT NULL THEN
      IF g.anon_priv <> '' THEN EXECUTE format('GRANT %s ON public.%I TO anon', g.anon_priv, g.tbl); END IF;
      EXECUTE format('GRANT %s ON public.%I TO authenticated', g.user_priv, g.tbl);
    END IF;
  END LOOP;
END
$lock$;
