import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

interface ReorderItem {
  id: string;
  board_column: string;
  position: number;
}

/**
 * PATCH /api/board/reorder
 * Batch update positions after drag-and-drop.
 * Body: { items: Array<{ id, board_column, position }> }
 */
export async function PATCH(request: Request) {
  const supabase = createServerClient();

  let body: { items?: ReorderItem[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { items } = body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "items array is required" }, { status: 400 });
  }

  const validColumns = ["review", "get_contacts", "call", "visit"];
  for (const item of items) {
    if (!item.id || !item.board_column || typeof item.position !== "number") {
      return NextResponse.json({ error: "Each item must have id, board_column, and position" }, { status: 400 });
    }
    if (!validColumns.includes(item.board_column)) {
      return NextResponse.json({ error: `Invalid board column: ${item.board_column}` }, { status: 400 });
    }
  }

  const now = new Date().toISOString();

  // Update each item's position and column
  const results = await Promise.all(
    items.map((item) =>
      supabase
        .from("board_listings")
        .update({
          board_column: item.board_column,
          position: item.position,
          updated_at: now,
        })
        .eq("id", item.id)
    )
  );

  const failed = results.filter((r) => r.error);
  if (failed.length > 0) {
    return NextResponse.json(
      { error: "Some updates failed", details: failed.map((r) => r.error?.message) },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
