import { useState, useMemo } from "react";
import {
  useGeolocation,
  useStations,
  useCheapestAndPriciest,
  useFuelStats,
  PRESET_LOCATIONS,
} from "./hooks";
import { FUEL_TYPES } from "./types/fuel";
import type { FuelType, SortMode, Station } from "./types/fuel";
import FuelMap from "./FuelMap";
import StationSheet from "./StationSheet";
import "./App.css";

// ── Helpers ───────────────────────────────────────────────────
function formatPrice(cents: number) { return `${cents.toFixed(1)}¢`; }
function formatDistance(km: number | undefined) {
  if (km === undefined) return "–";
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}
function priceColor(price: number, min: number, max: number) {
  if (max === min) return "#22c55e";
  const r = (price - min) / (max - min);
  if (r < 0.33) return "#22c55e";
  if (r < 0.66) return "#f59e0b";
  return "#ef4444";
}

// Parse "suburb STATE" from address string e.g. "123 Main St, FYSHWICK ACT 2609" → "Fyshwick · ACT"
function parseSuburbState(address: string | null): string {
  if (!address) return "";
  const parts = address.split(",");
  const last = parts[parts.length - 1].trim();
  // Remove postcode (4 digits at end)
  const withoutPostcode = last.replace(/\s*\d{4}\s*$/, "").trim();
  // Split into suburb and state
  const words = withoutPostcode.split(/\s+/);
  const state = words[words.length - 1];
  const suburb = words.slice(0, -1).map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
  return suburb && state ? `${suburb} · ${state}` : withoutPostcode;
}

// Brand badge — colored circle with brand initial
const BRAND_COLORS: Record<string, { bg: string; text: string }> = {
  "BP":              { bg: "#00A651", text: "#fff" },
  "Ampol":           { bg: "#E8002D", text: "#fff" },
  "Caltex":          { bg: "#E8002D", text: "#fff" },
  "Shell":           { bg: "#FFD500", text: "#d00" },
  "7-Eleven":        { bg: "#F7702A", text: "#fff" },
  "Coles Express":   { bg: "#E2001A", text: "#fff" },
  "United":          { bg: "#003087", text: "#fff" },
  "Liberty":         { bg: "#0057A8", text: "#fff" },
  "Metro":           { bg: "#6B21A8", text: "#fff" },
  "Puma":            { bg: "#1D1D1B", text: "#FFD700" },
  "Mobil":           { bg: "#0033A0", text: "#fff" },
  "EG Ampol":        { bg: "#E8002D", text: "#fff" },
  "Costco":          { bg: "#005DAA", text: "#fff" },
  "FTR":             { bg: "#374151", text: "#fff" },
};

function BrandBadge({ brand }: { brand: string | null }) {
  const key = Object.keys(BRAND_COLORS).find(k => brand?.includes(k)) ?? "";
  const colors = BRAND_COLORS[key] ?? { bg: "#374151", text: "#fff" };
  const initial = (brand ?? "?").charAt(0).toUpperCase();
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 28, height: 28, borderRadius: "50%",
      background: colors.bg, color: colors.text,
      fontSize: 12, fontWeight: 700, flexShrink: 0,
    }}>{initial}</span>
  );
}

// ── StatsBar ──────────────────────────────────────────────────
function StatsBar({ stats }: { stats: ReturnType<typeof useFuelStats> }) {
  if (!stats) return <div className="stats-bar">Loading stats...</div>;
  return (
    <div className="stats-bar">
      <div className="stat"><span className="stat-label">Cheapest</span><span className="stat-value green">{formatPrice(stats.cheapest)}</span></div>
      <div className="stat"><span className="stat-label">Average</span><span className="stat-value">{formatPrice(stats.average)}</span></div>
      <div className="stat"><span className="stat-label">Dearest</span><span className="stat-value red">{formatPrice(stats.dearest)}</span></div>
      <div className="stat"><span className="stat-label">Spread</span><span className="stat-value">{formatPrice(stats.spread)}</span></div>
    </div>
  );
}

