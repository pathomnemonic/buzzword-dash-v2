-- ================================================================
-- Dx Dash — Supabase schema
-- Version: 2.0.0
--
-- Run this file FIRST, then policies.sql, in the Supabase SQL editor.
-- Both files are safe to re-run.
--
-- Also required in the Supabase dashboard:
--   Authentication -> Providers -> enable "Allow anonymous sign-ins"
--   (the game signs players in anonymously so scores and friends work
--   without a password; players may optionally link an email later).
-- ================================================================

-- ==================== PLAYER PROFILES ====================

CREATE TABLE IF NOT EXISTS player_profiles (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  player_name  text NOT NULL DEFAULT 'Anonymous' CHECK (char_length(player_name) BETWEEN 1 AND 30),
  avatar       text NOT NULL DEFAULT 'avatar_intern' CHECK (char_length(avatar) <= 64),
  badges       text[] NOT NULL DEFAULT '{}' CHECK (cardinality(badges) <= 6),
  best_score   integer NOT NULL DEFAULT 0 CHECK (best_score >= 0),
  best_streak  integer NOT NULL DEFAULT 0 CHECK (best_streak >= 0),
  visible      boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS player_profiles_name_idx ON player_profiles (lower(player_name));


-- ==================== SCORES ====================

CREATE TABLE IF NOT EXISTS scores (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_name  text NOT NULL CHECK (char_length(player_name) BETWEEN 1 AND 30),
  avatar       text NOT NULL DEFAULT 'avatar_intern' CHECK (char_length(avatar) <= 64),
  score        integer NOT NULL CHECK (score >= 0),
  accuracy     integer NOT NULL DEFAULT 0 CHECK (accuracy BETWEEN 0 AND 100),
  best_streak  integer NOT NULL DEFAULT 0 CHECK (best_streak >= 0),
  speed        numeric NOT NULL DEFAULT 1 CHECK (speed > 0 AND speed <= 10),
  mode         text NOT NULL DEFAULT 'endless' CHECK (char_length(mode) <= 32),
  badges       text[] NOT NULL DEFAULT '{}' CHECK (cardinality(badges) <= 6),
  run_id       text NOT NULL UNIQUE CHECK (char_length(run_id) <= 64),
  season       text NOT NULL DEFAULT 'default' CHECK (char_length(season) <= 32),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scores_board_idx ON scores (mode, season, score DESC);
CREATE INDEX IF NOT EXISTS scores_user_idx ON scores (user_id);


-- ==================== FRIENDS ====================

CREATE TABLE IF NOT EXISTS friends (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  requester_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (requester_id <> addressee_id)
);

-- One relationship per pair, regardless of direction.
CREATE UNIQUE INDEX IF NOT EXISTS friends_pair_idx
  ON friends (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
CREATE INDEX IF NOT EXISTS friends_addressee_idx ON friends (addressee_id, status);


-- ==================== FRIEND BLOCKS ====================

CREATE TABLE IF NOT EXISTS friend_blocks (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  blocker_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);


-- ==================== MATCH INVITES ====================

CREATE TABLE IF NOT EXISTS match_invites (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  from_user   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room_code   text NOT NULL CHECK (char_length(room_code) BETWEEN 1 AND 10),
  match_id    text,
  mode        text NOT NULL DEFAULT 'mp_highscore' CHECK (char_length(mode) <= 32),
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  CHECK (from_user <> to_user)
);

CREATE INDEX IF NOT EXISTS match_invites_to_idx ON match_invites (to_user, status, expires_at);


-- Is there a block in either direction between two users? SECURITY DEFINER so
-- policies can see blocks made by the *other* person (RLS hides them from the
-- caller), without exposing who blocked whom.
CREATE OR REPLACE FUNCTION has_block_between(a uuid, b uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM friend_blocks
    WHERE (blocker_id = a AND blocked_id = b) OR (blocker_id = b AND blocked_id = a)
  );
$$;


-- ==================== USER REPORTS ====================

CREATE TABLE IF NOT EXISTS user_reports (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reporter_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason       text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  created_at   timestamptz NOT NULL DEFAULT now()
);


-- ==================== LEADERBOARD VIEW ====================
-- One best entry per user / mode / season, hiding players who turned their
-- profile visibility off. security_invoker makes the view obey RLS.

CREATE OR REPLACE VIEW leaderboard_best
WITH (security_invoker = true) AS
SELECT DISTINCT ON (s.user_id, s.mode, s.season)
  s.user_id, s.player_name, s.avatar, s.score, s.accuracy, s.best_streak,
  s.speed, s.mode, s.badges, s.season, s.created_at
FROM scores s
JOIN player_profiles p ON p.user_id = s.user_id AND p.visible = true
ORDER BY s.user_id, s.mode, s.season, s.score DESC, s.created_at ASC;


-- All-time best per user / mode across every season.
CREATE OR REPLACE VIEW leaderboard_alltime
WITH (security_invoker = true) AS
SELECT DISTINCT ON (s.user_id, s.mode)
  s.user_id, s.player_name, s.avatar, s.score, s.accuracy, s.best_streak,
  s.speed, s.mode, s.badges, s.season, s.created_at
FROM scores s
JOIN player_profiles p ON p.user_id = s.user_id AND p.visible = true
ORDER BY s.user_id, s.mode, s.score DESC, s.created_at ASC;


-- ==================== CARD REPORTS ====================
-- Content feedback from players ("this card is wrong / ambiguous").

CREATE TABLE IF NOT EXISTS card_reports (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reporter_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id      text NOT NULL CHECK (char_length(card_id) <= 64),
  reason       text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 100),
  details      text NOT NULL DEFAULT '' CHECK (char_length(details) <= 1000),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS card_reports_card_idx ON card_reports (card_id);


-- ==================== PROFILE UPSERT ====================
-- SECURITY DEFINER so bests can only ever go up (GREATEST). The caller can
-- only touch their own row: p_user_id must equal auth.uid().

CREATE OR REPLACE FUNCTION upsert_player_profile(
  p_user_id     uuid,
  p_player_name text,
  p_avatar      text,
  p_badges      text[],
  p_best_score  integer,
  p_best_streak integer,
  p_visible     boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  INSERT INTO player_profiles AS pp
    (user_id, player_name, avatar, badges, best_score, best_streak, visible)
  VALUES (
    p_user_id,
    left(coalesce(nullif(trim(p_player_name), ''), 'Anonymous'), 30),
    left(coalesce(p_avatar, 'avatar_intern'), 64),
    coalesce(p_badges[1:6], '{}'),
    greatest(coalesce(p_best_score, 0), 0),
    greatest(coalesce(p_best_streak, 0), 0),
    coalesce(p_visible, true)
  )
  ON CONFLICT (user_id) DO UPDATE SET
    player_name = EXCLUDED.player_name,
    avatar      = EXCLUDED.avatar,
    badges      = EXCLUDED.badges,
    best_score  = GREATEST(pp.best_score, EXCLUDED.best_score),
    best_streak = GREATEST(pp.best_streak, EXCLUDED.best_streak),
    visible     = EXCLUDED.visible,
    updated_at  = now();
END;
$$;


-- ==================== STUDY GROUPS ====================
-- Private boards for a class or study group. Membership is by invite code.
-- All writes go through the SECURITY DEFINER functions below.

CREATE TABLE IF NOT EXISTS study_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 40),
  code        text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]{6}$'),
  owner_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE study_groups ADD COLUMN IF NOT EXISTS weekly_goal integer
  CHECK (weekly_goal IS NULL OR weekly_goal BETWEEN 50 AND 100000);

CREATE TABLE IF NOT EXISTS group_members (
  group_id   uuid NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS group_members_user_idx ON group_members (user_id);

-- Avoids RLS recursion when a policy needs to ask "am I a member?".
CREATE OR REPLACE FUNCTION is_group_member(gid uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM group_members WHERE group_id = gid AND user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION create_group(p_name text) RETURNS study_groups
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g study_groups;
  attempts int := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  IF (SELECT count(*) FROM study_groups WHERE owner_id = auth.uid()) >= 5 THEN
    RAISE EXCEPTION 'You can own at most 5 groups';
  END IF;
  LOOP
    BEGIN
      INSERT INTO study_groups (name, code, owner_id)
      VALUES (left(trim(p_name), 40), upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6)), auth.uid())
      RETURNING * INTO g;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      attempts := attempts + 1;
      IF attempts > 5 THEN RAISE EXCEPTION 'could not allocate a code'; END IF;
    END;
  END LOOP;
  INSERT INTO group_members (group_id, user_id) VALUES (g.id, auth.uid());
  RETURN g;
END;
$$;

CREATE OR REPLACE FUNCTION join_group(p_code text) RETURNS study_groups
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g study_groups;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  SELECT * INTO g FROM study_groups WHERE code = upper(trim(p_code));
  IF NOT FOUND THEN RAISE EXCEPTION 'No group with that code'; END IF;
  IF (SELECT count(*) FROM group_members WHERE group_id = g.id) >= 100 THEN
    RAISE EXCEPTION 'This group is full';
  END IF;
  INSERT INTO group_members (group_id, user_id) VALUES (g.id, auth.uid()) ON CONFLICT DO NOTHING;
  RETURN g;
END;
$$;

CREATE OR REPLACE FUNCTION leave_group(p_group_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM group_members WHERE group_id = p_group_id AND user_id = auth.uid();
  -- An empty group is removed.
  IF NOT EXISTS (SELECT 1 FROM group_members WHERE group_id = p_group_id) THEN
    DELETE FROM study_groups WHERE id = p_group_id;
  END IF;
END;
$$;

-- (Return type gained weekly_goal, so re-creating requires a drop.)
DROP FUNCTION IF EXISTS my_groups();
CREATE OR REPLACE FUNCTION my_groups()
RETURNS TABLE (id uuid, name text, code text, member_count bigint, is_owner boolean, weekly_goal integer)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT g.id, g.name, g.code,
         (SELECT count(*) FROM group_members m2 WHERE m2.group_id = g.id),
         g.owner_id = auth.uid(), g.weekly_goal
  FROM study_groups g
  JOIN group_members m ON m.group_id = g.id AND m.user_id = auth.uid()
  ORDER BY g.created_at;
$$;

-- Best scores among the group's members. p_period: 'week' (current ISO week) or 'all'.
CREATE OR REPLACE FUNCTION group_leaderboard(p_group_id uuid, p_mode text, p_period text)
RETURNS TABLE (user_id uuid, player_name text, avatar text, score integer, accuracy integer, best_streak integer)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
BEGIN
  IF NOT is_group_member(p_group_id) THEN RAISE EXCEPTION 'not a member of this group'; END IF;
  IF p_period = 'all' THEN
    RETURN QUERY
      SELECT lb.user_id, lb.player_name, lb.avatar, lb.score, lb.accuracy, lb.best_streak
      FROM group_members gm JOIN leaderboard_alltime lb ON lb.user_id = gm.user_id
      WHERE gm.group_id = p_group_id AND lb.mode = p_mode
      ORDER BY lb.score DESC LIMIT 50;
  ELSE
    RETURN QUERY
      SELECT lb.user_id, lb.player_name, lb.avatar, lb.score, lb.accuracy, lb.best_streak
      FROM group_members gm JOIN leaderboard_best lb ON lb.user_id = gm.user_id
      WHERE gm.group_id = p_group_id AND lb.mode = p_mode
        AND lb.season = to_char(now() AT TIME ZONE 'utc', 'IYYY-"W"IW')
      ORDER BY lb.score DESC LIMIT 50;
  END IF;
END;
$$;


-- ==================== SHARED DECKS ====================
-- Custom card decks shared by code. Decks cannot be listed: the only way to
-- read one is get_shared_deck() with its code.

CREATE TABLE IF NOT EXISTS shared_decks (
  code        text PRIMARY KEY CHECK (code ~ '^[A-Z0-9]{8}$'),
  owner_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  card_count  integer NOT NULL CHECK (card_count BETWEEN 1 AND 200),
  cards       jsonb NOT NULL CHECK (jsonb_typeof(cards) = 'array' AND pg_column_size(cards) < 400000),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION publish_deck(p_name text, p_cards jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c text;
  n integer;
  attempts int := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  IF jsonb_typeof(p_cards) <> 'array' THEN RAISE EXCEPTION 'cards must be an array'; END IF;
  n := jsonb_array_length(p_cards);
  IF n < 1 OR n > 200 THEN RAISE EXCEPTION 'A deck must have 1 to 200 cards'; END IF;
  IF (SELECT count(*) FROM shared_decks WHERE owner_id = auth.uid()) >= 20 THEN
    RAISE EXCEPTION 'You can share at most 20 decks';
  END IF;
  LOOP
    BEGIN
      c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
      INSERT INTO shared_decks (code, owner_id, name, card_count, cards)
      VALUES (c, auth.uid(), left(trim(p_name), 60), n, p_cards);
      RETURN c;
    EXCEPTION WHEN unique_violation THEN
      attempts := attempts + 1;
      IF attempts > 5 THEN RAISE EXCEPTION 'could not allocate a code'; END IF;
    END;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION get_shared_deck(p_code text)
RETURNS TABLE (name text, card_count integer, cards jsonb)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT d.name, d.card_count, d.cards FROM shared_decks d WHERE d.code = upper(trim(p_code));
$$;


-- ==================== SEASON STANDING (weekly tournament) ====================
-- The caller's rank among everyone with a score for a mode + season.

CREATE OR REPLACE FUNCTION season_standing(p_mode text, p_season text)
RETURNS TABLE (rank bigint, total bigint)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT
    (SELECT count(*) + 1 FROM leaderboard_best b
      WHERE b.mode = p_mode AND b.season = p_season
        AND b.score > (SELECT m.score FROM leaderboard_best m
                        WHERE m.user_id = auth.uid() AND m.mode = p_mode AND m.season = p_season)),
    (SELECT count(*) FROM leaderboard_best b WHERE b.mode = p_mode AND b.season = p_season)
  WHERE EXISTS (SELECT 1 FROM leaderboard_best m
                 WHERE m.user_id = auth.uid() AND m.mode = p_mode AND m.season = p_season);
$$;


-- ==================== ACTIVITY FEED ====================
-- Short "Sam hit a 20 streak" events, visible to the poster and their friends.

CREATE TABLE IF NOT EXISTS activity_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('new_best', 'streak', 'tournament', 'exam', 'group_join')),
  payload     jsonb NOT NULL DEFAULT '{}' CHECK (pg_column_size(payload) < 1000),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_events_user_idx ON activity_events (user_id, created_at DESC);


-- ==================== GROUP WEEKLY GOALS ====================
-- Members report cards studied per week; the group has one shared target.

ALTER TABLE study_groups ADD COLUMN IF NOT EXISTS weekly_goal integer
  CHECK (weekly_goal IS NULL OR weekly_goal BETWEEN 50 AND 100000);

CREATE TABLE IF NOT EXISTS weekly_study (
  user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  season   text NOT NULL CHECK (char_length(season) <= 12),
  cards    integer NOT NULL DEFAULT 0 CHECK (cards BETWEEN 0 AND 5000),
  PRIMARY KEY (user_id, season)
);

CREATE OR REPLACE FUNCTION report_study(p_season text, p_cards integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  INSERT INTO weekly_study AS w (user_id, season, cards)
  VALUES (auth.uid(), left(p_season, 12), least(greatest(coalesce(p_cards, 0), 0), 5000))
  ON CONFLICT (user_id, season) DO UPDATE SET cards = greatest(w.cards, EXCLUDED.cards);
END;
$$;

CREATE OR REPLACE FUNCTION set_group_goal(p_group_id uuid, p_goal integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE study_groups SET weekly_goal = p_goal WHERE id = p_group_id AND owner_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the group owner can set the goal'; END IF;
END;
$$;

-- Progress toward the goal this week: one row per member.
CREATE OR REPLACE FUNCTION group_goal_status(p_group_id uuid, p_season text)
RETURNS TABLE (goal integer, user_id uuid, player_name text, cards integer)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
BEGIN
  IF NOT is_group_member(p_group_id) THEN RAISE EXCEPTION 'not a member of this group'; END IF;
  RETURN QUERY
    SELECT g.weekly_goal, gm.user_id, coalesce(p.player_name, 'Member'), coalesce(w.cards, 0)
    FROM study_groups g
    JOIN group_members gm ON gm.group_id = g.id
    LEFT JOIN player_profiles p ON p.user_id = gm.user_id AND p.visible = true
    LEFT JOIN weekly_study w ON w.user_id = gm.user_id AND w.season = left(p_season, 12)
    WHERE g.id = p_group_id
    ORDER BY coalesce(w.cards, 0) DESC;
END;
$$;


-- ==================== CLOUD SAVES ====================
-- One private save per account, so progress follows the player across devices.
-- Written only through push_save(), which refuses to overwrite a newer save
-- from another device unless the caller passes that save's timestamp.

CREATE TABLE IF NOT EXISTS player_saves (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data        jsonb NOT NULL,
  run_count   integer NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE OR REPLACE FUNCTION push_save(p_data jsonb, p_run_count integer, p_base timestamptz)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  current_ts timestamptz;
  new_ts timestamptz := clock_timestamp();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF pg_column_size(p_data) > 3000000 THEN
    RAISE EXCEPTION 'Save is too large';
  END IF;

  SELECT updated_at INTO current_ts FROM player_saves WHERE user_id = uid FOR UPDATE;

  IF FOUND THEN
    -- Someone else (another device) saved since the caller last synced.
    IF p_base IS NULL OR current_ts <> p_base THEN
      RETURN NULL;
    END IF;
    UPDATE player_saves SET data = p_data, run_count = greatest(p_run_count, 0), updated_at = new_ts
    WHERE user_id = uid;
  ELSE
    IF p_base IS NOT NULL THEN
      -- The caller believed a save existed but it is gone; treat as a new save.
      NULL;
    END IF;
    INSERT INTO player_saves (user_id, data, run_count, updated_at)
    VALUES (uid, p_data, greatest(p_run_count, 0), new_ts);
  END IF;

  RETURN new_ts;
END;
$$;

-- Force an overwrite (the player chose "keep this device").
CREATE OR REPLACE FUNCTION force_save(p_data jsonb, p_run_count integer)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  new_ts timestamptz := clock_timestamp();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF pg_column_size(p_data) > 3000000 THEN
    RAISE EXCEPTION 'Save is too large';
  END IF;
  INSERT INTO player_saves (user_id, data, run_count, updated_at)
  VALUES (uid, p_data, greatest(p_run_count, 0), new_ts)
  ON CONFLICT (user_id) DO UPDATE
    SET data = excluded.data, run_count = excluded.run_count, updated_at = excluded.updated_at;
  RETURN new_ts;
END;
$$;


-- ==================== ACCOUNT DELETION ====================
-- Lets a player delete their own account and every row tied to it (profile,
-- scores, friends, groups, saves...) since all of those cascade from auth.users.
-- The app stores require an in-app way to do this.

CREATE OR REPLACE FUNCTION delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  DELETE FROM auth.users WHERE id = uid;
END;
$$;

REVOKE ALL ON FUNCTION delete_my_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_my_account() TO authenticated;


-- ==================== REALTIME ====================
-- Lets the app receive match invites instantly.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE match_invites;
EXCEPTION WHEN duplicate_object OR undefined_object THEN
  NULL;
END $$;
