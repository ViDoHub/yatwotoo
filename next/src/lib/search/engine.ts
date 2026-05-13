import { createServerClient } from "@/lib/supabase/server";
import type { Listing } from "@/types";

export interface SearchFilters {
  deal_type?: string;
  cities?: string[];
  city?: string;
  area_ids?: number[];
  top_area_ids?: number[];
  neighborhoods?: string[];
  rooms_min?: number;
  rooms_max?: number;
  price_min?: number;
  price_max?: number;
  sqm_min?: number;
  sqm_max?: number;
  floor_min?: number;
  floor_max?: number;
  center_lat?: number;
  center_lng?: number;
  radius_km?: number;
  amenities?: string[];
  sort_by?: string | string[];
}

export type SortBy =
  | "newest"
  | "price_asc"
  | "price_desc"
  | "price_per_sqm_asc"
  | "price_per_sqm_desc"
  | "sqm_desc"
  | "rooms_asc";

export interface SearchResult {
  listings: Listing[];
  total: number;
}

/**
 * Search listings with filters, sorting, and pagination.
 */
export async function searchListings(
  filters: SearchFilters,
  page: number = 1,
  pageSize: number = 20,
  hiddenOnly: boolean = false
): Promise<SearchResult> {
  const supabase = createServerClient();

  // If doing a radius search, use the RPC function
  if (filters.center_lat && filters.center_lng && filters.radius_km) {
    return searchWithRadius(filters, page, pageSize, hiddenOnly);
  }

  let query = supabase
    .from("listings")
    .select("*", { count: "exact" })
    .eq("is_active", true);

  if (hiddenOnly) {
    query = query.eq("is_hidden", true);
  } else {
    query = query.eq("is_hidden", false);
  }

  query = applyFilters(query, filters);
  query = applySort(query, filters.sort_by);

  // Pagination
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, count, error } = await query;

  if (error) {
    console.error("Search error:", error.message);
    return { listings: [], total: 0 };
  }

  return { listings: (data as Listing[]) ?? [], total: count ?? 0 };
}

/**
 * Search with radius using PostGIS RPC function.
 */
