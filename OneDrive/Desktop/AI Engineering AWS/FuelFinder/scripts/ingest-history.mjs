/**
 * FuelFinder — 2-Month Historical Data Ingest
 * Uses the NSW Open Data DataStore API — no CSV download required.
 * Run with:  node scripts/ingest-history.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { readFile } from "fs/promises";
import { resolve, dirname, extname } from "path";
import { fileURLToPath } from "url";
import * as XLSX from "xlsx";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load .env or .env.local ───────────────────────────────────
function loadEnv() {
  const candidates = ["../.env.local", "../.env"].map(p => resolve(__dirname, p));
  const envPath = candidates.find(p => existsSync(p));
  if (!envPath) { console.error("❌  No .env file found."); process.exit(1); }
  console.log(`   Using env: ${envPath.split(/[\\/]/).pop()}`);
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const eqIdx = line.indexOf("=");
    if (eqIdx < 1) continue;
    const key = line.slice(0, eqIdx).trim();
    const val = line.slice(eqIdx + 1).trim();
    if (key && !process.env[key]) process.env[key] = val;
  }
}
loadEnv();

const SUPABASE_URL    = process.env.VITE_SUPABASE_URL;
const SUPABASE_SVCKEY = process.env.SUPABASE_SERVICE_ROLE_KEY
                     ?? process.env.VITE_SUPABASE_SERVICE_ROLE_SECRET
                     ?? process.env.SUPABASE_SERVICE_ROLE_SECRET;

if (!SUPABASE_URL || !SUPABASE_SVCKEY) {
  console.error("❌  Missing VITE_SUPABASE_URL or service role key in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SVCKEY);

// ── NSW DataStore resource IDs (verified accessible) ─────────
// Source: data.nsw.gov.au/data/dataset/fuel-check
// Note: Nov 2025, Dec 2025, Jan 2026 are XLSX-only (not in DataStore)
const RESOURCES = [
  { name: "September 2025", id: "e12a757e-a9fe-4cbe-9034-55f00314c72b" },
  { name: "October 2025",   id: "c5ae66f9-9324-49b9-8f90-07cd6eb12d42" },
  { name: "February 2026",  id: "3786820f-8efd-4b13-b2ba-56096a9d42b3" },
];

const DATASTORE_API = "https://data.nsw.gov.au/data/api/action/datastore_search";
const PAGE_SIZE     = 1000;   // records per API page
const BATCH_SIZE    = 500;    // rows per Supabase insert

// NSW fuel code → our DB values
const FUEL_MAP = {
  U91: "U91",  E10: "E10",  P95: "P95",  P98: "P98",
  DL:  "Diesel",  PDL: "Premium Diesel",  LPG: "LPG",
};

// ── Load station map from Supabase ────────────────────────────
async function buildStationMap() {
  console.log("\n🗄️   Loading stations from Supabase…");
  const { data, error } = await supabase
    .from("stations")
    .select("id, name, suburb, api_station_id");
  if (error) throw new Error(`Supabase error: ${error.message}`);

  const map = new Map();
  for (const s of data ?? []) {
    // 1. By api_station_id (most precise)
    if (s.api_station_id) map.set(`api:${s.api_station_id}`, s.id);
    // 2. By name + suburb
    const nameNorm = (s.name ?? "").toLowerCase().trim();
    const suburbNorm = (s.suburb ?? "").toLowerCase().trim();
    if (suburbNorm) map.set(`${nameNorm}|${suburbNorm}`, s.id);
    // 3. Name-only fallback (suburb is null in many DB rows)
    if (!map.has(`name:${nameNorm}`)) map.set(`name:${nameNorm}`, s.id);
  }
  console.log(`   Mapped ${data?.length ?? 0} stations (name+suburb + name-only fallback)`);
  return map;
}

// ── Fetch all pages from one DataStore resource ───────────────
async function fetchAllRecords(resourceId, resourceName) {
  console.log(`\n📥  Fetching ${resourceName}…`);
  const allRecords = [];
  let offset = 0;

  // First call — get total count
  const firstUrl = `${DATASTORE_API}?resource_id=${resourceId}&limit=${PAGE_SIZE}&offset=0`;
  const firstRes = await fetch(firstUrl);
  const firstJson = await firstRes.json();
  if (!firstJson.success) throw new Error(`DataStore error for ${resourceName}`);

  const total = firstJson.result.total;
  allRecords.push(...firstJson.result.records);
  offset += PAGE_SIZE;

  const pages = Math.ceil(total / PAGE_SIZE);
  process.stdout.write(`   Page 1/${pages} (${allRecords.length}/${total})\r`);

  // Remaining pages
  while (offset < total) {
    const url = `${DATASTORE_API}?resource_id=${resourceId}&limit=${PAGE_SIZE}&offset=${offset}`;
    const res  = await fetch(url);
    const json = await res.json();
    if (!json.success) { console.warn(`   ⚠️  Page at offset ${offset} failed — skipping`); break; }
    allRecords.push(...json.result.records);
    offset += PAGE_SIZE;
    const page = Math.ceil(offset / PAGE_SIZE);
    process.stdout.write(`   Page ${page}/${pages} (${allRecords.length}/${total})\r`);
    await new Promise(r => setTimeout(r, 80)); // be polite to the API
  }

  console.log(`   ✓ Fetched ${allRecords.length} records from ${resourceName}        `);
  return allRecords;
}

// ── Map raw API records → price_history rows ──────────────────
function mapRecords(records, stationMap) {
  let matched = 0, skipped = 0;
  const rows = [];

  for (const rec of records) {
    // Fuel type
    const fuelType = FUEL_MAP[rec.FuelCode];
    if (!fuelType) { skipped++; continue; }

    // Station match — try 3 strategies
    const nameNorm   = (rec.ServiceStationName ?? "").toLowerCase().trim();
    const suburbNorm = (rec.Suburb ?? "").toLowerCase().trim();
    const stationId  =
      stationMap.get(`${nameNorm}|${suburbNorm}`) ??   // name + suburb
      stationMap.get(`name:${nameNorm}`);               // name-only fallback
    if (!stationId) { skipped++; continue; }

    // Price
    const price = parseFloat(rec.Price);
    if (isNaN(price) || price < 50 || price > 600) { skipped++; continue; }

    // Date — may be a JS Date (cellDates:true), an Excel serial, or one of two string formats:
    //   ISO-like:    "2025-09-25 06:14:21"  (Sep 2025, Feb 2026)
    //   Australian:  "4/10/2025 8:52"        (Oct 2025, Jan 2026 XLSX)
    let recordedAt;
    const rawDate = rec.PriceUpdatedDate;
    if (rawDate instanceof Date) {
      recordedAt = rawDate;
    } else if (typeof rawDate === "number") {
      // Excel serial date → JS Date via XLSX utility
      const d = XLSX.SSF.parse_date_code(rawDate);
      recordedAt = new Date(Date.UTC(d.y, d.m - 1, d.d, d.H, d.M, d.S));
    } else {
      const s = String(rawDate).trim();
      // DD/MM/YYYY H:MM[:SS] → parse manually to avoid ambiguity
      const ddmm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (ddmm) {
        const [, dd, mm, yyyy, hh, min, ss = "0"] = ddmm;
        recordedAt = new Date(Date.UTC(+yyyy, +mm - 1, +dd, +hh, +min, +ss));
      } else {
        // ISO-like: "2025-09-25 06:14:21" → replace space with T
        recordedAt = new Date(s.replace(" ", "T"));
      }
    }
    if (isNaN(recordedAt.getTime())) { skipped++; continue; }

    rows.push({
      station_id:  stationId,
      fuel_type:   fuelType,
      price_cents: price,
      recorded_at: recordedAt.toISOString(),
    });
    matched++;
  }

  console.log(`   Matched: ${matched}  |  Skipped (no station / bad data): ${skipped}`);
  return rows;
}

// ── Deduplicate against existing DB rows ──────────────────────
async function deduplicate(rows) {
  if (rows.length === 0) return rows;
  const dates = rows.map(r => r.recorded_at).sort();
  const { data: existing } = await supabase
    .from("price_history")
    .select("station_id, fuel_type, recorded_at")
    .gte("recorded_at", dates[0])
    .lte("recorded_at", dates[dates.length - 1])
    .limit(100000);   // override Supabase 1000-row default to catch all existing rows

  const seen = new Set(
    (existing ?? []).map(r => `${r.station_id}|${r.fuel_type}|${r.recorded_at}`)
  );
  const fresh = rows.filter(r => !seen.has(`${r.station_id}|${r.fuel_type}|${r.recorded_at}`));
  console.log(`   Already in DB: ${seen.size}  |  New to insert: ${fresh.length}`);
  return fresh;
}

// ── Bulk insert ────────────────────────────────────────────────
async function bulkInsert(rows, label) {
  if (rows.length === 0) { console.log("   Nothing new to insert."); return 0; }

  const batches = Math.ceil(rows.length / BATCH_SIZE);
  console.log(`\n💾  Inserting ${rows.length} rows in ${batches} batches…`);
  let inserted = 0, failed = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    // ignoreDuplicates: true → ON CONFLICT DO NOTHING (requires unique constraint 006)
    const { error } = await supabase.from("price_history")
      .upsert(batch, { onConflict: "station_id,fuel_type,recorded_at", ignoreDuplicates: true });
    const batchNo = Math.floor(i / BATCH_SIZE) + 1;
    if (error) {
      console.error(`\n   ❌ Batch ${batchNo}/${batches}: ${error.message}`);
      failed++;
    } else {
      inserted += batch.length;
      const pct = Math.round((batchNo / batches) * 100);
      process.stdout.write(`   ✓ ${batchNo}/${batches} (${pct}%) — ${inserted} inserted\r`);
    }
    await new Promise(r => setTimeout(r, 100));
  }
  console.log(`\n   Done: ${inserted} inserted, ${failed} batches failed`);
  return inserted;
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log("\n⛽  FuelFinder — Historical Data Ingest");
  console.log("════════════════════════════════════════");
  console.log(`   Importing: ${RESOURCES.map(r => r.name).join(", ")}`);

  try {
    const stationMap = await buildStationMap();
    let totalInserted = 0;

    // If a local file was passed as CLI arg, process it and exit
    const localFile = process.argv[2];
    if (localFile) {
      if (!existsSync(localFile)) throw new Error(`File not found: ${localFile}`);
      const ext = extname(localFile).toLowerCase();
      console.log(`\n📂  Local file: ${localFile}`);

      let rawRows;
      if (ext === ".xlsx" || ext === ".xls") {
        const buf  = await readFile(localFile);
        const wb   = XLSX.read(buf, { type: "buffer", cellDates: true });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        rawRows    = XLSX.utils.sheet_to_json(ws, { defval: "" }).map(r => ({
          ServiceStationName: r["ServiceStationName"] ?? r["Service Station Name"] ?? "",
          Suburb:             r["Suburb"] ?? "",
          FuelCode:           r["FuelCode"] ?? r["Fuel Code"] ?? "",
          PriceUpdatedDate:   r["PriceUpdatedDate"] ?? r["Price Updated Date"] ?? "",
          Price:              String(r["Price"] ?? ""),
        }));
        console.log(`   Parsed ${rawRows.length} rows from XLSX`);
      } else {
        rawRows = parseCsv(readFileSync(localFile, "utf8"));
      }

      console.log(`\n⚙️   Mapping to stations…`);
      const rows     = mapRecords(rawRows, stationMap);
      console.log(`\n🔎  Checking for duplicates…`);
      const fresh    = await deduplicate(rows);
      const inserted = await bulkInsert(fresh);
      totalInserted += inserted;

      console.log(`\n${"═".repeat(42)}`);
      console.log(`✅  Complete — ${totalInserted} rows inserted\n`);
      return;
    }

    // Otherwise use the DataStore API resources defined above
    for (const resource of RESOURCES) {
      console.log(`\n${"─".repeat(42)}`);
      console.log(`📅  ${resource.name}`);

      const records  = await fetchAllRecords(resource.id, resource.name);
      console.log(`\n⚙️   Mapping to stations…`);
      const rows     = mapRecords(records, stationMap);
      console.log(`\n🔎  Checking for duplicates…`);
      const fresh    = await deduplicate(rows);
      const inserted = await bulkInsert(fresh);
      totalInserted += inserted;
    }

    console.log(`\n${"═".repeat(42)}`);
    console.log(`✅  Complete — ${totalInserted} total rows inserted`);
    console.log(`   Refresh FuelFinder to see price history charts.\n`);
  } catch (err) {
    console.error("\n❌  Fatal:", err.message);
    process.exit(1);
  }
}

main();
