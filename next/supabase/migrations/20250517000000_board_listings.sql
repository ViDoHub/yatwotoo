-- ============================================
-- BOARD LISTINGS TABLE (Kanban board)
-- ============================================
CREATE TABLE board_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  board_column text NOT NULL DEFAULT 'review',
  position integer NOT NULL DEFAULT 0,
  contact_name text NOT NULL DEFAULT '',
  contact_phone text NOT NULL DEFAULT '',
  visit_date timestamptz,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT board_listings_listing_id_unique UNIQUE (listing_id),
  CONSTRAINT board_listings_column_check CHECK (board_column IN ('review', 'get_contacts', 'call', 'visit'))
);

CREATE INDEX idx_board_listings_column ON board_listings (board_column);
CREATE INDEX idx_board_listings_position ON board_listings (board_column, position);
