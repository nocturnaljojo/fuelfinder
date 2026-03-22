import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
  LineChart, Line, Legend, CartesianGrid,
} from "recharts";
import type { Station } from "./types/fuel";
import { useFuelTrends } from "./hooks";

interface ChartsModalProps {
  onClose:      () => void;
  stations:     Station[];
  fuelType:     string;
  radiusKm:     number | null;
  locationName: string;
}

function fmt(cents: number) { return `${cents.toFixed(1)}¢`; }

// Colour per fuel type — consistent across the app
const FUEL_COLORS: Record<string, string> = {
  "U91":             "#3b82f6",
  "E10":             "#22c55e",
  "P95":             "#f59e0b",
  "P98":             "#f97316",
  "Diesel":          "#eab308",
  "Premium Diesel":  "#8b5cf6",
  "LPG":             "#ec4899",
};

// ── Trend chart tooltip ───────────────────────────────────────
function TrendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#1e2330", border: "1px solid #334155",
      borderRadius: 10, padding: "10px 14px", fontSize: 12, minWidth: 140,
    }}>
      <div style={{ color: "#94a3b8", marginBottom: 6, fontWeight: 600 }}>{label}</div>
      {[...payload]
        .sort((a, b) => b.value - a.value)
        .map((p: any) => (
          <div key={p.dataKey} style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 3 }}>
            <span style={{ color: p.color }}>{p.dataKey}</span>
            <span style={{ color: "#e2e8f0", fontWeight: 700 }}>{p.value?.toFixed(1)}¢</span>
          </div>
        ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────
export default function ChartsModal({
  onClose, stations, fuelType, radiusKm, locationName,
}: ChartsModalProps) {

  const [activeTab,   setActiveTab]   = useState<"snapshot" | "trends">("snapshot");
  const [daysBack,    setDaysBack]    = useState(90);
  const [activeFuels, setActiveFuels] = useState<Set<string>>(
    new Set(["U91", "E10", "P95", "P98", "Diesel", "Premium Diesel"])
  );

  const { points, fuels, loading: trendsLoading } = useFuelTrends(daysBack);

  // ── Snapshot tab data ────────────────────────────────────────
  const prices = stations.map(s => s.price_cents);
  const minP   = prices.length ? Math.min(...prices) : 0;
  const maxP   = prices.length ? Math.max(...prices) : 0;
  const avg    = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
  const spread = maxP - minP;

  const distribution = useMemo(() => {
    if (!stations.length) return [];
    const bucketSize = spread > 20 ? 5 : spread > 8 ? 2 : 1;
    const lo = Math.floor(minP / bucketSize) * bucketSize;
    const hi = Math.ceil(maxP  / bucketSize) * bucketSize;
    const buckets: { label: string; count: number; price: number }[] = [];
    for (let p = lo; p <= hi; p += bucketSize) {
      const count = prices.filter(x => x >= p && x < p + bucketSize).length;
      if (count > 0) buckets.push({ label: `${p}¢`, count, price: p });
    }
    return buckets;
  }, [stations, prices, minP, maxP, spread]);

  const cheapestTop = useMemo(() =>
    [...stations]
      .sort((a, b) => a.price_cents - b.price_cents)
      .slice(0, 10)
      .map(s => ({
        name:  s.name.replace("7-Eleven", "7-11").replace("Coles Express", "Coles").slice(0, 22),
        price: s.price_cents,
        dist:  s.distance_km,
      })),
  [stations]);

  function priceColor(p: number) {
    if (!spread) return "#22c55e";
    const r = (p - minP) / spread;
    return r < 0.33 ? "#22c55e" : r < 0.66 ? "#f59e0b" : "#ef4444";
  }

  function toggleFuel(f: string) {
    setActiveFuels(prev => {
      const next = new Set(prev);
      if (next.has(f)) { if (next.size > 1) next.delete(f); }
      else next.add(f);
      return next;
    });
  }

  // Thin the X-axis labels so they don't crowd
  const xTick = points.length > 30 ? Math.ceil(points.length / 10) : 1;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="charts-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="charts-modal-header">
          <div>
            <h2 className="charts-modal-title">📊 Price Charts</h2>
            <p className="charts-modal-subtitle">
              {fuelType} · {locationName}
              {radiusKm ? ` · within ${radiusKm}km` : ""}
              {" "}· {stations.length} station{stations.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Tabs */}
        <div className="charts-tabs">
          <button
            className={`charts-tab${activeTab === "snapshot" ? " charts-tab--active" : ""}`}
            onClick={() => setActiveTab("snapshot")}
          >📍 Live Snapshot</button>
          <button
            className={`charts-tab${activeTab === "trends" ? " charts-tab--active" : ""}`}
            onClick={() => setActiveTab("trends")}
          >📈 Fuel Trends</button>
        </div>

        <div className="charts-modal-body">

          {/* ── SNAPSHOT TAB ── */}
          {activeTab === "snapshot" && (
            stations.length === 0 ? (
              <div className="charts-empty">No stations loaded — search a location first.</div>
            ) : (
              <>
                <div className="charts-stats-row">
                  <div className="charts-stat">
                    <span className="charts-stat-val" style={{ color: "#22c55e" }}>{fmt(minP)}</span>
                    <span className="charts-stat-label">Cheapest</span>
                  </div>
                  <div className="charts-stat">
                    <span className="charts-stat-val">{fmt(avg)}</span>
                    <span className="charts-stat-label">Average</span>
                  </div>
                  <div className="charts-stat">
                    <span className="charts-stat-val" style={{ color: "#ef4444" }}>{fmt(maxP)}</span>
                    <span className="charts-stat-label">Dearest</span>
                  </div>
                  <div className="charts-stat">
                    <span className="charts-stat-val" style={{ color: "#f59e0b" }}>{fmt(spread)}</span>
                    <span className="charts-stat-label">Spread</span>
                  </div>
                </div>

                {distribution.length > 1 && (
                  <div className="charts-section">
                    <h3 className="charts-section-title">Price Distribution</h3>
                    <p className="charts-section-sub">Stations at each price point</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={distribution} margin={{ top: 4, right: 8, left: -24, bottom: 4 }}>
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} allowDecimals={false} width={28} />
                        <Tooltip
                          contentStyle={{ background: "#1e2330", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                          formatter={(v) => { const n = Number(v); return [`${n} station${n !== 1 ? "s" : ""}`, "Count"]; }}
                        />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          {distribution.map((entry, i) => <Cell key={i} fill={priceColor(entry.price)} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {cheapestTop.length > 0 && (
                  <div className="charts-section">
                    <h3 className="charts-section-title">Top 10 Cheapest Stations</h3>
                    <p className="charts-section-sub">Dashed line = area average</p>
                    <ResponsiveContainer width="100%" height={Math.max(220, cheapestTop.length * 36)}>
                      <BarChart data={cheapestTop} layout="vertical" margin={{ top: 4, right: 52, left: 4, bottom: 4 }}>
                        <XAxis type="number" domain={[minP * 0.995, maxP * 1.005]}
                          tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={v => `${v.toFixed(0)}¢`} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#e2e8f0" }} width={88} />
                        <Tooltip
                          contentStyle={{ background: "#1e2330", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                          formatter={(v, _n, p) => {
                            const price = Number(v);
                            const dist  = (p as any)?.payload?.dist;
                            const distStr = dist !== undefined
                              ? ` · ${dist < 1 ? Math.round(dist * 1000) + "m" : dist.toFixed(1) + "km"}`
                              : "";
                            return [`${price.toFixed(1)}¢${distStr}`, "Price"];
                          }}
                        />
                        <ReferenceLine x={avg} stroke="#64748b" strokeDasharray="4 2"
                          label={{ value: "avg", fill: "#64748b", fontSize: 9, position: "insideTopLeft" }} />
                        <Bar dataKey="price" radius={[0, 4, 4, 0]}>
                          {cheapestTop.map((_, i) => <Cell key={i} fill={priceColor(cheapestTop[i].price)} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            )
          )}

          {/* ── TRENDS TAB ── */}
          {activeTab === "trends" && (
            <>
              {/* Date range selector */}
              <div className="trend-controls">
                <div className="trend-range-btns">
                  {[
                    { label: "7D",  value: 7  },
                    { label: "30D", value: 30 },
                    { label: "90D", value: 90 },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      className={`trend-range-btn${daysBack === opt.value ? " trend-range-btn--active" : ""}`}
                      onClick={() => setDaysBack(opt.value)}
                    >{opt.label}</button>
                  ))}
                </div>

                {/* Fuel type toggles */}
                <div className="trend-fuel-toggles">
                  {(fuels.length ? fuels : Object.keys(FUEL_COLORS)).map(f => (
                    <button
                      key={f}
                      className={`trend-fuel-chip${activeFuels.has(f) ? " trend-fuel-chip--on" : ""}`}
                      style={activeFuels.has(f)
                        ? { background: FUEL_COLORS[f] + "28", borderColor: FUEL_COLORS[f], color: FUEL_COLORS[f] }
                        : {}}
                      onClick={() => toggleFuel(f)}
                    >{f}</button>
                  ))}
                </div>
              </div>

              {trendsLoading ? (
                <div className="charts-empty">Loading trend data…</div>
              ) : points.length === 0 ? (
                <div className="charts-empty">
                  <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>No historical data yet</div>
                  <div style={{ color: "#64748b", fontSize: 13, lineHeight: 1.6 }}>
                    Run the ingest script to load historical prices, or wait for the
                    live collector to build up data over the next few days.
                  </div>
                </div>
              ) : (
                <div className="charts-section">
                  <h3 className="charts-section-title">Average Daily Price by Fuel Type</h3>
                  <p className="charts-section-sub">
                    NSW average across all stations · last {daysBack} days
                  </p>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={points} margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: "#64748b" }}
                        interval={xTick - 1}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "#64748b" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={v => `${v}¢`}
                        width={44}
                      />
                      <Tooltip content={<TrendTooltip />} />
                      {fuels
                        .filter(f => activeFuels.has(f))
                        .map(f => (
                          <Line
                            key={f}
                            type="monotone"
                            dataKey={f}
                            stroke={FUEL_COLORS[f] ?? "#94a3b8"}
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4, strokeWidth: 0 }}
                            connectNulls
                          />
                        ))
                      }
                    </LineChart>
                  </ResponsiveContainer>

                  {/* Colour key */}
                  <div className="trend-legend">
                    {fuels.filter(f => activeFuels.has(f)).map(f => (
                      <span key={f} className="trend-legend-item">
                        <span className="trend-legend-dot" style={{ background: FUEL_COLORS[f] }} />
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

        </div>

        <div className="charts-modal-footer">
          <button className="about-close-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
