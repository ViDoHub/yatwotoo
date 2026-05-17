"use client";

import Link from "next/link";
import type { Listing } from "@/types";

interface ListingCardProps {
  listing: Listing;
  onHide?: (yad2Id: string) => void;
  onUnhide?: (yad2Id: string) => void;
  isOnBoard?: boolean;
  onToggleBoard?: (listingId: string, isOnBoard: boolean) => void;
}

const AMENITY_GROUPS: { label: string; color: string; items: Record<string, string> }[] = [
  {
    label: "Comfort",
    color: "bg-[#eef6ff] text-[#3b82f6]",
    items: { air_conditioning: "A/C", furnished: "Furnished", renovated: "Renovated", balcony: "Balcony" },
  },
  {
    label: "Access",
    color: "bg-[#f0fdf4] text-[#22c55e]",
    items: { elevator: "Elevator", parking: "Parking", accessible: "Accessible" },
  },
  {
    label: "Safety",
    color: "bg-[#fef9ee] text-[#f59e0b]",
    items: { shelter: "Shelter", bars: "Bars" },
  },
  {
    label: "Other",
    color: "bg-[#f5f5f7] text-[#86868b]",
    items: { pets_allowed: "Pets OK", storage: "Storage", long_term: "Long Term", for_partners: "Roommates OK" },
  },
];

