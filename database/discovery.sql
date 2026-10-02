-- ================================================================
-- Dx Dash — Study-buddy and group discovery (NOT RELEASED YET)
--
-- Lets players be found, and find others, to study with:
--   * Study buddies: a player makes an opt-in listing (exam, exam date, subjects, pace, time zone) and gets a
--     ranked list of compatible players. Contact goes through the normal friend request, so nobody can message
--     a stranger. Listings are OFF until the player turns them on, and only a player with their own listing
--     can browse others.
--   * Groups (clans): the owner can make a group public (with an exam tag and open or by-request joining).
--     Anyone can browse public groups and join or ask to join.
--
-- The game does not show any of it until the build flag VITE_FEATURE_DISCOVERY=1 is set (js/features.js and
-- docs/DISCOVERY.md). Run this file in the Supabase SQL editor AFTER schema.sql and policies.sql. It is safe to
-- run twice. Nothing here can be read or written directly: everything goes through the functions below, which
-- hide blocked players, rate-limit, and never expose more than a name, picture and the listing fields.
-- ================================================================

-- ==================== STUDY BUDDY LISTINGS ====================

CREATE TABLE IF NOT EXISTS buddy_listings (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  exam         text NOT NULL CHECK (char_length(exam) BETWEEN 1 AND 30),
  exam_date    date,
  subjects     text[] NOT NULL DEFAULT '{}' CHECK (cardinality(subjects) <= 8 AND pg_column_size(subjects) < 700),
  pace         text NOT NULL DEFAULT 'steady' CHECK (pace IN ('relaxed', 'steady', 'intense')),
  utc_offset   smallint CHECK (utc_offset BETWEEN -12 AND 14),
  discoverable boolean NOT NULL DEFAULT false,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS buddy_listings_discoverable_idx ON buddy_listings (exam) WHERE discoverable;

CREATE OR REPLACE FUNCTION set_buddy_listing(p_exam text, p_exam_date date, p_subjects text[], p_pace text,
                                             p_utc_offset integer, p_discoverable boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  IF p_discoverable AND NOT EXISTS (SELECT 1 FROM player_profiles WHERE user_id = auth.uid() AND visible = true) THEN
    RAISE EXCEPTION 'Make your profile visible first';
  END IF;
  INSERT INTO buddy_listings AS b (user_id, exam, exam_date, subjects, pace, utc_offset, discoverable, updated_at)
  VALUES (auth.uid(), left(trim(p_exam), 30), p_exam_date, coalesce(p_subjects, '{}'), coalesce(p_pace, 'steady'),
          p_utc_offset, coalesce(p_discoverable, false), now())
  ON CONFLICT (user_id) DO UPDATE SET exam = EXCLUDED.exam, exam_date = EXCLUDED.exam_date, subjects = EXCLUDED.subjects,
    pace = EXCLUDED.pace, utc_offset = EXCLUDED.utc_offset, discoverable = EXCLUDED.discoverable, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION my_buddy_listing() RETURNS buddy_listings
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT * FROM buddy_listings WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION remove_buddy_listing() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM buddy_listings WHERE user_id = auth.uid();
$$;

-- Compatible players, best match first. Needs the caller to be discoverable too.
-- Score: same exam 3, exam dates within a month 2 (3 months 1), each shared subject 1 (up to 4),
-- same pace 1, time zones within 3 hours 1.
CREATE OR REPLACE FUNCTION find_buddies(p_limit integer DEFAULT 20)
RETURNS TABLE (user_id uuid, player_name text, avatar text, exam text, exam_date date, subjects text[],
               pace text, utc_offset smallint, score integer)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE me buddy_listings;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  SELECT * INTO me FROM buddy_listings WHERE buddy_listings.user_id = auth.uid() AND discoverable;
  IF NOT FOUND THEN RAISE EXCEPTION 'Turn on your own listing to find study buddies'; END IF;
  RETURN QUERY
    SELECT b.user_id, p.player_name, p.avatar, b.exam, b.exam_date, b.subjects, b.pace, b.utc_offset,
      ( (CASE WHEN lower(b.exam) = lower(me.exam) THEN 3 ELSE 0 END)
      + (CASE WHEN b.exam_date IS NULL OR me.exam_date IS NULL THEN 0
              WHEN abs(b.exam_date - me.exam_date) <= 30 THEN 2
              WHEN abs(b.exam_date - me.exam_date) <= 90 THEN 1 ELSE 0 END)
      + least(4, (SELECT count(*) FROM unnest(b.subjects) s WHERE s = ANY (me.subjects)))::integer
      + (CASE WHEN b.pace = me.pace THEN 1 ELSE 0 END)
      + (CASE WHEN b.utc_offset IS NOT NULL AND me.utc_offset IS NOT NULL AND abs(b.utc_offset - me.utc_offset) <= 3 THEN 1 ELSE 0 END)
      ) AS score
    FROM buddy_listings b
    JOIN player_profiles p ON p.user_id = b.user_id AND p.visible = true
    WHERE b.discoverable
      AND b.user_id <> auth.uid()
      AND NOT has_block_between(auth.uid(), b.user_id)
      AND NOT EXISTS (SELECT 1 FROM friends f
                      WHERE (f.requester_id = auth.uid() AND f.addressee_id = b.user_id)
                         OR (f.addressee_id = auth.uid() AND f.requester_id = b.user_id))
    ORDER BY score DESC, b.updated_at DESC
    LIMIT least(greatest(coalesce(p_limit, 20), 1), 30);
END;
$$;


-- ==================== PUBLIC GROUPS ====================

ALTER TABLE study_groups ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private'
  CHECK (visibility IN ('private', 'public'));
ALTER TABLE study_groups ADD COLUMN IF NOT EXISTS exam text CHECK (exam IS NULL OR char_length(exam) <= 30);
ALTER TABLE study_groups ADD COLUMN IF NOT EXISTS join_mode text NOT NULL DEFAULT 'open'
  CHECK (join_mode IN ('open', 'request'));

CREATE TABLE IF NOT EXISTS group_join_requests (
  group_id    uuid NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE OR REPLACE FUNCTION set_group_discovery(p_group_id uuid, p_public boolean, p_exam text, p_join_mode text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_join_mode NOT IN ('open', 'request') THEN RAISE EXCEPTION 'unknown join mode'; END IF;
  UPDATE study_groups
     SET visibility = CASE WHEN p_public THEN 'public' ELSE 'private' END,
         exam = nullif(left(trim(coalesce(p_exam, '')), 30), ''),
         join_mode = p_join_mode
   WHERE id = p_group_id AND owner_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the group owner can change this'; END IF;
END;
$$;

-- Public groups the caller is not in, newest and fullest first. p_query matches the name.
CREATE OR REPLACE FUNCTION discover_groups(p_query text DEFAULT '', p_exam text DEFAULT NULL, p_limit integer DEFAULT 20)
RETURNS TABLE (id uuid, name text, exam text, join_mode text, member_count bigint, weekly_goal integer, owner_name text, requested boolean)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT g.id, g.name, g.exam, g.join_mode,
         (SELECT count(*) FROM group_members m WHERE m.group_id = g.id),
         g.weekly_goal,
         coalesce(op.player_name, 'Owner'),
         EXISTS (SELECT 1 FROM group_join_requests r WHERE r.group_id = g.id AND r.user_id = auth.uid())
  FROM study_groups g
  LEFT JOIN player_profiles op ON op.user_id = g.owner_id
  WHERE auth.uid() IS NOT NULL
    AND g.visibility = 'public'
    AND NOT is_group_member(g.id)
    AND NOT has_block_between(auth.uid(), g.owner_id)
    AND (coalesce(p_query, '') = '' OR g.name ILIKE '%' || replace(replace(left(p_query, 40), '%', ''), '_', '') || '%')
    AND (p_exam IS NULL OR lower(g.exam) = lower(p_exam))
  ORDER BY (SELECT count(*) FROM group_members m WHERE m.group_id = g.id) DESC, g.created_at DESC
  LIMIT least(greatest(coalesce(p_limit, 20), 1), 30);
$$;

-- Join an open public group, or ask to join one that approves members. Returns 'joined' or 'requested'.
CREATE OR REPLACE FUNCTION join_public_group(p_group_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g study_groups;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  SELECT * INTO g FROM study_groups WHERE id = p_group_id AND visibility = 'public';
  IF NOT FOUND OR has_block_between(auth.uid(), g.owner_id) THEN RAISE EXCEPTION 'That group is not available'; END IF;
  IF is_group_member(g.id) THEN RETURN 'joined'; END IF;
  IF (SELECT count(*) FROM group_members WHERE group_id = g.id) >= 100 THEN RAISE EXCEPTION 'This group is full'; END IF;
  IF g.join_mode = 'open' THEN
    INSERT INTO group_members (group_id, user_id) VALUES (g.id, auth.uid()) ON CONFLICT DO NOTHING;
    RETURN 'joined';
  END IF;
  IF (SELECT count(*) FROM group_join_requests WHERE user_id = auth.uid()) >= 5 THEN
    RAISE EXCEPTION 'You have too many pending requests';
  END IF;
  INSERT INTO group_join_requests (group_id, user_id) VALUES (g.id, auth.uid()) ON CONFLICT DO NOTHING;
  RETURN 'requested';
END;
$$;

CREATE OR REPLACE FUNCTION cancel_group_request(p_group_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM group_join_requests WHERE group_id = p_group_id AND user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION group_requests(p_group_id uuid)
RETURNS TABLE (user_id uuid, player_name text, avatar text, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM study_groups WHERE id = p_group_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'Only the group owner can see requests';
  END IF;
  RETURN QUERY
    SELECT r.user_id, coalesce(p.player_name, 'Player'), coalesce(p.avatar, 'avatar_intern'), r.created_at
    FROM group_join_requests r
    LEFT JOIN player_profiles p ON p.user_id = r.user_id
    WHERE r.group_id = p_group_id AND NOT has_block_between(auth.uid(), r.user_id)
    ORDER BY r.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION resolve_group_request(p_group_id uuid, p_user uuid, p_accept boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM study_groups WHERE id = p_group_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'Only the group owner can answer requests';
  END IF;
  IF p_accept THEN
    IF (SELECT count(*) FROM group_members WHERE group_id = p_group_id) >= 100 THEN RAISE EXCEPTION 'This group is full'; END IF;
    IF NOT EXISTS (SELECT 1 FROM group_join_requests WHERE group_id = p_group_id AND user_id = p_user) THEN
      RAISE EXCEPTION 'No such request';
    END IF;
    INSERT INTO group_members (group_id, user_id) VALUES (p_group_id, p_user) ON CONFLICT DO NOTHING;
  END IF;
  DELETE FROM group_join_requests WHERE group_id = p_group_id AND user_id = p_user;
END;
$$;

-- my_groups() gains the discovery fields (re-created, since the return type grew)
DROP FUNCTION IF EXISTS my_groups();
CREATE OR REPLACE FUNCTION my_groups()
RETURNS TABLE (id uuid, name text, code text, member_count bigint, is_owner boolean, weekly_goal integer,
               visibility text, exam text, join_mode text, pending_requests bigint)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT g.id, g.name, g.code,
         (SELECT count(*) FROM group_members m2 WHERE m2.group_id = g.id),
         g.owner_id = auth.uid(), g.weekly_goal, g.visibility, g.exam, g.join_mode,
         CASE WHEN g.owner_id = auth.uid() THEN (SELECT count(*) FROM group_join_requests r WHERE r.group_id = g.id) ELSE 0 END
  FROM study_groups g
  JOIN group_members m ON m.group_id = g.id AND m.user_id = auth.uid()
  ORDER BY g.created_at;
$$;


-- ==================== WHO MAY CALL WHAT ====================

ALTER TABLE buddy_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_join_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON buddy_listings, group_join_requests FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION set_buddy_listing(text, date, text[], text, integer, boolean), my_buddy_listing(), remove_buddy_listing(),
  find_buddies(integer), set_group_discovery(uuid, boolean, text, text), discover_groups(text, text, integer),
  join_public_group(uuid), cancel_group_request(uuid), group_requests(uuid), resolve_group_request(uuid, uuid, boolean),
  my_groups() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_buddy_listing(text, date, text[], text, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION my_buddy_listing() TO authenticated;
GRANT EXECUTE ON FUNCTION remove_buddy_listing() TO authenticated;
GRANT EXECUTE ON FUNCTION find_buddies(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION set_group_discovery(uuid, boolean, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION discover_groups(text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION join_public_group(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_group_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION group_requests(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_group_request(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION my_groups() TO authenticated;
