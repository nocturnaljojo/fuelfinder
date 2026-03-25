# Historical Backfill

This page is the **quick-reference guide** for re-running or extending the historical data ingest. For full architecture details see [Data Pipeline](data-pipeline.md).

---

## What is the backfill?

The live cron only stores prices from the moment it starts running. To give the charts meaningful trend data from day one, we ran a one-off backfill using monthly price history files published by the NSW Government.

**Result:** ~65,000 rows in `price_history` covering September 2025 → February 2026.

---

## Data source

**NSW Open Data — FuelCheck Price History**
`https://data.nsw.gov.au/data/dataset/fuel-check`

Monthly files of every reported price change across all NSW, ACT, and TAS service stations. Available as CSV (recent months in CKAN DataStore) or XLSX download (older months).

---

## Running the ingest script

```bash
cd "C:/Users/jtdra/OneDrive/Desktop/AI Engineering AWS/FuelFinder"

# Option A — pull directly from NSW Open Data CKAN API
node scripts/ingest-history.mjs

# Option B — ingest a CSV or XLSX file you've downloaded manually
node scripts/ingest-history.mjs "C:/Users/jtdra/Downloads/fuelcheck_jan2026.xlsx"
node scripts/ingest-history.mjs "C:/Users/jtdra/Downloads/price_history_feb2026.csv"
```

The script reads credentials from `.env` automatically.

---

## Required `.env` variables

```
VITE_SUPABASE_URL=https://fwgmsbrbdhmqzadawqcs.supabase.co
VITE_SUPABASE_SERVICE_ROLE_SECRET=eyJ...   # service_role JWT
```

---

## What the script does (step by step)

### 1. Build station map
Loads all ~3,300 stations from the `stations` table. Creates three lookup keys per station so it can match historical records regardless of how the name is formatted:

- `api:{api_station_id}` — direct code match
- `{name}|{suburb}` — name + suburb combined
- `name:{name}` — name only (primary match, since suburb is `null` in our DB)

### 2. Fetch source data
- **CKAN DataStore months**: paginates the API at 1,000 records/page, 80ms delay between pages.
- **Local CSV**: reads with Node.js `fs`.
- **Local XLSX**: parsed with `xlsx` package using `{ cellDates: true }` to handle Excel's serial date format.

### 3. Normalise records
Each record is mapped to:
```
{ station_id, fuel_type, price_cents, recorded_at }
```
`PriceUpdatedDate` → UTC ISO string. `Price` is stored as-is (e.g. `239.9`).

### 4. Deduplicate
Queries existing `price_history` rows for the same date range. Builds a Set of `station_id|fuel_type|date` keys. Incoming rows already in the Set are skipped — no DB-level constraint needed.

### 5. Batch insert
Inserts 500 rows at a time with 100ms delay between batches. Prints a progress summary per resource/file.

---

## Months status

| Month | In DataStore? | Status | Notes |
|---|---|---|---|
| Sep 2025 | ✅ | ✅ Ingested | ~21,200 rows |
| Oct 2025 | ✅ | ⚠️ 0 matches | Name format mismatch — re-ingest needed |
| Nov 2025 | ❌ XLSX only | ⏳ Pending download | Download from NSW Open Data |
| Dec 2025 | ❌ XLSX only | ⏳ Pending download | Download from NSW Open Data |
| Jan 2026 | ❌ XLSX only | ✅ Ingested | ~22,500 rows (XLSX) |
| Feb 2026 | ✅ | ✅ Ingested | ~22,500 rows |

---

## Adding new months

1. Go to `https://data.nsw.gov.au/data/dataset/fuel-check`
2. Find the new month's resource.
3. **If it's in the DataStore:** add the resource ID to `RESOURCES` array in `scripts/ingest-history.mjs`:
   ```js
   { name: "March 2026", id: "paste-resource-id-here" },
   ```
4. **If it's XLSX-only:** download the file and run:
   ```bash
   node scripts/ingest-history.mjs "path/to/file.xlsx"
   ```

---

## Finding DataStore resource IDs

Use the CKAN `package_show` API to list all resources for the fuel-check dataset:

```bash
curl "https://data.nsw.gov.au/data/api/action/package_show?id=fuel-check" | \
  python3 -m json.tool | grep -A5 '"name"'
```

Then verify each resource is in the DataStore (not just a file download):

```bash
curl "https://data.nsw.gov.au/data/api/action/resource_show?id=<resource-id>" | \
  python3 -m json.tool | grep datastore_active
```

`"datastore_active": true` means you can use the CKAN DataStore API directly. `false` means download the file manually.

---

## Common issues

### "0 rows matched" for a month

The station name format in the CSV differs from what's stored in our `stations` table.

**Debug:** print a sample of unmatched names:
```js
// Temporarily add to mapRecords():
if (!stationId) console.log('NO MATCH:', rec.ServiceStationName, rec.Suburb);
```

**Fix options:**
- Add address-based matching (match on normalised street address)
- Run a one-off SQL UPDATE to align name formats in the `stations` table

### XLSX dates arrive as numbers

If you see `rec.PriceUpdatedDate.replace is not a function`, the XLSX file is using Excel serial date format. The script already handles this with `XLSX.read(buf, { cellDates: true })`. If upgrading the script, always pass `cellDates: true`.

### Script crashes on large files

Increase Node.js heap if needed:
```bash
node --max-old-space-size=4096 scripts/ingest-history.mjs path/to/large.xlsx
```

---

## Data quality rules

- **No DB-level unique constraint on `price_history`** — deduplication is done in the script. A DB constraint blocks the live cron (see [Data Quality Incident](data-pipeline.md#part-3--data-quality-incident-march-2026)).
- Price values are stored as `NUMERIC(6,1)` — e.g. `239.9`. Do not multiply by 100.
- `recorded_at` is always UTC ISO 8601.
- `fuel_type` must be one of: `U91`, `E10`, `P95`, `P98`, `Diesel`, `Premium Diesel`, `LPG`.
