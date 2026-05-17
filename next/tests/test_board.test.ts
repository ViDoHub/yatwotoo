import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================
// Mock Supabase
// ============================================

let mockData: unknown = null;
let mockError: unknown = null;
let mockCount: number | null = null;

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

  // Make chain thenable by default
  Object.defineProperty(mockQueryChain, "then", {
    configurable: true,
    get: () => (fn: (v: unknown) => unknown) =>
      Promise.resolve({ data: mockData, error: mockError, count: mockCount }).then(fn),
  });
}

setupChain();

const mockFrom = vi.fn().mockReturnValue(mockQueryChain);

const mockUser = { id: "test-user-id", email: "test@example.com" };

vi.mock("@/lib/supabase/auth-helper", () => ({
  getAuthenticatedClient: () =>
    Promise.resolve({
      supabase: { from: mockFrom },
      user: mockUser,
      error: null,
    }),
}));

// ============================================
// Tests for Board API
// ============================================

describe("API: GET /api/board", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockData = null;
    mockError = null;
    mockCount = null;
    setupChain();
    mockFrom.mockReturnValue(mockQueryChain);
  });

  it("returns all board listings ordered by column and position", async () => {
    const boardItems = [
      { id: "b1", listing_id: "l1", board_column: "review", position: 0, listings: { yad2_id: "abc" } },
      { id: "b2", listing_id: "l2", board_column: "call", position: 0, listings: { yad2_id: "def" } },
    ];
    mockData = boardItems;

    const { GET } = await import("@/app/api/board/route");
    const resp = await GET();
    const json = await resp.json();

    expect(resp.status).toBe(200);
    expect(json).toHaveLength(2);
    expect(mockFrom).toHaveBeenCalledWith("board_listings");
    expect(mockQueryChain.select).toHaveBeenCalledWith("*, listings(*)");
    expect(mockQueryChain.order).toHaveBeenCalledWith("board_column");
  });

  it("returns 500 on database error", async () => {
    mockError = { message: "DB connection failed" };

    const { GET } = await import("@/app/api/board/route");
    const resp = await GET();
    const json = await resp.json();

    expect(resp.status).toBe(500);
    expect(json.error).toBe("DB connection failed");
  });

  it("returns empty array when no board listings exist", async () => {
    mockData = [];

    const { GET } = await import("@/app/api/board/route");
    const resp = await GET();
    const json = await resp.json();

    expect(resp.status).toBe(200);
    expect(json).toEqual([]);
  });
});

describe("API: POST /api/board", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockData = null;
    mockError = null;
    mockCount = 0;
    setupChain();
    mockFrom.mockReturnValue(mockQueryChain);

    // For count query (select with head:true), return count
    mockQueryChain.select = vi.fn().mockImplementation((_sel: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.head) {
        return {
          eq: vi.fn().mockReturnValue({
            then: (fn: (v: unknown) => unknown) =>
              Promise.resolve({ count: mockCount, error: null }).then(fn),
          }),
        };
      }
      return mockQueryChain;
    });

    // For insert chain
    mockQueryChain.insert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockReturnValue({
          then: (fn: (v: unknown) => unknown) =>
            Promise.resolve({ data: mockData, error: mockError }).then(fn),
        }),
      }),
    });
  });

  it("adds a listing to the board in review column", async () => {
    mockData = { id: "b1", listing_id: "l1", board_column: "review", position: 0 };

    const { POST } = await import("@/app/api/board/route");
    const request = new Request("http://localhost:3001/api/board", {
      method: "POST",
      body: JSON.stringify({ listing_id: "l1" }),
      headers: { "Content-Type": "application/json" },
    });
    const resp = await POST(request);
    const json = await resp.json();

    expect(resp.status).toBe(201);
    expect(json.board_column).toBe("review");
    expect(mockFrom).toHaveBeenCalledWith("board_listings");
  });

  it("returns 400 when listing_id is missing", async () => {
    const { POST } = await import("@/app/api/board/route");
    const request = new Request("http://localhost:3001/api/board", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    const resp = await POST(request);

    expect(resp.status).toBe(400);
    const json = await resp.json();
    expect(json.error).toBe("listing_id is required");
  });

  it("returns 400 on invalid JSON", async () => {
    const { POST } = await import("@/app/api/board/route");
    const request = new Request("http://localhost:3001/api/board", {
      method: "POST",
      body: "not json",
    });
    const resp = await POST(request);

    expect(resp.status).toBe(400);
  });

  it("returns 409 when listing already on board", async () => {
    mockError = { code: "23505", message: "duplicate key" };

    const { POST } = await import("@/app/api/board/route");
    const request = new Request("http://localhost:3001/api/board", {
      method: "POST",
      body: JSON.stringify({ listing_id: "l1" }),
      headers: { "Content-Type": "application/json" },
    });
    const resp = await POST(request);

    expect(resp.status).toBe(409);
    const json = await resp.json();
    expect(json.error).toContain("already on the board");
  });

  it("returns 409 response with meaningful error message", async () => {
    mockError = { code: "23505", message: "duplicate key value violates unique constraint" };

    const { POST } = await import("@/app/api/board/route");
    const request = new Request("http://localhost:3001/api/board", {
      method: "POST",
      body: JSON.stringify({ listing_id: "l1" }),
      headers: { "Content-Type": "application/json" },
    });
    const resp = await POST(request);
    const json = await resp.json();

    expect(resp.status).toBe(409);
    expect(typeof json.error).toBe("string");
    expect(json.error.length).toBeGreaterThan(0);
  });
});

