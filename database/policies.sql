-- ================================================================
-- Buzzword Dash — Row Level Security Policies
-- Version: 2.0.0
--
-- All tables use RLS. Writes require authentication via auth.uid().
-- Anonymous/public writes are prohibited per ARCHITECTURE.md §27.6.
-- ================================================================

-- ==================== ENABLE RLS ====================

ALTER TABLE scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE friends ENABLE ROW LEVEL SECURITY;
ALTER TABLE friend_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_reports ENABLE ROW LEVEL SECURITY;


-- ==================== SCORES POLICIES ====================

-- Anyone can read scores (leaderboard is public).
DROP POLICY IF EXISTS "scores_select_public" ON scores;
CREATE POLICY "scores_select_public"
  ON scores FOR SELECT
  USING (true);

-- Authenticated users can insert their own scores.
DROP POLICY IF EXISTS "scores_insert_own" ON scores;
CREATE POLICY "scores_insert_own"
  ON scores FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users cannot update or delete scores once submitted.
-- (No UPDATE or DELETE policies = forbidden by default with RLS.)


-- ==================== PLAYER PROFILES POLICIES ====================

-- Public profiles are readable by anyone.
-- Own profile is always readable.
DROP POLICY IF EXISTS "profiles_select" ON player_profiles;
CREATE POLICY "profiles_select"
  ON player_profiles FOR SELECT
  USING (visible = true OR auth.uid() = user_id);

-- Users can insert their own profile.
DROP POLICY IF EXISTS "profiles_insert_own" ON player_profiles;
CREATE POLICY "profiles_insert_own"
  ON player_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update only their own profile.
DROP POLICY IF EXISTS "profiles_update_own" ON player_profiles;
CREATE POLICY "profiles_update_own"
  ON player_profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ==================== FRIENDS POLICIES ====================

-- Users can see friend rows where they are either party.
DROP POLICY IF EXISTS "friends_select_own" ON friends;
CREATE POLICY "friends_select_own"
  ON friends FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- Users can send friend requests (as requester).
DROP POLICY IF EXISTS "friends_insert_own" ON friends;
CREATE POLICY "friends_insert_own"
  ON friends FOR INSERT
  WITH CHECK (
    auth.uid() = requester_id
    AND status = 'pending'
    AND NOT has_block_between(auth.uid(), addressee_id)
  );

-- Only the addressee can update status (accept/decline).
DROP POLICY IF EXISTS "friends_update_addressee" ON friends;
CREATE POLICY "friends_update_addressee"
  ON friends FOR UPDATE
  USING (auth.uid() = addressee_id)
  WITH CHECK (auth.uid() = addressee_id);

-- Either party can delete a friendship (unfriend).
DROP POLICY IF EXISTS "friends_delete_own" ON friends;
CREATE POLICY "friends_delete_own"
  ON friends FOR DELETE
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);


-- ==================== FRIEND BLOCKS POLICIES ====================

-- Users can see their own blocks.
DROP POLICY IF EXISTS "blocks_select_own" ON friend_blocks;
CREATE POLICY "blocks_select_own"
  ON friend_blocks FOR SELECT
  USING (auth.uid() = blocker_id);

-- Users can block others.
DROP POLICY IF EXISTS "blocks_insert_own" ON friend_blocks;
CREATE POLICY "blocks_insert_own"
  ON friend_blocks FOR INSERT
  WITH CHECK (auth.uid() = blocker_id);

-- Users can unblock others.
DROP POLICY IF EXISTS "blocks_delete_own" ON friend_blocks;
CREATE POLICY "blocks_delete_own"
  ON friend_blocks FOR DELETE
  USING (auth.uid() = blocker_id);


-- ==================== MATCH INVITES POLICIES ====================

-- Users can see invites sent to or from them.
DROP POLICY IF EXISTS "invites_select_own" ON match_invites;
CREATE POLICY "invites_select_own"
  ON match_invites FOR SELECT
  USING (auth.uid() = from_user OR auth.uid() = to_user);

-- Users can create invites they send.
DROP POLICY IF EXISTS "invites_insert_own" ON match_invites;
CREATE POLICY "invites_insert_own"
  ON match_invites FOR INSERT
  WITH CHECK (
    auth.uid() = from_user
    AND EXISTS (
      SELECT 1 FROM friends f
      WHERE f.status = 'accepted'
        AND ((f.requester_id = auth.uid() AND f.addressee_id = to_user)
          OR (f.addressee_id = auth.uid() AND f.requester_id = to_user))
    )
  );

