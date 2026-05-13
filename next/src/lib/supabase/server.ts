import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Server-side Supabase client using the service role key.
 * Use this in API routes, server components, and cron handlers.
 * Never expose this client to the browser.
 */
export function createServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  return createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
