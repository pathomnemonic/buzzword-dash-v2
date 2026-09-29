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


-- ==================== SCORES POLICIES ====================

-- Anyone can read scores (leaderboard is public).
CREATE POLICY "scores_select_public"
  ON scores FOR SELECT
  USING (true);

-- Authenticated users can insert their own scores.
CREATE POLICY "scores_insert_own"
  ON scores FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users cannot update or delete scores once submitted.
-- (No UPDATE or DELETE policies = forbidden by default with RLS.)


-- ==================== PLAYER PROFILES POLICIES ====================

-- Public profiles are readable by anyone.
-- Own profile is always readable.
CREATE POLICY "profiles_select"
  ON player_profiles FOR SELECT
  USING (visible = true OR auth.uid() = user_id);

-- Users can insert their own profile.
CREATE POLICY "profiles_insert_own"
  ON player_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update only their own profile.
CREATE POLICY "profiles_update_own"
  ON player_profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ==================== FRIENDS POLICIES ====================

-- Users can see friend rows where they are either party.
CREATE POLICY "friends_select_own"
  ON friends FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- Users can send friend requests (as requester).
CREATE POLICY "friends_insert_own"
  ON friends FOR INSERT
  WITH CHECK (auth.uid() = requester_id);

-- Only the addressee can update status (accept/decline).
CREATE POLICY "friends_update_addressee"
  ON friends FOR UPDATE
  USING (auth.uid() = addressee_id)
  WITH CHECK (auth.uid() = addressee_id);

-- Either party can delete a friendship (unfriend).
CREATE POLICY "friends_delete_own"
  ON friends FOR DELETE
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);


-- ==================== FRIEND BLOCKS POLICIES ====================

-- Users can see their own blocks.
CREATE POLICY "blocks_select_own"
  ON friend_blocks FOR SELECT
  USING (auth.uid() = blocker_id);

-- Users can block others.
CREATE POLICY "blocks_insert_own"
  ON friend_blocks FOR INSERT
  WITH CHECK (auth.uid() = blocker_id);

-- Users can unblock others.
CREATE POLICY "blocks_delete_own"
  ON friend_blocks FOR DELETE
  USING (auth.uid() = blocker_id);


-- ==================== MATCH INVITES POLICIES ====================

-- Users can see invites sent to or from them.
CREATE POLICY "invites_select_own"
  ON match_invites FOR SELECT
  USING (auth.uid() = from_user OR auth.uid() = to_user);

-- Users can create invites they send.
CREATE POLICY "invites_insert_own"
  ON match_invites FOR INSERT
  WITH CHECK (auth.uid() = from_user);

-- Sender can update status to 'cancelled'.
-- Recipient can update status to 'accepted' or 'declined'.
CREATE POLICY "invites_update_own"
  ON match_invites FOR UPDATE
  USING (auth.uid() = from_user OR auth.uid() = to_user)
  WITH CHECK (
    (auth.uid() = from_user AND status = 'cancelled') OR
    (auth.uid() = to_user AND status IN ('accepted', 'declined'))
  );


-- ==================== USER REPORTS POLICIES ====================

-- Users can see their own reports.
CREATE POLICY "reports_select_own"
  ON user_reports FOR SELECT
  USING (auth.uid() = reporter_id);

-- Authenticated users can submit reports.
CREATE POLICY "reports_insert_own"
  ON user_reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

-- Reports cannot be updated or deleted by users.
-- (Admin review handled separately outside RLS.)


-- ==================== GRANT USAGE TO SERVICE ROLE ====================
-- The upsert_player_profile function runs as SECURITY DEFINER
-- so it can enforce GREATEST logic on profile bests.
-- The anon and authenticated roles call it via RPC.

GRANT EXECUTE ON FUNCTION upsert_player_profile(uuid, text, text, text[], integer, integer, boolean)
  TO authenticated;
