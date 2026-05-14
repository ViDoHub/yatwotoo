import { describe, it, expect } from "vitest";
import { parseMarker, buildApiParams } from "@/lib/scraper/yad2-client";
import type { Marker } from "@/lib/scraper/yad2-client";

// ============================================
// Sample data fixtures
// ============================================

function sampleMarker(overrides: Partial<Marker> = {}): Marker {
  return {
    token: "abc123",
    price: 6000,
    address: {
      city: { text: "תל אביב" },
      neighborhood: { text: "פלורנטין" },
      street: { text: "הרצל" },
      house: { number: 42, floor: 4 },
      coords: { lat: 32.06, lon: 34.77 },
      area: { text: "תל אביב" },
      region: { text: "מרכז", id: 3 },
    },
    additionalDetails: {
      roomsCount: 3,
      squareMeter: 75,
    },
    metaData: {
      images: ["https://img.yad2.co.il/1.jpg", "https://img.yad2.co.il/2.jpg"],
      coverImage: "https://img.yad2.co.il/cover.jpg",
    },
    ...overrides,
  };
}

// ============================================
// parseMarker
// ============================================

describe("parseMarker", () => {
  it("parses a valid marker with all fields", () => {
    const result = parseMarker(sampleMarker(), "rent");
    expect(result).not.toBeNull();
    expect(result!.yad2_id).toBe("abc123");
    expect(result!.deal_type).toBe("rent");
    expect(result!.city).toBe("תל אביב");
    expect(result!.neighborhood).toBe("פלורנטין");
    expect(result!.street).toBe("הרצל");
    expect(result!.house_number).toBe("42");
    expect(result!.rooms).toBe(3);
    expect(result!.floor).toBe(4);
    expect(result!.sqm).toBe(75);
    expect(result!.price).toBe(6000);
    expect(result!.price_per_sqm).toBe(80);
    expect(result!.images).toEqual(["https://img.yad2.co.il/1.jpg", "https://img.yad2.co.il/2.jpg"]);
    expect(result!.url).toBe("https://www.yad2.co.il/item/abc123");
    expect(result!.top_area_id).toBe(3);
  });

  it("returns null for marker without token", () => {
    expect(parseMarker(sampleMarker({ token: "" }), "rent")).toBeNull();
  });

  it("returns null when token key is missing", () => {
    const m = sampleMarker();
    delete (m as Record<string, unknown>).token;
    expect(parseMarker(m, "rent")).toBeNull();
  });

  it("parses marker with missing optional fields", () => {
    const result = parseMarker({ token: "minimal" }, "rent");
    expect(result).not.toBeNull();
    expect(result!.yad2_id).toBe("minimal");
    expect(result!.city).toBe("");
    expect(result!.rooms).toBeNull();
    expect(result!.price).toBeNull();
    expect(result!.images).toEqual([]);
  });

  it("handles zero price correctly", () => {
    const result = parseMarker(sampleMarker({ price: 0 }), "rent");
    expect(result).not.toBeNull();
    expect(result!.price).toBe(0);
    expect(result!.price_per_sqm).toBeNull();
  });

  it("handles missing coordinates", () => {
    const m = sampleMarker();
    m.address!.coords = undefined;
    const result = parseMarker(m, "rent");
    expect(result).not.toBeNull();
    expect(result!.location).toBeNull();
  });

  it("uses coverImage as fallback when images list is empty", () => {
    const m = sampleMarker();
    m.metaData = { images: [], coverImage: "https://img.yad2.co.il/cover.jpg" };
    const result = parseMarker(m, "rent");
    expect(result!.images).toEqual(["https://img.yad2.co.il/cover.jpg"]);
  });

  it("parses forsale deal type", () => {
    const result = parseMarker(sampleMarker(), "forsale");
    expect(result!.deal_type).toBe("forsale");
  });

  it("handles string floor value", () => {
    const m = sampleMarker();
    m.address!.house = { number: 10, floor: 5 };
    const result = parseMarker(m, "rent");
    expect(result!.floor).toBe(5);
  });

  it("handles non-numeric floor gracefully", () => {
    const m = sampleMarker();
    (m.address!.house as Record<string, unknown>).floor = "ground";
    const result = parseMarker(m, "rent");
    expect(result!.floor).toBeNull();
  });

  it("converts house_number 0 to string '0'", () => {
    const m = sampleMarker();
    m.address!.house = { number: 0, floor: 2 };
    const result = parseMarker(m, "rent");
    expect(result!.house_number).toBe("0");
  });

  it("calculates price_per_sqm correctly", () => {
    const m = sampleMarker();
    m.price = 10000;
    m.additionalDetails = { squareMeter: 100, roomsCount: 3 };
    const result = parseMarker(m, "rent");
    expect(result!.price_per_sqm).toBe(100);
  });

  it("price_per_sqm is null when sqm is 0", () => {
    const m = sampleMarker();
    m.additionalDetails = { squareMeter: 0, roomsCount: 3 };
    const result = parseMarker(m, "rent");
    expect(result!.price_per_sqm).toBeNull();
  });

  it("generates correct PostGIS location string", () => {
    const result = parseMarker(sampleMarker(), "rent");
    expect(result!.location).toBe("SRID=4326;POINT(34.77 32.06)");
  });

  it("handles string rooms count", () => {
    const m = sampleMarker();
    (m.additionalDetails as Record<string, unknown>).roomsCount = "3.5";
    const result = parseMarker(m, "rent");
    expect(result!.rooms).toBe(3.5);
  });
});

// ============================================
// buildApiParams
// ============================================

describe("buildApiParams", () => {
  it("returns empty object for empty filters", () => {
    expect(buildApiParams({})).toEqual({});
  });

  it("maps rooms_min/max to minRooms/maxRooms", () => {
    const result = buildApiParams({ rooms_min: 2, rooms_max: 4 });
    expect(result).toEqual({ minRooms: "2", maxRooms: "4" });
  });

  it("maps price_min/max to minPrice/maxPrice", () => {
    const result = buildApiParams({ price_min: 3000, price_max: 8000 });
    expect(result).toEqual({ minPrice: "3000", maxPrice: "8000" });
  });

  it("includes only recognized keys", () => {
    const result = buildApiParams({
      rooms_min: 2,
      price_max: 5000,
      unknown_key: "ignored",
      city: "Tel Aviv",
    });
    expect(result).toEqual({ minRooms: "2", maxPrice: "5000" });
  });

  it("ignores falsy values", () => {
    const result = buildApiParams({ rooms_min: 0, price_min: null });
    expect(result).toEqual({});
  });
});
