// ============================================================
// FuelFinder Canberra — Supabase Edge Function
// Name: refresh-fuel-prices
// Runtime: Deno (TypeScript)
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── ACT postcodes ────────────────────────────────────────────
const ACT_POSTCODES = new Set([
  "2600", "2601", "2602", "2603", "2604", "2605", "2606", "2607",
  "2608", "2609", "2610", "2611", "2612", "2613", "2614", "2615",
  "2616", "2617", "2618", "2619", "2620",
  "2900", "2901", "2902", "2903", "2904", "2905", "2906", "2907",
  "2908", "2909", "2910", "2911", "2912", "2913", "2914",
]);

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

// ── Fetch all stations + prices ───────────────────────────────
// Correct path: /FuelPriceCheck/v2/fuel/prices
async function fetchFuelData(token: string, apiKey: string) {
  const res = await fetch(`${NSW_API_BASE}/FuelPriceCheck/v2/fuel/prices`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
      apikey: apiKey,
      transactionid: crypto.randomUUID(),
      requesttimestamp: formatTimestamp(),
    },
  });
  if (!res.ok) throw new Error(`Data fetch failed (${res.status}): ${await res.text()}`);
  return res.json();
}

// ── Main handler ──────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
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
    console.log("Fetching fuel data...");
    const { stations, prices } = await fetchFuelData(token, apiKey);
    console.log(`API returned ${stations.length} stations, ${prices.length} prices`);

    // Step 3: Filter to ACT by parsing postcode from address
    // Station join key = station.code (prices use stationcode to match)
    const actStations = stations.filter((s: any) => {
      const pc = extractPostcode(s.address ?? "");
      return pc && ACT_POSTCODES.has(pc);
    });
    const actCodeSet = new Set(actStations.map((s: any) => String(s.code)));
    console.log(`ACT stations found: ${actStations.length}`);

    if (actStations.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "No ACT stations found", elapsed_ms: Date.now() - startedAt }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Step 4: Upsert station metadata (use code as api_station_id)
    const stationRows = actStations.map((s: any) => ({
      api_station_id: String(s.code),
      name: s.name,
      brand: s.brand ?? null,
      address: s.address ?? null,
      suburb: null, // not provided by API, parse from address if needed
      postcode: extractPostcode(s.address ?? "") ?? null,
      lat: s.location?.latitude ?? null,
      lng: s.location?.longitude ?? null,
      updated_at: new Date().toISOString(),
    }));

    const { error: upsertError } = await supabase
      .from("stations")
      .upsert(stationRows, { onConflict: "api_station_id" });
    if (upsertError) throw new Error(`Station upsert: ${upsertError.message}`);
    console.log(`Upserted ${stationRows.length} stations`);

    // Step 5: Get internal DB IDs
    const { data: dbStations, error: fetchError } = await supabase
      .from("stations")
      .select("id, api_station_id")
      .in("api_station_id", actStations.map((s: any) => String(s.code)));
    if (fetchError) throw new Error(`Station fetch: ${fetchError.message}`);

    const codeToDbId = new Map<string, number>(
      (dbStations ?? []).map((s: any) => [s.api_station_id, s.id])
    );

    // Step 6: Build price rows (prices join via stationcode → station.code)
    const now = new Date().toISOString();
    const priceRows = prices
      .filter((p: any) => actCodeSet.has(String(p.stationcode)) && codeToDbId.has(String(p.stationcode)))
      .flatMap((p: any) => {
        const ft = FUEL_TYPE_MAP[p.fueltype];
        if (!ft) return [];
        return [{ station_id: codeToDbId.get(String(p.stationcode)), fuel_type: ft, price_cents: p.price, recorded_at: now }];
      });
    console.log(`Inserting ${priceRows.length} price records...`);

    // Step 7: Batch insert
    let inserted = 0;
    for (let i = 0; i < priceRows.length; i += 500) {
      const { error } = await supabase.from("price_history").insert(priceRows.slice(i, i + 500));
      if (error) throw new Error(`Price insert: ${error.message}`);
      inserted += Math.min(500, priceRows.length - i);
    }

    const elapsed = Date.now() - startedAt;
    console.log(`Done: ${inserted} prices in ${elapsed}ms`);

    return new Response(
      JSON.stringify({ ok: true, stations_upserted: stationRows.length, prices_inserted: inserted, elapsed_ms: elapsed }),
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Error:", message);
    return new Response(
      JSON.stringify({ ok: false, error: message, elapsed_ms: Date.now() - startedAt }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
