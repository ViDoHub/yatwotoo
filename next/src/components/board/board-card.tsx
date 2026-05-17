"use client";

import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Listing, BoardColumn } from "@/types";

export interface BoardItem {
  id: string;
  listing_id: string;
  board_column: BoardColumn;
  position: number;
  contact_name: string;
  contact_phone: string;
  visit_date: string | null;
  notes: string;
  listings: Listing;
}

interface BoardCardProps {
  item: BoardItem;
  onRemove: (id: string) => void;
  onEditContacts: (item: BoardItem) => void;
  onEditVisit?: (item: BoardItem) => void;
  onCalendarSync?: (item: BoardItem) => string;
}

export function BoardCard({ item, onRemove, onEditContacts, onEditVisit, onCalendarSync }: BoardCardProps) {
  const listing = item.listings;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, data: { item } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const showContacts = item.board_column !== "review";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white rounded-xl shadow-[0_1px_6px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.03)] p-3 cursor-grab active:cursor-grabbing ${
        isDragging ? "ring-2 ring-[#0071e3]/40" : ""
      }`}
      {...attributes}
      {...listeners}
    >
      {/* Address + Price */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <Link
          href={`/listings/${listing.yad2_id}`}
          className="text-[0.8125rem] font-medium text-[#1d1d1f] no-underline hover:text-[#0071e3] leading-tight text-right flex-1"
          dir="rtl"
          onClick={(e) => e.stopPropagation()}
        >
          {listing.city}
          {listing.street ? `, ${listing.street}` : ""}
          {listing.house_number ? ` ${listing.house_number}` : ""}
        </Link>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(item.id);
          }}
          className="shrink-0 p-0.5 text-[#aeaeb2] hover:text-[#ff3b30] bg-transparent border-none cursor-pointer rounded transition-colors"
          title="Remove from board"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Specs row */}
      <div className="flex items-center gap-2 text-[0.6875rem] text-[#86868b] mb-1.5">
        {listing.price != null && (
          <span className="font-semibold text-[#0071e3]">
            ₪{listing.price.toLocaleString()}
          </span>
        )}
        {listing.rooms != null && <span>{listing.rooms} rm</span>}
        {listing.sqm != null && <span>{listing.sqm} m²</span>}
        {listing.floor != null && <span>Fl.{listing.floor}</span>}
      </div>

      {/* Deal type badge */}
      <div className="mb-1.5">
        <span
          className={`text-[0.5625rem] font-bold px-1.5 py-0.5 rounded ${
            listing.deal_type === "rent"
              ? "bg-[#e8f4fd] text-[#0071e3]"
              : "bg-[#e6f9e6] text-[#34c759]"
          }`}
        >
          {listing.deal_type === "rent" ? "RENT" : "BUY"}
        </span>
      </div>

      {/* Contact info (visible from get_contacts onward) */}
      {showContacts && (
        <div className="border-t border-black/[0.04] pt-1.5 mt-1">
          {item.contact_name || item.contact_phone ? (
            <div className="text-[0.6875rem] text-[#1d1d1f] space-y-0.5">
              {item.contact_name && (
                <div className="flex items-center gap-1">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <span>{item.contact_name}</span>
                </div>
              )}
              {item.contact_phone && (
                <div className="flex items-center gap-1">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                  </svg>
                  <a
                    href={`tel:${item.contact_phone}`}
                    className="text-[#0071e3] no-underline hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {item.contact_phone}
                  </a>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEditContacts(item);
              }}
              className="text-[0.6875rem] text-[#0071e3] bg-transparent border-none cursor-pointer p-0 hover:underline"
            >
              + Add contact info
            </button>
          )}
          {(item.contact_name || item.contact_phone) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEditContacts(item);
              }}
              className="text-[0.625rem] text-[#86868b] bg-transparent border-none cursor-pointer p-0 hover:underline mt-0.5"
            >
              Edit
            </button>
          )}
        </div>
      )}

      {/* Visit date/time (visible in visit column) */}
      {item.board_column === "visit" && (
        <div className="border-t border-black/[0.04] pt-1.5 mt-1">
          {item.visit_date ? (
            <div className="text-[0.6875rem] text-[#1d1d1f] space-y-1">
              <div className="flex items-center gap-1">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <span>
                  {new Date(item.visit_date).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                  {" "}
                  {new Date(item.visit_date).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {onCalendarSync && (
                  <a
                    href={onCalendarSync(item)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[0.625rem] text-[#4285f4] hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                    Google Calendar
                  </a>
                )}
                {onEditVisit && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditVisit(item);
                    }}
                    className="text-[0.625rem] text-[#86868b] bg-transparent border-none cursor-pointer p-0 hover:underline"
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>
          ) : (
            onEditVisit && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEditVisit(item);
                }}
                className="text-[0.6875rem] text-[#0071e3] bg-transparent border-none cursor-pointer p-0 hover:underline"
              >
                + Schedule visit
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