export function ListingCard({ listing, onHide, onUnhide, isOnBoard, onToggleBoard }: ListingCardProps) {
  const imageUrl = listing.images?.[0] || null;
  const dateStr = listing.date_added
    ? listing.date_added.slice(0, 10).split("-").reverse().join("/")
    : listing.first_seen_at
    ? new Date(listing.first_seen_at).toLocaleDateString("en-GB")
    : null;

  const activeAmenityGroups = AMENITY_GROUPS.map((group) => ({
    ...group,
    active: Object.entries(group.items).filter(
      ([key]) => (listing as Record<string, unknown>)[key]
    ),
  })).filter((group) => group.active.length > 0);

  const isRent = listing.deal_type === "rent";
  const isForSale = listing.deal_type === "forsale";

  return (
    <div className="group bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.04),0_0_0_1px_rgba(0,0,0,0.03)] p-3 transition-all hover:shadow-[0_4px_20px_rgba(0,0,0,0.08)]">
      {/* Desktop: 3-zone horizontal | Mobile: stacked */}
      <div className="flex gap-3 sm:gap-4">

        {/* === LEFT ZONE: Price + Image + Date === */}
        <Link
          href={`/listings/${listing.yad2_id}`}
          className="shrink-0 w-[140px] flex flex-col items-center no-underline text-inherit"
        >
          {/* Price */}
          {listing.price != null ? (
            <div className="text-center mb-1">
              <div className="text-base sm:text-lg font-semibold text-[#0071e3] leading-tight">
                {listing.price.toLocaleString()} ₪{isRent && <span className="text-[0.625rem] font-normal text-[#86868b]"> /month</span>}
              </div>
            </div>
          ) : (
            <div className="text-center mb-1">
              <div className="text-xs text-[#aeaeb2]">No price</div>
            </div>
          )}

          {/* Image */}
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

          {/* Published date */}
          {dateStr && (
            <div className="text-[0.6875rem] text-[#aeaeb2] mt-1 text-center">{dateStr}</div>
          )}
        </Link>

        {/* === MIDDLE ZONE: Address + Description === */}
        <Link
          href={`/listings/${listing.yad2_id}`}
          className="flex-1 min-w-0 no-underline text-inherit flex flex-col"
        >
          {/* Address */}
          <h3 className="font-medium text-[0.9375rem] text-[#1d1d1f] leading-snug text-right" dir="rtl">
            {listing.city}
            {listing.street ? `, ${listing.street}` : ""}
            {listing.house_number ? ` ${listing.house_number}` : ""}
          </h3>
          {listing.neighborhood && (
            <p className="text-[0.8125rem] text-[#86868b] mt-0.5 text-right font-semibold" dir="rtl">{listing.neighborhood}</p>
          )}

          {/* Description (RTL) */}
          {listing.description && (
            <p className="text-xs text-[#86868b] mt-2 leading-relaxed line-clamp-3 text-right flex-1" dir="rtl">
              {listing.description}
            </p>
          )}
        </Link>

        {/* === RIGHT ZONE: Specs + Amenities (hidden on mobile, shown below instead) === */}
        <div className="hidden sm:flex shrink-0 w-[160px] flex-col gap-3">
          {/* Specs */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3 text-[0.8125rem]">
              {listing.rooms != null && (
                <span className="text-[#1d1d1f]">
                  <span className="text-[#86868b]">Rooms</span> {listing.rooms}
                </span>
              )}
              {listing.floor != null && (
                <span className="text-[#1d1d1f]">
                  <span className="text-[#86868b]">Floor</span> {listing.floor}{listing.total_floors ? `/${listing.total_floors}` : ""}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-[0.8125rem]">
              {listing.sqm != null && (
                <span className="text-[#1d1d1f]">
                  <span className="text-[#86868b]">Area</span> {listing.sqm} sqm
                </span>
              )}
              {listing.price_per_sqm != null && (
                <span className="text-[#1d1d1f]">
                  <span className="text-[#86868b]">₪/sqm</span> {Math.round(listing.price_per_sqm)}
                </span>
              )}
            </div>
          </div>

          {/* Amenities */}
          {activeAmenityGroups.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {activeAmenityGroups.map((group) =>
                group.active.map(([key, label]) => (
                  <span key={key} className={`text-[0.625rem] px-1.5 py-[2px] rounded-full ${group.color}`}>
                    {label}
                    {key === "parking" && listing.parking_spots && listing.parking_spots > 1
                      ? ` (${listing.parking_spots})`
                      : ""}
                  </span>
                ))
              )}
            </div>
          )}
        </div>

        {/* === ACTION STRIP: Heart + Eye icon + Vertical deal-type tag === */}
        <div className="shrink-0 flex flex-col items-center gap-1 pt-0.5">
          {/* Board heart toggle */}
          {onToggleBoard && (
            <button
              onClick={() => onToggleBoard(listing.id, !!isOnBoard)}
              title={isOnBoard ? "Remove from board" : "Add to board"}
              className={`p-1 rounded-lg transition-colors bg-transparent border-none cursor-pointer ${
                isOnBoard
                  ? "text-[#ff3b30] hover:bg-[#fff0f0]"
                  : "text-[#aeaeb2] hover:bg-[#fff0f0] hover:text-[#ff3b30]"
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill={isOnBoard ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
              </svg>
            </button>
          )}

          {/* Hide/Unhide */}
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

          {/* Vertical deal-type tag */}
          {(isRent || isForSale) && (
            <span
              className={`text-[0.5625rem] font-bold tracking-wider px-1 py-2 rounded-md ${
                isRent
                  ? "bg-[#e8f4fd] text-[#0071e3]"
                  : "bg-[#e6f9e6] text-[#34c759]"
              }`}
              style={{ writingMode: "vertical-rl", textOrientation: "upright" }}
            >
              {isRent ? "RENT" : "BUY"}
            </span>
          )}
        </div>
      </div>

      {/* === MOBILE BOTTOM: Specs + Amenities (visible only on small screens) === */}
      <div className="sm:hidden mt-3 pt-3 border-t border-[#f0f0f2]">
        {/* Specs row */}
        <div className="flex items-center gap-3 flex-wrap text-[0.8125rem]">
          {listing.rooms != null && (
            <span className="text-[#1d1d1f]">
              <span className="text-[#86868b]">Rooms</span> {listing.rooms}
            </span>
          )}
          {listing.sqm != null && (
            <span className="text-[#1d1d1f]">
              <span className="text-[#86868b]">·</span> {listing.sqm} sqm
            </span>
          )}
          {listing.floor != null && (
            <span className="text-[#1d1d1f]">
              <span className="text-[#86868b]">·</span> Fl. {listing.floor}
            </span>
          )}
          {listing.price_per_sqm != null && (
            <span className="text-[#1d1d1f]">
              <span className="text-[#86868b]">·</span> {Math.round(listing.price_per_sqm)} ₪/sqm
            </span>
          )}
        </div>

        {/* Amenities */}
        {activeAmenityGroups.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {activeAmenityGroups.map((group) =>
              group.active.map(([key, label]) => (
                <span key={key} className={`text-[0.625rem] px-1.5 py-[2px] rounded-full ${group.color}`}>
                  {label}
                  {key === "parking" && listing.parking_spots && listing.parking_spots > 1
                    ? ` (${listing.parking_spots})`
                    : ""}
                </span>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
