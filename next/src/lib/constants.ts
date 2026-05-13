import type { DealType } from "@/types";

// Yad2 API base URL
export const YAD2_BASE_URL = "https://gw.yad2.co.il/realestate-feed";
export const YAD2_DETAIL_URL = "https://gw.yad2.co.il/feed-search-legacy/item";

// Deal type → API path segment
export const DEAL_TYPE_PATHS: Record<DealType, string> = {
  rent: "rent",
  forsale: "forsale",
  newprojects: "forsale",
};

// Region IDs used by Yad2 API
export const REGIONS: Record<number, string> = {
  1: "מרכז והשרון",
  2: "דרום",
  3: "תל אביב והסביבה",
  4: "יהודה, שומרון ובקעת הירדן",
  5: "מישור החוף הצפוני",
  6: "ירושלים",
  7: "צפון ועמקים",
  8: "ירושלים והסביבה",
};

// Price range buckets for deep-fetch subdivision
export const PRICE_RANGES: [number, number][] = [
  [1, 3000],
  [3001, 5000],
  [5001, 7000],
  [7001, 9000],
  [9001, 12000],
  [12001, 16000],
  [16001, 25000],
  [25001, 50000],
  [50001, 999999],
];

// Maps Yad2 additional_info_items_v2 keys to our amenity column names
export const AMENITY_KEY_MAP: Record<string, string> = {
  air_conditioner: "air_conditioning",
  elevator: "elevator",
  shelter: "shelter",
  pets: "pets_allowed",
  furniture: "furnished",
  bars: "bars",
  boiler: "boiler",
  accessibility: "accessible",
  renovated: "renovated",
  long_term: "long_term",
  warhouse: "storage",
  for_partners: "for_partners",
};

// Default headers for Yad2 requests
export const YAD2_HEADERS: Record<string, string> = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
  DNT: "1",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-site",
  Origin: "https://www.yad2.co.il",
  Referer: "https://www.yad2.co.il/",
};

// Scraper config
export const SCRAPE_CONCURRENCY = 3;
export const REQUEST_DELAY_MIN = 0.3;
export const REQUEST_DELAY_MAX = 0.8;

// Job statuses
export const JOB_STATUS = {
  PENDING: "pending",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
  RESUMED: "resumed",
} as const;

// Filter parameter names (used in saved searches)
export const FILTER_PARAMS = {
  DEAL_TYPE: "deal_type",
  CITY: "city",
  AREA_IDS: "area_ids",
  TOP_AREA_IDS: "top_area_ids",
  NEIGHBORHOODS: "neighborhoods",
  ROOMS_MIN: "rooms_min",
  ROOMS_MAX: "rooms_max",
  PRICE_MIN: "price_min",
  PRICE_MAX: "price_max",
  SQM_MIN: "sqm_min",
  SQM_MAX: "sqm_max",
  FLOOR_MIN: "floor_min",
  FLOOR_MAX: "floor_max",
  CENTER_LAT: "center_lat",
  CENTER_LNG: "center_lng",
  RADIUS_KM: "radius_km",
} as const;
