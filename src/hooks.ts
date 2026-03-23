import { useState, useEffect, useCallback, useMemo } from "react";
import { useUser } from "@clerk/clerk-react";
import { supabase } from "./supabaseClient";
import type { Station, FuelType, FuelStats, CurrentPriceRow } from "./types/fuel";

// ── Preset locations ──────────────────────────────────────────
export type LocationPreset = {
  name:   string;
  lat:    number;
  lng:    number;
  state:  string;   // top-level collapsible — "ACT" | "NSW" | "TAS" …
  region: string;   // non-interactive divider label within the state
};

// States shown in order — add new states here as coverage expands
export const PRESET_STATES: { code: string; label: string; icon: string }[] = [
  { code: "ACT", label: "Australian Capital Territory", icon: "🏛️" },
  { code: "NSW", label: "New South Wales",              icon: "💙" },
  { code: "TAS", label: "Tasmania",                    icon: "🍎" },
];

export const PRESET_LOCATIONS: LocationPreset[] = [
  // ── ACT ─────────────────────────────────────────────────────
  { name: "Canberra CBD",  lat: -35.2809, lng: 149.1300, state: "ACT", region: "Canberra" },
  { name: "Belconnen",     lat: -35.2350, lng: 149.0680, state: "ACT", region: "Canberra" },
  { name: "Gungahlin",     lat: -35.1833, lng: 149.1333, state: "ACT", region: "Canberra" },
  { name: "Woden",         lat: -35.3475, lng: 149.0860, state: "ACT", region: "Canberra" },
  { name: "Tuggeranong",   lat: -35.4244, lng: 149.0690, state: "ACT", region: "Canberra" },
  { name: "Queanbeyan",    lat: -35.3533, lng: 149.2344, state: "ACT", region: "Queanbeyan–Palerang" },

  // ── NSW ─────────────────────────────────────────────────────
  { name: "Yass",          lat: -34.8433, lng: 148.9097, state: "NSW", region: "Southern Tablelands" },
  { name: "Goulburn",      lat: -34.7533, lng: 149.7183, state: "NSW", region: "Southern Tablelands" },
  { name: "Braidwood",     lat: -35.4500, lng: 149.8000, state: "NSW", region: "Southern Tablelands" },

  { name: "Cooma",         lat: -36.2358, lng: 149.1247, state: "NSW", region: "Snowy Mountains" },
  { name: "Jindabyne",     lat: -36.4167, lng: 148.6333, state: "NSW", region: "Snowy Mountains" },

  { name: "Batemans Bay",  lat: -35.7083, lng: 150.1742, state: "NSW", region: "South Coast" },
  { name: "Nowra",         lat: -34.8833, lng: 150.6000, state: "NSW", region: "South Coast" },
  { name: "Ulladulla",     lat: -35.3607, lng: 150.4729, state: "NSW", region: "South Coast" },

  // ── TAS ─────────────────────────────────────────────────────
  { name: "Hobart",        lat: -42.8821, lng: 147.3272, state: "TAS", region: "Greater Hobart" },
  { name: "Launceston",    lat: -41.4332, lng: 147.1441, state: "TAS", region: "Northern Tasmania" },
  { name: "Devonport",     lat: -41.1803, lng: 146.3497, state: "TAS", region: "Northern Tasmania" },
  { name: "Burnie",        lat: -41.0553, lng: 145.9041, state: "TAS", region: "Northern Tasmania" },
];

// Parliament House — default GPS fallback
const PARLIAMENT_HOUSE: [number, number] = [-35.3082, 149.1244];

// ── Haversine distance (km) ───────────────────────────────────
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── useGeolocation ────────────────────────────────────────────
export function useGeolocation() {
  const [coords, setCoords] = useState<[number, number]>(PARLIAMENT_HOUSE);
  const [isDefault, setIsDefault] = useState(true);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords([pos.coords.latitude, pos.coords.longitude]);
        setIsDefault(false);
      },
      () => { setIsDefault(true); },
      { timeout: 8000 }
    );
  }, []);

  return { coords, isDefault };
}

// ── useStations ───────────────────────────────────────────────
export function useStations(
  fuelType: FuelType,
  userCoords: [number, number],
  radiusKm: number | null = null
) {
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchStations = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase
      .from("current_prices")
      .select("*")
      .eq("fuel_type", fuelType)
      .order("price_cents", { ascending: true });

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    const rows = (data as CurrentPriceRow[]) ?? [];
    const [userLat, userLng] = userCoords;

    const enriched: Station[] = rows
      .map((row) => ({
        ...row,
        fuel_type: row.fuel_type as FuelType,
        distance_km: haversine(userLat, userLng, row.lat, row.lng),
      }))
      .filter((s) => radiusKm === null || s.distance_km! <= radiusKm);

    setStations(enriched);
    setLastRefresh(new Date());
    setLoading(false);
  }, [fuelType, userCoords, radiusKm]);

  useEffect(() => { fetchStations(); }, [fetchStations]);

  useEffect(() => {
    const interval = setInterval(fetchStations, 20 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchStations]);

  return { stations, loading, error, lastRefresh, refetch: fetchStations };
}

