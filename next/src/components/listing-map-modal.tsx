"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icon
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

interface ListingMapModalProps {
  lat: number;
  lng: number;
  address: string;
  onClose: () => void;
}

export default function ListingMapModal({ lat, lng, address, onClose }: ListingMapModalProps) {
  return (
    <div
      className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl overflow-hidden w-full max-w-2xl h-[70vh] relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="absolute top-3 right-3 z-[1000] bg-white/90 hover:bg-white rounded-full w-8 h-8 flex items-center justify-center text-lg border-none cursor-pointer shadow-md"
          onClick={onClose}
        >
          ✕
        </button>
        <MapContainer
          center={[lat, lng]}
          zoom={16}
          className="w-full h-full"
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={[lat, lng]}>
            <Popup>{address}</Popup>
          </Marker>
        </MapContainer>
      </div>
    </div>
  );
}
