import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

/**
 * GET /api/cities?top_area_ids=1,2,3
 * Returns distinct city names, optionally filtered by region (top_area_id).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const topAreaIdsParam = url.searchParams.get("top_area_ids");

  const supabase = createServerClient();

  const ids = topAreaIdsParam
    ? topAreaIdsParam.split(",").map(Number).filter(Boolean)
    : null;

  const { data, error } = await supabase.rpc("distinct_cities", {
    filter_top_area_ids: ids,
  });

  if (error) {
    return NextResponse.json({ cities: [] }, { status: 500 });
  }

  const cities = (data || []).map((r: { name: string }) => r.name);
  return NextResponse.json({ cities });
}
