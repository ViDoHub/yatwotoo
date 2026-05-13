"use client";

import dynamic from "next/dynamic";

const MapClient = dynamic(() => import("@/components/map-client"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[calc(100vh-8rem)] bg-[#f5f5f7] rounded-2xl flex items-center justify-center text-[#86868b]">
      Loading map...
    </div>
  ),
});

export default function MapPage() {
  return <MapClient />;
}