// ── Leaderboard ───────────────────────────────────────────────
function Leaderboard({ title, stations, min, max, onSelect }: {
  title: string; stations: Station[]; min: number; max: number;
  onSelect: (s: Station) => void;
}) {
  return (
    <div className="leaderboard">
      <h3>{title}</h3>
      {stations.map((s, i) => (
        <div key={s.id} className="lb-row" onClick={() => onSelect(s)} style={{ cursor: "pointer" }}>
          <span className="lb-rank">#{i + 1}</span>
          <BrandBadge brand={s.brand} />
          <span className="lb-info">
            <span className="lb-name">{s.name}</span>
            <span className="lb-suburb">{parseSuburbState(s.address)}</span>
          </span>
          <span className="lb-price" style={{ color: priceColor(s.price_cents, min, max) }}>
            {formatPrice(s.price_cents)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── StationRow ────────────────────────────────────────────────
function StationRow({ station, min, max, onSelect }: {
  station: Station; min: number; max: number; onSelect: (s: Station) => void;
}) {
  return (
    <div className="station-row" onClick={() => onSelect(station)}>
      <div className="station-info">
        <span className="station-name">{station.name}</span>
        <span className="station-meta">{station.brand ?? ""}{station.postcode ? ` · ${station.postcode}` : ""}</span>
      </div>
      <div className="station-right">
        <span className="station-price" style={{ color: priceColor(station.price_cents, min, max) }}>
          {formatPrice(station.price_cents)}
        </span>
        <span className="station-dist">{formatDistance(station.distance_km)}</span>
      </div>
    </div>
  );
}

// ── Radius options ────────────────────────────────────────────
const RADIUS_OPTIONS: { label: string; value: number | null }[] = [
  { label: "5km",  value: 5  },
  { label: "10km", value: 10 },
  { label: "25km", value: 25 },
  { label: "50km", value: 50 },
  { label: "All",  value: null },
];

// ── App ───────────────────────────────────────────────────────
export default function App() {
  const [fuelType, setFuelType]     = useState<FuelType>("U91");
  const [sortMode, setSortMode]     = useState<SortMode>("distance");
  const [radiusKm, setRadiusKm]     = useState<number | null>(25);
  const [locationName, setLocationName]   = useState("My Location");
  const [manualCoords, setManualCoords]   = useState<[number, number] | null>(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);

  const { coords: gpsCoords, isDefault } = useGeolocation();
  const coords: [number, number] = manualCoords ?? gpsCoords;
  const [userLat, userLng] = coords;

  // All fuel types — needed to show full price list in station sheet
  const { stations: allStations } = useStations("U91",           coords, radiusKm);
  const { stations: e10 }         = useStations("E10",           coords, radiusKm);
  const { stations: p95 }         = useStations("P95",           coords, radiusKm);
  const { stations: p98 }         = useStations("P98",           coords, radiusKm);
  const { stations: diesel }      = useStations("Diesel",        coords, radiusKm);
  const { stations: premDiesel }  = useStations("Premium Diesel",coords, radiusKm);
  const { stations: lpg }         = useStations("LPG",           coords, radiusKm);

  const { stations, loading, error, lastRefresh, refetch } = useStations(fuelType, coords, radiusKm);

  const { cheapest, priciest } = useCheapestAndPriciest(stations);
  const stats = useFuelStats(stations);

  const prices = stations.map((s) => s.price_cents);
  const min = prices.length ? Math.min(...prices) : 0;
  const max = prices.length ? Math.max(...prices) : 0;

  const sorted = useMemo(() => {
    const copy = [...stations];
    copy.sort((a, b) =>
      sortMode === "distance"
        ? (a.distance_km ?? 999) - (b.distance_km ?? 999)
        : a.price_cents - b.price_cents
    );
    return copy;
  }, [stations, sortMode]);

  // All fuel prices for the selected station (for bottom sheet)
  const allFuelForSelected = useMemo(() => {
    if (!selectedStation) return [];
    const allRows = [...allStations, ...e10, ...p95, ...p98, ...diesel, ...premDiesel, ...lpg];
    return allRows.filter((s) => s.station_id === selectedStation.station_id);
  }, [selectedStation, allStations, e10, p95, p98, diesel, premDiesel, lpg]);

  function handleSelectStation(s: Station) {
    setSelectedStation(s);
    setShowLocationPicker(false);
  }

  function selectGPS() {
    setManualCoords(null);
    setLocationName("My Location");
    setShowLocationPicker(false);
  }

  function selectPreset(preset: typeof PRESET_LOCATIONS[0]) {
    setManualCoords([preset.lat, preset.lng]);
    setLocationName(preset.name);
    setShowLocationPicker(false);
    if (preset.region === "Regional NSW" || preset.region === "Tasmania") setRadiusKm(50);
  }

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header">
        <div className="header-left">
          <h1>FuelFinder</h1>
          <span className="header-sub">Canberra</span>
        </div>
        <div className="header-right">
          <div className="location-picker">
            <button className="location-btn" onClick={() => setShowLocationPicker((v) => !v)}>
              📍 {locationName}{manualCoords === null && isDefault ? " (default)" : ""}
            </button>
            {showLocationPicker && (
              <div className="location-dropdown">
                <button className="location-option gps-option" onClick={selectGPS}>🛰 Use My GPS Location</button>
                <div className="location-group-label">ACT</div>
                {PRESET_LOCATIONS.filter((p) => p.region === "ACT").map((p) => (
                  <button key={p.name} className="location-option" onClick={() => selectPreset(p)}>{p.name}</button>
                ))}
                <div className="location-group-label">Regional NSW</div>
                {PRESET_LOCATIONS.filter((p) => p.region === "Regional NSW").map((p) => (
                  <button key={p.name} className="location-option" onClick={() => selectPreset(p)}>{p.name}</button>
                ))}
                <div className="location-group-label">Tasmania</div>
                {PRESET_LOCATIONS.filter((p) => p.region === "Tasmania").map((p) => (
                  <button key={p.name} className="location-option" onClick={() => selectPreset(p)}>{p.name}</button>
                ))}
              </div>
            )}
          </div>
          <button className="refresh-btn" onClick={refetch} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          {lastRefresh && (
            <span className="last-refresh">
              Updated {lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
      </header>

      {/* ── Fuel type filter ── */}
      <div className="fuel-filters">
        {FUEL_TYPES.map((ft) => (
          <button key={ft} className={`fuel-pill ${fuelType === ft ? "active" : ""}`} onClick={() => setFuelType(ft)}>
            {ft}
          </button>
        ))}
      </div>

      {/* ── Radius filter ── */}
      <div className="radius-filters">
        <span className="radius-label">Within:</span>
        {RADIUS_OPTIONS.map((r) => (
          <button key={r.label} className={`radius-pill ${radiusKm === r.value ? "active" : ""}`} onClick={() => setRadiusKm(r.value)}>
            {r.label}
          </button>
        ))}
      </div>

      {/* ── Stats bar ── */}
      <StatsBar stats={stats} />
      {error && <div className="error-banner">Error: {error}</div>}

      {/* ── Map ── */}
      <div className="map-container">
        <FuelMap
          stations={stations}
          userLat={userLat}
          userLng={userLng}
          onSelectStation={handleSelectStation}
        />
      </div>

      {/* ── Leaderboards ── */}
      <div className="leaderboards">
        <Leaderboard title="Top 5 Cheapest" stations={cheapest} min={min} max={max} onSelect={handleSelectStation} />
        <Leaderboard title="Top 5 Dearest"  stations={priciest}  min={min} max={max} onSelect={handleSelectStation} />
      </div>

      {/* ── Sort + station list ── */}
      <div className="list-section">
        <div className="sort-controls">
          <span className="sort-label">Sort by:</span>
          <button className={`sort-btn ${sortMode === "distance" ? "active" : ""}`} onClick={() => setSortMode("distance")}>Nearest</button>
          <button className={`sort-btn ${sortMode === "price" ? "active" : ""}`}    onClick={() => setSortMode("price")}>Cheapest</button>
        </div>
        <div className="station-count">{!loading && <span>{sorted.length} station{sorted.length !== 1 ? "s" : ""} found</span>}</div>
        {loading && <div className="loading">Loading stations...</div>}
        <div className="station-list">
          {sorted.map((s) => (
            <StationRow key={s.id} station={s} min={min} max={max} onSelect={handleSelectStation} />
          ))}
          {!loading && sorted.length === 0 && (
            <div className="empty">No {fuelType} prices found. Try expanding the radius or selecting a different location.</div>
          )}
        </div>
      </div>

      {/* ── Station bottom sheet ── */}
      <StationSheet
        station={selectedStation}
        allStationsForStation={allFuelForSelected}
        onClose={() => setSelectedStation(null)}
      />
    </div>
  );
}
