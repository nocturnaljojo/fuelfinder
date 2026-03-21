import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabaseClient";
import type { Station, FuelType, FuelStats, CurrentPriceRow } from "./types/fuel";

// ── Preset locations ──────────────────────────────────────────
export type LocationPreset = {
  name: string;
  lat: number;
  lng: number;
  region: "ACT" | "Regional NSW" | "Tasmania";
};

export const PRESET_LOCATIONS: LocationPreset[] = [
  // ACT
  { name: "Canberra CBD",   lat: -35.2809, lng: 149.1300, region: "ACT" },
  { name: "Belconnen",      lat: -35.2350, lng: 149.0680, region: "ACT" },
  { name: "Gungahlin",      lat: -35.1833, lng: 149.1333, region: "ACT" },
  { name: "Woden",          lat: -35.3475, lng: 149.0860, region: "ACT" },
  { name: "Tuggeranong",    lat: -35.4244, lng: 149.0690, region: "ACT" },
  { name: "Queanbeyan",     lat: -35.3533, lng: 149.2344, region: "ACT" },
  // Regional NSW
  { name: "Yass",           lat: -34.8433, lng: 148.9097, region: "Regional NSW" },
  { name: "Goulburn",       lat: -34.7533, lng: 149.7183, region: "Regional NSW" },
  { name: "Cooma",          lat: -36.2358, lng: 149.1247, region: "Regional NSW" },
  { name: "Batemans Bay",   lat: -35.7083, lng: 150.1742, region: "Regional NSW" },
  // Tasmania
  { name: "Hobart",         lat: -42.8821, lng: 147.3272, region: "Tasmania" },
  { name: "Launceston",     lat: -41.4332, lng: 147.1441, region: "Tasmania" },
  { name: "Devonport",      lat: -41.1803, lng: 146.3497, region: "Tasmania" },
  { name: "Burnie",         lat: -41.0553, lng: 145.9041, region: "Tasmania" },
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

// ── usePriceHistory ───────────────────────────────────────────
export interface PricePoint {
  date: string;       // "2024-03-22"
  label: string;      // "22 Mar"
  price: number;      // cents
}

export function usePriceHistory(stationId: number | null, fuelType: string) {
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!stationId) return;
    setLoading(true);

    const since = new Date();
    since.setDate(since.getDate() - 30);

    supabase
      .from("price_history")
      .select("price_cents, recorded_at")
      .eq("station_id", stationId)
      .eq("fuel_type", fuelType)
      .gte("recorded_at", since.toISOString())
      .order("recorded_at", { ascending: true })
      .then(({ data }) => {
        // Group by day — keep last reading of each day
        const byDay = new Map<string, number>();
        for (const row of data ?? []) {
          const day = row.recorded_at.slice(0, 10);
          byDay.set(day, row.price_cents);
        }
        setHistory(
          [...byDay.entries()].map(([date, price]) => ({
            date,
            price,
            label: new Date(date + "T12:00:00").toLocaleDateString([], {
              day: "numeric", month: "short",
            }),
          }))
        );
        setLoading(false);
      });
  }, [stationId, fuelType]);

  return { history, loading };
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
