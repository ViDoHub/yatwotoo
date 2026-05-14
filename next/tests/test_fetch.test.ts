import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================
// Mock fetch for Yad2 API calls
// ============================================

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { fetchRegion, fetchItemDetail } from "@/lib/scraper/yad2-client";

// ============================================
// fetchRegion
// ============================================

describe("fetchRegion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns markers on successful fetch", async () => {
    const markers = [{ token: "abc", price: 5000 }];
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { markers } }),
    });

    const result = await fetchRegion(3, "rent");
    expect(result).toEqual(markers);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("region=3");
    expect(url).toContain("/rent/");
  });

  it("returns empty array on non-200 response", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 403 });

    const result = await fetchRegion(3, "rent");
    expect(result).toEqual([]);
  });

  it("returns empty array on network error", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    const result = await fetchRegion(3, "rent");
    expect(result).toEqual([]);
  });

  it("includes additional params in URL", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { markers: [] } }),
    });

    await fetchRegion(3, "rent", { minPrice: "3000", maxRooms: "4" });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("minPrice=3000");
    expect(url).toContain("maxRooms=4");
  });

  it("uses forsale path for forsale deal type", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { markers: [] } }),
    });

    await fetchRegion(3, "forsale");
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/forsale/");
  });
});

// ============================================
// fetchItemDetail
// ============================================

describe("fetchItemDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses full detail response", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            additional_info_items_v2: [
              { key: "air_conditioner", value: true },
              { key: "elevator", value: true },
              { key: "shelter", value: false },
            ],
            parking: "2",
            balconies: 1,
            info_text: "דירה מרווחת ומוארת",
            images_urls: ["https://img.yad2.co.il/detail1.jpg"],
            info_bar_items: [
              { key: "entrance", titleWithoutLabel: "01/03/2025" },
            ],
            date_added: "2025-01-10",
            date_raw: "2025-01-12",
            property_tax: 150,
            HouseCommittee: 200,
            TotalFloor_text: "8",
            contact_name: "ישראל",
            garden_area: null,
            payments_in_year: 12,
          },
        }),
    });

    const result = await fetchItemDetail("abc123");
    expect(result).not.toBeNull();
    expect(result!.amenities.air_conditioning).toBe(true);
    expect(result!.amenities.elevator).toBe(true);
    expect(result!.amenities.shelter).toBe(false);
    expect(result!.amenities.parking).toBe(true);
    expect(result!.amenities.balcony).toBe(true);
    expect(result!.parkingSpots).toBe(2);
    expect(result!.description).toBe("דירה מרווחת ומוארת");
    expect(result!.images).toEqual(["https://img.yad2.co.il/detail1.jpg"]);
    expect(result!.entryDate).toBe("01/03/2025");
    expect(result!.totalFloors).toBe(8);
    expect(result!.contactName).toBe("ישראל");
    expect(result!.paymentsInYear).toBe(12);
  });

  it("returns null on non-retryable error (500)", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const result = await fetchItemDetail("abc123", 1);
    expect(result).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries on rate limit (429) with backoff", async () => {
    // First call: 429, second call: success
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              additional_info_items_v2: [],
              info_text: "test",
              images_urls: [],
              info_bar_items: [],
            },
          }),
      });

    const result = await fetchItemDetail("abc123", 2);
    expect(result).not.toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  }, 120000);

  it("returns null when all retries exhausted", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 429 });

    const result = await fetchItemDetail("abc123", 1);
    expect(result).toBeNull();
  }, 120000);

  it("returns null on network error", async () => {
    mockFetch.mockRejectedValue(new Error("Connection refused"));

    const result = await fetchItemDetail("abc123", 1);
    expect(result).toBeNull();
  });

  it("handles parking=0 as false", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            additional_info_items_v2: [],
            parking: "0",
            info_text: "",
            images_urls: [],
            info_bar_items: [],
          },
        }),
    });

    const result = await fetchItemDetail("abc123");
    expect(result!.amenities.parking).toBe(false);
    expect(result!.parkingSpots).toBe(0);
  });

  it("handles non-digit parking as false", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            additional_info_items_v2: [],
            parking: "none",
            info_text: "",
            images_urls: [],
            info_bar_items: [],
          },
        }),
    });

    const result = await fetchItemDetail("abc123");
    expect(result!.amenities.parking).toBe(false);
    expect(result!.parkingSpots).toBeNull();
  });
});
