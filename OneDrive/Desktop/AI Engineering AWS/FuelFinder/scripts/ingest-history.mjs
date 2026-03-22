/**
 * FuelFinder — 2-Month Historical Data Ingest
 * ─────────────────────────────────────────────────────────────
 * Pulls quarterly CSV files from NSW Open Data (data.nsw.gov.au),
 * matches stations to your Supabase DB, and bulk-inserts into
 * the price_history table.
 *
 * SETUP (run once):
 *   1. Get your Service Role key from:
 *      Supabase → Project Settings → API → service_role (secret)
 *
 *   2. Create a .env.local file in the project root with:
 *      VITE_SUPABASE_URL=https://xxxx.supabase.co
 *      SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5...
 *
 *   3. Run:
 *      node scripts/ingest-history.mjs
 *
 * The script is safe to re-run — it skips rows already in the DB.
 * ─────────────────────────────────────────────────────────────
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load environment variables from .env.local ───────────────
function loadEnv() {
  const envPath = resolve(__dirname, "../.env.local");
  if (!existsSync(envPath)) {
    console.error("❌  Missing .env.local — see SETUP instructions at the top of this file.");
    process.exit(1);
  }
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const [key, ...val] = line.split("=");
    if (key && val.length) process.env[key.trim()] = val.join("=").trim();
  }
}
loadEnv();

const SUPABASE_URL      = process.env.VITE_SUPABASE_URL;
const SUPABASE_SVCKEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SVCKEY) {
  console.error("❌  VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SVCKEY);

// ── Config ────────────────────────────────────────────────────
const MONTHS_BACK  = 2;                         // how far back to import
const BATCH_SIZE   = 500;                        // rows per Supabase insert
const CKAN_API     = "https://data.nsw.gov.au/api/3/action/package_show?id=fuel-check";

// NSW FuelCode → our DB fuel_type values
const FUEL_MAP = {
  U91: "U91",
  E10: "E10",
  P95: "P95",
  P98: "P98",
  DL:  "Diesel",
  PDL: "Premium Diesel",
  LPG: "LPG",
};

// ── Date cutoff — 2 months ago ────────────────────────────────
const CUTOFF = new Date();
CUTOFF.setMonth(CUTOFF.getMonth() - MONTHS_BACK);
console.log(`\n📅  Importing prices from ${CUTOFF.toDateString()} → today`);

// ── Step 1: Discover CSV download URLs via CKAN ───────────────
async function getDownloadUrls() {
  console.log("\n🔍  Looking up NSW Open Data resources…");
  const res  = await fetch(CKAN_API);
  const json = await res.json();

  if (!json.success) throw new Error("CKAN API returned failure");

  const resources = json.result.resources
    .filter(r => r.format?.toUpperCase() === "CSV" || r.url?.toLowerCase().endsWith(".csv"))
    .sort((a, b) => new Date(b.last_modified ?? 0) - new Date(a.last_modified ?? 0));

  if (resources.length === 0) throw new Error("No CSV resources found on data.nsw.gov.au");

  // Take the 2 most recent quarters (covers ~6 months → guaranteed 2 months of data)
  const urls = resources.slice(0, 2).map(r => r.url);
  console.log(`   Found ${resources.length} CSVs — downloading latest ${urls.length}:`);
  urls.forEach(u => console.log(`   • ${u}`));
  return urls;
}

// ── Step 2: Download CSV text ─────────────────────────────────
async function downloadCsv(url) {
  console.log(`\n⬇️   Downloading ${url.split("/").pop()}…`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const text = await res.text();
  console.log(`   Downloaded ${(text.length / 1024 / 1024).toFixed(1)} MB`);
  return text;
}

// ── Step 3: Parse CSV (no external deps — pure JS) ───────────
function parseCsv(text) {
  const lines  = text.split("\n");
  const header = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  const rows   = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Handle quoted fields with commas inside
    const fields = [];
    let current  = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === "," && !inQuotes) { fields.push(current.trim()); current = ""; }
      else { current += ch; }
    }
    fields.push(current.trim());

    const row = {};
    header.forEach((h, idx) => { row[h] = (fields[idx] ?? "").replace(/^"|"$/g, "").trim(); });
    rows.push(row);
  }
  return rows;
}

// ── Step 4: Load station lookup map from Supabase ────────────
async function buildStationMap() {
  console.log("\n🗄️   Loading stations from Supabase…");
  const { data, error } = await supabase
    .from("stations")
    .select("id, name, suburb, api_station_id");

  if (error) throw new Error(`Failed to load stations: ${error.message}`);

  const map = new Map();
  for (const s of data ?? []) {
    // Match by api_station_id (most reliable)
    if (s.api_station_id) map.set(`id:${s.api_station_id}`, s.id);

    // Match by lowercase name + suburb (fallback)
    const key = `${(s.name ?? "").toLowerCase()}|${(s.suburb ?? "").toLowerCase()}`;
    map.set(key, s.id);
  }

  console.log(`   Mapped ${data?.length ?? 0} stations`);
  return map;
}

// ── Step 5: Process rows + collect inserts ────────────────────
function processRows(rows, stationMap) {
  let matched  = 0;
  let skipped  = 0;
  let tooOld   = 0;
  const records = [];

  for (const row of rows) {
    // ── Parse date ──
    // NSW format: "15/01/2026 10:30:00"  or  ISO "2026-01-15T10:30:00"
    let recordedAt;
    const raw = row.PriceUpdatedDate ?? row.TransactionDateutc ?? "";
    if (!raw) { skipped++; continue; }

    if (raw.includes("/")) {
      const [datePart, timePart = "12:00:00"] = raw.split(" ");
      const [d, m, y] = datePart.split("/");
      recordedAt = new Date(`${y}-${m}-${d}T${timePart}`);
    } else {
      recordedAt = new Date(raw);
    }

    if (isNaN(recordedAt.getTime())) { skipped++; continue; }
    if (recordedAt < CUTOFF)         { tooOld++;  continue; }

    // ── Map fuel type ──
    const fuelType = FUEL_MAP[row.FuelCode];
    if (!fuelType) { skipped++; continue; }

    // ── Match station ──
    // Try api_station_id first (ServiceStationCode column in newer CSVs)
    let stationId = row.ServiceStationCode
      ? stationMap.get(`id:${row.ServiceStationCode}`)
      : undefined;

    if (!stationId) {
      const key = `${(row.ServiceStationName ?? "").toLowerCase()}|${(row.Suburb ?? "").toLowerCase()}`;
      stationId = stationMap.get(key);
    }

    if (!stationId) { skipped++; continue; }

    // ── Validate price ──
    const price = parseFloat(row.Price);
    if (isNaN(price) || price < 50 || price > 600) { skipped++; continue; }

    records.push({
      station_id:  stationId,
      fuel_type:   fuelType,
      price_cents: price,
      recorded_at: recordedAt.toISOString(),
    });
    matched++;
  }

  console.log(`   Parsed  : ${rows.length} rows`);
  console.log(`   Matched : ${matched}`);
  console.log(`   Too old : ${tooOld}`);
  console.log(`   Skipped : ${skipped} (no station match or bad data)`);
  return records;
}

// ── Step 6: Deduplicate against existing DB records ───────────
async function deduplicateRecords(records) {
  if (records.length === 0) return records;

  console.log("\n🔎  Checking for existing records in DB…");

  // Sample the date range of our records
  const dates = records.map(r => r.recorded_at).sort();
  const from  = dates[0];
  const to    = dates[dates.length - 1];

  const { data: existing } = await supabase
    .from("price_history")
    .select("station_id, fuel_type, recorded_at")
    .gte("recorded_at", from)
    .lte("recorded_at", to);

  const existingKeys = new Set(
    (existing ?? []).map(r => `${r.station_id}|${r.fuel_type}|${r.recorded_at}`)
  );

  const fresh = records.filter(
    r => !existingKeys.has(`${r.station_id}|${r.fuel_type}|${r.recorded_at}`)
  );

  console.log(`   Already in DB : ${existingKeys.size}`);
  console.log(`   New to insert : ${fresh.length}`);
  return fresh;
}

// ── Step 7: Bulk insert in batches ────────────────────────────
async function bulkInsert(records) {
  if (records.length === 0) {
    console.log("\n✅  Nothing new to insert.");
    return;
  }

  const totalBatches = Math.ceil(records.length / BATCH_SIZE);
  console.log(`\n💾  Inserting ${records.length} records in ${totalBatches} batches…`);

  let inserted = 0;
  let errors   = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch     = records.slice(i, i + BATCH_SIZE);
    const batchNum  = Math.floor(i / BATCH_SIZE) + 1;

    const { error } = await supabase
      .from("price_history")
      .insert(batch);

    if (error) {
      console.error(`   ❌ Batch ${batchNum}/${totalBatches} failed: ${error.message}`);
      errors++;
    } else {
      inserted += batch.length;
      const pct = Math.round((batchNum / totalBatches) * 100);
      process.stdout.write(`   ✓ ${batchNum}/${totalBatches} (${pct}%) — ${inserted} rows inserted\r`);
    }

    // Small pause to avoid overwhelming Supabase
    await new Promise(r => setTimeout(r, 120));
  }

  console.log(`\n\n✅  Done — ${inserted} rows inserted, ${errors} batches failed`);
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log("⛽  FuelFinder Historical Data Ingest");
  console.log("════════════════════════════════════");

  try {
    const urls       = await getDownloadUrls();
    const stationMap = await buildStationMap();
    let   allRecords = [];

    for (const url of urls) {
      const csvText = await downloadCsv(url);
      const rows    = parseCsv(csvText);
      console.log(`\n⚙️   Processing rows…`);
      const records = processRows(rows, stationMap);
      allRecords    = allRecords.concat(records);
    }

    // Deduplicate across both files + existing DB
    const deduped = await deduplicateRecords(allRecords);
    await bulkInsert(deduped);

    console.log("\n🏁  Ingest complete. Refresh FuelFinder to see price history charts.");
  } catch (err) {
    console.error("\n❌  Fatal error:", err.message);
    process.exit(1);
  }
}

main();
