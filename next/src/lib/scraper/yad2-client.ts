import type { DealType, ListingInsert } from "@/types";
import {
  AMENITY_KEY_MAP,
  DEAL_TYPE_PATHS,
  PRICE_RANGES,
  REGIONS,
  REQUEST_DELAY_MAX,
  REQUEST_DELAY_MIN,
  SCRAPE_CONCURRENCY,
  YAD2_BASE_URL,
  YAD2_DETAIL_URL,
  YAD2_HEADERS,
} from "@/lib/constants";

// Simple user agents for rotation
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:128.0) Gecko/20100101 Firefox/128.0",
];

function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getHeaders(): Record<string, string> {
  return { ...YAD2_HEADERS, "User-Agent": randomUserAgent() };
}

async function delay(): Promise<void> {
  const ms =
    (REQUEST_DELAY_MIN + Math.random() * (REQUEST_DELAY_MAX - REQUEST_DELAY_MIN)) * 1000;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// Simple concurrency limiter
let activeRequests = 0;
async function withConcurrency<T>(fn: () => Promise<T>): Promise<T> {
  while (activeRequests >= SCRAPE_CONCURRENCY) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  activeRequests++;
  try {
    return await fn();
  } finally {
    activeRequests--;
  }
}

// ============================================
// FETCH REGION (map markers)
// ============================================

export interface Marker {
  token?: string;
  price?: number;
  address?: {
    city?: { text?: string };
    neighborhood?: { text?: string };
    street?: { text?: string };
    house?: { number?: number; floor?: number };
    coords?: { lat?: number; lon?: number };
    area?: { text?: string };
    region?: { text?: string; id?: number };
  };
  additionalDetails?: {
    roomsCount?: number | string;
    squareMeter?: number | string;
  };
  metaData?: {
    images?: string[];
    coverImage?: string;
  };
}

interface FeedResponse {
  data?: {
    markers?: Marker[];
    clusters?: Cluster[];
  };
}

interface Cluster {
  areaId?: number;
  cityId?: number;
  hoodId?: number;
  docCount?: number;
}

export async function fetchRegion(
  regionId: number,
  dealType: DealType = "rent",
  params?: Record<string, string | number>
): Promise<Marker[]> {
  const path = DEAL_TYPE_PATHS[dealType];
  const url = new URL(`${YAD2_BASE_URL}/${path}/map`);
  url.searchParams.set("region", String(regionId));
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
  }

  try {
    const resp = await fetch(url.toString(), { headers: getHeaders() });
    if (!resp.ok) return [];
    const data: FeedResponse = await resp.json();
    return data.data?.markers ?? [];
  } catch {
    return [];
  }
}

// ============================================
// PARSE MARKER → ListingInsert
// ============================================

function parseFloat_(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return isNaN(n) ? null : n;
}

function parseInt_(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return isNaN(n) ? null : Math.floor(n);
}

export function parseMarker(marker: Marker, dealType: DealType = "rent"): ListingInsert | null {
  const token = marker.token;
  if (!token) return null;

  const addr = marker.address ?? {};
  const house = addr.house ?? {};
  const coords = addr.coords ?? {};
  const details = (marker as Record<string, unknown>).additionalDetails as Record<string, unknown> | undefined ?? {};
  const meta = (marker as Record<string, unknown>).metaData as Record<string, unknown> | undefined ?? {};

  const rooms = parseFloat_(details.roomsCount);
  const floor = parseInt_(house.floor);
  const sqm = parseFloat_(details.squareMeter);
  const price = parseInt_(marker.price);
  const pricePerSqm = price && sqm && sqm > 0 ? Math.round((price / sqm) * 10) / 10 : null;

  // Geospatial — PostGIS expects WKT or GeoJSON via Supabase
  const lat = coords.lat ? Number(coords.lat) : null;
  const lng = coords.lon ? Number(coords.lon) : null;
  const location =
    lat && lng ? `SRID=4326;POINT(${lng} ${lat})` : null;

  // Images
  let images: string[] = (meta.images as string[]) ?? [];
  if (images.length === 0 && meta.coverImage) {
    images = [meta.coverImage as string];
  }

  return {
    yad2_id: token,
    deal_type: dealType,
    city: addr.city?.text ?? "",
    neighborhood: addr.neighborhood?.text ?? "",
    street: addr.street?.text ?? "",
    house_number: house.number != null ? String(house.number) : "",
    area: addr.area?.text ?? "",
    area_id: 0,
    top_area: addr.region?.text ?? "",
    top_area_id: addr.region?.id ?? 0,
    rooms,
    floor,
    sqm,
    price,
    price_per_sqm: pricePerSqm,
    location,
    description: "",
    images,
    url: `https://www.yad2.co.il/item/${token}`,
    entry_date: "",
  };
}

