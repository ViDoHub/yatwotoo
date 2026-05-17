import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { JOB_STATUS } from "@/lib/constants";

/**
 * POST /api/scrape/start
 * Create a new pending scrape job. The cron handler picks it up.
 */
export async function POST(request: Request) {
  const supabase = createAdminClient();

  // Check if a scrape is already running or pending
  const { data: active } = await supabase
    .from("scrape_jobs")
    .select("id, status")
    .in("status", [JOB_STATUS.RUNNING, JOB_STATUS.PENDING])
    .limit(1)
    .single();

  if (active) {
    return NextResponse.json(
      { status: "already_running", job_id: active.id },
      { status: 409 }
    );
  }

  // Check for resume
  const url = new URL(request.url);
  const resume = url.searchParams.get("resume") === "true";

  let regionsCompleted: string[] = [];
  let totalFetched = 0;
  let totalNew = 0;
  let totalPriceDrops = 0;

  if (resume) {
    const { data: prev } = await supabase
      .from("scrape_jobs")
      .select("*")
      .in("status", [JOB_STATUS.FAILED, JOB_STATUS.CANCELLED])
      .not("regions_completed", "eq", "{}")
      .order("started_at", { ascending: false })
      .limit(1)
      .single();

    if (prev) {
      regionsCompleted = prev.regions_completed;
      totalFetched = prev.total_fetched;
      totalNew = prev.total_new;
      totalPriceDrops = prev.total_price_drops;

      await supabase
        .from("scrape_jobs")
        .update({ status: JOB_STATUS.RESUMED })
        .eq("id", prev.id);
    }
  }

  const { data: job, error } = await supabase
    .from("scrape_jobs")
    .insert({
      status: JOB_STATUS.PENDING,
      regions_completed: regionsCompleted,
      total_fetched: totalFetched,
      total_new: totalNew,
      total_price_drops: totalPriceDrops,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: "started", job_id: job.id });
}
