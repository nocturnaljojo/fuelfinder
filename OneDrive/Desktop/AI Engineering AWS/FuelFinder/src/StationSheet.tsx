import type { Station } from "./types/fuel";

interface StationSheetProps {
  station: Station | null;
  allStationsForStation: Station[]; // all fuel types for this station_id
  onClose: () => void;
}

function formatPrice(cents: number) {
  return `${cents.toFixed(1)}¢`;
}

function formatDistance(km: number | undefined) {
  if (km === undefined) return "–";
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

export default function StationSheet({ station, allStationsForStation, onClose }: StationSheetProps) {
  if (!station) return null;

  function openDirections() {
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${station!.lat},${station!.lng}`,
      "_blank"
    );
  }

  const updatedAt = new Date(station.recorded_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <>
      {/* Backdrop */}
      <div className="sheet-backdrop" onClick={onClose} />

      {/* Sheet */}
      <div className="sheet">
        {/* Drag handle */}
        <div className="sheet-handle" />

        {/* Header */}
        <div className="sheet-header">
          <div>
            <h2 className="sheet-name">{station.name}</h2>
            <p className="sheet-meta">
              {station.brand ?? ""}
              {station.address ? ` · ${station.address}` : ""}
            </p>
            <p className="sheet-meta">
              {formatDistance(station.distance_km)} away · Updated {updatedAt}
            </p>
          </div>
          <button className="sheet-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Fuel prices grid */}
        <div className="sheet-prices">
          {allStationsForStation.length > 0 ? (
            allStationsForStation
              .sort((a, b) => a.price_cents - b.price_cents)
              .map((s) => (
                <div key={s.fuel_type} className="sheet-price-row">
                  <span className="sheet-fuel-type">{s.fuel_type}</span>
                  <span className="sheet-price-val">{formatPrice(s.price_cents)}</span>
                </div>
              ))
          ) : (
            <div className="sheet-price-row">
              <span className="sheet-fuel-type">{station.fuel_type}</span>
              <span className="sheet-price-val">{formatPrice(station.price_cents)}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="sheet-actions">
          <button className="sheet-directions-btn" onClick={openDirections}>
            🧭 Get Directions
          </button>
          <button className="sheet-close-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </>
  );
}
