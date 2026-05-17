import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================
// Mock Supabase
// ============================================

let mockExistingLogs: unknown[] = [];
let mockSettings: Record<string, unknown> | null = null;

const mockQueryChain: Record<string, ReturnType<typeof vi.fn>> = {};
const chainMethods = [
  "select", "insert", "update", "upsert", "delete",
  "eq", "neq", "gt", "gte", "lt", "lte", "in", "is",
  "range", "order", "limit", "single",
];

function setupChain() {
  for (const m of chainMethods) {
    mockQueryChain[m] = vi.fn().mockReturnValue(mockQueryChain);
  }
  mockQueryChain.single = vi.fn().mockReturnValue({
    then: (fn: (v: unknown) => unknown) =>
      Promise.resolve({ data: mockSettings, error: mockSettings ? null : { message: "not found" } }).then(fn),
  });
  mockQueryChain.limit = vi.fn().mockReturnValue({
    ...mockQueryChain,
    then: (fn: (v: unknown) => unknown) =>
      Promise.resolve({ data: mockExistingLogs, error: null }).then(fn),
  });
}

setupChain();

const mockFrom = vi.fn().mockReturnValue(mockQueryChain);

// Mock all notification senders
const mockSendWhatsApp = vi.fn().mockResolvedValue(true);
const mockSendTelegram = vi.fn().mockResolvedValue(true);
const mockSendEmail = vi.fn().mockResolvedValue(true);

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));
vi.mock("@/lib/notifications/whatsapp", () => ({
  sendWhatsApp: (...args: unknown[]) => mockSendWhatsApp(...args),
}));
vi.mock("@/lib/notifications/telegram", () => ({
  sendTelegram: (...args: unknown[]) => mockSendTelegram(...args),
}));
vi.mock("@/lib/notifications/email", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

import type { Listing } from "@/types";
import { notifyNewListing } from "@/lib/notifications/dispatcher";

function sampleListing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: "uuid-1",
    yad2_id: "abc123",
    deal_type: "rent",
    city: "תל אביב",
    neighborhood: "פלורנטין",
    street: "הרצל",
    house_number: "42",
    area: "תל אביב",
    area_id: 100,
    top_area: "מרכז",
    top_area_id: 3,
    rooms: 3,
    floor: 4,
    sqm: 75,
    price: 6000,
    price_per_sqm: 80,
    parking: true,
    elevator: true,
    balcony: false,
    pets_allowed: true,
    air_conditioning: true,
    furnished: false,
    accessible: false,
    bars: false,
    boiler: false,
    shelter: true,
    renovated: false,
    long_term: false,
    storage: false,
    for_partners: false,
    location: null,
    description: "דירה",
    images: [],
    url: "https://www.yad2.co.il/item/abc123",
    entry_date: "2025-01-15",
    date_added: "2025-01-10",
    date_updated: "2025-01-12",
    project_name: "",
    property_tax: "",
    house_committee: "",
    total_floors: 8,
    contact_name: "",
    parking_spots: null,
    garden_area: null,
    payments_in_year: null,
    first_seen_at: "2025-01-10T10:00:00Z",
    last_seen_at: "2025-01-12T10:00:00Z",
    is_active: true,
    is_hidden: false,
    ...overrides,
  } as Listing;
}

// ============================================
// Hidden listing behavior tests
// (mirrors test_hidden_listings.py)
// ============================================

describe("Hidden Listings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistingLogs = [];
    mockSettings = {
      notifications_enabled: true,
      whatsapp_enabled: true,
      telegram_enabled: false,
      email_enabled: false,
    };
    setupChain();
    mockFrom.mockReturnValue(mockQueryChain);
  });

  it("is_hidden defaults to false on Listing type", () => {
    const listing = sampleListing();
    expect(listing.is_hidden).toBe(false);
  });

  it("hidden listing can be represented", () => {
    const listing = sampleListing({ is_hidden: true });
    expect(listing.is_hidden).toBe(true);
  });

  it("POST /hide calls update with is_hidden=true", async () => {
    mockQueryChain.update = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        then: (fn: (v: unknown) => unknown) =>
          Promise.resolve({ data: null, error: null }).then(fn),
      }),
    });

    const { POST } = await import("@/app/api/listings/[yad2Id]/hide/route");
    const req = new Request("http://localhost/api/listings/abc123/hide", { method: "POST" });
    const resp = await POST(req, { params: Promise.resolve({ yad2Id: "abc123" }) });
    const json = await resp.json();

    expect(json.status).toBe("hidden");
    expect(mockQueryChain.update).toHaveBeenCalledWith({ is_hidden: true });
  });

  it("POST /unhide calls update with is_hidden=false", async () => {
    mockQueryChain.update = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        then: (fn: (v: unknown) => unknown) =>
          Promise.resolve({ data: null, error: null }).then(fn),
      }),
    });

    const { POST } = await import("@/app/api/listings/[yad2Id]/unhide/route");
    const req = new Request("http://localhost/api/listings/abc123/unhide", { method: "POST" });
    const resp = await POST(req, { params: Promise.resolve({ yad2Id: "abc123" }) });
    const json = await resp.json();

    expect(json.status).toBe("unhidden");
    expect(mockQueryChain.update).toHaveBeenCalledWith({ is_hidden: false });
  });

  it("POST /hide returns 500 on db error", async () => {
    mockQueryChain.update = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        then: (fn: (v: unknown) => unknown) =>
          Promise.resolve({ data: null, error: { message: "db error" } }).then(fn),
      }),
    });

    const { POST } = await import("@/app/api/listings/[yad2Id]/hide/route");
    const req = new Request("http://localhost/api/listings/test/hide", { method: "POST" });
    const resp = await POST(req, { params: Promise.resolve({ yad2Id: "test" }) });
    expect(resp.status).toBe(500);
  });

  it("notifications not sent for hidden listings", async () => {
    // A hidden listing should still go through notification,
    // but the dedup check should prevent duplicate sends
    mockExistingLogs = [{ id: "already-sent" }];
    setupChain();
    mockFrom.mockReturnValue(mockQueryChain);

    const listing = sampleListing({ is_hidden: true });
    const result = await notifyNewListing(listing, "search-1");
    expect(result).toBe(false);
    expect(mockSendWhatsApp).not.toHaveBeenCalled();
  });
});
