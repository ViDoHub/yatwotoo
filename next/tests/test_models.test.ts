import { describe, it, expect } from "vitest";
import type { DealType, AmenityKey } from "@/types";
import { AMENITY_KEYS } from "@/types";
import {
  REGIONS,
  DEAL_TYPE_PATHS,
  AMENITY_KEY_MAP,
  YAD2_BASE_URL,
  YAD2_DETAIL_URL,
  JOB_STATUS,
  FILTER_PARAMS,
  PRICE_RANGES,
} from "@/lib/constants";

// ============================================
// Types & Constants (mirrors test_models.py)
// ============================================

describe("DealType", () => {
  it("covers rent, forsale, newprojects", () => {
    const types: DealType[] = ["rent", "forsale", "newprojects"];
    expect(types).toHaveLength(3);
  });

  it("DEAL_TYPE_PATHS maps all deal types", () => {
    expect(DEAL_TYPE_PATHS.rent).toBe("rent");
    expect(DEAL_TYPE_PATHS.forsale).toBe("forsale");
    expect(DEAL_TYPE_PATHS.newprojects).toBe("forsale");
  });
});

describe("AMENITY_KEYS", () => {
  it("contains expected amenity keys", () => {
    const expected: AmenityKey[] = [
      "parking", "elevator", "balcony", "pets_allowed", "air_conditioning",
      "furnished", "shelter", "renovated", "long_term", "storage", "for_partners",
    ];
    expect([...AMENITY_KEYS]).toEqual(expected);
  });
});

describe("AMENITY_KEY_MAP", () => {
  it("maps yad2 keys to our keys", () => {
    expect(AMENITY_KEY_MAP.air_conditioner).toBe("air_conditioning");
    expect(AMENITY_KEY_MAP.pets).toBe("pets_allowed");
    expect(AMENITY_KEY_MAP.furniture).toBe("furnished");
    expect(AMENITY_KEY_MAP.accessibility).toBe("accessible");
    expect(AMENITY_KEY_MAP.warhouse).toBe("storage");
  });
});

describe("REGIONS", () => {
  it("has expected region entries", () => {
    expect(Object.keys(REGIONS).length).toBeGreaterThanOrEqual(8);
    expect(REGIONS[3]).toBe("תל אביב והסביבה");
    expect(REGIONS[6]).toBe("ירושלים");
  });
});

describe("JOB_STATUS", () => {
  it("contains all statuses", () => {
    expect(JOB_STATUS.PENDING).toBe("pending");
    expect(JOB_STATUS.RUNNING).toBe("running");
    expect(JOB_STATUS.COMPLETED).toBe("completed");
    expect(JOB_STATUS.FAILED).toBe("failed");
    expect(JOB_STATUS.CANCELLED).toBe("cancelled");
    expect(JOB_STATUS.RESUMED).toBe("resumed");
  });
});

describe("FILTER_PARAMS", () => {
  it("contains expected filter keys", () => {
    expect(FILTER_PARAMS.DEAL_TYPE).toBe("deal_type");
    expect(FILTER_PARAMS.ROOMS_MIN).toBe("rooms_min");
    expect(FILTER_PARAMS.PRICE_MAX).toBe("price_max");
    expect(FILTER_PARAMS.CENTER_LAT).toBe("center_lat");
  });
});

describe("PRICE_RANGES", () => {
  it("contains non-overlapping ascending ranges", () => {
    for (let i = 0; i < PRICE_RANGES.length; i++) {
      const [min, max] = PRICE_RANGES[i];
      expect(min).toBeLessThan(max);
      if (i > 0) {
        expect(min).toBeGreaterThan(PRICE_RANGES[i - 1][1]);
      }
    }
  });
});

describe("URLs", () => {
  it("base URL points to yad2 realestate feed", () => {
    expect(YAD2_BASE_URL).toContain("yad2.co.il");
    expect(YAD2_BASE_URL).toContain("realestate-feed");
  });

  it("detail URL points to yad2 item endpoint", () => {
    expect(YAD2_DETAIL_URL).toContain("yad2.co.il");
    expect(YAD2_DETAIL_URL).toContain("item");
  });
});
