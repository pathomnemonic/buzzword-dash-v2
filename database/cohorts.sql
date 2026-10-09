-- ================================================================
-- Dx Dash — Cohorts and cohort wars (NOT RELEASED YET)
--
-- Cohorts are teams of up to 50 players (a class, a study group, a whole
-- school year) that climb a weekly "war" ladder together. Schools are a tag on
-- a cohort, so schools can be ranked against each other.
--
-- This file is optional and the game does not show cohorts until the build
-- flag VITE_FEATURE_COHORTS=1 is set (see docs/COHORTS.md). Run it in the
-- Supabase SQL editor AFTER schema.sql and policies.sql, when there are
-- enough players for cohorts to be fun. It is safe to run twice.
--
-- How the war works:
--   * Each ISO week is one war. A ranked-match win scores 10 points for the
--     winner's cohort, a draw 3. One player can bring in at most 100 points
--     per week, so one grinder cannot carry a cohort.
--   * Cohort standing = war points this week. School standing = the war points
--     of all that school's cohorts.
--   * "Trophies" of a cohort = the sum of its members' ranked trophies.
-- ================================================================

-- ==================== TABLES ====================

CREATE TABLE IF NOT EXISTS schools (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 60),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS schools_name_idx ON schools (lower(name));

CREATE TABLE IF NOT EXISTS cohorts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (char_length(name) BETWEEN 3 AND 30),
  tag         text NOT NULL UNIQUE CHECK (tag ~ '^[A-Z0-9]{5}$'),
  school_id   uuid REFERENCES schools(id) ON DELETE SET NULL,
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 140),
  join_mode   text NOT NULL DEFAULT 'open' CHECK (join_mode IN ('open', 'invite')),
  max_members integer NOT NULL DEFAULT 50 CHECK (max_members BETWEEN 2 AND 50),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cohorts_name_idx ON cohorts (lower(name));
CREATE INDEX IF NOT EXISTS cohorts_school_idx ON cohorts (school_id);

