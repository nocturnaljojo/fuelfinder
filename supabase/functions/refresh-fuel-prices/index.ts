// ============================================================
// FuelFinder Canberra — Supabase Edge Function
// Name: refresh-fuel-prices
// Runtime: Deno (TypeScript)
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── States to include ─────────────────────────────────────────
// Scalable: add more states here as we expand
const SUPPORTED_STATES = new Set(["NSW", "TAS"]);
const STATES_PARAM = [...SUPPORTED_STATES].join("|"); // "NSW|TAS"

// NSW API fuel code → our canonical label
const FUEL_TYPE_MAP: Record<string, string> = {
  U91: "U91", E10: "E10", P95: "P95", P98: "P98",
  DL: "Diesel", PDL: "Premium Diesel", LPG: "LPG",
};

// ── Correct base URL (from Swagger: api.onegov.nsw.gov.au) ───
const NSW_API_BASE = "https://api.onegov.nsw.gov.au";
const NSW_TOKEN_URL = `${NSW_API_BASE}/oauth/client_credential/accesstoken?grant_type=client_credentials`;

// Extract 4-digit postcode from address string
// e.g. "539 Wilberforce Rd, WILBERFORCE NSW 2756" → "2756"
function extractPostcode(address: string): string | null {
  const match = address.match(/\b(\d{4})\b\s*$/);
  return match ? match[1] : null;
}

// Extract suburb from address string (word(s) before STATE POSTCODE)
// e.g. "123 Main St, GOULBURN NSW 2580" → "Goulburn"
function extractSuburb(address: string): string | null {
  const match = address.match(/,\s*([^,]+?)\s+(?:NSW|TAS|VIC|QLD|SA|WA|NT|ACT)\s+\d{4}\s*$/i);
  if (!match) return null;
  return match[1]
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

// Extract state from address string
function extractState(address: string): string | null {
  const match = address.match(/\b(NSW|TAS|VIC|QLD|SA|WA|NT|ACT)\b/i);
  return match ? match[1].toUpperCase() : null;
}

// Format timestamp as required: dd/MM/yyyy hh:mm:ss AM/PM
function formatTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const d = pad(now.getUTCDate());
  const m = pad(now.getUTCMonth() + 1);
  const y = now.getUTCFullYear();
  let h = now.getUTCHours();
  const min = pad(now.getUTCMinutes());
  const sec = pad(now.getUTCSeconds());
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${d}/${m}/${y} ${pad(h)}:${min}:${sec} ${ampm}`;
}

// ── OAuth token (GET per Swagger spec) ───────────────────────
async function getAccessToken(apiKey: string, apiSecret: string): Promise<string> {
  const credentials = btoa(`${apiKey}:${apiSecret}`);
  const res = await fetch(NSW_TOKEN_URL, {
    method: "GET",
    headers: { Authorization: `Basic ${credentials}` },
  });
  if (!res.ok) throw new Error(`Token request failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  if (!data.access_token) throw new Error(`No access_token: ${JSON.stringify(data)}`);
  return data.access_token;
}

