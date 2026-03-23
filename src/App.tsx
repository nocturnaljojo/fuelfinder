import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { SignInButton, SignedIn, SignedOut, UserButton } from "@clerk/clerk-react";
import {
  useGeolocation,
  useStations,
  useCheapestAndPriciest,
  useFuelStats,
  useEngagementGate,
  useFavourites,
  getPriceAgeHours,
  getFreshness,
} from "./hooks";
import { FUEL_TYPES } from "./types/fuel";
import type { FuelType, Station } from "./types/fuel";
import FuelMap from "./FuelMap";
import StationSheet from "./StationSheet";
import AboutModal from "./AboutModal";
import FeedbackModal from "./FeedbackModal";
import ChartsModal from "./ChartsModal";
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
function parseSuburbState(address: string | null): string {
  if (!address) return "";
  const parts = address.split(",");
  const last = parts[parts.length - 1].trim();
  const withoutPostcode = last.replace(/\s*\d{4}\s*$/, "").trim();
  const words = withoutPostcode.split(/\s+/);
  const state = words[words.length - 1];
  const suburb = words.slice(0, -1).map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
  return suburb && state ? `${suburb} · ${state}` : withoutPostcode;
}

// ── Nominatim result type ─────────────────────────────────────
interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  address: {
    suburb?:    string;
    town?:      string;
    city?:      string;
    village?:   string;
    state?:     string;
    postcode?:  string;
  };
}

const STATE_ABBR: Record<string, string> = {
  "Australian Capital Territory": "ACT",
  "New South Wales":              "NSW",
  "Victoria":                     "VIC",
  "Queensland":                   "QLD",
  "South Australia":              "SA",
  "Western Australia":            "WA",
  "Tasmania":                     "TAS",
  "Northern Territory":           "NT",
};

// Distinct colours per state — high contrast on dark background
const STATE_COLORS: Record<string, { bg: string; text: string }> = {
  "ACT": { bg: "#1d6fa4", text: "#fff" },
  "NSW": { bg: "#0d3f6e", text: "#fff" },
  "VIC": { bg: "#4a1a6e", text: "#fff" },
  "QLD": { bg: "#7b1c31", text: "#fff" },
  "SA":  { bg: "#b84300", text: "#fff" },
  "WA":  { bg: "#7a6200", text: "#ffe" },
  "TAS": { bg: "#005c3b", text: "#fff" },
  "NT":  { bg: "#7a3200", text: "#fff" },
};

function formatNominatim(r: NominatimResult): {
  name: string; abbr: string; postcode: string; area: string;
} {
  const parts = r.display_name.split(",").map(s => s.trim());
  const name  = parts[0];

  // Try structured address.state first, then walk display_name backwards for a known state
  const stateRaw = r.address?.state
    ?? parts.slice(1).reverse().find(p => STATE_ABBR[p] !== undefined)
    ?? "";
  const abbr     = STATE_ABBR[stateRaw] || stateRaw.toUpperCase().slice(0, 3);
  const postcode = r.address?.postcode ?? "";

  // Contextual area — first part of display_name that isn't the suburb or state
  const candidates = [
    r.address?.suburb, r.address?.town, r.address?.city, r.address?.village, parts[1],
  ];
  const area = candidates.find(a => a && a !== name && a !== stateRaw && !STATE_ABBR[a ?? ""]) ?? "";

  return { name, abbr, postcode, area };
}

// ── Brand badge ───────────────────────────────────────────────
const BRAND_COLORS: Record<string, { bg: string; text: string }> = {
  "BP":            { bg: "#00A651", text: "#fff" },
  "Ampol":         { bg: "#E8002D", text: "#fff" },
  "Caltex":        { bg: "#E8002D", text: "#fff" },
  "Shell":         { bg: "#FFD500", text: "#d00" },
  "7-Eleven":      { bg: "#F7702A", text: "#fff" },
  "Coles Express": { bg: "#E2001A", text: "#fff" },
  "United":        { bg: "#003087", text: "#fff" },
  "Liberty":       { bg: "#0057A8", text: "#fff" },
  "Metro":         { bg: "#6B21A8", text: "#fff" },
  "Puma":          { bg: "#1D1D1B", text: "#FFD700" },
  "Mobil":         { bg: "#0033A0", text: "#fff" },
  "EG Ampol":      { bg: "#E8002D", text: "#fff" },
  "Costco":        { bg: "#005DAA", text: "#fff" },
  "FTR":           { bg: "#374151", text: "#fff" },
};
function BrandBadge({ brand }: { brand: string | null }) {
  const key = Object.keys(BRAND_COLORS).find(k => brand?.includes(k)) ?? "";
  const colors = BRAND_COLORS[key] ?? { bg: "#374151", text: "#fff" };
  return (
    <span className="brand-badge" style={{ background: colors.bg, color: colors.text }}>
      {(brand ?? "?").charAt(0).toUpperCase()}
    </span>
  );
}

