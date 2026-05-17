import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================
// Mock Supabase with properly chainable query builder (Proxy-based)
// ============================================

function createChainableMock() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  let resolveData: unknown = null;
  let resolveError: unknown = null;
  let resolveCount: number | null = null;

  const handler: ProxyHandler<object> = {
    get(_target, prop: string) {
      if (prop === "then") {
        return (fn: (v: unknown) => unknown) =>
          Promise.resolve({ data: resolveData, error: resolveError, count: resolveCount }).then(fn);
      }
      if (prop === "__calls") return calls;
      if (prop === "__setResult") {
        return (data: unknown, error: unknown = null, count: number | null = null) => {
          resolveData = data;
          resolveError = error;
          resolveCount = count;
        };
      }
      return (...args: unknown[]) => {
        calls.push({ method: prop, args });
        return proxy;
      };
    },
  };

  const proxy = new Proxy({}, handler);
  return proxy as Record<string, unknown>;
}

let chain: ReturnType<typeof createChainableMock>;
const mockFrom = vi.fn(() => chain);
const mockRpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({ from: mockFrom, rpc: mockRpc }),
}));

import { searchListings, getAreaCounts, getNeighborhoods, matchSavedSearch } from "@/lib/search/engine";

// ============================================
// Helpers
// ============================================

function getCalls(): Array<{ method: string; args: unknown[] }> {
  return (chain as Record<string, unknown>).__calls as Array<{ method: string; args: unknown[] }>;
}

function setResult(data: unknown, error: unknown = null, count: number | null = null) {
  ((chain as Record<string, unknown>).__setResult as Function)(data, error, count);
}

function hasCall(method: string, ...expectedArgs: unknown[]): boolean {
  const calls = getCalls();
  return calls.some(
    (c) => c.method === method && expectedArgs.every((a, i) => JSON.stringify(c.args[i]) === JSON.stringify(a))
  );
}

// ============================================
// searchListings
// ============================================

describe("searchListings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chain = createChainableMock();
    mockFrom.mockReturnValue(chain);
    mockRpc.mockResolvedValue({ data: [], error: null });
    setResult([], null, 0);
  });

  it("returns empty results on error", async () => {
    setResult(null, { message: "db error" }, 0);
    const result = await searchListings({}, 1, 20, false);
    expect(result).toEqual({ listings: [], total: 0 });
  });

  it("returns listings and total count", async () => {
    setResult([{ yad2_id: "abc" }], null, 1);
    const result = await searchListings({}, 1, 20, false);
    expect(result.listings).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it("applies deal_type filter", async () => {
    await searchListings({ deal_type: "rent" }, 1, 20, false);
    expect(hasCall("eq", "deal_type", "rent")).toBe(true);
  });

  it("applies cities filter with in()", async () => {
    await searchListings({ cities: ["תל אביב", "חיפה"] }, 1, 20, false);
    expect(hasCall("in", "city", ["תל אביב", "חיפה"])).toBe(true);
  });

  it("applies room range filters", async () => {
    await searchListings({ rooms_min: 2, rooms_max: 4 }, 1, 20, false);
    expect(hasCall("gte", "rooms", 2)).toBe(true);
    expect(hasCall("lte", "rooms", 4)).toBe(true);
  });

  it("applies price range filters", async () => {
    await searchListings({ price_min: 3000, price_max: 8000 }, 1, 20, false);
    expect(hasCall("gte", "price", 3000)).toBe(true);
    expect(hasCall("lte", "price", 8000)).toBe(true);
  });

  it("applies sqm range filters", async () => {
    await searchListings({ sqm_min: 50, sqm_max: 100 }, 1, 20, false);
    expect(hasCall("gte", "sqm", 50)).toBe(true);
    expect(hasCall("lte", "sqm", 100)).toBe(true);
  });

  it("applies floor range filters", async () => {
    await searchListings({ floor_min: 2, floor_max: 5 }, 1, 20, false);
    expect(hasCall("gte", "floor", 2)).toBe(true);
    expect(hasCall("lte", "floor", 5)).toBe(true);
  });

  it("applies amenity filters", async () => {
    await searchListings({ amenities: ["parking", "elevator"] }, 1, 20, false);
    expect(hasCall("is", "parking", true)).toBe(true);
    expect(hasCall("is", "elevator", true)).toBe(true);
  });

  it("applies hidden filter for hidden mode", async () => {
    await searchListings({}, 1, 20, true);
    expect(hasCall("eq", "is_hidden", true)).toBe(true);
  });

  it("applies non-hidden filter by default", async () => {
    await searchListings({}, 1, 20, false);
    expect(hasCall("eq", "is_hidden", false)).toBe(true);
  });

  it("always filters is_active=true", async () => {
    await searchListings({}, 1, 20, false);
    expect(hasCall("eq", "is_active", true)).toBe(true);
  });

  it("skips top_area_ids when cities provided", async () => {
    await searchListings({ cities: ["תל אביב"], top_area_ids: [3] }, 1, 20, false);
    expect(hasCall("in", "top_area_id", [3])).toBe(false);
  });

  it("skips top_area_ids when neighborhoods provided", async () => {
    await searchListings({ neighborhoods: ["פלורנטין"], top_area_ids: [3] }, 1, 20, false);
    expect(hasCall("in", "top_area_id", [3])).toBe(false);
  });

  it("applies top_area_ids when no cities", async () => {
    await searchListings({ top_area_ids: [3, 7] }, 1, 20, false);
    expect(hasCall("in", "top_area_id", [3, 7])).toBe(true);
  });

  it("applies neighborhoods filter", async () => {
    await searchListings({ neighborhoods: ["פלורנטין"] }, 1, 20, false);
    expect(hasCall("in", "neighborhood", ["פלורנטין"])).toBe(true);
  });

  it("applies area_ids filter", async () => {
    await searchListings({ area_ids: [100, 200] }, 1, 20, false);
    expect(hasCall("in", "area_id", [100, 200])).toBe(true);
  });

  it("applies pagination range", async () => {
    await searchListings({}, 3, 10, false);
    expect(hasCall("range", 20, 29)).toBe(true);
  });

  it("applies default sort (newest)", async () => {
    await searchListings({}, 1, 20, false);
    const orderCalls = getCalls().filter((c) => c.method === "order");
    expect(orderCalls.length).toBeGreaterThan(0);
  });

  it("applies price_asc sort", async () => {
    await searchListings({ sort_by: "price_asc" }, 1, 20, false);
    const call = getCalls().find((c) => c.method === "order" && c.args[0] === "price");
    expect(call).toBeDefined();
    expect((call!.args[1] as { ascending: boolean }).ascending).toBe(true);
  });

  it("applies price_desc sort", async () => {
    await searchListings({ sort_by: "price_desc" }, 1, 20, false);
    const call = getCalls().find((c) => c.method === "order" && c.args[0] === "price");
    expect(call).toBeDefined();
    expect((call!.args[1] as { ascending: boolean }).ascending).toBe(false);
  });

  it("uses radius search when geo params provided", async () => {
    mockRpc.mockResolvedValue({ data: [{ yad2_id: "abc123" }], error: null });
    await searchListings({ center_lat: 32.06, center_lng: 34.77, radius_km: 5 }, 1, 20, false);
    expect(mockRpc).toHaveBeenCalledWith("listings_near_point", {
      lat: 32.06,
      lng: 34.77,
      radius_km: 5,
    });
  });

  it("handles combined filters", async () => {
    await searchListings(
      { deal_type: "rent", cities: ["תל אביב"], rooms_min: 2, price_max: 8000 },
      1, 20, false
    );
    expect(hasCall("eq", "deal_type", "rent")).toBe(true);
    expect(hasCall("in", "city", ["תל אביב"])).toBe(true);
    expect(hasCall("gte", "rooms", 2)).toBe(true);
    expect(hasCall("lte", "price", 8000)).toBe(true);
  });
});

