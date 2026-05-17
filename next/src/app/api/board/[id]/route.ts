import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/board/[id]
 * Update a board listing (column, contacts, notes, position).
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const supabase = createServerClient();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Only allow updating specific fields
  const allowed = ["board_column", "position", "contact_name", "contact_phone", "visit_date", "notes"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) {
      updates[key] = body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  // Validate board_column if provided
  if (updates.board_column) {
    const validColumns = ["review", "get_contacts", "call", "visit"];
    if (!validColumns.includes(updates.board_column as string)) {
      return NextResponse.json({ error: "Invalid board column" }, { status: 400 });
    }
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("board_listings")
    .update(updates)
    .eq("id", id)
    .select("*, listings(*)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Board listing not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

/**
 * DELETE /api/board/[id]
 * Remove a listing from the board.
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const supabase = createServerClient();

  const { error } = await supabase
    .from("board_listings")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