// ── Leaderboard ───────────────────────────────────────────────
function Leaderboard({ title, subtitle, icon, stations, min, max, onSelect, accentColor, distFirst = false }: {
  title: string;
  subtitle: string;
  icon: string;
  stations: Station[];
  min: number;
  max: number;
  accentColor: string;
  onSelect: (s: Station) => void;
  distFirst?: boolean;  // true → lead with distance, show price as secondary
}) {
  return (
    <div className="leaderboard">
      <div className="leaderboard-header">
        <span className="leaderboard-icon">{icon}</span>
        <div>
          <div className="leaderboard-title">{title}</div>
          <div className="leaderboard-subtitle">{subtitle}</div>
        </div>
      </div>
      <div className="lb-cards">
        {stations.map((s, i) => (
          <div key={s.id} className="lb-card" onClick={() => onSelect(s)}>
            <span className="lb-rank" style={{ color: accentColor }}>#{i + 1}</span>
            <BrandBadge brand={s.brand} />
            <div className="lb-info">
              <span className="lb-name">{s.name}</span>
              <span className="lb-suburb">{parseSuburbState(s.address)}</span>
            </div>
            <div className="lb-right">
              {distFirst ? (
                <>
                  <span className="lb-price" style={{ color: accentColor }}>
                    {formatDistance(s.distance_km)}
                  </span>
                  <span className="lb-dist">{formatPrice(s.price_cents)}</span>
                </>
              ) : (
                <>
                  <span className="lb-price" style={{ color: accentColor }}>
                    {formatPrice(s.price_cents)}
                  </span>
                  {s.distance_km !== undefined && (
                    <span className="lb-dist">{formatDistance(s.distance_km)}</span>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Best Value score — cheapest + nearest combined ────────────
// Weights: 60% price, 40% distance. Lower score = better value.
function useBestValue(stations: Station[], count = 5): Station[] {
  return useMemo(() => {
    const withDist = stations.filter(s => s.distance_km !== undefined);
    if (withDist.length === 0) return [];
    const prices    = withDist.map(s => s.price_cents);
    const distances = withDist.map(s => s.distance_km!);
    const minP = Math.min(...prices),    maxP = Math.max(...prices);
    const minD = Math.min(...distances), maxD = Math.max(...distances);
    return withDist
      .map(s => {
        const pScore = maxP === minP ? 0 : (s.price_cents - minP) / (maxP - minP);
        const dScore = maxD === minD ? 0 : (s.distance_km! - minD) / (maxD - minD);
        return { ...s, _score: 0.6 * pScore + 0.4 * dScore };
      })
      .sort((a, b) => (a as any)._score - (b as any)._score)
      .slice(0, count);
  }, [stations, count]);
}

// ── Station row ───────────────────────────────────────────────
function StationRow({ station, min, max, onSelect, isFavourited = false }: {
  station: Station; min: number; max: number; onSelect: (s: Station) => void; isFavourited?: boolean;
}) {
  const ageHours  = getPriceAgeHours(station.recorded_at);
  const freshness = getFreshness(ageHours);
  return (
    <div className="station-row" onClick={() => onSelect(station)}>
      <div className="station-row-left">
        <BrandBadge brand={station.brand} />
        <div className="station-info">
          <span className="station-name">
            {isFavourited && <span className="row-fav-star" title="Saved station">⭐</span>}
            {station.name}
          </span>
          <span className="station-meta">{parseSuburbState(station.address)}</span>
        </div>
      </div>
      <div className="station-row-right">
        <span className="station-price" style={{ color: priceColor(station.price_cents, min, max) }}>
          {formatPrice(station.price_cents)}
        </span>
        <div className="station-row-bottom">
          <span className="station-dist">{formatDistance(station.distance_km)}</span>
          <span
            className="freshness-dot"
            title={`${freshness.label} · updated ${ageHours < 1 ? "< 1h" : Math.round(ageHours) + "h"} ago`}
            style={{ background: freshness.color }}
          />
        </div>
      </div>
    </div>
  );
}

const RADIUS_OPTIONS: { label: string; value: number | null }[] = [
  { label: "5km",  value: 5  },
  { label: "10km", value: 10 },
  { label: "25km", value: 25 },
  { label: "50km", value: 50 },
  { label: "All",  value: null },
];

// ── Collapsible section wrapper ───────────────────────────────
function CollapsibleGroup({
  label, open, onToggle, children,
}: {
  label: string; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="collapsible-group">
      <button className="collapsible-toggle" onClick={onToggle}>
        <span>{label}</span>
        <span className={`chevron${open ? " open" : ""}`}>›</span>
      </button>
      {open && <div className="collapsible-body">{children}</div>}
    </div>
  );
}

// ── Engagement gate modal ─────────────────────────────────────
function EngagementModal({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="engagement-overlay" onClick={onDismiss}>
      <div className="engagement-modal" onClick={e => e.stopPropagation()}>
        <div className="engagement-fuel-icon">⛽</div>
        <h2 className="engagement-title">You're finding great deals!</h2>
        <p className="engagement-subtitle">
          Create a free account to unlock the full FuelFinder experience.
        </p>
        <ul className="engagement-perks">
          <li><span className="perk-icon">📈</span> 30-day price history charts</li>
          <li><span className="perk-icon">⭐</span> Save favourite stations</li>
          <li><span className="perk-icon">🔔</span> Price drop alerts <span className="perk-soon">Coming soon</span></li>
          <li><span className="perk-icon">🏠</span> Set a home location</li>
        </ul>
        <SignInButton mode="modal">
          <button className="engagement-cta" onClick={onDismiss}>
            Create free account — it's quick
          </button>
        </SignInButton>
        <button className="engagement-skip" onClick={onDismiss}>
          Continue browsing for now
        </button>
      </div>
    </div>
  );
}

// ── Relative time helper ──────────────────────────────────────
function timeAgo(date: Date, now: number): string {
  const diffMs  = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1)  return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr  < 24) return `${diffHr}h ago`;
  return date.toLocaleDateString([], { day: "numeric", month: "short" });
}

// ── App ───────────────────────────────────────────────────────
export default function App() {
  const [fuelType, setFuelType]     = useState<FuelType>("U91");
  const [radiusKm, setRadiusKm]     = useState<number | null>(25);
  const [listExpanded, setListExpanded] = useState(true);
  const [showAbout,    setShowAbout]    = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showCharts,   setShowCharts]   = useState(false);
  const [locationName, setLocationName] = useState("My Location");
  const [manualCoords, setManualCoords] = useState<[number, number] | null>(null);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [manualInput, setManualInput]         = useState("");
  const [suggestions, setSuggestions]         = useState<NominatimResult[]>([]);
  const [suggestLoading, setSuggestLoading]   = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // "Scan this area" — tracks where the map is centred vs where data is loaded
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const suggestTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  // Sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const { showGate, recordView, dismissGate } = useEngagementGate();

  // Ticks every 30s so relative timestamps ("2 min ago") update automatically
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const { coords: gpsCoords, isDefault } = useGeolocation();
  const coords: [number, number] = manualCoords ?? gpsCoords;
  const [userLat, userLng] = coords;

  const { stations: allStations } = useStations("U91",            coords, radiusKm);
  const { stations: e10 }         = useStations("E10",            coords, radiusKm);
  const { stations: p95 }         = useStations("P95",            coords, radiusKm);
  const { stations: p98 }         = useStations("P98",            coords, radiusKm);
  const { stations: diesel }      = useStations("Diesel",         coords, radiusKm);
  const { stations: premDiesel }  = useStations("Premium Diesel", coords, radiusKm);
  const { stations: lpg }         = useStations("LPG",            coords, radiusKm);

  const { stations, loading, error, lastRefresh, refetch } = useStations(fuelType, coords, radiusKm);
  const { cheapest, priciest } = useCheapestAndPriciest(stations);
  const bestValue = useBestValue(stations);
  const { favouriteIds, favouriteStations, toggleFavourite } = useFavourites(stations);
  const nearest = useMemo(
    () =>
      [...stations]
        .filter(s => s.distance_km !== undefined)
        .sort((a, b) => (a.distance_km ?? 999) - (b.distance_km ?? 999))
        .slice(0, 5),
    [stations]
  );
  const stats = useFuelStats(stations);

  const prices = stations.map(s => s.price_cents);
  const min = prices.length ? Math.min(...prices) : 0;
  const max = prices.length ? Math.max(...prices) : 0;

  // Always sort by distance — leaderboard cards handle the price/value views
  const sorted = useMemo(() => {
    return [...stations].sort((a, b) => (a.distance_km ?? 999) - (b.distance_km ?? 999));
  }, [stations]);

  const allFuelForSelected = useMemo(() => {
    if (!selectedStation) return [];
    const allRows = [...allStations, ...e10, ...p95, ...p98, ...diesel, ...premDiesel, ...lpg];
    return allRows.filter(s => s.station_id === selectedStation.station_id);
  }, [selectedStation, allStations, e10, p95, p98, diesel, premDiesel, lpg]);

  function handleSelectStation(s: Station) {
    setSelectedStation(s);
    setMobileSidebarOpen(false);
    recordView(); // increment engagement counter — may trigger gate modal
  }

  function selectGPS() {
    setManualCoords(null);
    setLocationName("My Location");
    setMapCenter(null);
  }

  // "Scan this area" — show button when map has drifted > 2km from current search origin
  const distFromMapCenter = useMemo(() => {
    if (!mapCenter) return 0;
    const [mLat, mLng] = mapCenter;
    const [cLat, cLng] = coords;
    const R = 6371;
    const dLat = ((mLat - cLat) * Math.PI) / 180;
    const dLng = ((mLng - cLng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((cLat * Math.PI) / 180) *
        Math.cos((mLat * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }, [mapCenter, coords]);

  const showScanBtn = distFromMapCenter > 2; // show after 2km drift

  async function handleScanArea() {
    if (!mapCenter) return;
    setScanLoading(true);
    try {
      // Reverse-geocode the map centre to get a friendly area name
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${mapCenter[0]}&lon=${mapCenter[1]}&format=json&zoom=10`;
      const res  = await fetch(url, { headers: { "Accept-Language": "en" } });
      const data = await res.json();
      const place =
        data?.address?.suburb ??
        data?.address?.town ??
        data?.address?.city ??
        data?.address?.village ??
        data?.address?.county ??
        "this area";
      setLocationName(place);
    } catch {
      setLocationName("this area");
    } finally {
      setManualCoords([mapCenter[0], mapCenter[1]]);
      setMapCenter(null);
      setScanLoading(false);
    }
  }

  // Debounced suburb search — fires 350ms after the user stops typing
  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 2) { setSuggestions([]); setShowSuggestions(false); return; }
    setSuggestLoading(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ", Australia")}&format=json&limit=7&addressdetails=1&countrycodes=au&featuretype=settlement`;
      const res  = await fetch(url, { headers: { "Accept-Language": "en" } });
      const data: NominatimResult[] = await res.json();
      setSuggestions(data);
      setShowSuggestions(data.length > 0);
    } catch {
      setSuggestions([]);
    } finally {
      setSuggestLoading(false);
    }
  }, []);

  function handleSearchInput(value: string) {
    setManualInput(value);
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    if (value.trim().length < 2) { setSuggestions([]); setShowSuggestions(false); return; }
    suggestTimer.current = setTimeout(() => fetchSuggestions(value.trim()), 350);
  }

  function handleSuggestionClick(result: NominatimResult) {
    const { name } = formatNominatim(result);
    setManualCoords([parseFloat(result.lat), parseFloat(result.lon)]);
    setLocationName(name);
    setManualInput("");
    setSuggestions([]);
    setShowSuggestions(false);
    setMobileSidebarOpen(false);
    setMapCenter(null);
  }

  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { setShowSuggestions(false); }
    if (e.key === "Enter"  && suggestions.length > 0) {
      e.preventDefault();
      handleSuggestionClick(suggestions[0]);
    }
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    function onOutsideClick(e: MouseEvent) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, []);

  const locationIsGPS     = manualCoords === null && !isDefault;
  const locationIsDefault = manualCoords === null && isDefault;

  return (
    <div className="app-layout">
      {/* Mobile overlay */}
      {mobileSidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setMobileSidebarOpen(false)} />
      )}

      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className={`sidebar${sidebarCollapsed ? " sidebar--collapsed" : ""}${mobileSidebarOpen ? " sidebar--open" : ""}`}>

        {/* Mobile-only filter header (Carsales-style) */}
        <div className="sidebar-mobile-header">
          <button
            className="sidebar-mobile-close"
            onClick={() => setMobileSidebarOpen(false)}
            aria-label="Close filters"
          >✕</button>
          <span className="sidebar-mobile-title">Filters</span>
          <button
            className="sidebar-mobile-done"
            onClick={() => setMobileSidebarOpen(false)}
          >Show {sorted.length} results</button>
        </div>

        {/* Desktop logo + collapse toggle */}
        <div className="sidebar-logo">
          {!sidebarCollapsed && (
            <>
              <span className="sidebar-logo-icon">⛽</span>
              <div style={{ flex: 1 }}>
                <div className="sidebar-logo-name">FuelFinder</div>
                <div className="sidebar-logo-region">NSW · TAS</div>
              </div>
            </>
          )}
          <button
            className="sidebar-collapse-btn"
            onClick={() => setSidebarCollapsed(v => !v)}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? "›" : "‹"}
          </button>
        </div>

        {/* Everything below hidden when collapsed */}
        {!sidebarCollapsed && (
          <>
            {/* ── Location ── */}
            <div className="sidebar-section">
              <div className="sidebar-section-title">📍 Location</div>

              {/* Current location badge */}
              <div className="location-badge">
                <span
                  className="location-badge-dot"
                  style={{ background: locationIsGPS ? "#22c55e" : locationIsDefault ? "#f59e0b" : "#3b82f6" }}
                />
                <span className="location-badge-name">{locationName}</span>
                {locationIsDefault && <span className="location-badge-hint">default</span>}
              </div>

              {/* GPS button */}
              <button
                className={`sidebar-loc-btn gps-btn${manualCoords === null ? " active" : ""}`}
                onClick={selectGPS}
              >
                🛰 Use my GPS
              </button>

              {/* Suburb autocomplete search */}
              <div className="location-search-wrap" ref={searchWrapRef}>
                <div className="location-search-row">
                  <input
                    className="location-search-input"
                    type="text"
                    placeholder="Search suburb, town or postcode…"
                    value={manualInput}
                    onChange={e => handleSearchInput(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  {suggestLoading && <span className="location-search-spinner">⟳</span>}
                  {manualInput && (
                    <button
                      className="location-search-clear"
                      onClick={() => { setManualInput(""); setSuggestions([]); setShowSuggestions(false); }}
                      aria-label="Clear search"
                    >✕</button>
                  )}
                </div>

                {showSuggestions && suggestions.length > 0 && (
                  <ul className="location-suggestions" role="listbox">
                    {suggestions.map((r, i) => {
                      const { name, abbr, postcode, area } = formatNominatim(r);
                      const badgeColors = STATE_COLORS[abbr] ?? { bg: "#374151", text: "#fff" };
                      return (
                        <li
                          key={i}
                          className="location-suggestion-item"
                          role="option"
                          onMouseDown={() => handleSuggestionClick(r)}
                        >
                          <span className="suggestion-pin">📍</span>
                          <span className="suggestion-body">
                            <span className="suggestion-main-row">
                              <span className="suggestion-name">{name}</span>
                              {abbr && (
                                <span
                                  className="suggestion-state-badge"
                                  style={{ background: badgeColors.bg, color: badgeColors.text }}
                                >{abbr}</span>
                              )}
                            </span>
                            {(area || postcode) && (
                              <span className="suggestion-detail">
                                {[area, postcode].filter(Boolean).join(" · ")}
                              </span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Tip: use search box above or "Scan this area" on the map */}
              <p className="sidebar-search-tip">
                💡 Search a suburb above, or pan the map and tap <strong>Scan this area</strong>
              </p>
            </div>

            {/* ── My Favourites (signed-in only) ── */}
            <SignedIn>
              {favouriteStations.length > 0 && (
                <div className="sidebar-section sidebar-favourites">
                  <div className="sidebar-section-title">⭐ My Favourites</div>
                  {favouriteStations.map(s => (
                    <button
                      key={s.station_id}
                      className="fav-station-btn"
                      onClick={() => handleSelectStation(s)}
                    >
                      <div className="fav-station-left">
                        <BrandBadge brand={s.brand} />
                        <div className="fav-station-info">
                          <span className="fav-station-name">{s.name}</span>
                          <span className="fav-station-sub">{parseSuburbState(s.address)}</span>
                        </div>
                      </div>
                      <span className="fav-station-price">{formatPrice(s.price_cents)}</span>
                    </button>
                  ))}
                </div>
              )}
              {favouriteStations.length === 0 && (
                <div className="sidebar-section sidebar-favourites sidebar-favourites--empty">
                  <div className="sidebar-section-title">⭐ My Favourites</div>
                  <p className="fav-empty-hint">
                    Tap ☆ on any station to save it here for quick access.
                  </p>
                </div>
              )}
            </SignedIn>

            {/* ── Fuel Type ── */}
            <div className="sidebar-section">
              <div className="sidebar-section-title">⛽ Fuel Type</div>
              <div className="chip-grid">
                {FUEL_TYPES.map(ft => (
                  <button
                    key={ft}
                    className={`chip${fuelType === ft ? " chip--active" : ""}`}
                    onClick={() => setFuelType(ft)}
                  >{ft}</button>
                ))}
              </div>
            </div>

            {/* ── Radius ── */}
            <div className="sidebar-section">
              <div className="sidebar-section-title">📏 Search Radius</div>
              <div className="chip-grid">
                {RADIUS_OPTIONS.map(r => (
                  <button
                    key={r.label}
                    className={`chip${radiusKm === r.value ? " chip--active" : ""}`}
                    onClick={() => setRadiusKm(r.value)}
                  >{r.label}</button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── Sidebar nav — About + Charts ── */}
        {!sidebarCollapsed && (
          <div className="sidebar-nav">
            <button className="sidebar-nav-btn" onClick={() => setShowAbout(true)}>
              <span className="sidebar-nav-icon">ℹ️</span>
              <span>About FuelFinder</span>
            </button>
            <button className="sidebar-nav-btn" onClick={() => setShowCharts(true)}>
              <span className="sidebar-nav-icon">📊</span>
              <span>Price Charts</span>
            </button>
          </div>
        )}

        {/* Sidebar footer — version/credit */}
        <div className="sidebar-footer">
          <span className="sidebar-footer-text">FuelFinder · free for 🇦🇺</span>
        </div>
      </aside>

      {/* ── Main panel ──────────────────────────────────────── */}
      <main className="main-panel">

        {/* Topbar */}
        <div className="topbar">
          <button
            className="hamburger"
            onClick={() => setMobileSidebarOpen(v => !v)}
            aria-label="Toggle filters"
          >☰</button>

          <div className="topbar-context">
            {loading
              ? <span className="topbar-loading">Loading…</span>
              : <span className="topbar-count">
                  <strong>{sorted.length}</strong> {fuelType} station{sorted.length !== 1 ? "s" : ""} · {locationName}
                  {radiusKm !== null ? ` · within ${radiusKm}km` : ""}
                </span>
            }
          </div>

          <div className="topbar-actions">
            <SignedOut>
              <SignInButton mode="modal">
                <button className="signin-btn">Sign in</button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <UserButton afterSignOutUrl="/" />
            </SignedIn>
            <button className="refresh-btn" onClick={refetch} disabled={loading}>
              {loading ? "…" : "↻ Refresh"}
            </button>
            {lastRefresh && (
              <span className="last-refresh" title={lastRefresh.toLocaleString()}>
                Updated {timeAgo(lastRefresh, now)}
              </span>
            )}
          </div>
        </div>

        {error && <div className="error-banner">⚠️ {error}</div>}

        {/* ── Quick filter strip (mobile) ──────────────────────
            Always-visible fuel type + radius chips above the map.
            Eliminates the need to open the sidebar for common actions. */}
        <div className="quick-filter-bar">
          <div className="qfb-scroll">
            {/* Fuel type section */}
            <span className="qfb-label">⛽</span>
            {FUEL_TYPES.map(ft => (
              <button
                key={ft}
                className={`qfb-chip${fuelType === ft ? " qfb-chip--active" : ""}`}
                onClick={() => setFuelType(ft)}
              >{ft}</button>
            ))}

            <div className="qfb-divider" />

            {/* Radius section */}
            <span className="qfb-label">📍</span>
            {RADIUS_OPTIONS.map(r => (
              <button
                key={r.label}
                className={`qfb-chip${radiusKm === r.value ? " qfb-chip--active" : ""}`}
                onClick={() => setRadiusKm(r.value)}
              >{r.label}</button>
            ))}
          </div>
        </div>

        {/* Map */}
        <div className="map-container">
          <FuelMap
            stations={stations}
            userLat={userLat}
            userLng={userLng}
            onSelectStation={handleSelectStation}
            onMapMove={(lat, lng) => setMapCenter([lat, lng])}
          />
          {/* "Scan this area" button — floats over map when user pans away */}
          {showScanBtn && (
            <button
              className={`scan-area-btn${scanLoading ? " scan-area-btn--loading" : ""}`}
              onClick={handleScanArea}
              disabled={scanLoading}
            >
              {scanLoading ? "⟳ Scanning…" : "🔍 Scan this area"}
            </button>
          )}
        </div>

        {/* Scrollable content below map */}
        <div className="main-content-scroll">

          {/* Stats strip */}
          {stats && (
            <div className="stats-strip">
              <div className="stats-strip-item">
                <span className="stats-strip-label">Cheapest</span>
                <span className="stats-strip-value" style={{ color: "#22c55e" }}>{formatPrice(stats.cheapest)}</span>
              </div>
              <div className="stats-strip-divider" />
              <div className="stats-strip-item">
                <span className="stats-strip-label">Average</span>
                <span className="stats-strip-value">{formatPrice(stats.average)}</span>
              </div>
              <div className="stats-strip-divider" />
              <div className="stats-strip-item">
                <span className="stats-strip-label">Dearest</span>
                <span className="stats-strip-value" style={{ color: "#ef4444" }}>{formatPrice(stats.dearest)}</span>
              </div>
              <div className="stats-strip-divider" />
              <div className="stats-strip-item">
                <span className="stats-strip-label">Spread</span>
                <span className="stats-strip-value" style={{ color: "#f59e0b" }}>{formatPrice(stats.spread)}</span>
              </div>
            </div>
          )}

          {/* Low-result banner — suggest expanding radius */}
          {!loading && sorted.length > 0 && sorted.length < 5 && radiusKm !== null && (
            <div className="coverage-banner coverage-banner--low">
              <span>📍 Only {sorted.length} station{sorted.length !== 1 ? "s" : ""} found nearby.</span>
              <button className="coverage-expand-btn" onClick={() => setRadiusKm(null)}>
                Expand to All →
              </button>
            </div>
          )}

          {/* No-result banner */}
          {!loading && sorted.length === 0 && (
            <div className="coverage-banner coverage-banner--empty">
              <span>No {fuelType} stations found in this area.</span>
              {radiusKm !== null && (
                <button className="coverage-expand-btn" onClick={() => setRadiusKm(null)}>
                  Try All radius →
                </button>
              )}
            </div>
          )}

          {/* Non-ACT coverage notice — live prices only available in ACT */}
          {!loading && sorted.length > 0 && !sorted.some(s =>
            s.postcode && Number(s.postcode) >= 2600 && Number(s.postcode) <= 2914
          ) && (
            <div className="coverage-banner coverage-banner--historical">
              ⏱ Prices shown are from our last data update — live tracking covers ACT only.
            </div>
          )}

          {/* Leaderboards — 4 cards */}
          {cheapest.length > 0 && (
            <div className="leaderboards-wrap">
            <div className="leaderboards-row">
              <Leaderboard
                icon="⭐"
                title="Cheapest & Nearest"
                subtitle={`Best price + distance${radiusKm ? ` within ${radiusKm}km` : ""}`}
                stations={bestValue}
                min={min} max={max}
                accentColor="#3b82f6"
                onSelect={handleSelectStation}
              />
              <Leaderboard
                icon="💰"
                title="Cheapest"
                subtitle={`Lowest price${radiusKm ? ` within ${radiusKm}km` : " in all results"}`}
                stations={cheapest}
                min={min} max={max}
                accentColor="#22c55e"
                onSelect={handleSelectStation}
              />
              <Leaderboard
                icon="📍"
                title="Nearest"
                subtitle={`Closest stations${radiusKm ? ` within ${radiusKm}km` : ""}`}
                stations={nearest}
                min={min} max={max}
                accentColor="#f59e0b"
                distFirst
                onSelect={handleSelectStation}
              />
              <Leaderboard
                icon="⚠️"
                title="Most Expensive"
                subtitle={`Highest price${radiusKm ? ` within ${radiusKm}km` : " in all results"}`}
                stations={priciest}
                min={min} max={max}
                accentColor="#ef4444"
                onSelect={handleSelectStation}
              />
            </div>
            </div>
          )}

          {/* Support strip */}
          <div className="support-strip">
            <p className="support-strip-tagline">🇦🇺 FuelFinder is free · built for Australians</p>
            <div className="support-strip-actions">
              <button className="support-feedback-btn" onClick={() => setShowFeedback(true)}>
                💬 Feedback
              </button>
              <a
                href="https://www.buymeacoffee.com/nocturnaljv"
                target="_blank"
                rel="noopener noreferrer"
                className="support-strip-btn"
                title="Support FuelFinder"
              >
                ☕ Buy me a coffee
              </a>
            </div>
          </div>

          {/* Station list header — tap to expand / collapse the full list */}
          <button
            className="station-list-header"
            onClick={() => setListExpanded(v => !v)}
            aria-expanded={listExpanded}
          >
            <span className="station-list-count">
              {!loading && `${sorted.length} station${sorted.length !== 1 ? "s" : ""} found`}
            </span>
            <span className="station-list-header-right">
              <span className="station-list-sort-label">📍 Nearest first</span>
              <span className={`list-chevron${listExpanded ? " open" : ""}`}>›</span>
            </span>
          </button>

          {listExpanded && (
            <>
              {loading && <div className="list-loading">Loading stations…</div>}
              <div className="station-list">
                {sorted.map(s => (
                  <StationRow
                    key={s.id}
                    station={s}
                    min={min}
                    max={max}
                    onSelect={handleSelectStation}
                    isFavourited={favouriteIds.has(s.station_id)}
                  />
                ))}
                {!loading && sorted.length === 0 && (
                  <div className="list-empty">
                    No {fuelType} prices found nearby.<br />
                    Try expanding the radius or selecting a different location.
                  </div>
                )}
              </div>
            </>
          )}

        </div>
      </main>

      {/* Engagement gate modal */}
      {showGate    && <EngagementModal onDismiss={dismissGate} />}

      {/* About modal */}
      {showAbout    && <AboutModal    onClose={() => setShowAbout(false)} />}

      {/* Feedback modal */}
      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}

      {/* Charts modal */}
      {showCharts && (
        <ChartsModal
          onClose={() => setShowCharts(false)}
          stations={stations}
          fuelType={fuelType}
          radiusKm={radiusKm}
          locationName={locationName}
        />
      )}

      {/* Station bottom sheet */}
      <StationSheet
        station={selectedStation}
        allStationsForStation={allFuelForSelected}
        onClose={() => setSelectedStation(null)}
        isFavourited={selectedStation ? favouriteIds.has(selectedStation.station_id) : false}
        onToggleFavourite={toggleFavourite}
      />
    </div>
  );
}
