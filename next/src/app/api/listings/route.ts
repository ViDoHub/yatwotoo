import { NextResponse } from "next/server";
import { searchListings } from "@/lib/search/engine";
import { createServerClient } from "@/lib/supabase/server";
import type { SearchFilters } from "@/lib/search/engine";

/**
 * GET /api/listings
 * Search listings with filters + pagination.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;

  const filters: SearchFilters = {};

  if (params.get("deal_type")) filters.deal_type = params.get("deal_type")!;
  if (params.get("city")) filters.city = params.get("city")!;
  if (params.get("cities")) filters.cities = params.get("cities")!.split(",");
  if (params.get("area_ids"))
    filters.area_ids = params.get("area_ids")!.split(",").map(Number);
  if (params.get("top_area_ids"))
    filters.top_area_ids = params.get("top_area_ids")!.split(",").map(Number);
  if (params.get("neighborhoods"))
    filters.neighborhoods = params.get("neighborhoods")!.split(",");
  if (params.get("rooms_min")) filters.rooms_min = Number(params.get("rooms_min"));
  if (params.get("rooms_max")) filters.rooms_max = Number(params.get("rooms_max"));
  if (params.get("price_min")) filters.price_min = Number(params.get("price_min"));
  if (params.get("price_max")) filters.price_max = Number(params.get("price_max"));
  if (params.get("sqm_min")) filters.sqm_min = Number(params.get("sqm_min"));
  if (params.get("sqm_max")) filters.sqm_max = Number(params.get("sqm_max"));
  if (params.get("floor_min")) filters.floor_min = Number(params.get("floor_min"));
  if (params.get("floor_max")) filters.floor_max = Number(params.get("floor_max"));
  if (params.get("center_lat")) filters.center_lat = Number(params.get("center_lat"));
  if (params.get("center_lng")) filters.center_lng = Number(params.get("center_lng"));
  if (params.get("radius_km")) filters.radius_km = Number(params.get("radius_km"));
  if (params.get("amenities"))
    filters.amenities = params.get("amenities")!.split(",");
  if (params.get("sort_by")) filters.sort_by = params.get("sort_by")!;

  const page = Number(params.get("page") ?? 1);
  const pageSize = Math.min(Number(params.get("page_size") ?? 20), 100);
  const hiddenOnly = params.get("hidden") === "true";

  const result = await searchListings(filters, page, pageSize, hiddenOnly);

  // Get hidden count when showing non-hidden listings
  let hiddenCount = 0;
  if (!hiddenOnly) {
    const supabase = createServerClient();
    const { count } = await supabase
      .from("listings")
      .select("*", { count: "exact", head: true })
      .eq("is_hidden", true);
    hiddenCount = count ?? 0;
  }

  return NextResponse.json({
    listings: result.listings,
    total: result.total,
    page,
    page_size: pageSize,
    total_pages: Math.ceil(result.total / pageSize),
    hidden_count: hiddenCount,
  });
}
