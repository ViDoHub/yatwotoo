import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================
// Mock Supabase and notification senders
// ============================================

const mockSendWhatsApp = vi.fn().mockResolvedValue(true);
const mockSendTelegram = vi.fn().mockResolvedValue(true);
const mockSendEmail = vi.fn().mockResolvedValue(true);

vi.mock("@/lib/notifications/whatsapp", () => ({
  sendWhatsApp: (...args: unknown[]) => mockSendWhatsApp(...args),
}));
vi.mock("@/lib/notifications/telegram", () => ({
  sendTelegram: (...args: unknown[]) => mockSendTelegram(...args),
}));
vi.mock("@/lib/notifications/email", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

let mockSettings: Record<string, unknown> | null = {
  notifications_enabled: true,
  whatsapp_enabled: true,
  telegram_enabled: false,
  email_enabled: false,
};

let mockExistingLogs: unknown[] = [];
const insertedLogs: unknown[] = [];

const mockQueryChain: Record<string, ReturnType<typeof vi.fn>> = {};
const chainMethods = [
  "select", "insert", "update", "upsert", "delete",
  "eq", "neq", "gt", "gte", "lt", "lte", "in", "is",
  "range", "order", "limit", "single", "maybeSingle",
];

function setupChain() {
  for (const m of chainMethods) {
    mockQueryChain[m] = vi.fn().mockReturnValue(mockQueryChain);
  }

  // `single()` resolves with settings or logs
  mockQueryChain.single = vi.fn().mockReturnValue({
    then: (fn: (v: unknown) => unknown) =>
      Promise.resolve({ data: mockSettings, error: null }).then(fn),
  });

  // `limit(1)` for notification_logs dedup check
  mockQueryChain.limit = vi.fn().mockReturnValue({
    ...mockQueryChain,
    then: (fn: (v: unknown) => unknown) =>
      Promise.resolve({ data: mockExistingLogs, error: null }).then(fn),
  });

  // insert for notification_logs
  mockQueryChain.insert = vi.fn((data: unknown) => {
    insertedLogs.push(data);
    return {
      then: (fn: (v: unknown) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(fn),
    };
  });
}

setupChain();

const mockFrom = vi.fn().mockReturnValue(mockQueryChain);

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

import { notifyNewListing, notifyPriceDrop } from "@/lib/notifications/dispatcher";
import type { Listing } from "@/types";

// ============================================
// Sample listing
// ============================================

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
    description: "דירה יפה",
    images: ["https://img.yad2.co.il/1.jpg"],
    url: "https://www.yad2.co.il/item/abc123",
    entry_date: "2025-01-15",
    date_added: "2025-01-10",
    date_updated: "2025-01-12",
    project_name: "",
    property_tax: "",
    house_committee: "",
    total_floors: 8,
    contact_name: "ישראל",
    parking_spots: 1,
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
// notifyNewListing
// ============================================

describe("notifyNewListing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistingLogs = [];
    insertedLogs.length = 0;
    mockSettings = {
      notifications_enabled: true,
      whatsapp_enabled: true,
      telegram_enabled: false,
      email_enabled: false,
    };
    setupChain();
    mockFrom.mockReturnValue(mockQueryChain);
  });

  it("sends notification and logs it", async () => {
    const listing = sampleListing();
    const result = await notifyNewListing(listing, "search-1");
    expect(result).toBe(true);
    expect(mockSendWhatsApp).toHaveBeenCalledTimes(1);
    // Message should contain address
    const msg = mockSendWhatsApp.mock.calls[0][0] as string;
    expect(msg).toContain("הרצל");
    expect(msg).toContain("תל אביב");
    // Should log notification
    expect(insertedLogs.length).toBeGreaterThan(0);
  });

  it("dedup prevents double send", async () => {
    mockExistingLogs = [{ id: "existing-log" }];
    setupChain();
    mockFrom.mockReturnValue(mockQueryChain);

    const result = await notifyNewListing(sampleListing(), "search-1");
    expect(result).toBe(false);
    expect(mockSendWhatsApp).not.toHaveBeenCalled();
  });

  it("failed send returns false, no log", async () => {
    mockSendWhatsApp.mockResolvedValueOnce(false);

    const result = await notifyNewListing(sampleListing(), "search-1");
    expect(result).toBe(false);
    expect(insertedLogs).toHaveLength(0);
  });

  it("formats message with minimal listing data", async () => {
    const listing = sampleListing({
      street: "",
      neighborhood: "",
      rooms: null,
      sqm: null,
      price: null,
    });
    const result = await notifyNewListing(listing, "search-1");
    expect(result).toBe(true);
    const msg = mockSendWhatsApp.mock.calls[0][0] as string;
    expect(msg).toContain("תל אביב");
  });

  it("disabled notifications returns false", async () => {
    mockSettings = {
      notifications_enabled: false,
      whatsapp_enabled: true,
      telegram_enabled: false,
      email_enabled: false,
    };
    setupChain();
    mockFrom.mockReturnValue(mockQueryChain);

    const result = await notifyNewListing(sampleListing(), "search-1");
    expect(result).toBe(false);
  });
});

// ============================================
// notifyPriceDrop
// ============================================

describe("notifyPriceDrop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistingLogs = [];
    insertedLogs.length = 0;
    mockSettings = {
      notifications_enabled: true,
      whatsapp_enabled: true,
      telegram_enabled: false,
      email_enabled: false,
    };
    setupChain();
    mockFrom.mockReturnValue(mockQueryChain);
  });

  it("sends price drop notification", async () => {
    const listing = sampleListing({ price: 5500 });
    const result = await notifyPriceDrop(listing, 6000, "search-1");
    expect(result).toBe(true);
    const msg = mockSendWhatsApp.mock.calls[0][0] as string;
    expect(msg).toContain("6,000");
    expect(msg).toContain("5,500");
    expect(msg).toContain("500");
  });

  it("dedup prevents duplicate price drop notification", async () => {
    mockExistingLogs = [{ id: "existing-log" }];
    setupChain();
    mockFrom.mockReturnValue(mockQueryChain);

    const result = await notifyPriceDrop(sampleListing(), 7000, "search-1");
    expect(result).toBe(false);
    expect(mockSendWhatsApp).not.toHaveBeenCalled();
  });
});
