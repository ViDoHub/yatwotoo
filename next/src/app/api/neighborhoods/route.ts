import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/neighborhoods?cities=city1,city2
 * Get distinct neighborhoods, optionally filtered by cities.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const citiesParam = url.searchParams.get("cities") ?? "";
  const cities = citiesParam ? citiesParam.split(",").filter(Boolean) : null;

  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("distinct_neighborhoods", {
    filter_cities: cities,
  });

  if (error) {
    return NextResponse.json({ neighborhoods: [] }, { status: 500 });
  }

  const neighborhoods = (data || []).map((r: { name: string }) => ({ name: r.name }));
  return NextResponse.json({ neighborhoods });
}
