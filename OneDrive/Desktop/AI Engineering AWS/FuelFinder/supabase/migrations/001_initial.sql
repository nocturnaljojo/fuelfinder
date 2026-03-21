-- ============================================================
-- FuelFinder Canberra — Initial Migration
-- Run this in: Supabase Dashboard > SQL Editor
-- ============================================================

-- ── Extensions ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================
-- TABLES
-- ============================================================

-- ── stations ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stations (
  id               SERIAL PRIMARY KEY,
  api_station_id   INTEGER UNIQUE NOT NULL,  -- NSW API station code
  name             TEXT NOT NULL,
  brand            TEXT,
  address          TEXT,
  suburb           TEXT,
  postcode         TEXT,
  lat              DOUBLE PRECISION NOT NULL,
  lng              DOUBLE PRECISION NOT NULL,
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stations_location
  ON stations (lat, lng);

-- ── price_history ────────────────────────────────────────────
-- Append-only time series. Never update rows — always INSERT.
CREATE TABLE IF NOT EXISTS price_history (
  id           BIGSERIAL PRIMARY KEY,
  station_id   INTEGER NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  fuel_type    TEXT NOT NULL,  -- U91, E10, P95, P98, Diesel, Premium Diesel, LPG
  price_cents  NUMERIC(6,1) NOT NULL,  -- e.g. 229.9
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_history_station_fuel
  ON price_history (station_id, fuel_type, recorded_at DESC);

-- ============================================================
-- VIEWS
-- ============================================================

-- ── current_prices ───────────────────────────────────────────
-- Latest price per station per fuel type, joined with station metadata.
CREATE OR REPLACE VIEW current_prices AS
SELECT DISTINCT ON (ph.station_id, ph.fuel_type)
  ph.id,
  ph.station_id,
  ph.fuel_type,
  ph.price_cents,
  ph.recorded_at,
  s.api_station_id,
  s.name,
  s.brand,
  s.address,
  s.suburb,
  s.postcode,
  s.lat,
  s.lng
FROM price_history ph
JOIN stations s ON s.id = ph.station_id
ORDER BY ph.station_id, ph.fuel_type, ph.recorded_at DESC;

-- ============================================================
-- RPC FUNCTIONS
-- ============================================================

-- ── upsert_station ───────────────────────────────────────────
-- Insert a station or update its metadata if it already exists.
CREATE OR REPLACE FUNCTION upsert_station(
  p_api_station_id  INTEGER,
  p_name            TEXT,
  p_brand           TEXT,
  p_address         TEXT,
  p_suburb          TEXT,
  p_postcode        TEXT,
  p_lat             DOUBLE PRECISION,
  p_lng             DOUBLE PRECISION
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_id INTEGER;
BEGIN
  INSERT INTO stations (api_station_id, name, brand, address, suburb, postcode, lat, lng, updated_at)
  VALUES (p_api_station_id, p_name, p_brand, p_address, p_suburb, p_postcode, p_lat, p_lng, NOW())
  ON CONFLICT (api_station_id) DO UPDATE SET
    name       = EXCLUDED.name,
    brand      = EXCLUDED.brand,
    address    = EXCLUDED.address,
    suburb     = EXCLUDED.suburb,
    postcode   = EXCLUDED.postcode,
    lat        = EXCLUDED.lat,
    lng        = EXCLUDED.lng,
    updated_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ── avg_price_history ────────────────────────────────────────
-- Hourly average prices for a given fuel type over the last N days.
-- Used by the 7-day price trend chart (Phase 3).
CREATE OR REPLACE FUNCTION avg_price_history(
  p_fuel_type  TEXT,
  p_days       INTEGER DEFAULT 7
)
RETURNS TABLE (
  hour         TIMESTAMPTZ,
  avg_price    NUMERIC(6,1),
  station_count BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    date_trunc('hour', recorded_at) AS hour,
    ROUND(AVG(price_cents), 1)      AS avg_price,
    COUNT(DISTINCT station_id)      AS station_count
  FROM price_history
  WHERE
    fuel_type   = p_fuel_type
    AND recorded_at >= NOW() - (p_days || ' days')::INTERVAL
  GROUP BY date_trunc('hour', recorded_at)
  ORDER BY hour ASC;
$$;

-- ── cleanup_old_prices ───────────────────────────────────────
-- Purge price records older than 90 days to keep DB within free tier limits.
-- Called by pg_cron once daily.
CREATE OR REPLACE FUNCTION cleanup_old_prices()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM price_history
  WHERE recorded_at < NOW() - INTERVAL '90 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- stations: public read, service-role write
ALTER TABLE stations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read stations"
  ON stations FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Service role write stations"
  ON stations FOR ALL
  TO service_role
  USING (true);

-- price_history: public read, service-role write
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read price_history"
  ON price_history FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Service role write price_history"
  ON price_history FOR ALL
  TO service_role
  USING (true);

-- ============================================================
-- NOTES
-- ============================================================
-- After running this migration:
--   1. Deploy the Edge Function:  supabase functions deploy refresh-fuel-prices
--   2. Run the pg_cron setup SQL (002_cron.sql)
--   3. Manually invoke the Edge Function to verify data appears
-- ============================================================
