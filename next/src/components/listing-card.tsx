"use client";

import Link from "next/link";
import type { Listing } from "@/types";

interface ListingCardProps {
  listing: Listing;
  onHide?: (yad2Id: string) => void;
  onUnhide?: (yad2Id: string) => void;
}

const AMENITY_DISPLAY: Record<string, string> = {
  parking: "Parking",
  elevator: "Elevator",
  balcony: "Balcony",
  air_conditioning: "A/C",
  pets_allowed: "Pets OK",
  shelter: "Shelter",
  furnished: "Furnished",
  renovated: "Renovated",
  storage: "Storage",
  long_term: "Long Term",
  for_partners: "Roommates OK",
};

export function ListingCard({ listing, onHide, onUnhide }: ListingCardProps) {
  const imageUrl = listing.images?.[0] || null;
  const dateStr = listing.date_added
    ? listing.date_added.slice(0, 10).split("-").reverse().join("/")
    : listing.first_seen_at
    ? new Date(listing.first_seen_at).toLocaleDateString("en-GB")
    : null;

  // Collect amenities that are true
  const activeAmenities = Object.entries(AMENITY_DISPLAY).filter(
    ([key]) => (listing as Record<string, unknown>)[key]
  );

  return (
    <div className="group bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.04),0_0_0_1px_rgba(0,0,0,0.03)] p-4 transition-all hover:shadow-[0_4px_20px_rgba(0,0,0,0.08)]">
      <div className="flex gap-4">
        {/* Image */}
        <Link href={`/listings/${listing.yad2_id}`} className="shrink-0 w-[140px]">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              className="w-[140px] h-[100px] object-cover rounded-xl bg-[#f5f5f7]"
            />
          ) : (
            <div className="w-[140px] h-[100px] rounded-xl bg-[#f5f5f7] flex items-center justify-center">
              <svg className="w-7 h-7 text-[#d2d2d7]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </div>
          )}
          {dateStr && (
            <div className="text-[0.6875rem] text-[#aeaeb2] mt-1.5 text-center">{dateStr}</div>
          )}
        </Link>

        {/* Content */}
        <Link href={`/listings/${listing.yad2_id}`} className="flex-1 min-w-0 no-underline text-inherit">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-medium truncate text-[0.9375rem] text-[#1d1d1f]">
                  {listing.street}
                  {listing.house_number ? ` ${listing.house_number}` : ""}
                  {listing.city ? `, ${listing.city}` : ""}
                </h3>
                {listing.deal_type === "rent" && (
                  <span className="text-[0.625rem] font-semibold bg-[#e8f4fd] text-[#0071e3] px-[7px] py-[2px] rounded-full whitespace-nowrap">Rent</span>
                )}
                {listing.deal_type === "forsale" && (
                  <span className="text-[0.625rem] font-semibold bg-[#e6f9e6] text-[#1a7a1a] px-[7px] py-[2px] rounded-full whitespace-nowrap">ForSale</span>
                )}
              </div>
              {listing.neighborhood && (
                <p className="text-[0.8125rem] text-[#86868b] mt-0.5">{listing.neighborhood}</p>
              )}
            </div>
            {listing.price != null && (
              <div className="text-right shrink-0">
                <div className="text-lg font-semibold text-[#0071e3]">
                  {listing.price.toLocaleString()} ₪
                </div>
                {listing.deal_type === "rent" && (
                  <div className="text-[0.6875rem] text-[#86868b]">/month</div>
                )}
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 mt-2.5">
            {listing.rooms != null && (
              <span className="text-[0.8125rem] text-[#86868b]">{listing.rooms} rooms</span>
            )}
            {listing.sqm != null && (
              <span className="text-[0.8125rem] text-[#86868b]">{listing.sqm} sqm</span>
            )}
            {listing.floor != null && (
              <span className="text-[0.8125rem] text-[#86868b]">Floor {listing.floor}</span>
            )}
            {listing.price_per_sqm != null && (
              <span className="text-[0.8125rem] text-[#86868b]">{Math.round(listing.price_per_sqm)} ₪/sqm</span>
            )}
          </div>

          {/* Description (RTL) */}
          {listing.description && (
            <p className="text-xs text-[#86868b] mt-1.5 leading-relaxed line-clamp-2 text-right" dir="rtl">
              {listing.description}
            </p>
          )}

          {/* Amenity badges */}
          {activeAmenities.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {activeAmenities.map(([key, label]) => (
                <span key={key} className="text-[0.6875rem] bg-[#f5f5f7] text-[#86868b] px-2 py-[3px] rounded-full">
                  {label}
                  {key === "parking" && listing.parking_spots && listing.parking_spots > 1
                    ? ` (${listing.parking_spots})`
                    : ""}
                </span>
              ))}
            </div>
          )}
        </Link>

        {/* Hide/Unhide button */}
        <div className="shrink-0 flex items-start pt-1">
          {onUnhide && (
            <button
              onClick={() => onUnhide(listing.yad2_id)}
              title="Unhide listing"
              className="p-1.5 rounded-lg text-[#34c759] hover:bg-[#f0faf0] transition-colors bg-transparent border-none cursor-pointer"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
              </svg>
            </button>
          )}
          {onHide && (
            <button
              onClick={() => onHide(listing.yad2_id)}
              title="Hide listing"
              className="p-1.5 rounded-lg text-[#aeaeb2] hover:bg-[#fff0f0] hover:text-[#ff3b30] transition-colors bg-transparent border-none cursor-pointer"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
