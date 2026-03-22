-- Migration 006: Deduplicate price_history and add unique constraint
-- This cleans up duplicate rows created by the initial ingest runs
-- where the dedup query was limited to 1000 rows by Supabase's server cap.

-- Step 1: Delete all duplicate rows, keeping the lowest id for each unique combination
DELETE FROM price_history
WHERE id NOT IN (
  SELECT MIN(id)
  FROM price_history
  GROUP BY station_id, fuel_type, recorded_at
);

-- Step 2: Add unique constraint to prevent future duplicates
-- The ingest script will switch to ON CONFLICT DO NOTHING after this.
ALTER TABLE price_history
  ADD CONSTRAINT price_history_unique
  UNIQUE (station_id, fuel_type, recorded_at);
