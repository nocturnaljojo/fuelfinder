// ── Fuel types ────────────────────────────────────────────────
export type FuelType =
  | "U91"
  | "E10"
  | "P95"
  | "P98"
  | "Diesel"
  | "Premium Diesel"
  | "LPG";

export const FUEL_TYPES: FuelType[] = [
  "U91", "E10", "P95", "P98", "Diesel", "Premium Diesel", "LPG",
];

// ── Sort modes ────────────────────────────────────────────────
export type SortMode = "distance" | "price";

// ── Station with current price ────────────────────────────────
export interface Station {
  id: number;
  station_id: number;
  api_station_id: number;
  name: string;
  brand: string | null;
  address: string | null;
  suburb: string | null;
  postcode: string | null;
  lat: number;
  lng: number;
  fuel_type: FuelType;
  price_cents: number;      // e.g. 229.9 (cents per litre)
  recorded_at: string;      // ISO timestamp
  // Client-computed
  distance_km?: number;
}

// ── Stats bar data ────────────────────────────────────────────
export interface FuelStats {
  cheapest: number;
  average: number;
  dearest: number;
  spread: number;
}

// ── Supabase row from current_prices view ────────────────────
export interface CurrentPriceRow {
  id: number;
  station_id: number;
  api_station_id: number;
  fuel_type: string;
  price_cents: number;
  recorded_at: string;
  name: string;
  brand: string | null;
  address: string | null;
  suburb: string | null;
  postcode: string | null;
  lat: number;
  lng: number;
}
