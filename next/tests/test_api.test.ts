import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================
// Mock Supabase
// ============================================

let mockListingData: unknown = null;
let mockListingError: unknown = null;
let mockPriceHistoryData: unknown[] = [];
let mockActiveJob: unknown = null;
let mockTotalListings = 0;
let mockInsertedSearches: unknown[] = [];
let mockUpdateData: Record<string, unknown> = {};

const mockQueryChain: Record<string, ReturnType<typeof vi.fn>> = {};
const chainMethods = [
  "select", "insert", "update", "upsert", "delete",
  "eq", "neq", "gt", "gte", "lt", "lte", "in", "is", "not",
  "range", "order", "limit", "single", "maybeSingle",
];

function setupChain() {
  for (const m of chainMethods) {
    mockQueryChain[m] = vi.fn().mockReturnValue(mockQueryChain);
  }

  mockQueryChain.single = vi.fn().mockReturnValue({
    then: (fn: (v: unknown) => unknown) =>
      Promise.resolve({ data: mockListingData, error: mockListingError }).then(fn),
  });
}

setupChain();

const mockFrom = vi.fn().mockReturnValue(mockQueryChain);
const mockSearchListings = vi.fn().mockResolvedValue({ listings: [], total: 0 });

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

vi.mock("@/lib/supabase/auth-helper", () => ({
  getAuthenticatedClient: () =>
    Promise.resolve({
      supabase: { from: mockFrom },
      user: { id: "test-user-id", email: "test@example.com" },
      error: null,
    }),
}));

vi.mock("@/lib/search/engine", () => ({
  searchListings: (...args: unknown[]) => mockSearchListings(...args),
}));

// Import the route handlers
// Since Next.js route handlers are just exported functions,
// we can test them directly by passing Request objects

// ============================================
// Tests for API routes (unit tests of logic)
// ============================================

describe("API: /api/listings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListingData = null;
    mockListingError = null;
    mockSearchListings.mockResolvedValue({ listings: [], total: 0 });
    setupChain();
    mockFrom.mockReturnValue(mockQueryChain);
  });

  it("GET parses filter parameters from URL", async () => {
    // Import the route handler
    const { GET } = await import("@/app/api/listings/route");

    const url = "http://localhost:3001/api/listings?deal_type=rent&rooms_min=2&rooms_max=4&price_min=3000&cities=tel+aviv,haifa";
    const request = new Request(url);
    const resp = await GET(request);
    const json = await resp.json();

    expect(mockSearchListings).toHaveBeenCalledTimes(1);
    const [filters, page, pageSize, hiddenOnly] = mockSearchListings.mock.calls[0];
    expect(filters.deal_type).toBe("rent");
    expect(filters.rooms_min).toBe(2);
    expect(filters.rooms_max).toBe(4);
    expect(filters.price_min).toBe(3000);
    expect(filters.cities).toEqual(["tel aviv", "haifa"]);
    expect(page).toBe(1);
    expect(pageSize).toBe(20);
    expect(hiddenOnly).toBe(false);
  });

  it("GET respects page_size cap of 100", async () => {
    const { GET } = await import("@/app/api/listings/route");

    const request = new Request("http://localhost:3001/api/listings?page_size=500");
    await GET(request);

    const [, , pageSize] = mockSearchListings.mock.calls[0];
    expect(pageSize).toBe(100);
  });

  it("GET passes hidden=true", async () => {
    const { GET } = await import("@/app/api/listings/route");

    const request = new Request("http://localhost:3001/api/listings?hidden=true");
    await GET(request);

    const [, , , hiddenOnly] = mockSearchListings.mock.calls[0];
    expect(hiddenOnly).toBe(true);
  });

  it("GET returns JSON with pagination fields", async () => {
    mockSearchListings.mockResolvedValue({ listings: [{ yad2_id: "a" }], total: 50 });

    const { GET } = await import("@/app/api/listings/route");
    const request = new Request("http://localhost:3001/api/listings?page=3&page_size=10");
    const resp = await GET(request);
    const json = await resp.json();

    expect(json.page).toBe(3);
    expect(json.page_size).toBe(10);
    expect(json.total).toBe(50);
    expect(json.total_pages).toBe(5);
    expect(json.listings).toHaveLength(1);
  });
});