// ============================================
// getAreaCounts
// ============================================

describe("getAreaCounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chain = createChainableMock();
    mockFrom.mockReturnValue(chain);
  });

  it("returns empty object when no data", async () => {
    setResult(null, null);
    const result = await getAreaCounts();
    expect(result).toEqual({});
  });

  it("groups counts by area_id", async () => {
    setResult([{ area_id: 100 }, { area_id: 100 }, { area_id: 200 }], null);
    const result = await getAreaCounts();
    expect(result).toEqual({ 100: 2, 200: 1 });
  });

  it("filters only active listings", async () => {
    setResult([], null);
    await getAreaCounts();
    expect(hasCall("eq", "is_active", true)).toBe(true);
  });

  it("excludes area_id=0", async () => {
    setResult([], null);
    await getAreaCounts();
    expect(hasCall("gt", "area_id", 0)).toBe(true);
  });
});

// ============================================
// getNeighborhoods
// ============================================

describe("getNeighborhoods", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chain = createChainableMock();
    mockFrom.mockReturnValue(chain);
  });

  it("returns empty array when no data", async () => {
    setResult(null, null);
    const result = await getNeighborhoods([]);
    expect(result).toEqual([]);
  });

  it("counts neighborhoods correctly", async () => {
    setResult([
      { neighborhood: "פלורנטין" },
      { neighborhood: "פלורנטין" },
      { neighborhood: "נווה צדק" },
    ], null);
    const result = await getNeighborhoods(["תל אביב"]);
    expect(result).toContainEqual({ neighborhood: "פלורנטין", count: 2 });
    expect(result).toContainEqual({ neighborhood: "נווה צדק", count: 1 });
  });

  it("filters by city when provided", async () => {
    setResult([], null);
    await getNeighborhoods(["תל אביב"]);
    expect(hasCall("in", "city", ["תל אביב"])).toBe(true);
  });
});

// ============================================
// matchSavedSearch
// ============================================

describe("matchSavedSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chain = createChainableMock();
    mockFrom.mockReturnValue(chain);
  });

  it("returns true when listing matches", async () => {
    setResult([{ yad2_id: "abc123" }], null);
    const result = await matchSavedSearch({ deal_type: "rent" }, "abc123");
    expect(result).toBe(true);
  });

  it("returns false when no match", async () => {
    setResult([], null);
    const result = await matchSavedSearch({ deal_type: "forsale" }, "abc123");
    expect(result).toBe(false);
  });

  it("filters by yad2_id", async () => {
    setResult([], null);
    await matchSavedSearch({}, "abc123");
    expect(hasCall("eq", "yad2_id", "abc123")).toBe(true);
  });

  it("applies filters to match query", async () => {
    setResult([], null);
    await matchSavedSearch({ deal_type: "rent", rooms_min: 2 }, "abc123");
    expect(hasCall("eq", "deal_type", "rent")).toBe(true);
    expect(hasCall("gte", "rooms", 2)).toBe(true);
  });
});
