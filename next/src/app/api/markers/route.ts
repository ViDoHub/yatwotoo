import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

/**
 * GET /api/markers
 * Return listing markers for the map view with all filters applied.
 * Returns up to 2000 results (no pagination).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;
  const supabase = createServerClient();

  const hiddenOnly = params.get("hidden") === "true";

  let query = supabase
    .from("listings")
    .select("yad2_id, price, rooms, sqm, city, street, deal_type, location")
    .eq("is_hidden", hiddenOnly)
    .not("location", "is", null)
    .limit(2000);

  if (params.get("deal_type")) query = query.eq("deal_type", params.get("deal_type")!);
  if (params.get("cities")) query = query.in("city", params.get("cities")!.split(","));
  if (params.get("top_area_ids"))
    query = query.in("top_area_id", params.get("top_area_ids")!.split(",").map(Number));
  if (params.get("neighborhoods"))
    query = query.in("neighborhood", params.get("neighborhoods")!.split(","));
  if (params.get("rooms_min")) query = query.gte("rooms", Number(params.get("rooms_min")));
  if (params.get("rooms_max")) query = query.lte("rooms", Number(params.get("rooms_max")));
  if (params.get("price_min")) query = query.gte("price", Number(params.get("price_min")));
  if (params.get("price_max")) query = query.lte("price", Number(params.get("price_max")));
  if (params.get("sqm_min")) query = query.gte("sqm", Number(params.get("sqm_min")));
  if (params.get("sqm_max")) query = query.lte("sqm", Number(params.get("sqm_max")));

  // Amenity filters
  const amenities = params.get("amenities")?.split(",").filter(Boolean) || [];
  for (const amenity of amenities) {
    query = query.eq(amenity, true);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ markers: [], total: 0, error: error.message }, { status: 500 });
  }

  const markers: { lat: number; lng: number; price: number | null; rooms: number | null; sqm: number | null; address: string; yad2_id: string }[] = [];

  for (const row of data || []) {
    const coords = extractCoords(row.location);
    if (!coords) continue;
    markers.push({
      lat: coords[1],
      lng: coords[0],
      price: row.price,
      rooms: row.rooms,
      sqm: row.sqm,
      address: row.street ? `${row.street}, ${row.city}` : row.city || "",
      yad2_id: row.yad2_id,
    });
  }

  return NextResponse.json({ markers, total: markers.length });
}

function extractCoords(location: unknown): [number, number] | null {
  if (!location) return null;
  // GeoJSON format: { type: "Point", coordinates: [lng, lat] }
  if (typeof location === "object" && location !== null) {
    const obj = location as Record<string, unknown>;
    if (obj.coordinates && Array.isArray(obj.coordinates) && obj.coordinates.length >= 2) {
      return [obj.coordinates[0] as number, obj.coordinates[1] as number];
    }
  }
  // WKB hex with SRID: 01 + type(4) + srid(4) + x(8) + y(8) = 50 hex chars for Point
  if (typeof location === "string" && location.length >= 50) {
    try {
      const buf = Buffer.from(location, "hex");
      // byte 0: byte order (01 = LE)
      const le = buf[0] === 1;
      // bytes 9-16: x (longitude), bytes 17-24: y (latitude)
      const x = le ? buf.readDoubleLE(9) : buf.readDoubleBE(9);
      const y = le ? buf.readDoubleLE(17) : buf.readDoubleBE(17);
      if (isFinite(x) && isFinite(y) && Math.abs(x) <= 180 && Math.abs(y) <= 90) {
        return [x, y];
      }
    } catch {
      // fall through
    }
    // WKT fallback: POINT(lng lat)
    const match = location.match(/POINT\(([\d.-]+)\s+([\d.-]+)\)/);
    if (match) return [parseFloat(match[1]), parseFloat(match[2])];
  }
  return null;
}
