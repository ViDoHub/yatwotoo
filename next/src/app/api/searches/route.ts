import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase/auth-helper";

/**
 * GET /api/searches — List all saved searches
 * POST /api/searches — Create a new saved search
 */
export async function GET() {
  const { supabase, error: authError } = await getAuthenticatedClient();
  if (authError) return authError;

  const { data, error } = await supabase!
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

  const { supabase, user, error: authError } = await getAuthenticatedClient();
  if (authError) return authError;

  const { data, error } = await supabase!
    .from("saved_searches")
    .insert({ name, filters: filters ?? {}, user_id: user!.id })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ search: data }, { status: 201 });
}
