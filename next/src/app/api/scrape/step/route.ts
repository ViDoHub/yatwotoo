import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { JOB_STATUS, REGIONS } from "@/lib/constants";
import { deepFetchRegion, buildApiParams } from "@/lib/scraper/yad2-client";
import { processMarkerChunk } from "@/lib/scraper/sync";
import type { DealType } from "@/types";

const DEAL_TYPES: DealType[] = ["rent", "forsale"];

/**
 * POST /api/scrape/step
 * Process one region+deal_type step for the current running job.
 * Called internally by the cron handler in a loop.
 */
export async function POST() {
  const supabase = createServerClient();

  // Find the current running or pending job
  const { data: job } = await supabase
    .from("scrape_jobs")
    .select("*")
    .in("status", [JOB_STATUS.RUNNING, JOB_STATUS.PENDING])
    .order("started_at", { ascending: true })
    .limit(1)
    .single();

  if (!job) {
    return NextResponse.json({ status: "no_job" });
  }

  // Mark as running if pending
  if (job.status === JOB_STATUS.PENDING) {
    await supabase
      .from("scrape_jobs")
      .update({ status: JOB_STATUS.RUNNING })
      .eq("id", job.id);
  }

  // Find next step to process
  const completedSet = new Set(job.regions_completed);
  let nextStep: { dealType: DealType; regionId: number } | null = null;

  for (const dealType of DEAL_TYPES) {
    for (const regionId of Object.keys(REGIONS).map(Number)) {
      const stepKey = `${dealType}:${regionId}`;
      if (!completedSet.has(stepKey)) {
        nextStep = { dealType, regionId };
        break;
      }
    }
    if (nextStep) break;
  }

  // All steps completed
  if (!nextStep) {
    await supabase
      .from("scrape_jobs")
      .update({
        status: JOB_STATUS.COMPLETED,
        completed_at: new Date().toISOString(),
        current_region: null,
        current_deal_type: null,
      })
      .eq("id", job.id);

    return NextResponse.json({ status: "completed", job_id: job.id });
  }

  const { dealType, regionId } = nextStep;
  const stepKey = `${dealType}:${regionId}`;

  // Update current progress
  await supabase
    .from("scrape_jobs")
    .update({
      current_region: regionId,
      current_deal_type: dealType,
    })
    .eq("id", job.id);

  try {
    // Fetch markers for this region
    const apiParams = buildApiParams({});
    const markers = await deepFetchRegion(regionId, dealType, apiParams);

    // Process and upsert
    const { newListings, priceDrops } = await processMarkerChunk(markers, dealType);

    // Update job progress
    const updatedCompleted = [...job.regions_completed, stepKey];
    await supabase
      .from("scrape_jobs")
      .update({
        regions_completed: updatedCompleted,
        total_fetched: job.total_fetched + markers.length,
        total_new: job.total_new + newListings.length,
        total_price_drops: job.total_price_drops + priceDrops.length,
      })
      .eq("id", job.id);

    const totalSteps = Object.keys(REGIONS).length * DEAL_TYPES.length;
    return NextResponse.json({
      status: "step_completed",
      job_id: job.id,
      step: stepKey,
      markers_fetched: markers.length,
      new_listings: newListings.length,
      price_drops: priceDrops.length,
      progress: `${updatedCompleted.length}/${totalSteps}`,
    });
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : "Unknown error";
    await supabase
      .from("scrape_jobs")
      .update({
        status: JOB_STATUS.FAILED,
        error: errorMsg,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    return NextResponse.json(
      { status: "failed", error: errorMsg },
      { status: 500 }
    );
  }
}
