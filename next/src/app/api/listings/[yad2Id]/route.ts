import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

/**
 * GET /api/listings/[yad2Id]
 * Get a single listing by yad2_id with price history.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ yad2Id: string }> }
) {
  const { yad2Id } = await params;
  const supabase = createServerClient();

  const { data: listing, error } = await supabase
    .from("listings")
    .select("*")
    .eq("yad2_id", yad2Id)
    .single();

  if (error || !listing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Fetch price history
  const { data: priceHistory } = await supabase
    .from("price_history")
    .select("*")
    .eq("listing_id", yad2Id)
    .order("observed_at", { ascending: true });

  return NextResponse.json({ listing, price_history: priceHistory ?? [] });
}
