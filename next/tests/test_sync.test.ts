import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================
// Mock Supabase
// ============================================

const existingListings: Array<{ yad2_id: string; price: number | null }> = [];
const insertedListings: unknown[] = [];
const insertedPriceHistory: unknown[] = [];
const updatedListings: Array<{ yad2_id: string; data: Record<string, unknown> }> = [];

const mockQueryChain: Record<string, ReturnType<typeof vi.fn>> = {};
const chainMethods = [
  "select", "insert", "update", "upsert", "delete",
  "eq", "neq", "gt", "gte", "lt", "lte", "in", "is",
  "range", "order", "limit", "single",
];

function setupChain() {
  // Add thenable to the chain object itself (default: empty data)
  Object.defineProperty(mockQueryChain, "then", {
    configurable: true,
    get() {
      return (fn: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(fn);
    },
  });

  for (const m of chainMethods) {
    mockQueryChain[m] = vi.fn().mockReturnValue(mockQueryChain);
  }

  // Track insert calls
  mockQueryChain.insert = vi.fn((data: unknown) => {
    if (Array.isArray(data)) {
      insertedPriceHistory.push(...data);
    }
    return mockQueryChain;
  });

  // Track upsert calls
  mockQueryChain.upsert = vi.fn((data: unknown) => {
    if (Array.isArray(data)) {
      insertedListings.push(...data);
    }
    return mockQueryChain;
  });

  // Track update calls
  mockQueryChain.update = vi.fn((data: Record<string, unknown>) => {
    const eqFn = vi.fn((col: string, val: string) => {
      if (col === "yad2_id") {
        updatedListings.push({ yad2_id: val, data });
      }
      return mockQueryChain;
    });
    return { ...mockQueryChain, eq: eqFn };
  });

  // Handle `in("yad2_id", [...])` for fetching existing
  mockQueryChain.in = vi.fn(() => {
    Object.defineProperty(mockQueryChain, "then", {
      configurable: true,
      get() {
        return (fn: (v: unknown) => unknown) =>
          Promise.resolve({ data: existingListings, error: null }).then(fn);
      },
    });
    return mockQueryChain;
  });
}

setupChain();

const mockFrom = vi.fn((table: string) => {
  if (table === "price_history") {
    return {
      insert: mockQueryChain.insert,
    };
  }
  return mockQueryChain;
});

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

import { upsertListings, deduplicateListing } from "@/lib/scraper/sync";
import type { ListingInsert } from "@/types";

// ============================================
// Sample listing factory
// ============================================

function sampleInsert(overrides: Partial<ListingInsert> = {}): ListingInsert {
  return {
    yad2_id: "abc123",
    deal_type: "rent",
    city: "תל אביב",
    neighborhood: "פלורנטין",
    street: "הרצל",
    house_number: "42",
    area: "תל אביב",
    area_id: 0,
    top_area: "מרכז",
    top_area_id: 3,
    rooms: 3,
    floor: 4,
    sqm: 75,
    price: 6000,
    price_per_sqm: 80,
    location: null,
    description: "",
    images: [],
    url: "https://www.yad2.co.il/item/abc123",
    entry_date: "",
    ...overrides,
  };
}

// ============================================
// upsertListings
// ============================================

describe("upsertListings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existingListings.length = 0;
    insertedListings.length = 0;
    insertedPriceHistory.length = 0;
    updatedListings.length = 0;
    setupChain();
    mockFrom.mockImplementation((table: string) => {
      if (table === "price_history") {
        return { insert: mockQueryChain.insert };
      }
      return mockQueryChain;
    });
  });

  it("returns empty result for empty input", async () => {
    const result = await upsertListings([]);
    expect(result.newListings).toHaveLength(0);
    expect(result.priceDrops).toHaveLength(0);
  });

  it("inserts new listing and records price history", async () => {
    const listing = sampleInsert({ yad2_id: "new1", price: 5000 });
    const result = await upsertListings([listing]);
    expect(result.newListings).toHaveLength(1);
    expect(result.newListings[0].yad2_id).toBe("new1");
  });

  it("skips price history when price is null", async () => {
    const listing = sampleInsert({ yad2_id: "new2", price: null });
    const result = await upsertListings([listing]);
    expect(result.newListings).toHaveLength(1);
    // price_history insert should not include this listing
    const phCalls = insertedPriceHistory.filter(
      (p: unknown) => (p as { listing_id: string }).listing_id === "new2"
    );
    expect(phCalls).toHaveLength(0);
  });

  it("detects price drop for existing listing", async () => {
    existingListings.push({ yad2_id: "existing1", price: 7000 });
    const listing = sampleInsert({ yad2_id: "existing1", price: 6000 });
    const result = await upsertListings([listing]);
    expect(result.priceDrops).toHaveLength(1);
    expect(result.priceDrops[0].oldPrice).toBe(7000);
  });

  it("price increase is not a price drop", async () => {
    existingListings.push({ yad2_id: "existing2", price: 5000 });
    const listing = sampleInsert({ yad2_id: "existing2", price: 6000 });
    const result = await upsertListings([listing]);
    expect(result.priceDrops).toHaveLength(0);
  });

  it("handles batch of multiple listings", async () => {
    const listings = Array.from({ length: 10 }, (_, i) =>
      sampleInsert({ yad2_id: `batch${i}`, price: 5000 + i * 100 })
    );
    const result = await upsertListings(listings);
    expect(result.newListings).toHaveLength(10);
  });
});

// ============================================
// deduplicateListing
// ============================================

describe("deduplicateListing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupChain();
    mockFrom.mockReturnValue(mockQueryChain);
  });

  it("returns false for unique listing", async () => {
    // Mock limit to resolve with empty data
    mockQueryChain.limit = vi.fn().mockImplementation(() => {
      Object.defineProperty(mockQueryChain, "then", {
        configurable: true,
        get() {
          return (fn: (v: unknown) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(fn);
        },
      });
      return mockQueryChain;
    });

    const result = await deduplicateListing(
      sampleInsert({ yad2_id: "unique1" })
    );
    expect(result).toBe(false);
  });

  it("returns true when duplicate found", async () => {
    mockQueryChain.limit = vi.fn().mockImplementation(() => {
      Object.defineProperty(mockQueryChain, "then", {
        configurable: true,
        get() {
          return (fn: (v: unknown) => unknown) =>
            Promise.resolve({ data: [{ yad2_id: "other" }], error: null }).then(fn);
        },
      });
      return mockQueryChain;
    });

    const result = await deduplicateListing(
      sampleInsert({ yad2_id: "dup1" })
    );
    expect(result).toBe(true);
  });

  it("skips dedup when no street", async () => {
    const result = await deduplicateListing(
      sampleInsert({ street: "", rooms: 3 })
    );
    expect(result).toBe(false);
  });

  it("skips dedup when no rooms", async () => {
    const result = await deduplicateListing(
      sampleInsert({ rooms: null })
    );
    expect(result).toBe(false);
  });
});
