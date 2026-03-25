# Data Pipeline

## Overview

FuelFinder has two separate data flows that feed the same `price_history` table:

```
┌─────────────────────────────────────────────────────────────┐
│  LIVE FLOW (every 20 min)                                   │
│                                                             │
│  NSW FuelCheck API  ──HTTPS──►  Edge Function (Deno)        │
│  api.onegov.nsw.gov.au          refresh-fuel-prices         │
│                                        │                    │
│                         upsert stations + INSERT prices     │
│                                        ▼                    │
│                              Supabase Postgres              │
└─────────────────────────────────────────────────────────────┘
                                        │
┌─────────────────────────────────────────────────────────────┐
│  HISTORICAL BACKFILL (one-off, run manually)                │
│                                                             │
│  NSW Open Data CKAN API  ──► ingest-history.mjs (Node.js)  │
│  data.nsw.gov.au               ├─ CSV / XLSX monthly files  │
│                                └─ name-match to stations    │
│                                        │                    │
│                                INSERT price_history         │
└─────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
                            stations + price_history tables
                                        │
                            current_prices view (SELECT)
                                        │
                                        ▼
                            Frontend (React / useStations)
                                        │
                              map · leaderboards · charts
```

---

## Part 1 — Live Price Feed

### Edge Function: `refresh-fuel-prices`

**File:** `supabase/functions/refresh-fuel-prices/index.ts`
**Runtime:** Deno (Supabase Edge Functions)
**Trigger:** `pg_cron` HTTP POST every 20 minutes

#### How it works

1. **OAuth token** — POST to `api.onegov.nsw.gov.au/oauth/client_credential/accesstoken` with Base64-encoded `API_KEY:API_SECRET`.
2. **Fetch prices** — GET `FuelPriceCheck/v2/fuel/prices` which returns `{ stations[], prices[] }` for all ~3,300 NSW/ACT stations.
3. **Filter by state** — Keep only stations whose address contains `NSW`, `ACT`, or `TAS`. This keeps the dataset to ~3,300 manageable rows.
4. **Upsert stations** — Insert or update station metadata (name, brand, address, suburb, postcode, lat, lng) using `ON CONFLICT (api_station_id)`.
5. **Map API codes to DB IDs** — Paginate through the `stations` table to build a `Map<api_station_id → internal id>`.
6. **Insert prices** — Batch insert into `price_history` in chunks of 500 rows, each with `recorded_at = now()`.

#### Fuel type mapping

| NSW API code | DB label |
|---|---|
| U91 | U91 |
| E10 | E10 |
| P95 | P95 |
| P98 | P98 |
| DL | Diesel |
| PDL | Premium Diesel |
| LPG | LPG |

#### Environment variables required (set in Supabase Dashboard → Settings → Edge Functions)

| Variable | Description |
|---|---|
| `NSW_FUEL_API_KEY` | NSW FuelCheck API key |
| `NSW_FUEL_API_SECRET` | NSW FuelCheck API secret |
| `SUPABASE_URL` | Auto-injected by Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-injected by Supabase |

#### Error handling

If a batch insert hits a unique constraint (code `23505`), the function falls back to row-by-row inserts, counting skipped duplicates separately. Real errors (auth, network) still throw and return HTTP 500.

---

### pg_cron Schedule

Configured in `supabase/migrations/002_cron.sql`:

```sql
SELECT cron.schedule(
  'refresh-fuel-prices',
  '*/20 * * * *',   -- every 20 minutes
  $$ SELECT net.http_post(url := '...', headers := ..., body := '{}'); $$
);

SELECT cron.schedule(
  'cleanup-old-prices',
  '0 3 * * *',      -- daily at 03:00 UTC
  $$ SELECT cleanup_old_prices(); $$
);
```

The cleanup function purges `price_history` rows older than 90 days to stay within Supabase free tier storage limits.

---

### Data freshness

| Event | Trigger | Frequency |
|---|---|---|
| Price refresh | pg_cron → Edge Function | Every 20 minutes |
| Old data cleanup | pg_cron → `cleanup_old_prices()` | Daily at 03:00 UTC |
| Frontend fetch | Page load + manual Refresh button | On demand |

---

### Coverage

| Region | Live updates | Notes |
|---|---|---|
| ACT | ✅ Every 20 min | Primary coverage area |
| NSW | ✅ Every 20 min | ~3,200 stations |
| TAS | ✅ Every 20 min | ~50 stations |
| VIC / QLD / SA / WA | ❌ | Out of scope — different state APIs |

---

## Part 2 — Historical Backfill

To populate the charts with meaningful trend data from day one, we ran a one-off backfill using publicly available historical price files.

### Data source

**NSW Open Data — FuelCheck Price History**
URL: `https://data.nsw.gov.au/data/dataset/fuel-check`

The dataset contains monthly CSV/XLSX files of every reported price change across all NSW/ACT service stations. Each row represents one price update at one station for one fuel type.

Fields: `ServiceStationName`, `Address`, `Suburb`, `Postcode`, `Brand`, `FuelCode`, `PriceUpdatedDate`, `Price`

### Script: `scripts/ingest-history.mjs`

