import { createServerClient } from "@/lib/supabase/server";
import { DashboardClient } from "@/components/dashboard-client";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const supabase = createServerClient();

  const [totalResult, rentResult, forsaleResult, hiddenResult, searchesResult, notificationsResult] =
    await Promise.all([
      supabase
        .from("listings")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("is_hidden", false),
      supabase
        .from("listings")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("is_hidden", false)
        .eq("deal_type", "rent"),
      supabase
        .from("listings")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("is_hidden", false)
        .eq("deal_type", "forsale"),
      supabase
        .from("listings")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("is_hidden", true),
      supabase
        .from("saved_searches")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false }),
      supabase
        .from("notification_logs")
        .select("*")
        .order("sent_at", { ascending: false })
        .limit(10),
    ]);

  return (
    <DashboardClient
      stats={{
        total: totalResult.count ?? 0,
        rent: rentResult.count ?? 0,
        forsale: forsaleResult.count ?? 0,
        hidden: hiddenResult.count ?? 0,
        searches: searchesResult.data?.length ?? 0,
      }}
      savedSearches={searchesResult.data ?? []}
      recentNotifications={notificationsResult.data ?? []}
    />
  );
}