// ── usePriceHistory + last-changed ───────────────────────────
// Returns how stale a price is (hours since recorded_at)
export function getPriceAgeHours(recordedAt: string): number {
  return (Date.now() - new Date(recordedAt).getTime()) / 1000 / 60 / 60;
}

// Freshness label + colour based on age
export function getFreshness(ageHours: number): { label: string; color: string; warning: boolean } {
  if (ageHours < 6)  return { label: "Fresh",        color: "#22c55e", warning: false };
  if (ageHours < 24) return { label: "Recent",        color: "#f59e0b", warning: false };
  if (ageHours < 48) return { label: "Getting stale", color: "#f97316", warning: true  };
  return               { label: "Possibly closed",  color: "#ef4444", warning: true  };
}

// ── usePriceHistory ───────────────────────────────────────────
export interface PricePoint {
  date: string;       // "2024-03-22"
  label: string;      // "22 Mar"
  price: number;      // cents
}

export function usePriceHistory(stationId: number | null, fuelType: string) {
  const [history, setHistory]               = useState<PricePoint[]>([]);
  const [loading, setLoading]               = useState(false);
  const [lastChangedAt, setLastChangedAt]   = useState<string | null>(null);
  const [unchangedHours, setUnchangedHours] = useState<number | null>(null);

  useEffect(() => {
    if (!stationId) return;
    setLoading(true);
    setLastChangedAt(null);
    setUnchangedHours(null);

    const since = new Date();
    since.setDate(since.getDate() - 90);

    supabase
      .from("price_history")
      .select("price_cents, recorded_at")
      .eq("station_id", stationId)
      .eq("fuel_type", fuelType)
      .gte("recorded_at", since.toISOString())
      .order("recorded_at", { ascending: true })
      .then(({ data }) => {
        const rows = data ?? [];

        // Extract price-change events — only emit a point when the price changes.
        // Then add a synthetic "today" endpoint so the line always extends to now.
        // This gives a meaningful chart even when the cron has only run for a few days,
        // or when a station's price rarely changes.
        const dayFmt = (iso: string) =>
          new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString([], {
            day: "numeric", month: "short",
          });

        const changeEvents: PricePoint[] = [];
        let lastPrice: number | null = null;
        for (const row of rows) {
          if (row.price_cents !== lastPrice) {
            changeEvents.push({
              date:  row.recorded_at.slice(0, 10),
              price: row.price_cents,
              label: dayFmt(row.recorded_at),
            });
            lastPrice = row.price_cents;
          }
        }

        // Extend to today if the last change was not today
        const today = new Date().toISOString().slice(0, 10);
        if (changeEvents.length > 0 && changeEvents[changeEvents.length - 1].date !== today) {
          changeEvents.push({
            date:  today,
            price: changeEvents[changeEvents.length - 1].price,
            label: "Today",
          });
        }

        setHistory(changeEvents);

        // Find when price last CHANGED — walk backwards until value differs
        if (rows.length > 0) {
          const currentPrice = rows[rows.length - 1].price_cents;
          // Start from the end; find first row where price differs from current
          let firstRowAtCurrentPrice = rows[rows.length - 1];
          for (let i = rows.length - 2; i >= 0; i--) {
            if (rows[i].price_cents !== currentPrice) break;
            firstRowAtCurrentPrice = rows[i];
          }
          setLastChangedAt(firstRowAtCurrentPrice.recorded_at);
          setUnchangedHours(
            (Date.now() - new Date(firstRowAtCurrentPrice.recorded_at).getTime()) / 1000 / 60 / 60
          );
        }

        setLoading(false);
      });
  }, [stationId, fuelType]);

  return { history, loading, lastChangedAt, unchangedHours };
}

// ── useEngagementGate ─────────────────────────────────────────
// Shows a sign-up prompt after GATE_THRESHOLD station views.
// After dismissing, re-shows after REDISPLAY_AFTER more views.
// Signed-in users never see the gate.
const GATE_THRESHOLD  = 5;   // first trigger
const REDISPLAY_AFTER = 3;   // re-show after this many views post-dismiss

export function useEngagementGate() {
  const { isSignedIn } = useUser();
  const [showGate, setShowGate] = useState(false);

  // Clear gate state when user signs in
  useEffect(() => {
    if (isSignedIn) {
      setShowGate(false);
      localStorage.removeItem("ff_views");
      localStorage.removeItem("ff_gate_dismissed_at");
    }
  }, [isSignedIn]);

  function recordView() {
    if (isSignedIn) return;

    const views       = parseInt(localStorage.getItem("ff_views") ?? "0") + 1;
    const dismissedAt = parseInt(localStorage.getItem("ff_gate_dismissed_at") ?? "0");
    localStorage.setItem("ff_views", String(views));

    if (views >= GATE_THRESHOLD) {
      if (dismissedAt === 0 || views >= dismissedAt + REDISPLAY_AFTER) {
        setShowGate(true);
      }
    }
  }

  function dismissGate() {
    const views = parseInt(localStorage.getItem("ff_views") ?? "0");
    localStorage.setItem("ff_gate_dismissed_at", String(views));
    setShowGate(false);
  }

  return { showGate, recordView, dismissGate };
}