async function searchWithRadius(
  filters: SearchFilters,
  page: number,
  pageSize: number,
  hiddenOnly: boolean
): Promise<SearchResult> {
  const supabase = createServerClient();

  // First get IDs from the RPC function
  const { data: geoResults, error: geoError } = await supabase.rpc(
    "listings_near_point",
    {
      lat: filters.center_lat!,
      lng: filters.center_lng!,
      radius_km: filters.radius_km!,
    }
  );

  if (geoError || !geoResults?.length) {
    return { listings: [], total: 0 };
  }

  const yad2Ids = geoResults.map((r: Listing) => r.yad2_id);

  // Now query with additional filters
  let query = supabase
    .from("listings")
    .select("*", { count: "exact" })
    .in("yad2_id", yad2Ids)
    .eq("is_active", true);

  if (hiddenOnly) {
    query = query.eq("is_hidden", true);
  } else {
    query = query.eq("is_hidden", false);
  }

  // Apply non-geo filters
  const filtersWithoutGeo = { ...filters };
  delete filtersWithoutGeo.center_lat;
  delete filtersWithoutGeo.center_lng;
  delete filtersWithoutGeo.radius_km;
  query = applyFilters(query, filtersWithoutGeo);
  query = applySort(query, filters.sort_by);

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, count, error } = await query;

  if (error) {
    console.error("Radius search error:", error.message);
    return { listings: [], total: 0 };
  }

  return { listings: (data as Listing[]) ?? [], total: count ?? 0 };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(query: any, filters: SearchFilters) {
  // Deal type
  if (filters.deal_type) {
    query = query.eq("deal_type", filters.deal_type);
  }

  // City filters
  const hasCities = !!(
    (filters.cities?.length) ||
    filters.city
  );
  const hasNeighborhoods = !!(filters.neighborhoods?.length);

  if (filters.cities?.length) {
    query = query.in("city", filters.cities);
  } else if (filters.city) {
    query = query.eq("city", filters.city);
  }

  // Neighborhoods
  if (hasNeighborhoods) {
    query = query.in("neighborhood", filters.neighborhoods!);
  }

  // Area IDs
  if (filters.area_ids?.length) {
    query = query.in("area_id", filters.area_ids);
  }

  // Top area IDs — skip when cities or neighborhoods are set
  if (!hasCities && !hasNeighborhoods && filters.top_area_ids?.length) {
    query = query.in("top_area_id", filters.top_area_ids);
  }

  // Rooms range
  if (filters.rooms_min) query = query.gte("rooms", filters.rooms_min);
  if (filters.rooms_max) query = query.lte("rooms", filters.rooms_max);

  // Price range
  if (filters.price_min) query = query.gte("price", filters.price_min);
  if (filters.price_max) query = query.lte("price", filters.price_max);

  // Sqm range
  if (filters.sqm_min) query = query.gte("sqm", filters.sqm_min);
  if (filters.sqm_max) query = query.lte("sqm", filters.sqm_max);

  // Floor range
  if (filters.floor_min) query = query.gte("floor", filters.floor_min);
  if (filters.floor_max) query = query.lte("floor", filters.floor_max);

  // Amenity booleans
  if (filters.amenities?.length) {
    for (const amenity of filters.amenities) {
      query = query.is(amenity, true);
    }
  }

  return query;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applySort(query: any, sortBy?: string | string[]) {
  // Default to newest if no sort specified
  const sortKeys = sortBy
    ? Array.isArray(sortBy) ? sortBy : [sortBy]
    : ["newest"];

  const sortMap: Record<string, Array<{ column: string; ascending: boolean }>> = {
    newest: [
      { column: "date_added", ascending: false },
      { column: "first_seen_at", ascending: false },
    ],
    price_asc: [{ column: "price", ascending: true }],
    price_desc: [{ column: "price", ascending: false }],
    price_per_sqm_asc: [{ column: "price_per_sqm", ascending: true }],
    price_per_sqm_desc: [{ column: "price_per_sqm", ascending: false }],
    sqm_desc: [{ column: "sqm", ascending: false }],
    rooms_asc: [{ column: "rooms", ascending: true }],
  };

  const seenFields = new Set<string>();
  for (const key of sortKeys) {
    const sorts = sortMap[key];
    if (!sorts) continue;
    for (const { column, ascending } of sorts) {
      if (!seenFields.has(column)) {
        query = query.order(column, { ascending });
        seenFields.add(column);
      }
    }
  }

  return query;
}

/**
 * Check if a listing matches a saved search's filters.
 */
export async function matchSavedSearch(
  filters: SearchFilters,
  yad2Id: string
): Promise<boolean> {
  const supabase = createServerClient();

  let query = supabase
    .from("listings")
    .select("yad2_id")
    .eq("yad2_id", yad2Id)
    .eq("is_active", true)
    .eq("is_hidden", false);

  query = applyFilters(query, filters);
  const { data } = await query.limit(1);
  return (data?.length ?? 0) > 0;
}

/**
 * Get count of active listings per area_id.
 */
export async function getAreaCounts(): Promise<Record<number, number>> {
  const supabase = createServerClient();

  const { data } = await supabase
    .from("listings")
    .select("area_id")
    .eq("is_active", true)
    .gt("area_id", 0);

  if (!data) return {};

  const counts: Record<number, number> = {};
  for (const row of data) {
    counts[row.area_id] = (counts[row.area_id] ?? 0) + 1;
  }
  return counts;
}

/**
 * Get distinct neighborhoods with counts for given cities.
 */
export async function getNeighborhoods(
  cities: string[]
): Promise<Array<{ neighborhood: string; count: number }>> {
  const supabase = createServerClient();

  let query = supabase
    .from("listings")
    .select("neighborhood")
    .eq("is_active", true)
    .neq("neighborhood", "");

  if (cities.length > 0) {
    query = query.in("city", cities);
  }

  const { data } = await query;
  if (!data) return [];

  const counts: Record<string, number> = {};
  for (const row of data) {
    counts[row.neighborhood] = (counts[row.neighborhood] ?? 0) + 1;
  }

  return Object.entries(counts)
    .map(([neighborhood, count]) => ({ neighborhood, count }))
    .sort((a, b) => b.count - a.count);
}
