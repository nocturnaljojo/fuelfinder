import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";
import type { Station } from "./types/fuel";

interface ChartsModalProps {
  onClose:      () => void;
  stations:     Station[];
  fuelType:     string;
  radiusKm:     number | null;
  locationName: string;
}

function fmt(cents: number) { return `${cents.toFixed(1)}¢`; }

export default function ChartsModal({
  onClose, stations, fuelType, radiusKm, locationName,
}: ChartsModalProps) {

  const prices = stations.map(s => s.price_cents);
  const minP   = prices.length ? Math.min(...prices) : 0;
  const maxP   = prices.length ? Math.max(...prices) : 0;
  const avg    = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
  const spread = maxP - minP;

  // ── Price distribution in 2¢ buckets ──────────────────────
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

  // ── Top 10 cheapest for horizontal bar chart ──────────────
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

        <div className="charts-modal-body">

          {stations.length === 0 ? (
            <div className="charts-empty">
              No stations loaded — search a location first.
            </div>
          ) : (
            <>
              {/* ── Summary stats ── */}
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

              {/* ── Price distribution ── */}
              {distribution.length > 1 && (
                <div className="charts-section">
                  <h3 className="charts-section-title">Price Distribution</h3>
                  <p className="charts-section-sub">Number of stations at each price point</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={distribution} margin={{ top: 4, right: 8, left: -24, bottom: 4 }}>
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: "#94a3b8" }}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "#94a3b8" }}
                        allowDecimals={false}
                        width={28}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#1e2330", border: "1px solid #334155",
                          borderRadius: 8, fontSize: 12,
                        }}
                        formatter={(v) => {
                          const n = Number(v);
                          return [`${n} station${n !== 1 ? "s" : ""}`, "Count"];
                        }}
                      />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {distribution.map((entry, i) => (
                          <Cell key={i} fill={priceColor(entry.price)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* ── Top 10 cheapest horizontal bar ── */}
              {cheapestTop.length > 0 && (
                <div className="charts-section">
                  <h3 className="charts-section-title">Top 10 Cheapest Stations</h3>
                  <p className="charts-section-sub">Dashed line = area average</p>
                  <ResponsiveContainer width="100%" height={Math.max(220, cheapestTop.length * 36)}>
                    <BarChart
                      data={cheapestTop}
                      layout="vertical"
                      margin={{ top: 4, right: 52, left: 4, bottom: 4 }}
                    >
                      <XAxis
                        type="number"
                        domain={[minP * 0.995, maxP * 1.005]}
                        tick={{ fontSize: 10, fill: "#94a3b8" }}
                        tickFormatter={v => `${v.toFixed(0)}¢`}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fontSize: 10, fill: "#e2e8f0" }}
                        width={88}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#1e2330", border: "1px solid #334155",
                          borderRadius: 8, fontSize: 12,
                        }}
                        formatter={(v, _name, p) => {
                          const price = Number(v);
                          const dist  = (p as { payload?: { dist?: number } })?.payload?.dist;
                          const distStr = dist !== undefined
                            ? ` · ${dist < 1 ? Math.round(dist * 1000) + "m" : dist.toFixed(1) + "km"}`
                            : "";
                          return [`${price.toFixed(1)}¢${distStr}`, "Price"];
                        }}
                      />
                      <ReferenceLine
                        x={avg}
                        stroke="#64748b"
                        strokeDasharray="4 2"
                        label={{ value: "avg", fill: "#64748b", fontSize: 9, position: "insideTopLeft" }}
                      />
                      <Bar dataKey="price" radius={[0, 4, 4, 0]}>
                        {cheapestTop.map((entry, i) => (
                          <Cell key={i} fill={priceColor(entry.price)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* ── Coming soon ── */}
              <div className="charts-coming-soon">
                <div className="charts-cs-icon">📈</div>
                <div>
                  <div className="charts-cs-title">Price Trends Over Time</div>
                  <div className="charts-cs-sub">
                    7-day and 30-day historical averages, AIP wholesale terminal gate prices,
                    and regional comparisons — coming in the next update.
                  </div>
                </div>
              </div>
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
