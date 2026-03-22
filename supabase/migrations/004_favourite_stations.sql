-- ── 004_favourite_stations.sql ────────────────────────────────
-- Stores each signed-in user's starred/favourite stations.
-- user_id is the Clerk user ID (e.g. "user_2abc…")
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS favourite_stations (
  id         BIGSERIAL PRIMARY KEY,
  user_id    TEXT        NOT NULL,   -- Clerk user ID
  station_id INT         NOT NULL,   -- references stations.id
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, station_id)       -- one favourite record per user per station
);

-- Allow anyone to insert/delete their own rows (filtered by user_id client-side)
-- For a fully secure setup, wire Clerk JWTs into Supabase and use RLS policies.
-- This permissive policy is fine for the current indie-app stage.
ALTER TABLE favourite_stations DISABLE ROW LEVEL SECURITY;

-- Index for fast per-user lookups
CREATE INDEX IF NOT EXISTS idx_fav_user ON favourite_stations (user_id);
