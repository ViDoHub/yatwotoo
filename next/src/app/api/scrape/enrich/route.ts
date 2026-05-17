import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { fetchItemDetail } from "@/lib/scraper/yad2-client";
import type { Database } from "@/types/database";

/**
 * POST /api/scrape/enrich
 * Batch-enrich amenities for listings that haven't been enriched yet.
 * Called by Vercel Cron every 30 minutes.
 */
export async function POST() {
  const supabase = createAdminClient();
  const BATCH_SIZE = 50;

  // Find un-enriched active listings (parking/elevator/shelter are all null)
  const { data: listings, error } = await supabase
    .from("listings")
    .select("yad2_id")
    .eq("is_active", true)
    .is("parking", null)
    .is("elevator", null)
    .is("shelter", null)
    .limit(BATCH_SIZE);

  if (error || !listings || listings.length === 0) {
    return NextResponse.json({
      status: "done",
      enriched: 0,
      message: "No un-enriched listings found",
    });
  }

  let enriched = 0;
  let failed = 0;

  for (const { yad2_id } of listings) {
    const detail = await fetchItemDetail(yad2_id);
    if (!detail) {
      failed++;
      continue;
    }

    const updateData: Database["public"]["Tables"]["listings"]["Update"] = {
      ...detail.amenities,
    };

    if (detail.description) updateData.description = detail.description;
    if (detail.images.length > 0) updateData.images = detail.images;
    if (detail.entryDate) updateData.entry_date = detail.entryDate;
    if (detail.dateAdded) updateData.date_added = detail.dateAdded;
    if (detail.dateUpdated) updateData.date_updated = detail.dateUpdated;
    if (detail.propertyTax) updateData.property_tax = detail.propertyTax;
    if (detail.houseCommittee) updateData.house_committee = detail.houseCommittee;
    if (detail.totalFloors) updateData.total_floors = detail.totalFloors;
    if (detail.contactName) updateData.contact_name = detail.contactName;
    if (detail.parkingSpots) updateData.parking_spots = detail.parkingSpots;
    if (detail.gardenArea) updateData.garden_area = detail.gardenArea;
    if (detail.paymentsInYear) updateData.payments_in_year = detail.paymentsInYear;

    await supabase.from("listings").update(updateData).eq("yad2_id", yad2_id);
    enriched++;
  }

  return NextResponse.json({
    status: "done",
    enriched,
    failed,
    total: listings.length,
  });
}