// ── Fetch all stations + prices for supported states ─────────
async function fetchFuelData(token: string, apiKey: string) {
  const url = `${NSW_API_BASE}/FuelPriceCheck/v2/fuel/prices/state?state=${encodeURIComponent(STATES_PARAM)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
      apikey: apiKey,
      transactionid: crypto.randomUUID(),
      requesttimestamp: formatTimestamp(),
    },
  });

  // Fall back to the base endpoint if state-filtered endpoint isn't available
  if (res.status === 404 || res.status === 400) {
    console.log(`State endpoint returned ${res.status}, falling back to /fuel/prices`);
    const res2 = await fetch(`${NSW_API_BASE}/FuelPriceCheck/v2/fuel/prices`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
        apikey: apiKey,
        transactionid: crypto.randomUUID(),
        requesttimestamp: formatTimestamp(),
      },
    });
    if (!res2.ok) throw new Error(`Data fetch failed (${res2.status}): ${await res2.text()}`);
    return res2.json();
  }

  if (!res.ok) throw new Error(`Data fetch failed (${res.status}): ${await res.text()}`);
  return res.json();
}

// ── Fetch all DB stations in batches to avoid URL length limits ──
// Splits an array into chunks and runs the callback on each
async function fetchInBatches<T>(
  items: string[],
  batchSize: number,
  fetcher: (batch: string[]) => Promise<T[]>
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const data = await fetcher(batch);
    results.push(...data);
  }
  return results;
}

// ── CORS headers (required for browser-initiated invoke calls) ─
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// ── Main handler ──────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  // Handle CORS preflight — browser sends OPTIONS before the real request
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: CORS });
  }

  const startedAt = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiKey = Deno.env.get("NSW_FUEL_API_KEY")!;
    const apiSecret = Deno.env.get("NSW_FUEL_API_SECRET")!;

    if (!supabaseUrl || !serviceRoleKey || !apiKey || !apiSecret) {
      throw new Error("Missing required environment variables");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Step 1: Get token
    console.log("Fetching NSW API token...");
    const token = await getAccessToken(apiKey, apiSecret);
    console.log("Token OK");

    // Step 2: Fetch all stations + prices
    console.log(`Fetching fuel data for states: ${STATES_PARAM}...`);
    const rawData = await fetchFuelData(token, apiKey);
    const allStations: any[] = rawData.stations ?? [];
    const allPrices: any[] = rawData.prices ?? [];
    console.log(`API returned ${allStations.length} stations, ${allPrices.length} prices`);

    // Step 3: Deduplicate stations by code and filter to supported states
    const seen = new Set<string>();
    const filteredStations = allStations.filter((s: any) => {
      const code = String(s.code);
      if (seen.has(code)) return false;
      seen.add(code);
      // Filter by state extracted from address
      const state = extractState(s.address ?? "");
      return state && SUPPORTED_STATES.has(state);
    });

    console.log(`Stations after dedup + state filter: ${filteredStations.length}`);

    if (filteredStations.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "No stations found for supported states", elapsed_ms: Date.now() - startedAt }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    const filteredCodeSet = new Set(filteredStations.map((s: any) => String(s.code)));

    // Step 4: Upsert station metadata
    const stationRows = filteredStations.map((s: any) => ({
      api_station_id: String(s.code),
      name: s.name,
      brand: s.brand ?? null,
      address: s.address ?? null,
      suburb: extractSuburb(s.address ?? "") ?? null,
      state: extractState(s.address ?? "") ?? null,
      postcode: extractPostcode(s.address ?? "") ?? null,
      lat: s.location?.latitude ?? null,
      lng: s.location?.longitude ?? null,
      updated_at: new Date().toISOString(),
    }));

    // Batch upsert in chunks of 500 to avoid payload limits
    for (let i = 0; i < stationRows.length; i += 500) {
      const batch = stationRows.slice(i, i + 500);
      const { error: upsertError } = await supabase
        .from("stations")
        .upsert(batch, { onConflict: "api_station_id" });
      if (upsertError) throw new Error(`Station upsert: ${upsertError.message}`);
    }
    console.log(`Upserted ${stationRows.length} stations`);

    // Step 5: Get internal DB IDs
    // ── FIX: Fetch ALL stations from DB (no .in() filter) to avoid HTTP/2 stream
    //         error caused by URLs that are too long with 1500+ station IDs.
    //         After upserting, all our stations are guaranteed to be in the DB.
    console.log("Fetching DB station IDs...");
    let dbStations: any[] = [];
    let from = 0;
    const PAGE_SIZE = 1000;

    // Paginate through all DB stations
    while (true) {
      const { data, error: fetchError } = await supabase
        .from("stations")
        .select("id, api_station_id")
        .range(from, from + PAGE_SIZE - 1);

      if (fetchError) throw new Error(`Station fetch: ${fetchError.message}`);
      if (!data || data.length === 0) break;

      dbStations.push(...data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    console.log(`Fetched ${dbStations.length} stations from DB`);

    // Build map: api_station_id → internal DB id (only for our filtered stations)
    const codeToDbId = new Map<string, number>();
    for (const s of dbStations) {
      if (filteredCodeSet.has(String(s.api_station_id))) {
        codeToDbId.set(String(s.api_station_id), s.id);
      }
    }

    console.log(`Mapped ${codeToDbId.size} stations to DB IDs`);

    // Step 6: Build price rows
    // Round timestamp to the top of the current hour so that all three 20-min
    // cron runs within the same hour share an identical recorded_at.
    // The unique index (station_id, fuel_type, recorded_at) then ensures only
    // the FIRST run of each hour inserts — subsequent runs are silently skipped.
    const hourSlot = new Date();
    hourSlot.setUTCMinutes(0, 0, 0);
    const recordedAt = hourSlot.toISOString(); // e.g. "2026-03-28T05:00:00.000Z"

    const priceRows = allPrices
      .filter((p: any) => filteredCodeSet.has(String(p.stationcode)) && codeToDbId.has(String(p.stationcode)))
      .flatMap((p: any) => {
        const ft = FUEL_TYPE_MAP[p.fueltype];
        if (!ft) return [];
        return [{
          station_id: codeToDbId.get(String(p.stationcode)),
          fuel_type: ft,
          price_cents: p.price,
          recorded_at: recordedAt,
        }];
      });

    console.log(`Inserting ${priceRows.length} price records for slot ${recordedAt}...`);

    // Step 7: Upsert prices — ignoreDuplicates skips rows that already exist
    // for this hour slot without throwing an error.
    let inserted = 0;
    let skipped  = 0;
    for (let i = 0; i < priceRows.length; i += 500) {
      const batch = priceRows.slice(i, i + 500);
      const { data, error } = await supabase
        .from("price_history")
        .upsert(batch, { onConflict: "station_id,fuel_type,recorded_at", ignoreDuplicates: true })
        .select("station_id");
      if (error) throw new Error(`Price upsert: ${error.message}`);
      inserted += data?.length ?? 0;
      skipped  += batch.length - (data?.length ?? 0);
    }
    console.log(`Prices: ${inserted} inserted, ${skipped} skipped (already recorded this hour)`);

    const elapsed = Date.now() - startedAt;
    console.log(`Done: ${stationRows.length} stations, ${inserted} prices in ${elapsed}ms`);

    return new Response(
      JSON.stringify({
        ok: true,
        states: [...SUPPORTED_STATES],
        stations_upserted: stationRows.length,
        prices_inserted: inserted,
        elapsed_ms: elapsed,
      }),
      { headers: { "Content-Type": "application/json", ...CORS } }
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Error:", message);
    return new Response(
      JSON.stringify({ ok: false, error: message, elapsed_ms: Date.now() - startedAt }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS } }
    );
  }
});
