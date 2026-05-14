"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Listing, PriceHistory } from "@/types";

const ListingMapModal = dynamic(() => import("@/components/listing-map-modal"), { ssr: false });

interface Props {
  listing: Listing;
  priceHistory: PriceHistory[];
  coordinates?: [number, number] | null;
}

const AMENITY_LABELS: Record<string, string> = {
  parking: "🅿️ Parking",
  elevator: "🛗 Elevator",
  balcony: "🌅 Balcony",
  pets_allowed: "🐾 Pets",
  air_conditioning: "❄️ A/C",
  furnished: "🛋️ Furnished",
  shelter: "🛡️ Shelter",
  accessible: "♿ Accessible",
  bars: "🔒 Bars",
  boiler: "🔥 Boiler",
  renovated: "✨ Renovated",
  long_term: "📅 Long Term",
  storage: "📦 Storage",
  for_partners: "👥 Partners",
};

export function ListingDetailClient({ listing, priceHistory, coordinates }: Props) {
  const router = useRouter();
  const [hidden, setHidden] = useState(listing.is_hidden);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [showMap, setShowMap] = useState(false);

  async function toggleHide() {
    const action = hidden ? "unhide" : "hide";
    await fetch(`/api/listings/${listing.yad2_id}/${action}`, { method: "POST" });
    setHidden(!hidden);
    toast.success(hidden ? "Listing unhidden" : "Listing hidden");
  }

  const amenities = Object.entries(AMENITY_LABELS)
    .filter(([key]) => (listing as Record<string, unknown>)[key] === true)
    .map(([key, label]) => label);

  return (
    <div dir="ltr" className="max-w-5xl mx-auto">
      {/* Back button */}
      <button
        onClick={() => router.back()}
        className="text-sm text-[#0071e3] mb-4 bg-transparent border-none cursor-pointer hover:underline"
      >
        ← Back to listings
      </button>

      {/* Image Gallery */}
      {listing.images?.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-4 mb-6 snap-x">
          {listing.images.map((img, i) => (
            <img
              key={i}
              src={img}
              alt={`Photo ${i + 1}`}
              className="h-64 rounded-2xl object-cover snap-start flex-shrink-0 cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => setLightboxIdx(i)}
            />
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxIdx !== null && listing.images?.length > 0 && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
          onClick={() => setLightboxIdx(null)}
        >
          <button
            className="absolute top-4 right-4 text-white text-3xl bg-transparent border-none cursor-pointer z-10 hover:opacity-70"
            onClick={() => setLightboxIdx(null)}
          >
            ✕
          </button>
          {lightboxIdx > 0 && (
            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white text-4xl bg-black/40 rounded-full w-12 h-12 flex items-center justify-center border-none cursor-pointer hover:bg-black/60"
              onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx - 1); }}
            >
              ‹
            </button>
          )}
          {lightboxIdx < listing.images.length - 1 && (
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white text-4xl bg-black/40 rounded-full w-12 h-12 flex items-center justify-center border-none cursor-pointer hover:bg-black/60"
              onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx + 1); }}
            >
              ›
            </button>
          )}
          <img
            src={listing.images[lightboxIdx]}
            alt={`Photo ${lightboxIdx + 1}`}
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="absolute bottom-4 text-white text-sm opacity-70">
            {lightboxIdx + 1} / {listing.images.length}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl mx-auto">
        {/* LEFT: Price + Specs + Amenities + Extra Details */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-6">
              {/* Deal Type - Price */}
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <Badge
                    className={
                      listing.deal_type === "forsale"
                        ? "bg-[#34c759]/10 text-[#34c759]"
                        : "bg-[#0071e3]/10 text-[#0071e3]"
                    }
                  >
                    {listing.deal_type === "forsale" ? "For Sale" : "Rent"}
                  </Badge>
                  <div className="text-3xl font-semibold tracking-tight text-[#1d1d1f]">
                    {listing.price ? `₪${listing.price.toLocaleString()}` : "N/A"}
                    {listing.deal_type === "rent" && (
                      <span className="text-lg text-[#86868b] font-normal"> /month</span>
                    )}
                  </div>
                </div>
                {listing.price_per_sqm && (
                  <div className="text-sm text-[#86868b] ml-1">
                    ₪{Math.round(listing.price_per_sqm)}/m²
                  </div>
                )}
              </div>

              {/* Key Details */}
              <div className="grid grid-cols-3 gap-4 mb-4 border-t border-black/[0.04] pt-4">
                {listing.rooms && (
                  <div>
                    <div className="text-lg font-medium">{listing.rooms}</div>
                    <div className="text-xs text-[#86868b]">Rooms</div>
                  </div>
                )}
                {listing.sqm && (
                  <div>
                    <div className="text-lg font-medium">{listing.sqm} m²</div>
                    <div className="text-xs text-[#86868b]">Area</div>
                  </div>
                )}
                {listing.floor != null && (
                  <div>
                    <div className="text-lg font-medium">{listing.floor}{listing.total_floors ? `/${listing.total_floors}` : ""}</div>
                    <div className="text-xs text-[#86868b]">Floor</div>
                  </div>
                )}
              </div>

              {/* Amenities */}
              {amenities.length > 0 && (
                <div className="border-t border-black/[0.04] pt-4 mb-4">
                  <h3 className="text-sm font-medium mb-3">Amenities</h3>
                  <div className="flex flex-wrap gap-2">
                    {amenities.map((label) => (
                      <Badge key={label} variant="secondary" className="text-xs">
                        {label}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Extra Details */}
              <div className="border-t border-black/[0.04] pt-4 space-y-2 text-sm">
                {listing.entry_date && (
                  <Detail label="Entry Date" value={listing.entry_date.split("-").reverse().join("/")} />
                )}
                {listing.property_tax && (
                  <Detail label="Property Tax" value={`₪${listing.property_tax}`} />
                )}
                {listing.house_committee && (
                  <Detail label="House Committee" value={`₪${listing.house_committee}`} />
                )}
                {listing.contact_name && (
                  <Detail label="Contact" value={listing.contact_name} />
                )}
                {listing.parking_spots && (
                  <Detail label="Parking Spots" value={String(listing.parking_spots)} />
                )}
                {listing.garden_area && (
                  <Detail label="Garden" value={`${listing.garden_area} m²`} />
                )}
                <Detail
                  label="Published"
                  value={new Date(listing.first_seen_at).toLocaleDateString("en-GB")}
                />
                <Detail
                  label="Updated"
                  value={new Date(listing.last_seen_at).toLocaleDateString("en-GB")}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: Actions + Address + Description + Price History */}
        <div className="space-y-4">
          {/* Address + Actions */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={toggleHide}
                    title={hidden ? "Unhide Listing" : "Hide Listing"}
                    className="flex items-center justify-center w-8 h-8 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] transition-colors cursor-pointer"
                  >
                    {hidden ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    )}
                  </button>
                  <a
                    href={listing.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="View on Yad2"
                    className="flex items-center justify-center w-8 h-8 rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-white transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  </a>
                  <button
                    onClick={() => {
                      if (coordinates) {
                        setShowMap(true);
                      } else {
                        toast.error("No location data for this listing");
                      }
                    }}
                    title="View on Map"
                    className="flex items-center justify-center w-8 h-8 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] transition-colors cursor-pointer"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  </button>
                </div>
                <div className="text-right flex-1 mr-4" dir="rtl">
                  <h1 className="text-xl font-semibold text-[#1d1d1f]">
                    {[listing.city, listing.street].filter(Boolean).join(", ")}
                    {listing.house_number ? ` ${listing.house_number}` : ""}
                  </h1>
                  {listing.neighborhood && (
                    <div className="text-sm text-[#86868b] mt-1">{listing.neighborhood}</div>
                  )}
                </div>
              </div>

              {listing.description && (
                <div className="border-t border-black/[0.04] pt-4">
                  <h3 className="text-sm font-medium mb-2 text-right" dir="rtl">תיאור</h3>
                  <p className="text-sm text-[#86868b] whitespace-pre-line" dir="rtl">
                    {listing.description}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Price History */}
          {priceHistory.length > 1 && (
            <Card>
              <CardContent className="p-6">
                <h3 className="text-sm font-medium mb-3">Price History</h3>
                <div className="space-y-2">
                  {priceHistory.map((entry, i) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-[#86868b]">
                        {new Date(entry.observed_at).toLocaleDateString("en-GB")}{" "}
                        {new Date(entry.observed_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className="font-medium">
                        ₪{entry.price.toLocaleString()}
                        {i > 0 && entry.price < priceHistory[i - 1].price && (
                          <span className="text-[#34c759] ml-2 text-xs">
                            ↓ {(priceHistory[i - 1].price - entry.price).toLocaleString()}
                          </span>
                        )}
                        {i > 0 && entry.price > priceHistory[i - 1].price && (
                          <span className="text-[#ff3b30] ml-2 text-xs">
                            ↑ {(entry.price - priceHistory[i - 1].price).toLocaleString()}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Map Modal */}
      {showMap && coordinates && (
        <ListingMapModal
          lat={coordinates[1]}
          lng={coordinates[0]}
          address={[listing.city, listing.street].filter(Boolean).join(", ")}
          onClose={() => setShowMap(false)}
        />
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-[#86868b]">{label}</span>
      <span className="font-medium text-[#1d1d1f]">{value}</span>
    </div>
  );
}
