import { useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import type { Station, FuelType } from "./types/fuel";
import { usePriceHistory } from "./hooks";

interface StationSheetProps {
  station: Station | null;
  allStationsForStation: Station[];
  onClose: () => void;
}

function formatPrice(cents: number) { return `${cents.toFixed(1)}¢`; }
function formatDistance(km: number | undefined) {
  if (km === undefined) return "–";
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

// Trend relative to the previous data point
function Trend({ history }: { history: { price: number }[] }) {
  if (history.length < 2) return null;
  const latest = history[history.length - 1].price;
  const prev   = history[history.length - 2].price;
  const diff   = latest - prev;
  if (diff === 0) return <span className="trend neutral">→ Stable</span>;
  if (diff > 0)   return <span className="trend rising">↑ +{diff.toFixed(1)}¢ vs yesterday</span>;
  return              <span className="trend falling">↓ {diff.toFixed(1)}¢ vs yesterday</span>;
}

// Custom tooltip for the chart
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{label}</div>
      <div className="chart-tooltip-price">{formatPrice(payload[0].value)}</div>
    </div>
  );
}

export default function StationSheet({ station, allStationsForStation, onClose }: StationSheetProps) {
  const [selectedFuel, setSelectedFuel] = useState<FuelType | null>(null);

  // The fuel type to show history for — default to the station's current fuel type
  const activeFuel = selectedFuel ?? station?.fuel_type ?? "U91";

  const { history, loading: histLoading } = usePriceHistory(
    station?.station_id ?? null,
    activeFuel
  );

  if (!station) return null;

  function openDirections() {
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${station!.lat},${station!.lng}`,
      "_blank"
    );
  }

  const updatedAt = new Date(station.recorded_at).toLocaleString([], {
    day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit",
  });

  // Chart Y-axis domain — add 2¢ padding top/bottom
  const prices = history.map(h => h.price);
  const yMin = prices.length ? Math.floor(Math.min(...prices)) - 2 : 0;
  const yMax = prices.length ? Math.ceil(Math.max(...prices))  + 2 : 300;

  // Trend colour for the chart line
  const trendColor = history.length >= 2
    ? history[history.length - 1].price > history[history.length - 2].price
      ? "#ef4444"   // rising = red
      : "#22c55e"   // falling = green (cheaper = good)
    : "#3b82f6";

  return (
    <>
      {/* Backdrop — sheet lives INSIDE so flex-end alignment works */}
      <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />

        {/* Header */}
        <div className="sheet-header">
          <div className="sheet-header-info">
            <h2 className="sheet-name">{station.name}</h2>
            <p className="sheet-meta">{station.brand ?? ""}{station.address ? ` · ${station.address}` : ""}</p>
            <p className="sheet-meta">{formatDistance(station.distance_km)} away · Updated {updatedAt}</p>
          </div>
          <button className="sheet-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Fuel type tabs */}
        {allStationsForStation.length > 0 && (
          <div className="sheet-fuel-tabs">
            {allStationsForStation
              .sort((a, b) => a.price_cents - b.price_cents)
              .map(s => (
                <button
                  key={s.fuel_type}
                  className={`sheet-fuel-tab${activeFuel === s.fuel_type ? " active" : ""}`}
                  onClick={() => setSelectedFuel(s.fuel_type as FuelType)}
                >
                  <span className="tab-fuel">{s.fuel_type}</span>
                  <span className="tab-price">{formatPrice(s.price_cents)}</span>
                </button>
              ))
            }
          </div>
        )}

        {/* Price history chart */}
        <div className="sheet-chart-section">
          <div className="sheet-chart-header">
            <span className="sheet-chart-title">30-Day Price History · {activeFuel}</span>
            {!histLoading && <Trend history={history} />}
          </div>

          {histLoading ? (
            <div className="chart-loading">Loading history…</div>
          ) : history.length < 2 ? (
            <div className="chart-empty">Not enough history yet — check back after a few refreshes.</div>
          ) : (
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={history} margin={{ top: 4, right: 12, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="10%"  stopColor={trendColor} stopOpacity={0.25} />
                      <stop offset="95%"  stopColor={trendColor} stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3a" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "#64748b", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    domain={[yMin, yMax]}
                    tick={{ fill: "#64748b", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => `${v}¢`}
                    width={42}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="price"
                    stroke={trendColor}
                    strokeWidth={2}
                    fill="url(#priceGradient)"
                    dot={false}
                    activeDot={{ r: 4, fill: trendColor, stroke: "#0f1117", strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="sheet-actions">
          <button className="sheet-directions-btn" onClick={openDirections}>
            🧭 Get Directions
          </button>
          <button className="sheet-close-btn" onClick={onClose}>Close</button>
        </div>
      </div>
      </div>
    </>
  );
}
