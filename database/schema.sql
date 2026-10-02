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

-- Basic sanity limits on scores submitted by players (the app signs in, so these
-- run for real clients; admin and SQL-editor inserts are not limited).
-- One score per player per 20 seconds, and an absolute ceiling. This stops a
-- script flooding the leaderboard; it is not a full anti-cheat.
CREATE OR REPLACE FUNCTION scores_sanity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;
  IF NEW.score > 5000000 OR NEW.best_streak > 1000 THEN
    RAISE EXCEPTION 'score outside the believable range' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM scores WHERE user_id = NEW.user_id AND created_at > now() - interval '20 seconds') THEN
    RAISE EXCEPTION 'scores are coming in too fast' USING ERRCODE = '54000';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS scores_sanity_trg ON scores;
CREATE TRIGGER scores_sanity_trg BEFORE INSERT ON scores
  FOR EACH ROW EXECUTE FUNCTION scores_sanity();


-- Keep only each player's best run per mode and season, so the table (and every board built from it)
-- is never cluttered with lower runs. A run that does not beat the stored best is ignored (the insert
-- succeeds but adds nothing); one that does replaces the old row. Safe to re-run.
CREATE OR REPLACE FUNCTION scores_keep_best() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM scores
    WHERE user_id = NEW.user_id AND mode = NEW.mode AND season = NEW.season AND score >= NEW.score
  ) THEN
    RETURN NULL;
  END IF;
  DELETE FROM scores WHERE user_id = NEW.user_id AND mode = NEW.mode AND season = NEW.season;
  RETURN NEW;
END $$;

-- (Named so it fires after scores_sanity_trg: the flood and range checks run first.)
DROP TRIGGER IF EXISTS scores_keep_best_trg ON scores;
DROP TRIGGER IF EXISTS scores_zkeep_best_trg ON scores;
CREATE TRIGGER scores_zkeep_best_trg BEFORE INSERT ON scores
  FOR EACH ROW EXECUTE FUNCTION scores_keep_best();

-- One-time tidy-up of runs saved before this rule: keep the best row per player, mode and season.
DELETE FROM scores s
USING scores better
WHERE better.user_id = s.user_id AND better.mode = s.mode AND better.season = s.season
  AND (better.score > s.score OR (better.score = s.score AND better.id < s.id));


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

-- Strava-style feed: runs can be shared with friends or kept private, and friends can give kudos.
-- (The list of kinds grew, so the old check is replaced.)
ALTER TABLE activity_events DROP CONSTRAINT IF EXISTS activity_events_kind_check;
ALTER TABLE activity_events ADD CONSTRAINT activity_events_kind_check
  CHECK (kind IN ('new_best', 'streak', 'tournament', 'exam', 'group_join', 'run', 'milestone', 'streak_days', 'weekly_recap'));
ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'friends'
  CHECK (visibility IN ('friends', 'private'));

-- Can the caller see a post by this owner with this visibility? (Takes the row's own values rather than its id,
-- so the read policy also works for a row that is being inserted.)
CREATE OR REPLACE FUNCTION can_see_post(p_owner uuid, p_visibility text) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    p_owner = auth.uid()
    OR (p_visibility = 'friends'
      AND NOT has_block_between(auth.uid(), p_owner)
      AND EXISTS (SELECT 1 FROM friends f
                  WHERE f.status = 'accepted'
                    AND ((f.requester_id = auth.uid() AND f.addressee_id = p_owner)
                      OR (f.addressee_id = auth.uid() AND f.requester_id = p_owner))))
  );
$$;

CREATE OR REPLACE FUNCTION can_see_activity(p_event bigint) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM activity_events e WHERE e.id = p_event AND can_see_post(e.user_id, e.visibility));
$$;

-- No more than 60 events an hour from one player.
CREATE OR REPLACE FUNCTION activity_rate_limit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT count(*) FROM activity_events WHERE user_id = NEW.user_id AND created_at > now() - interval '1 hour') >= 60 THEN
    RAISE EXCEPTION 'Too many posts. Try again later.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS activity_rate_limit_trg ON activity_events;
CREATE TRIGGER activity_rate_limit_trg BEFORE INSERT ON activity_events
  FOR EACH ROW EXECUTE FUNCTION activity_rate_limit();

