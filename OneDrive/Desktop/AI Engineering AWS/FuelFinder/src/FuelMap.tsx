import { useEffect, useRef } from "react";
import L from "leaflet";
import type { Station } from "./types/fuel";

function priceColor(price: number, min: number, max: number): string {
  if (max === min) return "#22c55e";
  const r = (price - min) / (max - min);
  if (r < 0.33) return "#22c55e";
  if (r < 0.66) return "#f59e0b";
  return "#ef4444";
}

interface FuelMapProps {
  stations: Station[];
  userLat: number;
  userLng: number;
  onSelectStation: (station: Station) => void;
}

export default function FuelMap({ stations, userLat, userLng, onSelectStation }: FuelMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Layer[]>([]);

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, { zoomControl: true });
    map.setView([userLat, userLng], 12);
    setTimeout(() => map.invalidateSize(), 100);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OpenStreetMap &copy; CARTO",
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-centre when user location changes
  useEffect(() => {
    mapRef.current?.setView([userLat, userLng], mapRef.current.getZoom());
  }, [userLat, userLng]);

  // Redraw markers when stations change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove old markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const prices = stations.map((s) => s.price_cents);
    const min = prices.length ? Math.min(...prices) : 0;
    const max = prices.length ? Math.max(...prices) : 0;

    // User dot
    const userDot = L.circleMarker([userLat, userLng], {
      radius: 9,
      fillColor: "#3b82f6",
      color: "#fff",
      weight: 2.5,
      fillOpacity: 1,
    }).addTo(map).bindPopup("You are here");
    markersRef.current.push(userDot);

    // Station markers
    stations.forEach((s) => {
      const marker = L.circleMarker([s.lat, s.lng], {
        radius: 10,
        fillColor: priceColor(s.price_cents, min, max),
        color: "#fff",
        weight: 1.5,
        fillOpacity: 0.92,
      })
        .addTo(map)
        .bindPopup(`<strong>${s.name}</strong><br/>${s.brand ?? ""}<br/><span style="font-size:15px;font-weight:700">${s.price_cents.toFixed(1)}¢</span>`);

      marker.on("click", () => onSelectStation(s));
      markersRef.current.push(marker);
    });
  }, [stations, userLat, userLng, onSelectStation]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
