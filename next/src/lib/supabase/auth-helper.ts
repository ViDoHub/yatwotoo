import { NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase/server";

/**
 * Get authenticated Supabase client and user.
 * Returns 401 response if not authenticated.
 */
export async function getAuthenticatedClient() {
  const supabase = await createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      supabase: null,
      user: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { supabase, user, error: null };
}
