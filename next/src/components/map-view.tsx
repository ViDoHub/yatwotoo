"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icon
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

interface MarkerData {
  lat: number;
  lng: number;
  price?: number | null;
  rooms?: number | null;
  sqm?: number | null;
  address: string;
  yad2_id: string;
}

interface MapViewProps {
  filterParams: string; // URLSearchParams string with current filters
}

function MapMarkers({ filterParams }: { filterParams: string }) {
  const map = useMap();
  const [markers, setMarkers] = useState<MarkerData[]>([]);
  const [total, setTotal] = useState(0);
  const fittedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const loadMarkers = useCallback(async (fitBounds: boolean) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    try {
      const resp = await fetch(`/api/markers?${filterParams}`, {
        signal: abortRef.current.signal,
      });
      const data = await resp.json();
      setMarkers(data.markers || []);
      setTotal(data.total || 0);

      if (fitBounds && data.markers?.length > 0) {
        const positions = data.markers.map((m: MarkerData) => [m.lat, m.lng] as [number, number]);
        map.fitBounds(L.latLngBounds(positions), { padding: [30, 30] });
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") console.error(e);
    }
  }, [filterParams, map]);

  // Initial load — fit bounds
  useEffect(() => {
    if (!fittedRef.current) {
      fittedRef.current = true;
      loadMarkers(true);
    } else {
      loadMarkers(true);
    }
  }, [loadMarkers]);

  return (
    <>
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow text-xs font-medium text-[#1d1d1f]">
        {total} listing{total !== 1 ? "s" : ""} on map
      </div>
      {markers.map((m) => (
        <Marker key={m.yad2_id} position={[m.lat, m.lng]}>
          <Popup>
            <div className="text-sm">
              <div className="font-semibold">
                {m.price ? `₪${m.price.toLocaleString()}` : "N/A"}
              </div>
              <div>{m.address}</div>
              <div className="text-[#86868b]">
                {m.rooms && `${m.rooms} rooms`}
                {m.sqm && ` · ${m.sqm} m²`}
              </div>
              <a href={`/listings/${m.yad2_id}`} className="text-[#0071e3] text-xs">
                Details →
              </a>
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  );
}

export function MapView({ filterParams }: MapViewProps) {
  const defaultCenter: [number, number] = [31.7683, 35.2137];

  return (
    <div className="relative w-full h-full">
      <MapContainer
        center={defaultCenter}
        zoom={8}
        className="w-full h-full"
        style={{ zIndex: 0 }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapMarkers filterParams={filterParams} />
      </MapContainer>
    </div>
  );
}