describe("API: /api/listings/[yad2Id]/hide + unhide", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupChain();
    mockFrom.mockReturnValue(mockQueryChain);
    // Make update → eq chain resolve
    mockQueryChain.update = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        then: (fn: (v: unknown) => unknown) =>
          Promise.resolve({ data: null, error: null }).then(fn),
      }),
    });
  });

  it("POST /hide marks listing as hidden", async () => {
    const { POST } = await import("@/app/api/listings/[yad2Id]/hide/route");
    const request = new Request("http://localhost:3001/api/listings/abc123/hide", { method: "POST" });
    const resp = await POST(request, { params: Promise.resolve({ yad2Id: "abc123" }) });
    const json = await resp.json();

    expect(json.status).toBe("hidden");
    expect(json.yad2_id).toBe("abc123");
    expect(mockFrom).toHaveBeenCalledWith("listings");
    expect(mockQueryChain.update).toHaveBeenCalledWith({ is_hidden: true });
  });

  it("POST /unhide marks listing as unhidden", async () => {
    const { POST } = await import("@/app/api/listings/[yad2Id]/unhide/route");
    const request = new Request("http://localhost:3001/api/listings/abc123/unhide", { method: "POST" });
    const resp = await POST(request, { params: Promise.resolve({ yad2Id: "abc123" }) });
    const json = await resp.json();

    expect(json.status).toBe("unhidden");
    expect(json.yad2_id).toBe("abc123");
    expect(mockQueryChain.update).toHaveBeenCalledWith({ is_hidden: false });
  });
});

describe("API: /api/searches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupChain();
    mockFrom.mockReturnValue(mockQueryChain);
  });

  it("POST requires name", async () => {
    const { POST } = await import("@/app/api/searches/route");
    const request = new Request("http://localhost:3001/api/searches", {
      method: "POST",
      body: JSON.stringify({ filters: {} }),
      headers: { "Content-Type": "application/json" },
    });
    const resp = await POST(request);
    expect(resp.status).toBe(400);
    const json = await resp.json();
    expect(json.error).toContain("Name is required");
  });

  it("POST creates search with name and filters", async () => {
    const searchData = { id: "s1", name: "Test Search", filters: { deal_type: "rent" }, is_active: true };
    mockQueryChain.single = vi.fn().mockReturnValue({
      then: (fn: (v: unknown) => unknown) =>
        Promise.resolve({ data: searchData, error: null }).then(fn),
    });

    const { POST } = await import("@/app/api/searches/route");
    const request = new Request("http://localhost:3001/api/searches", {
      method: "POST",
      body: JSON.stringify({ name: "Test Search", filters: { deal_type: "rent" } }),
      headers: { "Content-Type": "application/json" },
    });
    const resp = await POST(request);
    expect(resp.status).toBe(201);
    const json = await resp.json();
    expect(json.search.name).toBe("Test Search");
  });
});

describe("API: /api/scrape/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupChain();
    mockFrom.mockReturnValue(mockQueryChain);
  });

  it("prevents duplicate when job already running", async () => {
    // First call (checking active jobs) returns an active job
    mockQueryChain.single = vi.fn().mockReturnValue({
      then: (fn: (v: unknown) => unknown) =>
        Promise.resolve({ data: { id: "job-1", status: "running" }, error: null }).then(fn),
    });

    const { POST } = await import("@/app/api/scrape/start/route");
    const request = new Request("http://localhost:3001/api/scrape/start", { method: "POST" });
    const resp = await POST(request);
    expect(resp.status).toBe(409);
    const json = await resp.json();
    expect(json.status).toBe("already_running");
  });

  it("creates new pending job when none active", async () => {
    // First call: no active job, second call: return the new job
    let callCount = 0;
    mockQueryChain.single = vi.fn().mockReturnValue({
      then: (fn: (v: unknown) => unknown) => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ data: null, error: { message: "not found" } }).then(fn);
        }
        return Promise.resolve({ data: { id: "new-job" }, error: null }).then(fn);
      },
    });

    const { POST } = await import("@/app/api/scrape/start/route");
    const request = new Request("http://localhost:3001/api/scrape/start", { method: "POST" });
    const resp = await POST(request);
    const json = await resp.json();
    expect(json.status).toBe("started");
    expect(json.job_id).toBe("new-job");
  });
});
