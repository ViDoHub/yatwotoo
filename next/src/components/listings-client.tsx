"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ListingCard } from "@/components/listing-card";
import type { Listing } from "@/types";
import { REGIONS } from "@/lib/constants";

const MapView = dynamic(() => import("@/components/map-view").then((m) => m.MapView), { ssr: false });

const AMENITY_LABELS: Record<string, string> = {
  parking: "Parking",
  elevator: "Elevator",
  balcony: "Balcony",
  pets_allowed: "Pets",
  air_conditioning: "A/C",
  furnished: "Furnished",
  shelter: "Shelter",
};

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price ↑" },
  { value: "price_desc", label: "Price ↓" },
  { value: "price_per_sqm_asc", label: "₪/sqm" },
  { value: "sqm_desc", label: "Largest" },
  { value: "rooms_asc", label: "Rooms ↑" },
];

interface ListingsResponse {
  listings: Listing[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export function ListingsClient({ hiddenMode = false }: { hiddenMode?: boolean }) {
  const searchParams = useSearchParams();
  const [data, setData] = useState<ListingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Storage key per mode
  const storageKey = hiddenMode ? "hidden_filters" : "listings_filters";

  // Filters — initialize from URL params only (sessionStorage restored in useEffect)
  const [dealType, setDealType] = useState(searchParams.get("deal_type") || "");
  const [topAreaIds, setTopAreaIds] = useState<string[]>(
    searchParams.get("top_area_ids")?.split(",").filter(Boolean) || []
  );
  const [cities, setCities] = useState<string[]>(
    searchParams.get("cities")?.split(",").filter(Boolean) || []
  );
  const [neighborhoods, setNeighborhoods] = useState<string[]>(
    searchParams.get("neighborhoods")?.split(",").filter(Boolean) || []
  );
  const [roomsMin, setRoomsMin] = useState(searchParams.get("rooms_min") || "");
  const [roomsMax, setRoomsMax] = useState(searchParams.get("rooms_max") || "");
  const [priceMin, setPriceMin] = useState(searchParams.get("price_min") || "");
  const [priceMax, setPriceMax] = useState(searchParams.get("price_max") || "");
  const [sqmMin, setSqmMin] = useState(searchParams.get("sqm_min") || "");
  const [sqmMax, setSqmMax] = useState(searchParams.get("sqm_max") || "");
  const [amenities, setAmenities] = useState<string[]>(
    searchParams.get("amenities")?.split(",").filter(Boolean) || []
  );
  const [sortBy, setSortBy] = useState<string[]>(
    searchParams.get("sort_by")?.split(",").filter(Boolean) || []
  );
  const showHidden = hiddenMode;
  const [hiddenCount, setHiddenCount] = useState(0);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [page, setPage] = useState(Number(searchParams.get("page") || 1));

  // Restore filters from sessionStorage on mount (only if URL has no filter params)
  useEffect(() => {
    if (searchParams.toString()) {
      setInitialized(true);
      return;
    }
    try {
      const stored = JSON.parse(sessionStorage.getItem(storageKey) || "{}");
      if (stored.dealType) setDealType(stored.dealType);
      if (stored.topAreaIds?.length) setTopAreaIds(stored.topAreaIds);
      if (stored.cities?.length) setCities(stored.cities);
      if (stored.neighborhoods?.length) setNeighborhoods(stored.neighborhoods);
      if (stored.roomsMin) setRoomsMin(stored.roomsMin);
      if (stored.roomsMax) setRoomsMax(stored.roomsMax);
      if (stored.priceMin) setPriceMin(stored.priceMin);
      if (stored.priceMax) setPriceMax(stored.priceMax);
      if (stored.sqmMin) setSqmMin(stored.sqmMin);
      if (stored.sqmMax) setSqmMax(stored.sqmMax);
      if (stored.amenities?.length) setAmenities(stored.amenities);
      if (stored.sortBy?.length) setSortBy(stored.sortBy);
      if (stored.page) setPage(stored.page);
    } catch { /* ignore */ }
    setInitialized(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // City & neighborhood options
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  const [neighborhoodOptions, setNeighborhoodOptions] = useState<string[]>([]);

  // Load neighborhoods when cities change
  useEffect(() => {
    if (cities.length === 0) {
      setNeighborhoodOptions([]);
      return;
    }
    fetch(`/api/neighborhoods?cities=${encodeURIComponent(cities.join(","))}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.neighborhoods)
          setNeighborhoodOptions(d.neighborhoods.map((n: { name: string }) => n.name));
      })
      .catch(() => {});
  }, [cities]);

  // Load cities when regions change
  useEffect(() => {
    const params = new URLSearchParams();
    if (topAreaIds.length) params.set("top_area_ids", topAreaIds.join(","));
    fetch(`/api/cities?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.cities) setCityOptions(d.cities);
      })
      .catch(() => {});
  }, [topAreaIds]);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (dealType) params.set("deal_type", dealType);
    if (cities.length) params.set("cities", cities.join(","));
    if (topAreaIds.length) params.set("top_area_ids", topAreaIds.join(","));
    if (neighborhoods.length) params.set("neighborhoods", neighborhoods.join(","));
    if (roomsMin) params.set("rooms_min", roomsMin);
    if (roomsMax) params.set("rooms_max", roomsMax);
    if (priceMin) params.set("price_min", priceMin);
    if (priceMax) params.set("price_max", priceMax);
    if (sqmMin) params.set("sqm_min", sqmMin);
    if (sqmMax) params.set("sqm_max", sqmMax);
    if (amenities.length) params.set("amenities", amenities.join(","));
    if (sortBy.length) params.set("sort_by", sortBy.join(","));
    if (showHidden) params.set("hidden", "true");
    params.set("page", String(page));

    try {
      const resp = await fetch(`/api/listings?${params.toString()}`);
      const json = await resp.json();
      setData(json);
      if (json.hidden_count !== undefined) setHiddenCount(json.hidden_count);
    } catch {
      toast.error("Failed to load listings");
    } finally {
      setLoading(false);
    }
  }, [dealType, cities, topAreaIds, neighborhoods, roomsMin, roomsMax, priceMin, priceMax, sqmMin, sqmMax, amenities, sortBy, showHidden, page]);

  useEffect(() => {
    if (initialized) fetchListings();
  }, [fetchListings, initialized]);

  // Persist filters to sessionStorage (only after initialized)
  useEffect(() => {
    if (!initialized) return;
    sessionStorage.setItem(storageKey, JSON.stringify({
      dealType, topAreaIds, cities, neighborhoods,
      roomsMin, roomsMax, priceMin, priceMax, sqmMin, sqmMax,
      amenities, sortBy, page,
    }));
  }, [initialized, dealType, topAreaIds, cities, neighborhoods, roomsMin, roomsMax, priceMin, priceMax, sqmMin, sqmMax, amenities, sortBy, page, storageKey]);

  function applyFilters() {
    setPage(1);
  }

  function clearFilters() {
    setDealType("");
    setTopAreaIds([]);
    setCities([]);
    setNeighborhoods([]);
    setRoomsMin("");
    setRoomsMax("");
    setPriceMin("");
    setPriceMax("");
    setSqmMin("");
    setSqmMax("");
    setAmenities([]);
    setSortBy([]);
    setPage(1);
    sessionStorage.removeItem(storageKey);
  }

  function toggleAmenity(key: string) {
    setAmenities((prev) =>
      prev.includes(key) ? prev.filter((a) => a !== key) : [...prev, key]
    );
  }

  function toggleSort(value: string) {
    setSortBy((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value]
    );
  }

  async function handleHide(yad2Id: string) {
    await fetch(`/api/listings/${yad2Id}/hide`, { method: "POST" });
    toast.success("Listing hidden");
    fetchListings();
  }

  async function handleUnhide(yad2Id: string) {
    await fetch(`/api/listings/${yad2Id}/unhide`, { method: "POST" });
    toast.success("Listing unhidden");
    fetchListings();
  }

  async function saveSearch() {
    const name = prompt("Search name:");
    if (!name) return;

    const filters: Record<string, unknown> = {};
    if (dealType) filters.deal_type = dealType;
    if (cities.length) filters.cities = cities;
    if (topAreaIds.length) filters.top_area_ids = topAreaIds.map(Number);
    if (neighborhoods.length) filters.neighborhoods = neighborhoods;
    if (roomsMin) filters.rooms_min = roomsMin;
    if (roomsMax) filters.rooms_max = roomsMax;
    if (priceMin) filters.price_min = priceMin;
    if (priceMax) filters.price_max = priceMax;
    if (sqmMin) filters.sqm_min = sqmMin;
    if (sqmMax) filters.sqm_max = sqmMax;
    if (amenities.length) filters.amenities = amenities;

    try {
      await fetch("/api/searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, filters }),
      });
      toast.success("Search saved!");
    } catch {
      toast.error("Failed to save search");
    }
  }

