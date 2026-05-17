import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase/auth-helper";

/**
 * GET /api/board
 * Fetch all board listings with joined listing data.
 */
export async function GET() {
  const { supabase, error: authError } = await getAuthenticatedClient();
  if (authError) return authError;

  const { data, error } = await supabase!
    .from("board_listings")
    .select("*, listings(*)")
    .order("board_column")
    .order("position");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

/**
 * POST /api/board
 * Add a listing to the board (default column: 'review').
 * Body: { listing_id: string }
 */
export async function POST(request: Request) {
  const { supabase, user, error: authError } = await getAuthenticatedClient();
  if (authError) return authError;

  let body: { listing_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { listing_id } = body;
  if (!listing_id) {
    return NextResponse.json({ error: "listing_id is required" }, { status: 400 });
  }

  // Get the next position in the review column
  const { count } = await supabase!
    .from("board_listings")
    .select("*", { count: "exact", head: true })
    .eq("board_column", "review");

  const { data, error } = await supabase!
    .from("board_listings")
    .insert({
      listing_id,
      board_column: "review",
      position: count ?? 0,
      user_id: user!.id,
    })
    .select("*, listings(*)")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Listing is already on the board" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
