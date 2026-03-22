# Data Pipeline

## Overview

```
NSW Government Fuel Price API
        │
        │  HTTPS (every 20 min via pg_cron)
        ▼
Supabase Edge Function
  refresh-fuel-prices (Deno)
        │
        │  upsert_station() + INSERT price_history
        ▼
Supabase Postgres
  stations + price_history tables
        │
        │  current_prices view (SELECT)
        ▼
Frontend (React / useStations hook)
        │
        │  rendered in map, leaderboards, charts
        ▼
User browser
```

## Edge Function: `refresh-fuel-prices`

Located at `supabase/functions/refresh-fuel-prices/index.ts`.

Runs as a Deno-based Supabase Edge Function. Invoked by `pg_cron` every 20 minutes via an authenticated HTTP POST.

### Steps

1. Fetch current prices for all NSW stations from the NSW Government fuel API.
2. For each station in the response:
   a. Call `upsert_station()` to insert or update metadata (name, brand, address, coordinates).
   b. Insert a new row into `price_history` for each fuel type with the current price.
3. Return a JSON summary `{ inserted: N, stations: M }`.

### Authentication

The Edge Function is invoked with a `service_role` JWT in the `Authorization` header. The key is stored securely in Supabase Vault.

## Data freshness

| Event | Trigger | Frequency |
|---|---|---|
| Price refresh | pg_cron → Edge Function | Every 20 minutes |
| Old data cleanup | pg_cron → `cleanup_old_prices()` | Daily at 03:00 AEST |
| Frontend fetch | Page load + manual Refresh button | On demand |

## Frontend data flow

The `useStations` hook in `src/hooks.ts` queries the `current_prices` view via the Supabase JS client, filtering by `fuel_type` and computing distance from the user's coordinates client-side using the Haversine formula. Distance is then used to filter by the selected radius.

The hook returns `{ stations, loading, error, lastRefresh, refetch }`. All UI components — map, leaderboards, stats bar, station list, and price charts — consume the same `stations` array; no secondary API calls are made.
