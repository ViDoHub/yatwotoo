import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { JOB_STATUS } from "@/lib/constants";

/**
 * GET /api/cron/poll
 * Vercel Cron handler — triggers a scrape job and processes all steps.
 * Runs every 15 minutes.
 */
export async function GET() {
  const supabase = createAdminClient();
  const baseUrl = process.env.NEXT_PUBLIC_VERCEL_URL
    ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
    : "http://localhost:3000";

  // Check if already running
  const { data: active } = await supabase
    .from("scrape_jobs")
    .select("id")
    .in("status", [JOB_STATUS.RUNNING, JOB_STATUS.PENDING])
    .limit(1)
    .single();

  if (active) {
    return NextResponse.json({ status: "already_running", job_id: active.id });
  }

  // Create a new job
  const { data: job, error } = await supabase
    .from("scrape_jobs")
    .insert({ status: JOB_STATUS.PENDING })
    .select()
    .single();

  if (error || !job) {
    return NextResponse.json({ error: "Failed to create job" }, { status: 500 });
  }

  // Process steps sequentially until done or timeout approaching
  const startTime = Date.now();
  const MAX_DURATION_MS = 55000; // Leave 5s buffer before Vercel 60s timeout
  let stepsCompleted = 0;

  while (Date.now() - startTime < MAX_DURATION_MS) {
    const resp = await fetch(`${baseUrl}/api/scrape/step`, {
      method: "POST",
    });
    const result = await resp.json();

    if (result.status === "completed" || result.status === "no_job") {
      break;
    }
    if (result.status === "failed") {
      return NextResponse.json({ status: "failed", error: result.error });
    }

    stepsCompleted++;
  }

  return NextResponse.json({
    status: "done",
    job_id: job.id,
    steps_completed: stepsCompleted,
  });
}