// ============================================
// DEEP FETCH (hierarchical drill-down)
// ============================================

async function fetchWithParams(
  dealType: DealType,
  queryParams: Record<string, string | number>
): Promise<{ markers: Marker[]; clusters: Cluster[] }> {
  return withConcurrency(async () => {
    await delay();
    const path = DEAL_TYPE_PATHS[dealType];
    const url = new URL(`${YAD2_BASE_URL}/${path}/map`);
    for (const [k, v] of Object.entries(queryParams)) {
      url.searchParams.set(k, String(v));
    }

    try {
      const resp = await fetch(url.toString(), { headers: getHeaders() });
      if (!resp.ok) return { markers: [], clusters: [] };
      const data: FeedResponse = await resp.json();
      return {
        markers: data.data?.markers ?? [],
        clusters: data.data?.clusters ?? [],
      };
    } catch {
      return { markers: [], clusters: [] };
    }
  });
}

export type OnChunkCallback = (markers: Marker[]) => Promise<void>;

export async function deepFetchRegion(
  regionId: number,
  dealType: DealType,
  apiParams: Record<string, string | number>,
  onChunk?: OnChunkCallback,
  chunkSize: number = 200
): Promise<Marker[]> {
  const allMarkers: Marker[] = [];
  const seenTokens = new Set<string>();
  let pending: Marker[] = [];

  async function flush() {
    if (pending.length > 0 && onChunk) {
      await onChunk([...pending]);
    }
    pending = [];
  }

  function collect(markers: Marker[]) {
    for (const m of markers) {
      const token = m.token ?? "";
      if (token && !seenTokens.has(token)) {
        seenTokens.add(token);
        allMarkers.push(m);
        pending.push(m);
      }
    }
  }

  async function collectFlush(markers: Marker[]) {
    collect(markers);
    if (pending.length >= chunkSize) {
      await flush();
    }
  }

  async function drillHood(
    params: Record<string, string | number>,
    cityId: string | number,
    hoodCluster: Cluster
  ) {
    const hoodId = hoodCluster.hoodId;
    const hoodDocs = hoodCluster.docCount ?? 0;
    if (!hoodId) return;

    if (hoodDocs <= 200) {
      const { markers } = await fetchWithParams(dealType, {
        ...params,
        city: cityId,
        neighborhood: hoodId,
      });
      await collectFlush(markers);
      return;
    }

    // Split by price ranges
    await Promise.all(
      PRICE_RANGES.map(async ([minPrice, maxPrice]) => {
        const { markers } = await fetchWithParams(dealType, {
          ...params,
          city: cityId,
          neighborhood: hoodId,
          minPrice,
          maxPrice,
        });
        await collectFlush(markers);
      })
    );
  }

  async function drillCity(
    params: Record<string, string | number>,
    cityCluster: Cluster
  ) {
    const cityId = cityCluster.cityId;
    const cityDocs = cityCluster.docCount ?? 0;
    if (!cityId) return;

    if (cityDocs <= 200) {
      const { markers } = await fetchWithParams(dealType, { ...params, city: cityId });
      await collectFlush(markers);
      return;
    }

    // Drill into neighborhoods
    const { clusters: hoodClusters } = await fetchWithParams(dealType, {
      ...params,
      city: cityId,
    });

    if (!hoodClusters.length) {
      const { markers } = await fetchWithParams(dealType, { ...params, city: cityId });
      await collectFlush(markers);
      return;
    }

    await Promise.all(
      hoodClusters.map((hc) => drillHood(params, cityId, hc))
    );
  }

  async function drillArea(
    params: Record<string, string | number>,
    areaCluster: Cluster
  ) {
    const areaId = areaCluster.areaId;
    const docCount = areaCluster.docCount ?? 0;
    if (!areaId) return;

    if (docCount <= 200) {
      const { markers } = await fetchWithParams(dealType, { ...params, area: areaId });
      await collectFlush(markers);
      return;
    }

    // Drill into cities
    const { clusters: cityClusters } = await fetchWithParams(dealType, {
      ...params,
      area: areaId,
    });

    if (!cityClusters.length) {
      const { markers } = await fetchWithParams(dealType, { ...params, area: areaId });
      await collectFlush(markers);
      return;
    }

    await Promise.all(
      cityClusters.map((cc) => drillCity(params, cc))
    );
  }

  // Start: fetch region top-level
  const params = { region: regionId, ...apiParams };
  const { markers, clusters } = await fetchWithParams(dealType, params);

  if (!clusters.length) {
    collect(markers);
    await flush();
    return allMarkers;
  }

  // Collect top-level markers
  collect(markers);

  // Drill into area clusters
  await Promise.all(clusters.map((ac) => drillArea(params, ac)));

  // Flush remaining
  await flush();

  console.log(
    `Region ${regionId} (${REGIONS[regionId] ?? "?"}): collected ${allMarkers.length} unique markers`
  );
  return allMarkers;
}

