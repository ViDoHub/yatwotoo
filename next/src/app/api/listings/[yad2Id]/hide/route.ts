import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

/**
 * POST /api/listings/[yad2Id]/hide
 * Mark a listing as hidden.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ yad2Id: string }> }
) {
  const { yad2Id } = await params;
  const supabase = createServerClient();

  const { error } = await supabase
    .from("listings")
    .update({ is_hidden: true })
    .eq("yad2_id", yad2Id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: "hidden", yad2_id: yad2Id });
}