  return (
    <div className="flex gap-6" dir="ltr">
      {/* Mobile filter toggle */}
      <button
        onClick={() => setMobileFiltersOpen(true)}
        className="lg:hidden fixed bottom-6 right-6 z-40 flex items-center gap-1.5 px-5 py-3 bg-[#0071e3] text-white text-[0.8125rem] font-medium rounded-full shadow-lg"
      >
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 4h18M3 12h12M3 20h6"/></svg>
        Filters {data && <span className="opacity-75">({data.total})</span>}
      </button>

      {/* Filter sidebar */}
      <aside
        className={`w-72 shrink-0 ${mobileFiltersOpen ? "fixed inset-0 z-50 bg-black/40 p-4 overflow-y-auto block" : "hidden"} lg:static lg:bg-transparent lg:p-0 lg:block`}
        onClick={(e) => { if (e.target === e.currentTarget) setMobileFiltersOpen(false); }}
      >
        <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto bg-white rounded-2xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04),0_0_0_1px_rgba(0,0,0,0.03)] space-y-3 max-w-[18rem] mx-auto lg:max-w-none scrollbar-thin">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#1d1d1f]">Filters</h2>
            <div className="flex items-center gap-2">
              <button onClick={clearFilters} className="text-xs font-medium text-[#0071e3]">Clear all</button>
              <button onClick={() => setMobileFiltersOpen(false)} className="lg:hidden text-xs font-medium text-[#86868b]">Close</button>
            </div>
          </div>

          {/* Deal type */}
          <FilterSection title="Deal Type">
            <select
              value={dealType}
              onChange={(e) => setDealType(e.target.value)}
              className="w-full border border-[#d2d2d7] rounded-[10px] px-2.5 py-1 text-[0.8125rem] text-[#1d1d1f] bg-white outline-none focus:border-[#0071e3] focus:ring-[3px] focus:ring-[#0071e3]/12 transition-all"
            >
              <option value="">All</option>
              <option value="rent">Rent</option>
              <option value="forsale">Buy</option>
            </select>
          </FilterSection>

          {/* Region */}
          <FilterSection title="Region">
            <MultiSelect
              options={Object.entries(REGIONS).map(([id, name]) => ({ value: id, label: name }))}
              selected={topAreaIds}
              onChange={setTopAreaIds}
              placeholder="Select regions..."
            />
          </FilterSection>

          {/* City */}
          <FilterSection title="City">
            <MultiSelect
              options={cityOptions.filter(Boolean).map((c) => ({ value: c, label: c }))}
              selected={cities}
              onChange={setCities}
              placeholder="Select cities..."
            />
          </FilterSection>

          {/* Neighborhood */}
          <FilterSection title="Neighborhood">
            <MultiSelect
              options={neighborhoodOptions.filter(Boolean).map((n) => ({ value: n, label: n }))}
              selected={neighborhoods}
              onChange={setNeighborhoods}
              placeholder={cities.length ? "Select neighborhoods..." : "Select city first..."}
              disabled={!cities.length}
            />
          </FilterSection>

          {/* Rooms */}
          <FilterSection title="Rooms">
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.5"
                min="1"
                placeholder="Min"
                value={roomsMin}
                onChange={(e) => setRoomsMin(e.target.value)}
                className="w-full border border-[#d2d2d7] rounded-[10px] px-2.5 py-1 text-[0.8125rem] text-[#1d1d1f] bg-white outline-none focus:border-[#0071e3] focus:ring-[3px] focus:ring-[#0071e3]/12 transition-all placeholder:text-[#aeaeb2]"
              />
              <span className="text-[#d2d2d7] text-xs">–</span>
              <input
                type="number"
                step="0.5"
                min="1"
                placeholder="Max"
                value={roomsMax}
                onChange={(e) => setRoomsMax(e.target.value)}
                className="w-full border border-[#d2d2d7] rounded-[10px] px-2.5 py-1 text-[0.8125rem] text-[#1d1d1f] bg-white outline-none focus:border-[#0071e3] focus:ring-[3px] focus:ring-[#0071e3]/12 transition-all placeholder:text-[#aeaeb2]"
              />
            </div>
          </FilterSection>

          {/* Price */}
          <FilterSection title="Price (ILS)">
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="100"
                placeholder="Min"
                value={priceMin}
                onChange={(e) => setPriceMin(e.target.value)}
                className="w-full border border-[#d2d2d7] rounded-[10px] px-2.5 py-1 text-[0.8125rem] text-[#1d1d1f] bg-white outline-none focus:border-[#0071e3] focus:ring-[3px] focus:ring-[#0071e3]/12 transition-all placeholder:text-[#aeaeb2]"
              />
              <span className="text-[#d2d2d7] text-xs">–</span>
              <input
                type="number"
                step="100"
                placeholder="Max"
                value={priceMax}
                onChange={(e) => setPriceMax(e.target.value)}
                className="w-full border border-[#d2d2d7] rounded-[10px] px-2.5 py-1 text-[0.8125rem] text-[#1d1d1f] bg-white outline-none focus:border-[#0071e3] focus:ring-[3px] focus:ring-[#0071e3]/12 transition-all placeholder:text-[#aeaeb2]"
              />
            </div>
          </FilterSection>

          {/* Size */}
          <FilterSection title="Size (sqm)">
            <div className="flex items-center gap-2">
              <input
                type="number"
                placeholder="Min"
                value={sqmMin}
                onChange={(e) => setSqmMin(e.target.value)}
                className="w-full border border-[#d2d2d7] rounded-[10px] px-2.5 py-1 text-[0.8125rem] text-[#1d1d1f] bg-white outline-none focus:border-[#0071e3] focus:ring-[3px] focus:ring-[#0071e3]/12 transition-all placeholder:text-[#aeaeb2]"
              />
              <span className="text-[#d2d2d7] text-xs">–</span>
              <input
                type="number"
                placeholder="Max"
                value={sqmMax}
                onChange={(e) => setSqmMax(e.target.value)}
                className="w-full border border-[#d2d2d7] rounded-[10px] px-2.5 py-1 text-[0.8125rem] text-[#1d1d1f] bg-white outline-none focus:border-[#0071e3] focus:ring-[3px] focus:ring-[#0071e3]/12 transition-all placeholder:text-[#aeaeb2]"
              />
            </div>
          </FilterSection>

          {/* Amenities */}
          <FilterSection title="Amenities" collapsible>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {Object.entries(AMENITY_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => toggleAmenity(key)}
                  className={`px-2.5 py-1 rounded-full text-xs font-[450] transition-all ${
                    amenities.includes(key)
                      ? "bg-[#e8f0fe] text-[#0071e3]"
                      : "bg-[#f5f5f7] text-[#86868b] hover:bg-[#ececf0]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </FilterSection>

          {/* Sort */}
          <FilterSection title="Sort by" collapsible>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {SORT_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => toggleSort(value)}
                  className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                    sortBy.includes(value)
                      ? "bg-[#e8f0fe] text-[#0071e3]"
                      : "bg-[#f5f5f7] text-[#86868b] hover:bg-[#ececf0]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </FilterSection>

          <button onClick={applyFilters} className="w-full py-2.5 bg-[#0071e3] hover:bg-[#0077ed] text-white text-[0.8125rem] font-medium rounded-[10px] transition-colors active:scale-[0.985]">
            Apply Filters
          </button>
          <button onClick={saveSearch} className="w-full py-2.5 bg-[#34c759] hover:bg-[#2fb44e] text-white text-[0.8125rem] font-medium rounded-[10px] transition-colors mt-2 active:scale-[0.985]">
            Save Search
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* View toggle + hidden badge */}
        <div className="flex items-center justify-between mb-4">
          <div className="inline-flex bg-[#f5f5f7] rounded-[10px] p-[3px] gap-[2px]">
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[0.8125rem] font-medium transition-all ${viewMode === "list" ? "bg-white text-[#1d1d1f] shadow-[0_1px_4px_rgba(0,0,0,0.08)]" : "bg-transparent text-[#86868b] hover:text-[#1d1d1f]"}`}
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
              List
            </button>
            <button
              onClick={() => setViewMode("map")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[0.8125rem] font-medium transition-all ${viewMode === "map" ? "bg-white text-[#1d1d1f] shadow-[0_1px_4px_rgba(0,0,0,0.08)]" : "bg-transparent text-[#86868b] hover:text-[#1d1d1f]"}`}
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4zM8 2v16M16 6v16"/></svg>
              Map
            </button>
          </div>
          {!hiddenMode && hiddenCount > 0 ? (
            <Link
              href="/listings/hidden"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#fff8e1] border border-[#ffe082] rounded-full text-[0.75rem] font-medium text-[#f57f17] no-underline hover:bg-[#fff3c4] transition-colors whitespace-nowrap"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
              </svg>
              {hiddenCount} hidden
            </Link>
          ) : null}
        </div>

        {/* Results header */}
        {viewMode === "list" && data && (
          <div className="flex items-center justify-between mb-5">
            <span className="text-sm font-medium text-[#1d1d1f]">
              {data.total.toLocaleString()} listing{data.total !== 1 ? "s" : ""}
            </span>
            <span className="text-xs text-[#86868b]">
              Page {data.page} of {data.total_pages}
            </span>
          </div>
        )}

        {/* Map view */}
        {viewMode === "map" && (
          <div className="rounded-2xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04),0_0_0_1px_rgba(0,0,0,0.03)]" style={{ height: "calc(100vh - 12rem)" }}>
            <MapView filterParams={(() => {
              const p = new URLSearchParams();
              if (dealType) p.set("deal_type", dealType);
              if (cities.length) p.set("cities", cities.join(","));
              if (topAreaIds.length) p.set("top_area_ids", topAreaIds.join(","));
              if (neighborhoods.length) p.set("neighborhoods", neighborhoods.join(","));
              if (roomsMin) p.set("rooms_min", roomsMin);
              if (roomsMax) p.set("rooms_max", roomsMax);
              if (priceMin) p.set("price_min", priceMin);
              if (priceMax) p.set("price_max", priceMax);
              if (sqmMin) p.set("sqm_min", sqmMin);
              if (sqmMax) p.set("sqm_max", sqmMax);
              if (amenities.length) p.set("amenities", amenities.join(","));
              if (showHidden) p.set("hidden", "true");
              return p.toString();
            })()} />
          </div>
        )}

        {/* Listings list */}
        {viewMode === "list" && (
          loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-2xl" />
              ))}
            </div>
          ) : data?.listings.length ? (
            <div className="space-y-3">
              {data.listings.map((listing) => (
                <ListingCard
                  key={listing.yad2_id}
                  listing={listing}
                  onHide={showHidden ? undefined : handleHide}
                  onUnhide={showHidden ? handleUnhide : undefined}
                />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.04),0_0_0_1px_rgba(0,0,0,0.03)] p-16 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-[#f5f5f7] rounded-full mb-4">
                <svg className="w-7 h-7 text-[#d2d2d7]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
                  <polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
              </div>
              <h3 className="text-base font-semibold text-[#1d1d1f] mb-1">No listings found</h3>
              <p className="text-[0.8125rem] text-[#86868b]">Try adjusting your filters.</p>
            </div>
          )
        )}

        {/* Pagination */}
        {viewMode === "list" && data && data.total_pages > 1 && (
          <nav className="flex items-center justify-center gap-1 mt-8">
            {page > 1 && (
              <button
                onClick={() => setPage((p) => p - 1)}
                className="px-3.5 py-2 text-[0.8125rem] rounded-lg bg-white text-[#1d1d1f] shadow-[0_1px_4px_rgba(0,0,0,0.06)] hover:shadow-md transition-shadow"
              >
                ← Previous
              </button>
            )}
            {getPageNumbers(page, data.total_pages).map((p, i) =>
              p === "..." ? (
                <span key={`dot-${i}`} className="px-2 py-2 text-[0.8125rem] text-[#86868b]">...</span>
              ) : (
                <button
                  key={p}
                  onClick={() => setPage(p as number)}
                  className={`px-3.5 py-2 text-[0.8125rem] rounded-lg font-medium transition-shadow ${
                    p === page
                      ? "bg-[#0071e3] text-white"
                      : "bg-white text-[#1d1d1f] shadow-[0_1px_4px_rgba(0,0,0,0.06)] hover:shadow-md"
                  }`}
                >
                  {p}
                </button>
              )
            )}
            {page < data.total_pages && (
              <button
                onClick={() => setPage((p) => p + 1)}
                className="px-3.5 py-2 text-[0.8125rem] rounded-lg bg-white text-[#1d1d1f] shadow-[0_1px_4px_rgba(0,0,0,0.06)] hover:shadow-md transition-shadow"
              >
                Next →
              </button>
            )}
          </nav>
        )}
      </div>
    </div>
  );
}

// Helper: generate page numbers with ellipsis
function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "...")[] = [];
  for (let p = 1; p <= total; p++) {
    if (p <= 3 || p >= total - 2 || (p >= current - 1 && p <= current + 1)) {
      pages.push(p);
    } else if (pages[pages.length - 1] !== "...") {
      pages.push("...");
    }
  }
  return pages;
}

// Sub-components
function FilterSection({ title, children, collapsible }: { title: string; children: React.ReactNode; collapsible?: boolean }) {
  const [open, setOpen] = useState(!collapsible);

  return (
    <div>
      <button
        type="button"
        onClick={() => collapsible && setOpen(!open)}
        className={`flex items-center justify-between w-full text-[0.6875rem] font-semibold uppercase tracking-wider text-[#86868b] mb-1 ${collapsible ? "cursor-pointer" : "cursor-default"}`}
      >
        {title}
        {collapsible && (
          <svg className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        )}
      </button>
      {open && children}
    </div>
  );
}

function MultiSelect({
  options,
  selected,
  onChange,
  placeholder,
  disabled,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (val: string[]) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = options.filter((o) =>
    !selected.includes(o.value) && o.label.toLowerCase().includes(search.toLowerCase())
  );

  function toggle(value: string) {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    );
    setOpen(false);
    setSearch("");
  }

  return (
    <div className="relative" ref={ref}>
      <div
        onClick={() => !disabled && setOpen(!open)}
        className={`w-full border border-[#d2d2d7] rounded-[10px] px-2.5 py-1 min-h-[28px] flex flex-wrap gap-1 items-center cursor-pointer text-[0.8125rem] bg-white transition-all focus-within:border-[#0071e3] focus-within:ring-[3px] focus-within:ring-[#0071e3]/12 ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        {selected.length > 0 ? (
          selected.map((v) => {
            const opt = options.find((o) => o.value === v);
            return (
              <span key={v} className="inline-flex items-center gap-0.5 bg-[#e8f0fe] text-[#0071e3] text-[0.7rem] font-medium px-2 py-0.5 rounded-md">
                {opt?.label || v}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggle(v); }}
                  className="text-[#0071e3]/60 hover:text-[#0071e3] ml-0.5"
                >×</button>
              </span>
            );
          })
        ) : (
          <span className="text-[#aeaeb2]">{placeholder}</span>
        )}
      </div>
      {open && (
        <div className="absolute z-50 top-full mt-1 w-full bg-white rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.04)] p-1 max-h-48 overflow-y-auto">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="חיפוש..."
            dir="auto"
            className="w-full px-2.5 py-1.5 text-[0.8125rem] border-b border-black/5 outline-none mb-1"
            autoFocus
          />
          {filtered.length === 0 ? (
            <div className="px-2.5 py-2 text-xs text-[#86868b]">No options</div>
          ) : (
            filtered.map((opt) => (
              <button
                type="button"
                key={opt.value}
                onClick={() => toggle(opt.value)}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-[0.8125rem] transition-colors hover:bg-[#f0f0f3] text-[#1d1d1f]"
              >
                {opt.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
