# Database Schema

FuelFinder uses Supabase (Postgres) with two core tables, one view, and several RPC functions.

## Tables

### `stations`

Stores static station metadata. Updated on conflict (upsert) when the Edge Function refreshes data.

| Column | Type | Notes |
|---|---|---|
| `id` | `SERIAL PRIMARY KEY` | Internal ID |
| `api_station_id` | `INTEGER UNIQUE NOT NULL` | NSW Government API station code |
| `name` | `TEXT NOT NULL` | Station display name |
| `brand` | `TEXT` | Brand name (e.g. "Ampol", "BP") |
| `address` | `TEXT` | Full street address |
| `suburb` | `TEXT` | Suburb |
| `postcode` | `TEXT` | Postcode |
| `lat` | `DOUBLE PRECISION NOT NULL` | Latitude |
| `lng` | `DOUBLE PRECISION NOT NULL` | Longitude |
| `updated_at` | `TIMESTAMPTZ` | Last metadata update |

Index: `(lat, lng)` for spatial proximity queries.

### `price_history`

Append-only time series. Rows are never updated — every refresh cycle inserts new rows.

| Column | Type | Notes |
|---|---|---|
| `id` | `BIGSERIAL PRIMARY KEY` | |
| `station_id` | `INTEGER` | FK → `stations.id` |
| `fuel_type` | `TEXT` | U91, E10, P95, P98, Diesel, Premium Diesel, LPG |
| `price_cents` | `NUMERIC(6,1)` | Price in cents per litre (e.g. 229.9) |
| `recorded_at` | `TIMESTAMPTZ` | Defaults to `NOW()` |

Index: `(station_id, fuel_type, recorded_at DESC)` — supports efficient "latest price" lookups and time-series queries.

### `feedback`

Stores user-submitted feedback from the in-app Feedback modal.

| Column | Type | Notes |
|---|---|---|
| `id` | `BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY` | |
| `message` | `TEXT NOT NULL` | User feedback text |
| `created_at` | `TIMESTAMPTZ` | Defaults to `NOW()` |

## Views

### `current_prices`

Returns the latest price per station per fuel type, joined with station metadata. Used by the frontend `useStations` hook.

```sql
SELECT DISTINCT ON (ph.station_id, ph.fuel_type)
  ph.id, ph.station_id, ph.fuel_type, ph.price_cents, ph.recorded_at,
  s.api_station_id, s.name, s.brand, s.address, s.suburb, s.postcode, s.lat, s.lng
FROM price_history ph
JOIN stations s ON s.id = ph.station_id
ORDER BY ph.station_id, ph.fuel_type, ph.recorded_at DESC;
```

## RPC Functions

### `upsert_station`

Inserts a new station or updates its metadata on `api_station_id` conflict. Returns the internal `id`. Called by the Edge Function for each station in the API response.

### `avg_price_history(p_fuel_type, p_days)`

Returns hourly average prices for a given fuel type over the last N days. Returns `(hour, avg_price, station_count)`. Used by the Phase 2 price trend chart.

### `cleanup_old_prices()`

Deletes `price_history` rows older than 90 days. Returns the count of deleted rows. Scheduled to run daily at 3:00 AM via `pg_cron`.

## pg_cron jobs

| Job name | Schedule | Action |
|---|---|---|
| `refresh-fuel-prices` | Every 20 minutes | HTTP POST to Edge Function |
| `cleanup-old-prices` | Daily at 03:00 | Calls `cleanup_old_prices()` |

## Row Level Security

| Table | anon role | service_role |
|---|---|---|
| `stations` | SELECT only | Full access |
| `price_history` | SELECT only | Full access |
| `feedback` | INSERT only | Full access |