-- Sender can update status to 'cancelled'.
-- Recipient can update status to 'accepted' or 'declined'.
DROP POLICY IF EXISTS "invites_update_own" ON match_invites;
CREATE POLICY "invites_update_own"
  ON match_invites FOR UPDATE
  USING (auth.uid() = from_user OR auth.uid() = to_user)
  WITH CHECK (
    (auth.uid() = from_user AND status = 'cancelled') OR
    (auth.uid() = to_user AND status IN ('accepted', 'declined'))
  );


-- ==================== USER REPORTS POLICIES ====================

-- Users can see their own reports.
DROP POLICY IF EXISTS "reports_select_own" ON user_reports;
CREATE POLICY "reports_select_own"
  ON user_reports FOR SELECT
  USING (auth.uid() = reporter_id);

-- Authenticated users can submit reports.
DROP POLICY IF EXISTS "reports_insert_own" ON user_reports;
CREATE POLICY "reports_insert_own"
  ON user_reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

-- Reports cannot be updated or deleted by users.
-- (Admin review handled separately outside RLS.)


-- ==================== CARD REPORTS POLICIES ====================

DROP POLICY IF EXISTS "card_reports_select_own" ON card_reports;
CREATE POLICY "card_reports_select_own"
  ON card_reports FOR SELECT
  USING (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "card_reports_insert_own" ON card_reports;
CREATE POLICY "card_reports_insert_own"
  ON card_reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);


-- ==================== GRANT USAGE TO SERVICE ROLE ====================
-- The upsert_player_profile function runs as SECURITY DEFINER
-- so it can enforce GREATEST logic on profile bests.
-- The anon and authenticated roles call it via RPC.

GRANT EXECUTE ON FUNCTION upsert_player_profile(uuid, text, text, text[], integer, integer, boolean)
  TO authenticated;


-- ==================== STUDY GROUPS / DECKS ====================
-- Group and deck writes happen only through the SECURITY DEFINER functions in
-- schema.sql, so no INSERT/UPDATE/DELETE policies are defined for these tables.

ALTER TABLE study_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_decks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "study_groups_select_member" ON study_groups;
CREATE POLICY "study_groups_select_member"
  ON study_groups FOR SELECT
  USING (is_group_member(id) OR owner_id = auth.uid());

DROP POLICY IF EXISTS "group_members_select_member" ON group_members;
CREATE POLICY "group_members_select_member"
  ON group_members FOR SELECT
  USING (is_group_member(group_id));

DROP POLICY IF EXISTS "shared_decks_select_own" ON shared_decks;
CREATE POLICY "shared_decks_select_own"
  ON shared_decks FOR SELECT
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "shared_decks_delete_own" ON shared_decks;
CREATE POLICY "shared_decks_delete_own"
  ON shared_decks FOR DELETE
  USING (owner_id = auth.uid());

GRANT EXECUTE ON FUNCTION has_block_between(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION create_group(text) TO authenticated;
GRANT EXECUTE ON FUNCTION join_group(text) TO authenticated;
GRANT EXECUTE ON FUNCTION leave_group(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION my_groups() TO authenticated;
GRANT EXECUTE ON FUNCTION group_leaderboard(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION publish_deck(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION get_shared_deck(text) TO authenticated;


-- ==================== ACTIVITY FEED / GROUP GOALS ====================

ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_study ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_select_self_or_friend" ON activity_events;
CREATE POLICY "activity_select_self_or_friend"
  ON activity_events FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM friends f
      WHERE f.status = 'accepted'
        AND ((f.requester_id = auth.uid() AND f.addressee_id = activity_events.user_id)
          OR (f.addressee_id = auth.uid() AND f.requester_id = activity_events.user_id))
    )
  );

DROP POLICY IF EXISTS "activity_insert_own" ON activity_events;
CREATE POLICY "activity_insert_own"
  ON activity_events FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "activity_delete_own" ON activity_events;
CREATE POLICY "activity_delete_own"
  ON activity_events FOR DELETE
  USING (user_id = auth.uid());

-- weekly_study is written only through report_study() and read through
-- group_goal_status(), so it has no direct policies.

GRANT EXECUTE ON FUNCTION season_standing(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION report_study(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION set_group_goal(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION group_goal_status(uuid, text) TO authenticated;
