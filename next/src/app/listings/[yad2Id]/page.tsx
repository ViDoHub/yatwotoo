import { createAuthClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { ListingDetailClient } from "@/components/listing-detail-client";

export async function generateMetadata({ params }: { params: Promise<{ yad2Id: string }> }) {
  const { yad2Id } = await params;
  const supabase = await createAuthClient();
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
  const supabase = await createAuthClient();

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

  // Extract coordinates from location (could be GeoJSON object or WKB hex string)
  let coords: [number, number] | null = null;
  const loc = listing.location;
  if (loc && typeof loc === "object" && (loc as Record<string, unknown>).coordinates) {
    const c = (loc as Record<string, unknown>).coordinates as number[];
    if (Array.isArray(c) && c.length >= 2) coords = [c[0], c[1]];
  } else if (loc && typeof loc === "string" && loc.length >= 50) {
    try {
      const buf = Buffer.from(loc, "hex");
      const le = buf[0] === 1;
      const x = le ? buf.readDoubleLE(9) : buf.readDoubleBE(9);
      const y = le ? buf.readDoubleLE(17) : buf.readDoubleBE(17);
      if (isFinite(x) && isFinite(y) && Math.abs(x) <= 180 && Math.abs(y) <= 90) {
        coords = [x, y];
      }
    } catch {}
  }

  return (
    <ListingDetailClient listing={listing} priceHistory={priceHistory ?? []} coordinates={coords} />
  );
}