// ── useFuelTrends ─────────────────────────────────────────────
// Fetches daily average prices per fuel type from price_history.
// Calls the avg_price_by_fuel_daily RPC function.
export interface FuelTrendRow {
  date_key:  string;   // "2026-02-15"
  fuel_type: string;
  avg_price: number;
}

// A single data point in the recharts-friendly format
export interface TrendPoint {
  date:  string;   // "2026-02-15"
  label: string;   // "15 Feb"
  [fuel: string]: number | string;  // e.g. { U91: 239.9, Diesel: 212.0 }
}

export function useFuelTrends(daysBack: number = 90) {
  const [points, setPoints]   = useState<TrendPoint[]>([]);
  const [fuels, setFuels]     = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    supabase
      .rpc("avg_price_by_fuel_daily", { days_back: daysBack })
      .then(({ data, error }) => {
        if (error || !data || data.length === 0) {
          setPoints([]);
          setFuels([]);
          setLoading(false);
          return;
        }

        const rows = data as FuelTrendRow[];

        // Build recharts-friendly structure: one entry per day
        const byDate = new Map<string, TrendPoint>();
        const fuelSet = new Set<string>();

        for (const row of rows) {
          fuelSet.add(row.fuel_type);
          if (!byDate.has(row.date_key)) {
            byDate.set(row.date_key, {
              date:  row.date_key,
              label: new Date(row.date_key + "T12:00:00").toLocaleDateString([], {
                day: "numeric", month: "short",
              }),
            });
          }
          byDate.get(row.date_key)![row.fuel_type] = Number(row.avg_price);
        }

        setPoints([...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)));
        // Sort fuels by typical price order
        const fuelOrder = ["U91","E10","P95","P98","Diesel","Premium Diesel","LPG"];
        setFuels([...fuelSet].sort((a, b) => fuelOrder.indexOf(a) - fuelOrder.indexOf(b)));
        setLoading(false);
      });
  }, [daysBack]);

  return { points, fuels, loading };
}

// ── useFavourites ─────────────────────────────────────────────
// Syncs a user's starred stations with Supabase.
// Works with Clerk user IDs stored as plain TEXT in favourite_stations.
export function useFavourites(stations: Station[]) {
  const { user, isSignedIn } = useUser();
  const [favouriteIds, setFavouriteIds] = useState<Set<number>>(new Set());

  // Load favourites whenever sign-in state changes
  useEffect(() => {
    if (!isSignedIn || !user?.id) {
      setFavouriteIds(new Set());
      return;
    }
    supabase
      .from("favourite_stations")
      .select("station_id")
      .eq("user_id", user.id)
      .then(({ data }) => {
        setFavouriteIds(
          new Set((data ?? []).map((r: { station_id: number }) => r.station_id))
        );
      });
  }, [isSignedIn, user?.id]);

  // Optimistic toggle — updates UI immediately, then syncs to Supabase
  const toggleFavourite = useCallback(
    async (stationId: number) => {
      if (!isSignedIn || !user?.id) return;
      const isFav = favouriteIds.has(stationId);
      if (isFav) {
        setFavouriteIds(prev => { const n = new Set(prev); n.delete(stationId); return n; });
        await supabase
          .from("favourite_stations")
          .delete()
          .eq("user_id", user.id)
          .eq("station_id", stationId);
      } else {
        setFavouriteIds(prev => new Set([...prev, stationId]));
        await supabase
          .from("favourite_stations")
          .insert({ user_id: user.id, station_id: stationId });
      }
    },
    [isSignedIn, user?.id, favouriteIds]
  );

  // Full Station objects for the current result set that are favourited
  const favouriteStations = useMemo(
    () => stations.filter(s => favouriteIds.has(s.station_id)),
    [stations, favouriteIds]
  );

  return { favouriteIds, favouriteStations, toggleFavourite };
}

// ── useCheapestAndPriciest ────────────────────────────────────
export function useCheapestAndPriciest(stations: Station[]) {
  const sorted = [...stations].sort((a, b) => a.price_cents - b.price_cents);
  return {
    cheapest: sorted.slice(0, 5),
    priciest: sorted.slice(-5).reverse(),
  };
}

// ── useFuelStats ──────────────────────────────────────────────
export function useFuelStats(stations: Station[]): FuelStats | null {
  if (stations.length === 0) return null;
  const prices = stations.map((s) => s.price_cents);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  return {
    cheapest: min,
    average: Math.round(avg * 10) / 10,
    dearest: max,
    spread: Math.round((max - min) * 10) / 10,
  };
}
