"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Fix default marker icon
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

interface MapMarker {
  yad2_id: string;
  price: number | null;
  rooms: number | null;
  sqm: number | null;
  city: string;
  street: string;
  neighborhood: string;
  deal_type: string;
  location: unknown;
}

function MapEvents({ onBoundsChange }: { onBoundsChange: (bounds: L.LatLngBounds) => void }) {
  useMapEvents({
    moveend: (e) => {
      onBoundsChange(e.target.getBounds());
    },
    zoomend: (e) => {
      onBoundsChange(e.target.getBounds());
    },
  });
  return null;
}

export default function MapClient() {
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [dealType, setDealType] = useState<string>("rent");
  const [loading, setLoading] = useState(false);
  const boundsRef = useRef<L.LatLngBounds | null>(null);

  // Israel center
  const defaultCenter: [number, number] = [31.7683, 35.2137];
  const defaultZoom = 8;

  const fetchMarkers = useCallback(async (bounds: L.LatLngBounds) => {
    setLoading(true);
    const params = new URLSearchParams({
      south: String(bounds.getSouth()),
      west: String(bounds.getWest()),
      north: String(bounds.getNorth()),
      east: String(bounds.getEast()),
      deal_type: dealType,
    });

    try {
      const resp = await fetch(`/api/markers?${params.toString()}`);
      const data = await resp.json();
      setMarkers(data.markers ?? []);
    } catch {
      console.error("Failed to fetch markers");
    } finally {
      setLoading(false);
    }
  }, [dealType]);

  function handleBoundsChange(bounds: L.LatLngBounds) {
    boundsRef.current = bounds;
    fetchMarkers(bounds);
  }

  useEffect(() => {
    if (boundsRef.current) {
      fetchMarkers(boundsRef.current);
    }
  }, [dealType, fetchMarkers]);

  // Parse location from listing — handle WKT POINT format
  function getLatLng(location: unknown): [number, number] | null {
    if (!location) return null;
    if (typeof location === "string") {
      // SRID=4326;POINT(lng lat)
      const match = location.match(/POINT\(([\d.-]+)\s+([\d.-]+)\)/);
      if (match) {
        return [parseFloat(match[2]), parseFloat(match[1])];
      }
    }
    if (typeof location === "object" && location !== null) {
      const obj = location as Record<string, unknown>;
      if (obj.coordinates && Array.isArray(obj.coordinates)) {
        return [obj.coordinates[1] as number, obj.coordinates[0] as number];
      }
    }
    return null;
  }

  return (
    <div className="relative">
      {/* Filter overlay */}
      <div className="absolute top-4 left-4 z-[1000] bg-white rounded-xl shadow-lg p-3 flex items-center gap-2">
        <Select value={dealType} onValueChange={(v) => v && setDealType(v)}>
          <SelectTrigger className="w-28 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="rent">Rent</SelectItem>
            <SelectItem value="forsale">For Sale</SelectItem>
          </SelectContent>
        </Select>
        {loading && <span className="text-xs text-[#86868b]">Loading...</span>}
        <span className="text-xs text-[#86868b]">{markers.length} markers</span>
      </div>

      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        className="w-full h-[calc(100vh-8rem)] rounded-2xl"
        style={{ zIndex: 0 }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapEvents onBoundsChange={handleBoundsChange} />
        {markers.map((marker) => {
          const pos = getLatLng(marker.location);
          if (!pos) return null;
          return (
            <Marker key={marker.yad2_id} position={pos}>
              <Popup>
                <div className="text-sm">
                  <div className="font-semibold">
                    {marker.price ? `₪${marker.price.toLocaleString()}` : "N/A"}
                  </div>
                  <div>{marker.street}, {marker.city}</div>
                  <div className="text-[#86868b]">
                    {marker.rooms && `${marker.rooms} rooms`}
                    {marker.sqm && ` · ${marker.sqm} m²`}
                  </div>
                  <a
                    href={`/listings/${marker.yad2_id}`}
                    className="text-[#0071e3] text-xs"
                  >
                    Details →
                  </a>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