-- One cohort per player.
CREATE TABLE IF NOT EXISTS cohort_members (
  cohort_id uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role      text NOT NULL DEFAULT 'member' CHECK (role IN ('leader', 'officer', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cohort_id, user_id)
);
CREATE INDEX IF NOT EXISTS cohort_members_cohort_idx ON cohort_members (cohort_id);

CREATE TABLE IF NOT EXISTS cohort_war_points (
  week       text NOT NULL,
  cohort_id  uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  points     integer NOT NULL DEFAULT 0 CHECK (points >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (week, cohort_id, user_id)
);
CREATE INDEX IF NOT EXISTS cohort_war_week_idx ON cohort_war_points (week, cohort_id);

ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohort_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohort_war_points ENABLE ROW LEVEL SECURITY;

-- Everything goes through the functions below.
REVOKE ALL ON schools, cohorts, cohort_members, cohort_war_points FROM PUBLIC, anon, authenticated;

-- ==================== HELPERS ====================

CREATE OR REPLACE FUNCTION cohort_week(ts timestamptz DEFAULT now()) RETURNS text
LANGUAGE sql STABLE AS $$ SELECT to_char(ts, 'IYYY-"W"IW') $$;

CREATE OR REPLACE FUNCTION cohort_random_tag() RETURNS text
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  t text;
BEGIN
  LOOP
    t := '';
    FOR i IN 1..5 LOOP
      t := t || substr(chars, 1 + floor(random() * length(chars))::integer, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM cohorts WHERE tag = t);
  END LOOP;
  RETURN t;
END;
$$;

CREATE OR REPLACE FUNCTION cohort_role_of(p_cohort uuid, p_user uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM cohort_members WHERE cohort_id = p_cohort AND user_id = p_user
$$;

-- ==================== MEMBERSHIP ====================

-- Start a cohort (and its school, if it is new). You become its leader.
CREATE OR REPLACE FUNCTION cohort_create(p_name text, p_school text DEFAULT NULL, p_description text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := auth.uid();
  sid uuid;
  c cohorts;
  school_name text := nullif(btrim(regexp_replace(coalesce(p_school, ''), '\s+', ' ', 'g')), '');
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF EXISTS (SELECT 1 FROM cohort_members WHERE user_id = me) THEN
    RAISE EXCEPTION 'Leave your current cohort first';
  END IF;
  IF school_name IS NOT NULL THEN
    SELECT id INTO sid FROM schools WHERE lower(name) = lower(school_name);
    IF sid IS NULL THEN
      INSERT INTO schools (name, created_by) VALUES (school_name, me) RETURNING id INTO sid;
    END IF;
  END IF;
  INSERT INTO cohorts (name, tag, school_id, description)
  VALUES (btrim(p_name), cohort_random_tag(), sid, coalesce(p_description, ''))
  RETURNING * INTO c;
  INSERT INTO cohort_members (cohort_id, user_id, role) VALUES (c.id, me, 'leader');
  RETURN jsonb_build_object('id', c.id, 'tag', c.tag, 'name', c.name);
END;
$$;

-- Join by the 5-character cohort code.
CREATE OR REPLACE FUNCTION cohort_join(p_tag text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := auth.uid();
  c cohorts;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO c FROM cohorts WHERE tag = upper(btrim(p_tag));
  IF NOT FOUND THEN RAISE EXCEPTION 'No cohort with that code'; END IF;
  IF EXISTS (SELECT 1 FROM cohort_members WHERE user_id = me) THEN
    RAISE EXCEPTION 'Leave your current cohort first';
  END IF;
  IF (SELECT count(*) FROM cohort_members WHERE cohort_id = c.id) >= c.max_members THEN
    RAISE EXCEPTION 'That cohort is full';
  END IF;
  INSERT INTO cohort_members (cohort_id, user_id) VALUES (c.id, me);
  RETURN jsonb_build_object('id', c.id, 'tag', c.tag, 'name', c.name);
END;
$$;

-- Whenever a member goes (leaving, removed, or an account deleted): the last one
-- out closes the cohort, and a leaderless cohort passes to the longest-serving
-- officer or member.
CREATE OR REPLACE FUNCTION cohort_after_member_gone() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  heir uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cohort_members WHERE cohort_id = OLD.cohort_id) THEN
    DELETE FROM cohorts WHERE id = OLD.cohort_id;
  ELSIF OLD.role = 'leader' AND NOT EXISTS (SELECT 1 FROM cohort_members WHERE cohort_id = OLD.cohort_id AND role = 'leader') THEN
    SELECT user_id INTO heir FROM cohort_members WHERE cohort_id = OLD.cohort_id
     ORDER BY (role = 'officer') DESC, joined_at LIMIT 1;
    UPDATE cohort_members SET role = 'leader' WHERE cohort_id = OLD.cohort_id AND user_id = heir;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS cohort_member_gone_trg ON cohort_members;
CREATE TRIGGER cohort_member_gone_trg AFTER DELETE ON cohort_members
  FOR EACH ROW EXECUTE FUNCTION cohort_after_member_gone();

CREATE OR REPLACE FUNCTION cohort_leave() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  DELETE FROM cohort_members WHERE user_id = auth.uid();
END;
$$;

-- Leader: make someone an officer or a member (or hand over leadership).
CREATE OR REPLACE FUNCTION cohort_set_role(p_user uuid, p_role text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := auth.uid();
  mine cohort_members;
  theirs cohort_members;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF p_role NOT IN ('leader', 'officer', 'member') THEN RAISE EXCEPTION 'Bad role'; END IF;
  SELECT * INTO mine FROM cohort_members WHERE user_id = me;
  IF NOT FOUND OR mine.role <> 'leader' THEN RAISE EXCEPTION 'Only the leader can do that'; END IF;
  SELECT * INTO theirs FROM cohort_members WHERE user_id = p_user AND cohort_id = mine.cohort_id;
  IF NOT FOUND OR p_user = me THEN RAISE EXCEPTION 'Not a member of your cohort'; END IF;
  UPDATE cohort_members SET role = p_role WHERE cohort_id = mine.cohort_id AND user_id = p_user;
  IF p_role = 'leader' THEN
    UPDATE cohort_members SET role = 'officer' WHERE cohort_id = mine.cohort_id AND user_id = me;
  END IF;
END;
$$;

-- Leader or officer: remove a member (officers can only remove plain members).
CREATE OR REPLACE FUNCTION cohort_kick(p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := auth.uid();
  mine cohort_members;
  theirs cohort_members;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO mine FROM cohort_members WHERE user_id = me;
  IF NOT FOUND OR mine.role = 'member' THEN RAISE EXCEPTION 'Only leaders and officers can do that'; END IF;
  SELECT * INTO theirs FROM cohort_members WHERE user_id = p_user AND cohort_id = mine.cohort_id;
  IF NOT FOUND OR p_user = me THEN RAISE EXCEPTION 'Not a member of your cohort'; END IF;
  IF theirs.role = 'leader' OR (theirs.role = 'officer' AND mine.role <> 'leader') THEN
    RAISE EXCEPTION 'You cannot remove that member';
  END IF;
  DELETE FROM cohort_members WHERE cohort_id = mine.cohort_id AND user_id = p_user;
END;
$$;

-- ==================== READING ====================

-- Find cohorts by name or school.
CREATE OR REPLACE FUNCTION cohort_search(p_query text DEFAULT '', p_limit integer DEFAULT 20)
RETURNS TABLE (id uuid, name text, tag text, school text, description text, members integer, max_members integer, trophies bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.name, c.tag, s.name, c.description,
         (SELECT count(*)::integer FROM cohort_members m WHERE m.cohort_id = c.id),
         c.max_members,
         coalesce((SELECT sum(t.trophies) FROM cohort_members m JOIN player_trophies t ON t.user_id = m.user_id WHERE m.cohort_id = c.id), 0)::bigint
    FROM cohorts c LEFT JOIN schools s ON s.id = c.school_id
   WHERE c.join_mode = 'open'
     AND (coalesce(p_query, '') = '' OR c.name ILIKE '%' || p_query || '%' OR s.name ILIKE '%' || p_query || '%')
   ORDER BY 8 DESC, c.name
   LIMIT least(greatest(p_limit, 1), 50);
$$;

-- My cohort with its roster. Only members can see the roster.
CREATE OR REPLACE FUNCTION my_cohort() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := auth.uid();
  m cohort_members;
  c cohorts;
  sname text;
  wk text := cohort_week();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO m FROM cohort_members WHERE user_id = me;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO c FROM cohorts WHERE id = m.cohort_id;
  SELECT name INTO sname FROM schools WHERE id = c.school_id;
  RETURN jsonb_build_object(
    'id', c.id, 'name', c.name, 'tag', c.tag, 'school', sname, 'description', c.description,
    'my_role', m.role, 'week', wk,
    'war_points', coalesce((SELECT sum(points) FROM cohort_war_points WHERE cohort_id = c.id AND week = wk), 0),
    'members', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'user_id', cm.user_id, 'name', coalesce(p.player_name, 'Anonymous'), 'role', cm.role,
               'trophies', coalesce(t.trophies, 0),
               'war_points', coalesce(w.points, 0))
             ORDER BY coalesce(w.points, 0) DESC, coalesce(t.trophies, 0) DESC)
        FROM cohort_members cm
        LEFT JOIN player_profiles p ON p.user_id = cm.user_id
        LEFT JOIN player_trophies t ON t.user_id = cm.user_id
        LEFT JOIN cohort_war_points w ON w.cohort_id = cm.cohort_id AND w.user_id = cm.user_id AND w.week = wk
       WHERE cm.cohort_id = c.id), '[]'::jsonb)
  );
END;
$$;

-- This week's war ladder: cohorts ranked by war points.
CREATE OR REPLACE FUNCTION cohort_war_standings(p_limit integer DEFAULT 50)
RETURNS TABLE (rank bigint, cohort_id uuid, name text, school text, members integer, war_points bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT rank() OVER (ORDER BY coalesce(sum(w.points), 0) DESC), c.id, c.name, s.name,
         (SELECT count(*)::integer FROM cohort_members m WHERE m.cohort_id = c.id),
         coalesce(sum(w.points), 0)::bigint
    FROM cohorts c
    LEFT JOIN schools s ON s.id = c.school_id
    LEFT JOIN cohort_war_points w ON w.cohort_id = c.id AND w.week = cohort_week()
   GROUP BY c.id, c.name, s.name
  HAVING coalesce(sum(w.points), 0) > 0
   ORDER BY 6 DESC, c.name
   LIMIT least(greatest(p_limit, 1), 100);
$$;

-- Schools ranked by the war points of all their cohorts this week.
CREATE OR REPLACE FUNCTION school_standings(p_limit integer DEFAULT 50)
RETURNS TABLE (rank bigint, school_id uuid, name text, cohorts integer, war_points bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT rank() OVER (ORDER BY coalesce(sum(w.points), 0) DESC), s.id, s.name,
         (SELECT count(*)::integer FROM cohorts c2 WHERE c2.school_id = s.id),
         coalesce(sum(w.points), 0)::bigint
    FROM schools s
    JOIN cohorts c ON c.school_id = s.id
    LEFT JOIN cohort_war_points w ON w.cohort_id = c.id AND w.week = cohort_week()
   GROUP BY s.id, s.name
  HAVING coalesce(sum(w.points), 0) > 0
   ORDER BY 5 DESC, s.name
   LIMIT least(greatest(p_limit, 1), 100);
$$;

-- ==================== WAR POINTS ====================
-- Points come only from settled ranked matches, never from the player's device.

CREATE OR REPLACE FUNCTION cohort_add_war_points(p_user uuid, p_points integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cid uuid;
  wk text := cohort_week();
  have integer;
  give integer;
BEGIN
  SELECT cohort_id INTO cid FROM cohort_members WHERE user_id = p_user;
  IF cid IS NULL THEN RETURN; END IF;
  SELECT coalesce(points, 0) INTO have FROM cohort_war_points WHERE week = wk AND cohort_id = cid AND user_id = p_user;
  have := coalesce(have, 0);
  give := least(p_points, 100 - have);   -- at most 100 points per player per week
  IF give <= 0 THEN RETURN; END IF;
  INSERT INTO cohort_war_points (week, cohort_id, user_id, points) VALUES (wk, cid, p_user, give)
  ON CONFLICT (week, cohort_id, user_id) DO UPDATE SET points = cohort_war_points.points + give, updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION cohort_add_war_points(uuid, integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION cohort_on_match_settled() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.settled AND NOT OLD.settled THEN
    IF NEW.winner_id IS NOT NULL THEN
      PERFORM cohort_add_war_points(NEW.winner_id, 10);
    ELSIF EXISTS (SELECT 1 FROM ranked_reports r WHERE r.match_id = NEW.id AND r.outcome = 'draw') THEN
      PERFORM cohort_add_war_points(NEW.host_id, 3);
      PERFORM cohort_add_war_points(NEW.guest_id, 3);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cohort_war_trg ON ranked_matches;
CREATE TRIGGER cohort_war_trg AFTER UPDATE ON ranked_matches
  FOR EACH ROW EXECUTE FUNCTION cohort_on_match_settled();

-- ==================== WHO MAY CALL WHAT ====================

REVOKE ALL ON FUNCTION cohort_create(text, text, text), cohort_join(text), cohort_leave(),
  cohort_set_role(uuid, text), cohort_kick(uuid), cohort_search(text, integer), my_cohort(),
  cohort_war_standings(integer), school_standings(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cohort_create(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION cohort_join(text) TO authenticated;
GRANT EXECUTE ON FUNCTION cohort_leave() TO authenticated;
GRANT EXECUTE ON FUNCTION cohort_set_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION cohort_kick(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION cohort_search(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION my_cohort() TO authenticated;
GRANT EXECUTE ON FUNCTION cohort_war_standings(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION school_standings(integer) TO authenticated;

-- Only triggers and other owner-run functions call these: the app roles must not (see the note in schema.sql)
REVOKE ALL ON FUNCTION cohort_week(timestamptz), cohort_random_tag(), cohort_role_of(uuid, uuid), cohort_after_member_gone(),
  cohort_on_match_settled(), cohort_add_war_points(uuid, integer) FROM PUBLIC, anon, authenticated;
