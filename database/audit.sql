-- ================================================================
-- Audit: run this in the Supabase SQL editor on your LIVE project. It should return NO ROWS.
-- Every row it returns is a way for a player (or anyone with the public app key) to reach something they should not.
-- Fix by running the database files in order, with lockdown.sql last (see README), then run this again.
-- ================================================================
WITH
  signed_in AS (SELECT unnest(ARRAY[
    'cancel_group_request', 'can_see_activity', 'can_see_post', 'cohort_create', 'cohort_join', 'cohort_kick', 'cohort_leave',
    'cohort_search', 'cohort_set_role', 'cohort_war_standings', 'create_group', 'delete_my_account', 'discover_groups',
    'find_buddies', 'force_save', 'get_feed', 'get_my_pro', 'get_shared_deck', 'give_kudos', 'group_goal_status',
    'group_leaderboard', 'group_requests', 'has_block_between', 'is_group_member', 'join_group', 'join_public_group',
    'leave_group', 'my_buddy_listing', 'my_cohort', 'my_groups', 'my_recent_kudos', 'publish_deck', 'push_save',
    'ranked_cancel', 'ranked_find_match', 'ranked_my_stats', 'ranked_poll_match', 'ranked_report', 'ranked_settle_stale',
    'ranked_top', 'redeem_pro_code', 'remove_buddy_listing', 'remove_kudos', 'report_content', 'report_diagnostic',
    'report_study', 'resolve_group_request', 'restore_backup_save', 'school_standings', 'season_standing',
    'set_activity_visibility', 'set_buddy_listing', 'set_group_discovery', 'set_group_goal', 'start_my_trial',
    'submit_feedback', 'upsert_player_profile']) AS name),
  open_to_all AS (SELECT unnest(ARRAY['ingest_analytics', 'delete_analytics', 'count_consent']) AS name),
  fns AS (
    SELECT p.oid, p.proname AS name, p.oid::regprocedure::text AS sig, p.prosecdef, p.proconfig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')  -- (not part of an extension)
  ),
  rels AS (
    SELECT c.oid, c.relname AS name, c.relkind, c.relrowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm', 'p')
  )
SELECT 'function a signed-out visitor can call' AS problem, sig AS what FROM fns
  WHERE has_function_privilege('anon', oid, 'EXECUTE') AND name NOT IN (SELECT name FROM open_to_all)
UNION ALL
SELECT 'function a signed-in player can call that the app does not use', sig FROM fns
  WHERE has_function_privilege('authenticated', oid, 'EXECUTE') AND name NOT IN (SELECT name FROM signed_in) AND name NOT IN (SELECT name FROM open_to_all)
UNION ALL
SELECT 'function that runs with the owner''s rights and does not fix its search path', sig FROM fns
  WHERE prosecdef AND NOT coalesce(proconfig::text ILIKE '%search_path=%', false)
UNION ALL
SELECT 'table that anyone signed out can change', name FROM rels
  WHERE has_table_privilege('anon', oid, 'INSERT') OR has_table_privilege('anon', oid, 'UPDATE') OR has_table_privilege('anon', oid, 'DELETE') OR has_table_privilege('anon', oid, 'TRUNCATE')
UNION ALL
SELECT 'table a signed-in player can truncate or re-shape', name FROM rels
  WHERE has_table_privilege('authenticated', oid, 'TRUNCATE') OR has_table_privilege('authenticated', oid, 'TRIGGER') OR has_table_privilege('authenticated', oid, 'REFERENCES')
UNION ALL
SELECT 'table without row security', name FROM rels WHERE relkind IN ('r', 'p') AND NOT relrowsecurity
UNION ALL
SELECT 'payment or owner data a player can reach', name FROM rels
  WHERE name IN ('pro_entitlements', 'pro_items', 'pro_library', 'pro_trials', 'pro_codes', 'pro_redemptions', 'pro_attempts',
                 'pro_stripe_customers', 'pro_stripe_events', 'pro_v_active', 'pro_v_codes', 'pro_v_redemptions', 'player_saves_backup',
                 'app_feedback', 'feedback_inbox', 'moderation_queue', 'client_diagnostics', 'content_reports')
    AND (has_table_privilege('anon', oid, 'SELECT') OR has_table_privilege('authenticated', oid, 'SELECT')
         OR has_table_privilege('authenticated', oid, 'INSERT') OR has_table_privilege('authenticated', oid, 'UPDATE') OR has_table_privilege('authenticated', oid, 'DELETE'))
ORDER BY 1, 2;
