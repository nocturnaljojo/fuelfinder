-- ── 005_fuel_trends_rpc.sql ──────────────────────────────────
-- Returns daily average price per fuel type from price_history.
-- Used by the Fuel Type Trends chart in ChartsModal.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION avg_price_by_fuel_daily(days_back INT DEFAULT 90)
RETURNS TABLE (
  date_key   DATE,
  fuel_type  TEXT,
  avg_price  NUMERIC
) AS $$
  SELECT
    DATE(recorded_at)                          AS date_key,
    fuel_type,
    ROUND(AVG(price_cents)::NUMERIC, 1)        AS avg_price
  FROM price_history
  WHERE recorded_at >= NOW() - (days_back || ' days')::INTERVAL
  GROUP BY DATE(recorded_at), fuel_type
  ORDER BY date_key, fuel_type;
$$ LANGUAGE sql STABLE;
