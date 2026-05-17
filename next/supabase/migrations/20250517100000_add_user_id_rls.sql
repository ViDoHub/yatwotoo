-- ============================================
-- Add user_id to user-scoped tables + enable RLS
-- ============================================

-- 1. board_listings
ALTER TABLE board_listings
  ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Replace unique constraint: (listing_id) → (user_id, listing_id)
ALTER TABLE board_listings
  DROP CONSTRAINT board_listings_listing_id_unique;
ALTER TABLE board_listings
  ADD CONSTRAINT board_listings_user_listing_unique UNIQUE (user_id, listing_id);

CREATE INDEX idx_board_listings_user_id ON board_listings (user_id);

ALTER TABLE board_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own board listings"
  ON board_listings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. saved_searches
ALTER TABLE saved_searches
  ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX idx_saved_searches_user_id ON saved_searches (user_id);

ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own saved searches"
  ON saved_searches FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. notification_logs
ALTER TABLE notification_logs
  ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX idx_notification_logs_user_id ON notification_logs (user_id);

ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notification logs"
  ON notification_logs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. user_settings
ALTER TABLE user_settings
  ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE;

CREATE INDEX idx_user_settings_user_id ON user_settings (user_id);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own settings"
  ON user_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. hidden_listings — new join table to replace is_hidden on listings
CREATE TABLE hidden_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hidden_listings_user_listing_unique UNIQUE (user_id, listing_id)
);

CREATE INDEX idx_hidden_listings_user_id ON hidden_listings (user_id);
CREATE INDEX idx_hidden_listings_listing_id ON hidden_listings (listing_id);

ALTER TABLE hidden_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own hidden listings"
  ON hidden_listings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
