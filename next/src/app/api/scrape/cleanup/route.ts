import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

/**
 * POST /api/scrape/cleanup
 * 1. Mark listings as inactive if not seen for 3 days.
 * 2. Delete listings that have been inactive (not seen for 7+ days).
 * Called by Vercel Cron daily at 3am.
 */
export async function POST() {
  const supabase = createServerClient();

  // Step 1: Mark stale listings as inactive (not seen for 3 days)
  const inactiveCutoff = new Date();
  inactiveCutoff.setDate(inactiveCutoff.getDate() - 3);

  const { data: markedData, error: markError } = await supabase
    .from("listings")
    .update({ is_active: false })
    .eq("is_active", true)
    .lt("last_seen_at", inactiveCutoff.toISOString())
    .select("id");

  const markedInactive = markedData?.length ?? 0;

  if (markError) {
    return NextResponse.json({ error: markError.message }, { status: 500 });
  }

  // Step 2: Delete listings not seen for 7+ days
  const deleteCutoff = new Date();
  deleteCutoff.setDate(deleteCutoff.getDate() - 7);

  const { data: deletedData, error: deleteError } = await supabase
    .from("listings")
    .delete()
    .eq("is_active", false)
    .lt("last_seen_at", deleteCutoff.toISOString())
    .select("id");

  const deleted = deletedData?.length ?? 0;

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({
    status: "done",
    marked_inactive: markedInactive,
    deleted: deleted,
  });
}
