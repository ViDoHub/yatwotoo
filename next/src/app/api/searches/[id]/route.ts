import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase/auth-helper";

/**
 * PUT /api/searches/[id] — Update a saved search
 * DELETE /api/searches/[id] — Deactivate a saved search
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { supabase, error: authError } = await getAuthenticatedClient();
  if (authError) return authError;

  const { data, error } = await supabase!
    .from("saved_searches")
    .update(body)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ search: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, error: authError } = await getAuthenticatedClient();
  if (authError) return authError;

  const { error } = await supabase!
    .from("saved_searches")
    .update({ is_active: false })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: "deactivated" });
}
