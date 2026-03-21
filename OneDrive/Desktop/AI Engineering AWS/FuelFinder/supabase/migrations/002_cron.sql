-- ============================================================
-- FuelFinder Canberra — pg_cron Setup
-- Run this AFTER:
--   1. Running 001_initial.sql
--   2. Deploying the Edge Function (supabase functions deploy refresh-fuel-prices)
--
-- Project ref is already filled in below.
-- Replace <service-role-key> with your Supabase service_role JWT
-- (find it in Supabase Dashboard > Settings > API > service_role key)
-- ============================================================

-- ── Store service role key in Vault (secure) ─────────────────
-- Do this via the Supabase Dashboard > Vault, or via SQL:
-- SELECT vault.create_secret('<service-role-key>', 'service_role_key');

-- ── Schedule: refresh fuel prices every 15 minutes ───────────
SELECT cron.schedule(
  'refresh-fuel-prices',       -- job name (unique)
  '*/20 * * * *',              -- cron expression: every 20 min (~2,160 calls/mo, under free 2,500 limit)
  $$
  SELECT net.http_post(
    url     := 'https://fwgmsbrbdhmqzadawqcs.supabase.co/functions/v1/refresh-fuel-prices',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <service-role-key>',
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- ── Schedule: clean up prices older than 90 days (daily at 3am) ─
SELECT cron.schedule(
  'cleanup-old-prices',
  '0 3 * * *',
  $$
  SELECT cleanup_old_prices();
  $$
);

-- ── Verify jobs are registered ───────────────────────────────
-- SELECT * FROM cron.job;

-- ── To remove jobs if needed ─────────────────────────────────
-- SELECT cron.unschedule('refresh-fuel-prices');
-- SELECT cron.unschedule('cleanup-old-prices');
