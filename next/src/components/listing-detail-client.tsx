"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Listing, PriceHistory } from "@/types";

interface Props {
  listing: Listing;
  priceHistory: PriceHistory[];
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

export function ListingDetailClient({ listing, priceHistory }: Props) {
  const router = useRouter();
  const [hidden, setHidden] = useState(listing.is_hidden);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

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
    <div dir="ltr" className="max-w-4xl mx-auto">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardContent className="p-6">
              {/* Price & Type */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-3xl font-semibold tracking-tight text-[#1d1d1f]">
                    {listing.price ? `₪${listing.price.toLocaleString()}` : "N/A"}
                    {listing.deal_type === "rent" && (
                      <span className="text-lg text-[#86868b] font-normal">/mo</span>
                    )}
                  </div>
                  {listing.price_per_sqm && (
                    <div className="text-sm text-[#86868b]">
                      ₪{Math.round(listing.price_per_sqm)}/m²
                    </div>
                  )}
                </div>
                <Badge
                  className={
                    listing.deal_type === "forsale"
                      ? "bg-[#34c759]/10 text-[#34c759]"
                      : "bg-[#0071e3]/10 text-[#0071e3]"
                  }
                >
                  {listing.deal_type === "forsale" ? "For Sale" : "Rent"}
                </Badge>
              </div>

              {/* Address */}
              <div className="mb-4">
                <h1 className="text-lg font-semibold text-[#1d1d1f]">
                  {listing.street}
                  {listing.house_number && ` ${listing.house_number}`}
                  {listing.city && `, ${listing.city}`}
                </h1>
                {listing.neighborhood && (
                  <div className="text-sm text-[#86868b]">{listing.neighborhood}</div>
                )}
              </div>

              {/* Key Details */}
              <div className="grid grid-cols-3 gap-4 mb-4">
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
                    <div className="text-lg font-medium">{listing.floor}</div>
                    <div className="text-xs text-[#86868b]">Floor{listing.total_floors ? ` / ${listing.total_floors}` : ""}</div>
                  </div>
                )}
              </div>

              {/* Description */}
              {listing.description && (
                <div className="border-t border-black/[0.04] pt-4">
                  <h3 className="text-sm font-medium mb-2">Description</h3>
                  <p className="text-sm text-[#86868b] whitespace-pre-line" dir="rtl">
                    {listing.description}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Amenities */}
          {amenities.length > 0 && (
            <Card>
              <CardContent className="p-6">
                <h3 className="text-sm font-medium mb-3">Amenities</h3>
                <div className="flex flex-wrap gap-2">
                  {amenities.map((label) => (
                    <Badge key={label} variant="secondary" className="text-xs">
                      {label}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

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

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Actions */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <a
                href={listing.url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-[10px] h-9 px-4 text-sm font-medium"
              >
                View on Yad2
              </a>
              <Button
                variant="outline"
                className="w-full rounded-[10px]"
                onClick={toggleHide}
              >
                {hidden ? "Unhide" : "Hide"} Listing
              </Button>
            </CardContent>
          </Card>

          {/* Extra Details */}
          <Card>
            <CardContent className="p-4 space-y-2 text-sm">
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
            </CardContent>
          </Card>
        </div>
      </div>
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
