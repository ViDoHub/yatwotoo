import { createServerClient } from "@/lib/supabase/server";
import type { ListingInsert } from "@/types";
import type { Marker } from "@/lib/scraper/yad2-client";
import { parseMarker } from "@/lib/scraper/yad2-client";
import type { DealType } from "@/types";

export interface UpsertResult {
  newListings: ListingInsert[];
  priceDrops: Array<{ listing: ListingInsert; oldPrice: number }>;
}

/**
 * Upsert a batch of parsed listings into Supabase.
 * - New listings: insert + record initial price history
 * - Existing listings: update last_seen_at, detect price changes
 */
export async function upsertListings(listings: ListingInsert[]): Promise<UpsertResult> {
  const supabase = createServerClient();
  const newListings: ListingInsert[] = [];
  const priceDrops: Array<{ listing: ListingInsert; oldPrice: number }> = [];

  if (listings.length === 0) return { newListings, priceDrops };

  // Fetch existing listings by yad2_id for price comparison
  const yad2Ids = listings.map((l) => l.yad2_id);
  const { data: existing } = await supabase
    .from("listings")
    .select("yad2_id, price")
    .in("yad2_id", yad2Ids);

  const existingMap = new Map<string, number | null>();
  for (const row of existing ?? []) {
    existingMap.set(row.yad2_id, row.price);
  }

  const toInsert: ListingInsert[] = [];
  const toUpdate: Array<{ yad2_id: string; data: Partial<ListingInsert> }> = [];
  const priceHistoryInserts: Array<{ listing_id: string; price: number }> = [];

  for (const listing of listings) {
    const existingPrice = existingMap.get(listing.yad2_id);

    if (existingPrice === undefined) {
      // New listing
      toInsert.push(listing);
      newListings.push(listing);

      if (listing.price) {
        priceHistoryInserts.push({
          listing_id: listing.yad2_id,
          price: listing.price,
        });
      }
    } else {
      // Existing listing — update
      const updateData: Partial<ListingInsert> = {
        last_seen_at: new Date().toISOString(),
        is_active: true,
      };

      // Price change detection
      if (listing.price && existingPrice && listing.price !== existingPrice) {
        updateData.price = listing.price;
        updateData.price_per_sqm = listing.price_per_sqm;

        priceHistoryInserts.push({
          listing_id: listing.yad2_id,
          price: listing.price,
        });

        if (listing.price < existingPrice) {
          priceDrops.push({ listing, oldPrice: existingPrice });
        }
      }

      // Update fields that may have changed
      if (listing.description) updateData.description = listing.description;
      if (listing.images && listing.images.length > 0) updateData.images = listing.images;
      if (listing.location) updateData.location = listing.location;

      toUpdate.push({ yad2_id: listing.yad2_id, data: updateData });
    }
  }

  // Batch insert new listings (upsert to handle race conditions)
  if (toInsert.length > 0) {
    const { error } = await supabase
      .from("listings")
      .upsert(toInsert, { onConflict: "yad2_id" });
    if (error) {
      console.error("Error inserting listings:", error.message);
    }
  }

  // Batch update existing listings
  for (const { yad2_id, data } of toUpdate) {
    await supabase.from("listings").update(data).eq("yad2_id", yad2_id);
  }

  // Insert price history records
  if (priceHistoryInserts.length > 0) {
    const { error } = await supabase.from("price_history").insert(priceHistoryInserts);
    if (error) {
      console.error("Error inserting price history:", error.message);
    }
  }

  console.log(
    `Upsert complete: ${newListings.length} new, ${priceDrops.length} price drops`
  );
  return { newListings, priceDrops };
}

/**
 * Process raw markers into listings and upsert them.
 */
export async function processMarkerChunk(
  markers: Marker[],
  dealType: DealType
): Promise<UpsertResult> {
  const listings: ListingInsert[] = [];
  for (const marker of markers) {
    const listing = parseMarker(marker, dealType);
    if (listing) listings.push(listing);
  }
  return upsertListings(listings);
}

/**
 * Check if a listing is a duplicate (same address + rooms + sqm, different yad2_id).
 */
export async function deduplicateListing(listing: ListingInsert): Promise<boolean> {
  if (!listing.street || !listing.rooms) return false;

  const supabase = createServerClient();
  let query = supabase
    .from("listings")
    .select("yad2_id")
    .neq("yad2_id", listing.yad2_id)
    .eq("city", listing.city ?? "")
    .eq("street", listing.street ?? "")
    .eq("rooms", listing.rooms)
    .eq("is_active", true)
    .limit(1);

  if (listing.sqm) {
    query = query.eq("sqm", listing.sqm);
  }

  const { data } = await query;
  return (data?.length ?? 0) > 0;
}
