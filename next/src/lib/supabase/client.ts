import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Browser-side Supabase client using the anon key.
 * Safe to use in client components.
 */
export function createBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createClient<Database>(supabaseUrl, supabaseKey);
}