Run with:
```bash
# Pull from NSW Open Data CKAN DataStore API (no download needed)
node scripts/ingest-history.mjs

# Or ingest a local CSV or XLSX file you've downloaded manually
node scripts/ingest-history.mjs "C:/Users/you/Downloads/fuelcheck_jan2026.xlsx"
```

#### How it works

**Step 1 — Build station map**

Loads all stations from the `stations` table and builds three lookup keys per station:

| Key format | Example | Purpose |
|---|---|---|
| `api:{api_station_id}` | `api:12345` | Direct match if API code is in the CSV |
| `{name}\|{suburb}` | `7-eleven mawson\|mawson` | Name + suburb combined |
| `name:{name}` | `name:7-eleven mawson` | Name-only fallback (most used — suburb is null in our DB) |

**Step 2 — Fetch/parse source data**

- **CKAN DataStore** (for months where data is in the DataStore): Paginates the API at 1,000 records/page with an 80ms delay between pages.
- **CSV file** (local): Read directly with Node.js `fs`.
- **XLSX file** (local): Parsed with the `xlsx` npm package using `{ cellDates: true }` to correctly handle Excel serial date numbers.

**Step 3 — Match records to stations**

Each record's `ServiceStationName` is normalised (lowercase, collapsed whitespace) and looked up against the station map. Records with no match are skipped and counted separately.

**Step 4 — Deduplication**

Before inserting, the script queries `price_history` for existing rows in the same date range and builds a Set of `station_id|fuel_type|date` keys. Any incoming row that already exists is skipped.

**Step 5 — Batch insert**

Inserts in batches of 500 rows with 100ms delay between batches to avoid overwhelming Supabase.

---

### Months ingested

| Month | Source | Method | Rows inserted |
|---|---|---|---|
| September 2025 | NSW Open Data DataStore | CKAN API | ~21,200 |
| October 2025 | NSW Open Data DataStore | CKAN API | ~0 (name format mismatch — re-ingest pending) |
| January 2026 | data.nsw.gov.au (XLSX download) | Local file | ~22,500 |
| February 2026 | NSW Open Data DataStore | CKAN API | ~22,500 |

Total backfilled: **~65,000 rows** across Sep 2025 → Feb 2026.

---

### Known issues

#### October 2025 — 0 matches

The October 2025 file uses a different station name format (e.g. `"COLES EXPRESS PHILLIP"` vs `"Coles Express Phillip"`). The case-insensitive normalisation handles this, but the suburb field format also differs. A re-ingest with an improved address-based matching fallback would recover these records.

#### November / December 2025 — XLSX only

These months are not available in the CKAN DataStore — only as XLSX downloads. To ingest them:

```bash
# Download from data.nsw.gov.au/data/dataset/fuel-check
node scripts/ingest-history.mjs "path/to/fuelcheck_nov2025.xlsx"
node scripts/ingest-history.mjs "path/to/fuelcheck_dec2025.xlsx"
```

#### Excel serial date format

XLSX files from NSW Open Data store `PriceUpdatedDate` as Excel serial numbers (e.g. `46055`) rather than strings. The script handles this with `{ cellDates: true }` in `XLSX.read()`, which converts serial numbers to JavaScript `Date` objects automatically.

---

## Part 3 — Data Quality Incident (March 2026)

### What happened

A unique constraint `price_history_unique` was added to the `price_history` table during development to prevent duplicate rows during the historical backfill. This constraint had the unintended side-effect of blocking the live cron.

**Timeline:**
- March 21 2026 — last successful cron run; constraint added same day
- March 21–25 2026 — every cron invocation returned HTTP 500 due to `23505 unique_violation`; **0 new prices inserted for 4 days**
- March 25 2026 — constraint dropped via `ALTER TABLE price_history DROP CONSTRAINT IF EXISTS price_history_unique`; cron restored, 10,123 rows inserted on first successful run

### Root cause

The constraint was `UNIQUE (station_id, fuel_type, ...)` with a date component. When fuel prices don't change between cron runs, inserting the same price again violated the constraint and crashed the entire batch.

### Fix applied

1. Constraint dropped: `ALTER TABLE price_history DROP CONSTRAINT IF EXISTS price_history_unique;`
2. Edge function updated: on `23505` error, falls back to row-by-row inserts and counts duplicates as `skipped` instead of throwing.
3. Deduplication for the historical ingest is now done in application code (the script), not via a DB constraint.

### Lesson

**Do not use DB-level unique constraints on append-only time-series tables.** Deduplication logic belongs in the application layer (ingest script) where it can be controlled precisely. The live cron must always be able to write, regardless of price change frequency.

---

## Frontend data flow

The `useStations` hook in `src/hooks.ts`:

1. Queries `current_prices` view filtered by `fuel_type`.
2. Applies a **bounding box filter** server-side using the scan centre's lat/lng and the selected radius (1 degree latitude ≈ 111 km). This keeps results well under Supabase's 1,000-row default limit and avoids returning stations from the wrong region.
3. Computes Haversine distance client-side for each returned station.
4. Applies the radius filter (`distance_km <= radiusKm`).

Returns `{ stations, loading, error, lastRefresh, refetch }`. All UI components — map markers, leaderboards, stats bar, station list, per-station history chart — consume this single array with no secondary API calls.
