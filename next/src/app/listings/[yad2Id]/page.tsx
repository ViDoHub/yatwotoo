import { createServerClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { ListingDetailClient } from "@/components/listing-detail-client";

export async function generateMetadata({ params }: { params: Promise<{ yad2Id: string }> }) {
  const { yad2Id } = await params;
  const supabase = createServerClient();
  const { data: listing } = await supabase
    .from("listings")
    .select("street,city")
    .eq("yad2_id", yad2Id)
    .single();
  const address = listing ? `${listing.street || ""}${listing.city ? `, ${listing.city}` : ""}` : yad2Id;
  return { title: address };
}

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ yad2Id: string }>;
}) {
  const { yad2Id } = await params;
  const supabase = createServerClient();

  const { data: listing } = await supabase
    .from("listings")
    .select("*")
    .eq("yad2_id", yad2Id)
    .single();

  if (!listing) {
    notFound();
  }

  const { data: priceHistory } = await supabase
    .from("price_history")
    .select("*")
    .eq("listing_id", yad2Id)
    .order("observed_at", { ascending: true });

  return (
    <ListingDetailClient listing={listing} priceHistory={priceHistory ?? []} />
  );
}
