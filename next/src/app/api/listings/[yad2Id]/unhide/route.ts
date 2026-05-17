import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * POST /api/listings/[yad2Id]/unhide
 * Mark a listing as not hidden.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ yad2Id: string }> }
) {
  const { yad2Id } = await params;
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("listings")
    .update({ is_hidden: false })
    .eq("yad2_id", yad2Id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: "unhidden", yad2_id: yad2Id });
}