CREATE TABLE IF NOT EXISTS activity_kudos (
  event_id    bigint NOT NULL REFERENCES activity_events(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji       text NOT NULL DEFAULT 'kudos' CHECK (emoji IN ('kudos', 'fire', 'brain', 'clap')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX IF NOT EXISTS activity_kudos_user_idx ON activity_kudos (user_id, created_at DESC);

-- Give (or change) kudos on a friend's post. Not on your own, not on what you cannot see.
CREATE OR REPLACE FUNCTION give_kudos(p_event bigint, p_emoji text DEFAULT 'kudos') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  SELECT user_id INTO owner FROM activity_events WHERE id = p_event;
  IF owner IS NULL OR NOT can_see_activity(p_event) THEN RAISE EXCEPTION 'That post is not available'; END IF;
  IF owner = auth.uid() THEN RAISE EXCEPTION 'You cannot give kudos to yourself'; END IF;
  IF (SELECT count(*) FROM activity_kudos WHERE user_id = auth.uid() AND created_at > now() - interval '1 hour') >= 120 THEN
    RAISE EXCEPTION 'Slow down a little';
  END IF;
  INSERT INTO activity_kudos (event_id, user_id, emoji) VALUES (p_event, auth.uid(), coalesce(p_emoji, 'kudos'))
  ON CONFLICT (event_id, user_id) DO UPDATE SET emoji = EXCLUDED.emoji;
END;
$$;

CREATE OR REPLACE FUNCTION remove_kudos(p_event bigint) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM activity_kudos WHERE event_id = p_event AND user_id = auth.uid();
$$;

-- Change who can see one of your posts.
CREATE OR REPLACE FUNCTION set_activity_visibility(p_event bigint, p_visibility text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_visibility NOT IN ('friends', 'private') THEN RAISE EXCEPTION 'unknown visibility'; END IF;
  UPDATE activity_events SET visibility = p_visibility WHERE id = p_event AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'That post is not yours'; END IF;
END;
$$;

-- The feed: your posts and your friends' (never what a friend kept private), with kudos counts.
-- p_scope: 'all' (default), 'friends' (not mine) or 'mine'.
CREATE OR REPLACE FUNCTION get_feed(p_limit integer DEFAULT 40, p_before bigint DEFAULT NULL, p_scope text DEFAULT 'all')
RETURNS TABLE (id bigint, user_id uuid, player_name text, avatar text, kind text, payload jsonb, visibility text,
               created_at timestamptz, kudos_count bigint, i_gave text, kudos_by text[])
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT e.id, e.user_id, coalesce(p.player_name, 'Player'), coalesce(p.avatar, 'avatar_intern'), e.kind, e.payload, e.visibility, e.created_at,
         (SELECT count(*) FROM activity_kudos k WHERE k.event_id = e.id),
         (SELECT k.emoji FROM activity_kudos k WHERE k.event_id = e.id AND k.user_id = auth.uid()),
         ARRAY(SELECT coalesce(kp.player_name, 'Player') FROM activity_kudos k
               LEFT JOIN player_profiles kp ON kp.user_id = k.user_id
               WHERE k.event_id = e.id ORDER BY k.created_at DESC LIMIT 3)
  FROM activity_events e
  LEFT JOIN player_profiles p ON p.user_id = e.user_id
  WHERE auth.uid() IS NOT NULL
    AND e.created_at > now() - interval '30 days'
    AND (p_before IS NULL OR e.id < p_before)
    AND can_see_activity(e.id)
    AND (CASE WHEN p_scope = 'mine' THEN e.user_id = auth.uid()
              WHEN p_scope = 'friends' THEN e.user_id <> auth.uid()
              ELSE true END)
  ORDER BY e.id DESC
  LIMIT least(greatest(coalesce(p_limit, 40), 1), 100);
$$;

-- Kudos others gave the caller recently (the "kudos you got" list).
CREATE OR REPLACE FUNCTION my_recent_kudos(p_since timestamptz DEFAULT now() - interval '7 days')
RETURNS TABLE (event_id bigint, kind text, giver_id uuid, giver_name text, emoji text, created_at timestamptz)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT k.event_id, e.kind, k.user_id, coalesce(p.player_name, 'Player'), k.emoji, k.created_at
  FROM activity_kudos k
  JOIN activity_events e ON e.id = k.event_id AND e.user_id = auth.uid()
  LEFT JOIN player_profiles p ON p.user_id = k.user_id
  WHERE auth.uid() IS NOT NULL AND k.created_at > p_since AND NOT has_block_between(auth.uid(), k.user_id)
  ORDER BY k.created_at DESC
  LIMIT 50;
$$;


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


-- ==================== RANKED MULTIPLAYER ====================
-- Trophies and leagues for matches against random players.
--
--   player_trophies   one row per player: trophies, wins, losses.
--   ranked_queue      players waiting for an opponent (each holds a PeerJS room).
--   ranked_matches    a pairing. Both players then play peer to peer.
--   ranked_reports    what each player says happened. Trophies change only when
--                     the two reports agree (or one player concedes, or one
--                     report stands unanswered for 90 seconds).
--
-- Players never write these tables directly; they call the functions below.
-- The trophy formula is the same as js/leagues.js (trophyDelta).

CREATE TABLE IF NOT EXISTS player_trophies (
  user_id       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  trophies      integer NOT NULL DEFAULT 0 CHECK (trophies >= 0),
  best_trophies integer NOT NULL DEFAULT 0 CHECK (best_trophies >= 0),
  wins          integer NOT NULL DEFAULT 0 CHECK (wins >= 0),
  losses        integer NOT NULL DEFAULT 0 CHECK (losses >= 0),
  draws         integer NOT NULL DEFAULT 0 CHECK (draws >= 0),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS player_trophies_rank_idx ON player_trophies (trophies DESC);

CREATE TABLE IF NOT EXISTS ranked_queue (
  user_id   uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  room_code text NOT NULL CHECK (room_code ~ '^[A-Z0-9]{5}$'),
  trophies  integer NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  seen_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ranked_matches (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room_code      text NOT NULL,
  host_trophies  integer NOT NULL,
  guest_trophies integer NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  settled        boolean NOT NULL DEFAULT false,
  winner_id      uuid,
  CHECK (host_id <> guest_id)
);
CREATE INDEX IF NOT EXISTS ranked_matches_host_idx ON ranked_matches (host_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ranked_reports (
  match_id    uuid NOT NULL REFERENCES ranked_matches(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  outcome     text NOT NULL CHECK (outcome IN ('win', 'loss', 'draw')),
  reported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, user_id)
);

-- The first trophy count of the player's current league: nobody drops below it.
CREATE OR REPLACE FUNCTION ranked_league_floor(t integer) RETURNS integer
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN t >= 3600 THEN 3600 WHEN t >= 2700 THEN 2700 WHEN t >= 1900 THEN 1900
    WHEN t >= 1200 THEN 1200 WHEN t >= 700 THEN 700 WHEN t >= 300 THEN 300 ELSE 0 END;
$$;

-- Trophy change for one player (see trophyDelta in js/leagues.js).
CREATE OR REPLACE FUNCTION ranked_delta(mine integer, theirs integer, outcome text) RETURNS integer
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  expected numeric := 1 / (1 + power(10::numeric, (theirs - mine) / 400.0));
  delta integer;
BEGIN
  IF outcome = 'draw' THEN RETURN 0; END IF;
  IF outcome = 'win' THEN
    delta := greatest(10, round(40 * (1 - expected))::integer);
  ELSE
    delta := -greatest(8, round(40 * expected)::integer);
  END IF;
  IF mine + delta < ranked_league_floor(mine) THEN
    delta := ranked_league_floor(mine) - mine;
  END IF;
  RETURN delta;
END;
$$;

-- Give one player their trophy change for a finished match.
CREATE OR REPLACE FUNCTION ranked_apply(p_user uuid, p_mine integer, p_theirs integer, p_outcome text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cur integer;
  d integer := ranked_delta(p_mine, p_theirs, p_outcome);
  nxt integer;
BEGIN
  INSERT INTO player_trophies (user_id) VALUES (p_user) ON CONFLICT DO NOTHING;
  SELECT trophies INTO cur FROM player_trophies WHERE user_id = p_user FOR UPDATE;
  nxt := greatest(cur + d, ranked_league_floor(cur));
  UPDATE player_trophies SET
    trophies = nxt,
    best_trophies = greatest(best_trophies, nxt),
    wins = wins + (CASE WHEN p_outcome = 'win' THEN 1 ELSE 0 END),
    losses = losses + (CASE WHEN p_outcome = 'loss' THEN 1 ELSE 0 END),
    draws = draws + (CASE WHEN p_outcome = 'draw' THEN 1 ELSE 0 END),
    updated_at = now()
  WHERE user_id = p_user;
  RETURN nxt - cur;
END;
$$;
REVOKE ALL ON FUNCTION ranked_apply(uuid, integer, integer, text) FROM PUBLIC;

-- Settle a match if its reports allow it. Returns true when the match is now settled.
CREATE OR REPLACE FUNCTION ranked_try_settle(p_match uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m ranked_matches;
  hr ranked_reports;
  gr ranked_reports;
  host_out text;
  guest_out text;
BEGIN
  SELECT * INTO m FROM ranked_matches WHERE id = p_match FOR UPDATE;
  IF NOT FOUND OR m.settled THEN RETURN COALESCE(m.settled, false); END IF;
  SELECT * INTO hr FROM ranked_reports WHERE match_id = p_match AND user_id = m.host_id;
  SELECT * INTO gr FROM ranked_reports WHERE match_id = p_match AND user_id = m.guest_id;

  IF hr.user_id IS NOT NULL AND gr.user_id IS NOT NULL THEN
    IF hr.outcome = 'win' AND gr.outcome = 'loss' THEN host_out := 'win'; guest_out := 'loss';
    ELSIF hr.outcome = 'loss' AND gr.outcome = 'win' THEN host_out := 'loss'; guest_out := 'win';
    ELSIF hr.outcome = 'draw' AND gr.outcome = 'draw' THEN host_out := 'draw'; guest_out := 'draw';
    ELSE
      -- the two stories do not match: nobody gains or loses anything
      UPDATE ranked_matches SET settled = true WHERE id = p_match;
      RETURN true;
    END IF;
  ELSIF hr.user_id IS NOT NULL THEN
    IF hr.outcome = 'loss' THEN host_out := 'loss'; guest_out := 'win';
    ELSIF hr.reported_at < now() - interval '90 seconds' THEN
      IF hr.outcome = 'win' THEN host_out := 'win'; guest_out := 'loss'; ELSE host_out := 'draw'; guest_out := 'draw'; END IF;
    ELSE RETURN false; END IF;
  ELSIF gr.user_id IS NOT NULL THEN
    IF gr.outcome = 'loss' THEN guest_out := 'loss'; host_out := 'win';
    ELSIF gr.reported_at < now() - interval '90 seconds' THEN
      IF gr.outcome = 'win' THEN guest_out := 'win'; host_out := 'loss'; ELSE guest_out := 'draw'; host_out := 'draw'; END IF;
    ELSE RETURN false; END IF;
  ELSE
    RETURN false;
  END IF;

  PERFORM ranked_apply(m.host_id, m.host_trophies, m.guest_trophies, host_out);
  PERFORM ranked_apply(m.guest_id, m.guest_trophies, m.host_trophies, guest_out);
  UPDATE ranked_matches SET settled = true,
    winner_id = CASE WHEN host_out = 'win' THEN m.host_id WHEN guest_out = 'win' THEN m.guest_id ELSE NULL END
  WHERE id = p_match;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION ranked_try_settle(uuid) FROM PUBLIC;

-- Join the queue with a PeerJS room you have just opened. Returns either
--   {role:'guest', match_id, room_code, ...}  an opponent was waiting: join their room, or
--   {role:'host', ...}                         nobody yet: keep your room open and call ranked_poll_match.
CREATE OR REPLACE FUNCTION ranked_find_match(p_room_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := auth.uid();
  code text := upper(p_room_code);
  my_t integer;
  cand ranked_queue;
  m ranked_matches;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF code !~ '^[A-Z0-9]{5}$' THEN RAISE EXCEPTION 'Bad room code'; END IF;
  INSERT INTO player_trophies (user_id) VALUES (me) ON CONFLICT DO NOTHING;
  SELECT trophies INTO my_t FROM player_trophies WHERE user_id = me;
  DELETE FROM ranked_queue WHERE user_id = me;

  -- a waiting player of similar strength; the window widens 10 trophies per second waited
  SELECT * INTO cand FROM ranked_queue q
   WHERE q.user_id <> me
     AND q.seen_at > now() - interval '15 seconds'
     AND abs(q.trophies - my_t) <= 150 + 10 * extract(epoch FROM (now() - q.joined_at))::integer
   ORDER BY q.joined_at
   LIMIT 1
   FOR UPDATE SKIP LOCKED;

  IF FOUND THEN
    DELETE FROM ranked_queue WHERE user_id = cand.user_id;
    INSERT INTO ranked_matches (host_id, guest_id, room_code, host_trophies, guest_trophies)
    VALUES (cand.user_id, me, cand.room_code, cand.trophies, my_t)
    RETURNING * INTO m;
    RETURN jsonb_build_object('role', 'guest', 'match_id', m.id, 'room_code', m.room_code,
                              'own_trophies', my_t, 'opponent_trophies', cand.trophies);
  END IF;

  INSERT INTO ranked_queue (user_id, room_code, trophies) VALUES (me, code, my_t);
  RETURN jsonb_build_object('role', 'host', 'own_trophies', my_t);
END;
$$;

-- The host calls this every few seconds while waiting. It keeps the queue entry
-- alive and reports when someone has been paired with the room.
CREATE OR REPLACE FUNCTION ranked_poll_match() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := auth.uid();
  m ranked_matches;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO m FROM ranked_matches
   WHERE host_id = me AND NOT settled AND created_at > now() - interval '2 minutes'
     AND NOT EXISTS (SELECT 1 FROM ranked_reports r WHERE r.match_id = ranked_matches.id)
   ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('matched', true, 'match_id', m.id, 'room_code', m.room_code,
                              'own_trophies', m.host_trophies, 'opponent_trophies', m.guest_trophies);
  END IF;
  UPDATE ranked_queue SET seen_at = now() WHERE user_id = me;
  RETURN jsonb_build_object('matched', false, 'waiting', FOUND OR EXISTS (SELECT 1 FROM ranked_queue WHERE user_id = me));
END;
$$;

CREATE OR REPLACE FUNCTION ranked_cancel() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM ranked_queue WHERE user_id = auth.uid();
$$;

-- Say how a match ended for you. Trophies change once the story is settled.
-- Returns {settled, delta, trophies}.
CREATE OR REPLACE FUNCTION ranked_report(p_match uuid, p_outcome text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := auth.uid();
  m ranked_matches;
  before_t integer;
  done boolean;
  after_t integer;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF p_outcome NOT IN ('win', 'loss', 'draw') THEN RAISE EXCEPTION 'Bad outcome'; END IF;
  SELECT * INTO m FROM ranked_matches WHERE id = p_match;
  IF NOT FOUND OR me NOT IN (m.host_id, m.guest_id) THEN RAISE EXCEPTION 'Not your match'; END IF;
  INSERT INTO player_trophies (user_id) VALUES (me) ON CONFLICT DO NOTHING;
  SELECT trophies INTO before_t FROM player_trophies WHERE user_id = me;
  IF m.settled THEN
    RETURN jsonb_build_object('settled', true, 'delta', 0, 'trophies', before_t);
  END IF;
  INSERT INTO ranked_reports (match_id, user_id, outcome) VALUES (p_match, me, p_outcome) ON CONFLICT DO NOTHING;
  done := ranked_try_settle(p_match);
  SELECT trophies INTO after_t FROM player_trophies WHERE user_id = me;
  RETURN jsonb_build_object('settled', done, 'delta', after_t - before_t, 'trophies', after_t);
END;
$$;

-- Settle matches where one side reported and the other never did (they left).
CREATE OR REPLACE FUNCTION ranked_settle_stale() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  FOR r IN
    SELECT m.id FROM ranked_matches m
     WHERE NOT m.settled AND m.created_at > now() - interval '1 day'
       AND EXISTS (SELECT 1 FROM ranked_reports x WHERE x.match_id = m.id AND x.reported_at < now() - interval '90 seconds')
     LIMIT 50
  LOOP
    IF ranked_try_settle(r.id) THEN n := n + 1; END IF;
  END LOOP;
  RETURN n;
END;
$$;

-- My own trophies (creates the row on first use).
CREATE OR REPLACE FUNCTION ranked_my_stats() RETURNS player_trophies
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := auth.uid();
  t player_trophies;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  INSERT INTO player_trophies (user_id) VALUES (me) ON CONFLICT DO NOTHING;
  SELECT * INTO t FROM player_trophies WHERE user_id = me;
  RETURN t;
END;
$$;

-- The top players by trophies.
CREATE OR REPLACE FUNCTION ranked_top(p_limit integer DEFAULT 50)
RETURNS TABLE (user_id uuid, player_name text, avatar text, trophies integer, wins integer, losses integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.user_id, coalesce(p.player_name, 'Anonymous'), coalesce(p.avatar, 'avatar_intern'),
         t.trophies, t.wins, t.losses
    FROM player_trophies t LEFT JOIN player_profiles p ON p.user_id = t.user_id
   WHERE t.wins + t.losses + t.draws > 0 AND coalesce(p.visible, true)
   ORDER BY t.trophies DESC, t.wins DESC
   LIMIT least(greatest(p_limit, 1), 100);
$$;

-- ==================== REALTIME ====================
-- Lets the app receive match invites instantly.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE match_invites;
EXCEPTION WHEN duplicate_object OR undefined_object THEN
  NULL;
END $$;
