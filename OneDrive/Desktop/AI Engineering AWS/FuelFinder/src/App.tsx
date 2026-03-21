import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { SignInButton, SignedIn, SignedOut, UserButton } from "@clerk/clerk-react";
import {
  useGeolocation,
  useStations,
  useCheapestAndPriciest,
  useFuelStats,
  useEngagementGate,
  PRESET_LOCATIONS,
  getPriceAgeHours,
  getFreshness,
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

function formatNominatim(r: NominatimResult): { name: string; meta: string } {
  const parts  = r.display_name.split(",").map(s => s.trim());
  const name   = parts[0];
  const state  = r.address.state ?? "";
  const abbr   = STATE_ABBR[state] || state;
  const post   = r.address.postcode ? ` ${r.address.postcode}` : "";
  // Second breadcrumb — suburb or LGA name
  const area   = r.address.suburb || r.address.town || r.address.city || parts[1] || "";
  const meta   = [area !== name ? area : "", abbr + post].filter(Boolean).join(", ");
  return { name, meta };
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
function Leaderboard({ title, subtitle, icon, stations, min, max, onSelect, accentColor }: {
  title: string;
  subtitle: string;
  icon: string;
  stations: Station[];
  min: number;
  max: number;
  accentColor: string;
  onSelect: (s: Station) => void;
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
              <span className="lb-price" style={{ color: accentColor }}>
                {formatPrice(s.price_cents)}
              </span>
              {s.distance_km !== undefined && (
                <span className="lb-dist">{formatDistance(s.distance_km)}</span>
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
function StationRow({ station, min, max, onSelect }: {
  station: Station; min: number; max: number; onSelect: (s: Station) => void;
}) {
  const ageHours  = getPriceAgeHours(station.recorded_at);
  const freshness = getFreshness(ageHours);
  return (
    <div className="station-row" onClick={() => onSelect(station)}>
      <div className="station-row-left">
        <BrandBadge brand={station.brand} />
        <div className="station-info">
          <span className="station-name">{station.name}</span>
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

// ── App ───────────────────────────────────────────────────────
export default function App() {
  const [fuelType, setFuelType]     = useState<FuelType>("U91");
  const [sortMode, setSortMode]     = useState<SortMode>("distance");
  const [radiusKm, setRadiusKm]     = useState<number | null>(25);
  const [locationName, setLocationName] = useState("My Location");
  const [manualCoords, setManualCoords] = useState<[number, number] | null>(null);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [manualInput, setManualInput]         = useState("");
  const [suggestions, setSuggestions]         = useState<NominatimResult[]>([]);
  const [suggestLoading, setSuggestLoading]   = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  // Sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Collapsible location sections — ACT open by default
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["ACT"]));
  function toggleSection(name: string) {
    setOpenSections(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  const { showGate, recordView, dismissGate } = useEngagementGate();

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
  const stats = useFuelStats(stations);

  const prices = stations.map(s => s.price_cents);
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
  }

  function selectPreset(preset: typeof PRESET_LOCATIONS[0]) {
    setManualCoords([preset.lat, preset.lng]);
    setLocationName(preset.name);
    setMobileSidebarOpen(false);
    if (preset.region === "Regional NSW" || preset.region === "Tasmania") setRadiusKm(50);
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

        {/* Logo + collapse toggle */}
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
                      const { name, meta } = formatNominatim(r);
                      return (
                        <li
                          key={i}
                          className="location-suggestion-item"
                          role="option"
                          onMouseDown={() => handleSuggestionClick(r)}
                        >
                          <span className="suggestion-icon">📍</span>
                          <span className="suggestion-body">
                            <span className="suggestion-name">{name}</span>
                            {meta && <span className="suggestion-meta">{meta}</span>}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Collapsible preset groups */}
              <CollapsibleGroup label="ACT" open={openSections.has("ACT")} onToggle={() => toggleSection("ACT")}>
                {PRESET_LOCATIONS.filter(p => p.region === "ACT").map(p => (
                  <button
                    key={p.name}
                    className={`sidebar-loc-btn${locationName === p.name ? " active" : ""}`}
                    onClick={() => selectPreset(p)}
                  >{p.name}</button>
                ))}
              </CollapsibleGroup>

              <CollapsibleGroup label="Regional NSW" open={openSections.has("Regional NSW")} onToggle={() => toggleSection("Regional NSW")}>
                {PRESET_LOCATIONS.filter(p => p.region === "Regional NSW").map(p => (
                  <button
                    key={p.name}
                    className={`sidebar-loc-btn${locationName === p.name ? " active" : ""}`}
                    onClick={() => selectPreset(p)}
                  >{p.name}</button>
                ))}
              </CollapsibleGroup>

              <CollapsibleGroup label="Tasmania" open={openSections.has("Tasmania")} onToggle={() => toggleSection("Tasmania")}>
                {PRESET_LOCATIONS.filter(p => p.region === "Tasmania").map(p => (
                  <button
                    key={p.name}
                    className={`sidebar-loc-btn${locationName === p.name ? " active" : ""}`}
                    onClick={() => selectPreset(p)}
                  >{p.name}</button>
                ))}
              </CollapsibleGroup>
            </div>

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

        {/* ── Buy Me a Coffee ── */}
        <div className="sidebar-bmc">
          <a
            href="https://www.buymeacoffee.com/nocturnaljv"
            target="_blank"
            rel="noopener noreferrer"
            className="bmc-btn"
            title="Support FuelFinder"
          >
            <span className="bmc-emoji">☕</span>
            <span className="bmc-text">Buy me a coffee</span>
          </a>
          <p className="bmc-tagline">Built free for Australians 🇦🇺</p>
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
            <a
              href="https://www.buymeacoffee.com/nocturnaljv"
              target="_blank"
              rel="noopener noreferrer"
              className="topbar-bmc"
              title="Buy me a coffee"
            >☕</a>
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
              <span className="last-refresh">
                {lastRefresh.toLocaleString([], {
                  day: "2-digit", month: "short", year: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })}
              </span>
            )}
          </div>
        </div>

        {error && <div className="error-banner">⚠️ {error}</div>}

        {/* Map */}
        <div className="map-container">
          <FuelMap
            stations={stations}
            userLat={userLat}
            userLng={userLng}
            onSelectStation={handleSelectStation}
          />
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

          {/* Leaderboards — 3 cards */}
          {cheapest.length > 0 && (
            <div className="leaderboards-row">
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
                icon="⭐"
                title="Best Value"
                subtitle={`Cheap + close${radiusKm ? ` within ${radiusKm}km` : ""}`}
                stations={bestValue}
                min={min} max={max}
                accentColor="#3b82f6"
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
          )}

          {/* Station list header + sort controls together */}
          <div className="station-list-header">
            <span className="station-list-count">
              {!loading && `${sorted.length} station${sorted.length !== 1 ? "s" : ""} found`}
            </span>
            <div className="sort-controls">
              <button className={`sort-btn${sortMode === "distance" ? " active" : ""}`} onClick={() => setSortMode("distance")}>📍 Nearest first</button>
              <button className={`sort-btn${sortMode === "price" ? " active" : ""}`}    onClick={() => setSortMode("price")}>💰 Cheapest first</button>
            </div>
          </div>

          {loading && <div className="list-loading">Loading stations…</div>}

          <div className="station-list">
            {sorted.map(s => (
              <StationRow key={s.id} station={s} min={min} max={max} onSelect={handleSelectStation} />
            ))}
            {!loading && sorted.length === 0 && (
              <div className="list-empty">
                No {fuelType} prices found nearby.<br />
                Try expanding the radius or selecting a different location.
              </div>
            )}
          </div>

        </div>
      </main>

      {/* Engagement gate modal — shown to non-signed-in users after 5 station views */}
      {showGate && <EngagementModal onDismiss={dismissGate} />}

      {/* Station bottom sheet */}
      <StationSheet
        station={selectedStation}
        allStationsForStation={allFuelForSelected}
        onClose={() => setSelectedStation(null)}
      />
    </div>
  );
}