describe("API: PATCH /api/board/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockData = null;
    mockError = null;
    setupChain();
    mockFrom.mockReturnValue(mockQueryChain);

    // update → eq → select → single chain
    mockQueryChain.update = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockReturnValue({
            then: (fn: (v: unknown) => unknown) =>
              Promise.resolve({ data: mockData, error: mockError }).then(fn),
          }),
        }),
      }),
    });
  });

  it("updates board_column", async () => {
    mockData = { id: "b1", board_column: "get_contacts", position: 0 };

    const { PATCH } = await import("@/app/api/board/[id]/route");
    const request = new Request("http://localhost:3001/api/board/b1", {
      method: "PATCH",
      body: JSON.stringify({ board_column: "get_contacts" }),
      headers: { "Content-Type": "application/json" },
    });
    const resp = await PATCH(request, { params: Promise.resolve({ id: "b1" }) });
    const json = await resp.json();

    expect(resp.status).toBe(200);
    expect(json.board_column).toBe("get_contacts");
  });

  it("updates contact fields", async () => {
    mockData = { id: "b1", contact_name: "John", contact_phone: "0501234567" };

    const { PATCH } = await import("@/app/api/board/[id]/route");
    const request = new Request("http://localhost:3001/api/board/b1", {
      method: "PATCH",
      body: JSON.stringify({ contact_name: "John", contact_phone: "0501234567" }),
      headers: { "Content-Type": "application/json" },
    });
    const resp = await PATCH(request, { params: Promise.resolve({ id: "b1" }) });
    const json = await resp.json();

    expect(resp.status).toBe(200);
    expect(json.contact_name).toBe("John");
    expect(json.contact_phone).toBe("0501234567");
  });

  it("rejects invalid board_column", async () => {
    const { PATCH } = await import("@/app/api/board/[id]/route");
    const request = new Request("http://localhost:3001/api/board/b1", {
      method: "PATCH",
      body: JSON.stringify({ board_column: "invalid" }),
      headers: { "Content-Type": "application/json" },
    });
    const resp = await PATCH(request, { params: Promise.resolve({ id: "b1" }) });

    expect(resp.status).toBe(400);
    const json = await resp.json();
    expect(json.error).toContain("Invalid board column");
  });

  it("rejects when no valid fields provided", async () => {
    const { PATCH } = await import("@/app/api/board/[id]/route");
    const request = new Request("http://localhost:3001/api/board/b1", {
      method: "PATCH",
      body: JSON.stringify({ unknown_field: "value" }),
      headers: { "Content-Type": "application/json" },
    });
    const resp = await PATCH(request, { params: Promise.resolve({ id: "b1" }) });

    expect(resp.status).toBe(400);
    const json = await resp.json();
    expect(json.error).toContain("No valid fields");
  });

  it("updates visit_date", async () => {
    const visitDate = "2026-05-20T14:00:00.000Z";
    mockData = { id: "b1", board_column: "visit", visit_date: visitDate };

    const { PATCH } = await import("@/app/api/board/[id]/route");
    const request = new Request("http://localhost:3001/api/board/b1", {
      method: "PATCH",
      body: JSON.stringify({ visit_date: visitDate }),
      headers: { "Content-Type": "application/json" },
    });
    const resp = await PATCH(request, { params: Promise.resolve({ id: "b1" }) });
    const json = await resp.json();

    expect(resp.status).toBe(200);
    expect(json.visit_date).toBe(visitDate);
  });

  it("moves to visit column with visit_date in one update", async () => {
    const visitDate = "2026-05-21T10:30:00.000Z";
    mockData = { id: "b1", board_column: "visit", visit_date: visitDate, position: 0 };

    const { PATCH } = await import("@/app/api/board/[id]/route");
    const request = new Request("http://localhost:3001/api/board/b1", {
      method: "PATCH",
      body: JSON.stringify({ board_column: "visit", visit_date: visitDate }),
      headers: { "Content-Type": "application/json" },
    });
    const resp = await PATCH(request, { params: Promise.resolve({ id: "b1" }) });
    const json = await resp.json();

    expect(resp.status).toBe(200);
    expect(json.board_column).toBe("visit");
    expect(json.visit_date).toBe(visitDate);
  });

  it("clears visit_date with null", async () => {
    mockData = { id: "b1", board_column: "visit", visit_date: null };

    const { PATCH } = await import("@/app/api/board/[id]/route");
    const request = new Request("http://localhost:3001/api/board/b1", {
      method: "PATCH",
      body: JSON.stringify({ visit_date: null }),
      headers: { "Content-Type": "application/json" },
    });
    const resp = await PATCH(request, { params: Promise.resolve({ id: "b1" }) });
    const json = await resp.json();

    expect(resp.status).toBe(200);
    expect(json.visit_date).toBeNull();
  });

  it("returns 400 on invalid JSON body", async () => {
    const { PATCH } = await import("@/app/api/board/[id]/route");
    const request = new Request("http://localhost:3001/api/board/b1", {
      method: "PATCH",
      body: "not json",
    });
    const resp = await PATCH(request, { params: Promise.resolve({ id: "b1" }) });

    expect(resp.status).toBe(400);
    const json = await resp.json();
    expect(json.error).toContain("Invalid JSON");
  });

  it("updates visit column with contacts and visit_date combined", async () => {
    const visitDate = "2026-05-22T16:00:00.000Z";
    mockData = {
      id: "b1",
      board_column: "visit",
      contact_name: "Jane",
      contact_phone: "0521234567",
      visit_date: visitDate,
    };

    const { PATCH } = await import("@/app/api/board/[id]/route");
    const request = new Request("http://localhost:3001/api/board/b1", {
      method: "PATCH",
      body: JSON.stringify({
        board_column: "visit",
        contact_name: "Jane",
        contact_phone: "0521234567",
        visit_date: visitDate,
      }),
      headers: { "Content-Type": "application/json" },
    });
    const resp = await PATCH(request, { params: Promise.resolve({ id: "b1" }) });
    const json = await resp.json();

    expect(resp.status).toBe(200);
    expect(json.board_column).toBe("visit");
    expect(json.contact_name).toBe("Jane");
    expect(json.contact_phone).toBe("0521234567");
    expect(json.visit_date).toBe(visitDate);
  });
});

