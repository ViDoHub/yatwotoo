import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { REGIONS } from "@/lib/constants";

/**
 * GET /api/scrape/status
 * Return current/last scrape job status and listing counts.
 */
export async function GET() {
  const supabase = createServerClient();

  // Get latest job
  const { data: job } = await supabase
    .from("scrape_jobs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(1)
    .single();

  // Get listing counts
  const { count: totalListings } = await supabase
    .from("listings")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true)
    .eq("is_hidden", false);

  const { count: rentCount } = await supabase
    .from("listings")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true)
    .eq("is_hidden", false)
    .eq("deal_type", "rent");

  const { count: forsaleCount } = await supabase
    .from("listings")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true)
    .eq("is_hidden", false)
    .eq("deal_type", "forsale");

  const result: Record<string, unknown> = {
    total_listings: totalListings ?? 0,
    rent_count: rentCount ?? 0,
    forsale_count: forsaleCount ?? 0,
  };

  if (job) {
    const totalSteps = Object.keys(REGIONS).length * 2;
    result.job = {
      id: job.id,
      status: job.status,
      started_at: job.started_at,
      completed_at: job.completed_at,
      regions_completed: job.regions_completed.length,
      total_steps: totalSteps,
      progress_pct: Math.round(
        (job.regions_completed.length / totalSteps) * 100
      ),
      total_fetched: job.total_fetched,
      total_new: job.total_new,
      total_price_drops: job.total_price_drops,
      error: job.error,
    };
  }

  return NextResponse.json(result);
}
