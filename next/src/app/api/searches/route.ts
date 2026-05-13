import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

/**
 * GET /api/searches — List all saved searches
 * POST /api/searches — Create a new saved search
 */
export async function GET() {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("saved_searches")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ searches: data ?? [] });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { name, filters } = body;

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("saved_searches")
    .insert({ name, filters: filters ?? {} })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ search: data }, { status: 201 });
}