// ============================================
// ITEM DETAIL (for amenity enrichment)
// ============================================

export interface ItemDetail {
  amenities: Record<string, boolean>;
  description: string;
  images: string[];
  entryDate: string;
  dateAdded: string;
  dateUpdated: string;
  propertyTax: string;
  houseCommittee: string;
  totalFloors: number | null;
  contactName: string;
  parkingSpots: number | null;
  gardenArea: number | null;
  paymentsInYear: number | null;
}

export async function fetchItemDetail(
  token: string,
  retries: number = 3
): Promise<ItemDetail | null> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const url = new URL(YAD2_DETAIL_URL);
      url.searchParams.set("token", token);
      const resp = await fetch(url.toString(), { headers: getHeaders() });

      if (resp.ok) {
        const json = await resp.json();
        const data = json.data ?? {};

        // Parse amenities
        const amenities: Record<string, boolean> = {};
        for (const item of data.additional_info_items_v2 ?? []) {
          const key = item.key ?? "";
          const ourKey = AMENITY_KEY_MAP[key];
          if (ourKey) {
            amenities[ourKey] = Boolean(item.value);
          }
        }

        // Parking
        const parkingVal = data.parking;
        let parkingSpots: number | null = null;
        if (parkingVal != null) {
          const parkingNum = parseInt_(parkingVal);
          amenities.parking = (parkingNum ?? 0) > 0;
          parkingSpots = parkingNum;
        }

        // Balcony
        const balconiesVal = data.balconies;
        if (balconiesVal != null) {
          amenities.balcony = Number(balconiesVal) > 0;
        }

        // Entry date
        let entryDate = "";
        for (const barItem of data.info_bar_items ?? []) {
          if (barItem.key === "entrance") {
            entryDate = barItem.titleWithoutLabel ?? "";
            break;
          }
        }

        return {
          amenities,
          description: data.info_text ?? "",
          images: data.images_urls ?? [],
          entryDate,
          dateAdded: data.date_added ?? "",
          dateUpdated: data.date_raw ?? "",
          propertyTax: String(data.property_tax ?? ""),
          houseCommittee: String(data.HouseCommittee ?? ""),
          totalFloors: parseInt_(data.TotalFloor_text),
          contactName: data.contact_name ?? "",
          parkingSpots,
          gardenArea: parseInt_(data.garden_area),
          paymentsInYear: parseInt_(data.payments_in_year),
        };
      }

      // Rate limited — backoff
      if (resp.status === 429 || resp.status === 403) {
        const backoff = 30000 * Math.pow(2, attempt);
        console.warn(`Rate limited (${resp.status}) on ${token}, backing off ${backoff / 1000}s`);
        await new Promise((resolve) => setTimeout(resolve, backoff));
        continue;
      }

      // Other error
      return null;
    } catch {
      return null;
    }
  }
  return null;
}

// ============================================
// BUILD API PARAMS (from search filters)
// ============================================

export function buildApiParams(filters: Record<string, unknown>): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.rooms_min) params.minRooms = String(filters.rooms_min);
  if (filters.rooms_max) params.maxRooms = String(filters.rooms_max);
  if (filters.price_min) params.minPrice = String(filters.price_min);
  if (filters.price_max) params.maxPrice = String(filters.price_max);
  return params;
}