describe("API: DELETE /api/board/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockData = null;
    mockError = null;
    setupChain();
    mockFrom.mockReturnValue(mockQueryChain);

    // delete → eq chain
    mockQueryChain.delete = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        then: (fn: (v: unknown) => unknown) =>
          Promise.resolve({ data: null, error: mockError }).then(fn),
      }),
    });
  });

  it("removes a listing from the board", async () => {
    const { DELETE } = await import("@/app/api/board/[id]/route");
    const request = new Request("http://localhost:3001/api/board/b1", { method: "DELETE" });
    const resp = await DELETE(request, { params: Promise.resolve({ id: "b1" }) });
    const json = await resp.json();

    expect(resp.status).toBe(200);
    expect(json.success).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith("board_listings");
  });

  it("returns 500 on database error", async () => {
    mockError = { message: "Delete failed" };

    const { DELETE } = await import("@/app/api/board/[id]/route");
    const request = new Request("http://localhost:3001/api/board/b1", { method: "DELETE" });
    const resp = await DELETE(request, { params: Promise.resolve({ id: "b1" }) });

    expect(resp.status).toBe(500);
    const json = await resp.json();
    expect(json.error).toBe("Delete failed");
  });
});

describe("API: PATCH /api/board/reorder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockData = null;
    mockError = null;
    setupChain();
    mockFrom.mockReturnValue(mockQueryChain);

    // update → eq chain
    mockQueryChain.update = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        then: (fn: (v: unknown) => unknown) =>
          Promise.resolve({ data: null, error: mockError }).then(fn),
      }),
    });
  });

  it("batch updates positions for multiple items", async () => {
    const { PATCH } = await import("@/app/api/board/reorder/route");
    const request = new Request("http://localhost:3001/api/board/reorder", {
      method: "PATCH",
      body: JSON.stringify({
        items: [
          { id: "b1", board_column: "review", position: 0 },
          { id: "b2", board_column: "review", position: 1 },
          { id: "b3", board_column: "get_contacts", position: 0 },
        ],
      }),
      headers: { "Content-Type": "application/json" },
    });
    const resp = await PATCH(request);
    const json = await resp.json();

    expect(resp.status).toBe(200);
    expect(json.success).toBe(true);
    // Should have called from('board_listings') for each item
    expect(mockFrom).toHaveBeenCalledWith("board_listings");
  });

  it("returns 400 when items array is empty", async () => {
    const { PATCH } = await import("@/app/api/board/reorder/route");
    const request = new Request("http://localhost:3001/api/board/reorder", {
      method: "PATCH",
      body: JSON.stringify({ items: [] }),
      headers: { "Content-Type": "application/json" },
    });
    const resp = await PATCH(request);

    expect(resp.status).toBe(400);
  });

  it("returns 400 when items have invalid column", async () => {
    const { PATCH } = await import("@/app/api/board/reorder/route");
    const request = new Request("http://localhost:3001/api/board/reorder", {
      method: "PATCH",
      body: JSON.stringify({
        items: [{ id: "b1", board_column: "invalid_column", position: 0 }],
      }),
      headers: { "Content-Type": "application/json" },
    });
    const resp = await PATCH(request);

    expect(resp.status).toBe(400);
    const json = await resp.json();
    expect(json.error).toContain("Invalid board column");
  });

  it("returns 400 when items missing required fields", async () => {
    const { PATCH } = await import("@/app/api/board/reorder/route");
    const request = new Request("http://localhost:3001/api/board/reorder", {
      method: "PATCH",
      body: JSON.stringify({
        items: [{ id: "b1" }],
      }),
      headers: { "Content-Type": "application/json" },
    });
    const resp = await PATCH(request);

    expect(resp.status).toBe(400);
  });

  it("returns 500 when database update fails", async () => {
    mockError = { message: "Update failed" };

    const { PATCH } = await import("@/app/api/board/reorder/route");
    const request = new Request("http://localhost:3001/api/board/reorder", {
      method: "PATCH",
      body: JSON.stringify({
        items: [
          { id: "b1", board_column: "review", position: 0 },
        ],
      }),
      headers: { "Content-Type": "application/json" },
    });
    const resp = await PATCH(request);
    const json = await resp.json();

    expect(resp.status).toBe(500);
    expect(json.error).toContain("failed");
  });
});
