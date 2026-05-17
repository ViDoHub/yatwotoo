-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================
-- LISTINGS TABLE
-- ============================================
CREATE TABLE listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yad2_id text UNIQUE NOT NULL,
  deal_type text NOT NULL DEFAULT 'rent',

  -- Address (flattened from embedded document)
  city text NOT NULL DEFAULT '',
  neighborhood text NOT NULL DEFAULT '',
  street text NOT NULL DEFAULT '',
  house_number text NOT NULL DEFAULT '',
  area text NOT NULL DEFAULT '',
  area_id integer NOT NULL DEFAULT 0,
  top_area text NOT NULL DEFAULT '',
  top_area_id integer NOT NULL DEFAULT 0,

  -- Property details
  rooms real,
  floor integer,
  sqm real,
  price bigint,
  price_per_sqm real,

  -- Amenities (flattened booleans)
  parking boolean,
  elevator boolean,
  balcony boolean,
  pets_allowed boolean,
  air_conditioning boolean,
  furnished boolean,
  accessible boolean,
  bars boolean,
  boiler boolean,
  shelter boolean,
  renovated boolean,
  long_term boolean,
  storage boolean,
  for_partners boolean,

  -- Geospatial
  location geography(Point, 4326),

  -- Content
  description text NOT NULL DEFAULT '',
  images text[] NOT NULL DEFAULT '{}',
  url text NOT NULL DEFAULT '',

  -- Dates
  entry_date text NOT NULL DEFAULT '',
  date_added text NOT NULL DEFAULT '',
  date_updated text NOT NULL DEFAULT '',

  -- Extra details
  project_name text NOT NULL DEFAULT '',
  property_tax text NOT NULL DEFAULT '',
  house_committee text NOT NULL DEFAULT '',
  total_floors integer,
  contact_name text NOT NULL DEFAULT '',
  parking_spots integer,
  garden_area integer,
  payments_in_year integer,

  -- Timestamps
  first_seen_at timestamptz NOT NULL DEFAULT '1970-01-01T00:00:00Z',
  last_seen_at timestamptz NOT NULL DEFAULT now(),

  -- Status
  is_active boolean NOT NULL DEFAULT true,
  is_hidden boolean NOT NULL DEFAULT false
);

-- Indexes
CREATE INDEX idx_listings_deal_type ON listings (deal_type);
CREATE INDEX idx_listings_area_id ON listings (area_id);
CREATE INDEX idx_listings_top_area_id ON listings (top_area_id);
CREATE INDEX idx_listings_city ON listings (city);
CREATE INDEX idx_listings_neighborhood ON listings (neighborhood);
CREATE INDEX idx_listings_is_active ON listings (is_active);
CREATE INDEX idx_listings_is_hidden ON listings (is_hidden);
CREATE INDEX idx_listings_location ON listings USING GIST (location);
CREATE INDEX idx_listings_price ON listings (price);
CREATE INDEX idx_listings_last_seen_at ON listings (last_seen_at);

-- ============================================
-- SAVED SEARCHES TABLE
-- ============================================
CREATE TABLE saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_saved_searches_is_active ON saved_searches (is_active);

-- ============================================
-- PRICE HISTORY TABLE
-- ============================================
CREATE TABLE price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id text NOT NULL REFERENCES listings(yad2_id) ON DELETE CASCADE,
  price bigint NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_price_history_listing_id ON price_history (listing_id);
CREATE INDEX idx_price_history_observed_at ON price_history (observed_at);

-- ============================================
-- NOTIFICATION LOGS TABLE
-- ============================================
CREATE TABLE notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_search_id text NOT NULL,
  listing_id text NOT NULL,
  message_type text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notification_logs_lookup ON notification_logs (saved_search_id, listing_id, message_type);

-- ============================================
-- USER SETTINGS TABLE (single row)
-- ============================================
CREATE TABLE user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- WhatsApp (Callmebot)
  whatsapp_enabled boolean NOT NULL DEFAULT true,
  whatsapp_phone text NOT NULL DEFAULT '',
  whatsapp_apikey text NOT NULL DEFAULT '',

  -- Telegram
  telegram_enabled boolean NOT NULL DEFAULT false,
  telegram_bot_token text NOT NULL DEFAULT '',
  telegram_chat_id text NOT NULL DEFAULT '',

  -- Email (SMTP)
  email_enabled boolean NOT NULL DEFAULT false,
  email_smtp_host text NOT NULL DEFAULT '',
  email_smtp_port integer NOT NULL DEFAULT 587,
  email_smtp_user text NOT NULL DEFAULT '',
  email_smtp_password text NOT NULL DEFAULT '',
  email_to text NOT NULL DEFAULT '',

  -- General
  poll_interval_minutes integer NOT NULL DEFAULT 15,
  notifications_enabled boolean NOT NULL DEFAULT true
);

-- ============================================
-- SCRAPE JOBS TABLE
-- ============================================
CREATE TABLE scrape_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  current_region integer,
  current_deal_type text,
  regions_completed text[] NOT NULL DEFAULT '{}',
  total_fetched integer NOT NULL DEFAULT 0,
  total_new integer NOT NULL DEFAULT 0,
  total_price_drops integer NOT NULL DEFAULT 0,
  error text
);

CREATE INDEX idx_scrape_jobs_status ON scrape_jobs (status);
CREATE INDEX idx_scrape_jobs_started_at ON scrape_jobs (started_at DESC);

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

-- ============================================
-- RPC FUNCTIONS FOR GEOSPATIAL QUERIES
-- ============================================

-- Get listings within a bounding box (for map viewport)
CREATE OR REPLACE FUNCTION listings_in_bbox(
  south double precision,
  west double precision,
  north double precision,
  east double precision
)
RETURNS SETOF listings
LANGUAGE sql
STABLE
AS $$
  SELECT *
  FROM listings
  WHERE location IS NOT NULL
    AND is_active = true
    AND is_hidden = false
    AND ST_Intersects(
      location,
      ST_MakeEnvelope(west, south, east, north, 4326)::geography
    );
$$;

-- Get listings within a radius of a point (for radius search)
CREATE OR REPLACE FUNCTION listings_near_point(
  lat double precision,
  lng double precision,
  radius_km double precision
)
RETURNS SETOF listings
LANGUAGE sql
STABLE
AS $$
  SELECT *
  FROM listings
  WHERE location IS NOT NULL
    AND is_active = true
    AND is_hidden = false
    AND ST_DWithin(
      location,
      ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
      radius_km * 1000  -- Convert km to meters
    );
$$;
