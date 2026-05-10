import asyncio
import logging
import random
from typing import Optional

import httpx
from fake_useragent import UserAgent

from app.config import settings
from app.models import Address, Amenities, DealType, GeoLocation, Listing

logger = logging.getLogger(__name__)

ua = UserAgent()

# New Yad2 realestate-feed API (replaces the legacy feed-search endpoint)
BASE_URL = "https://gw.yad2.co.il/realestate-feed"

# Only rent and forsale are supported; newprojects endpoint is gone
DEAL_TYPE_PATHS = {
    DealType.RENT: "rent",
    DealType.FORSALE: "forsale",
    DealType.NEW_PROJECTS: "forsale",  # Fallback: new projects no longer has its own endpoint
}

# Region IDs used by the new API (mapped from the old topArea concept)
REGIONS = {
    1: "מרכז והשרון",
    2: "דרום",
    3: "תל אביב והסביבה",
    4: "יהודה, שומרון ובקעת הירדן",
    5: "מישור החוף הצפוני",
    6: "ירושלים",
    7: "צפון ועמקים",
    8: "ירושלים והסביבה",
}

# Headers that mimic a real browser request
DEFAULT_HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
    "DNT": "1",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
    "Origin": "https://www.yad2.co.il",
    "Referer": "https://www.yad2.co.il/",
}


def _get_headers() -> dict:
    headers = DEFAULT_HEADERS.copy()
    headers["User-Agent"] = ua.random
    return headers


# Global semaphore to cap concurrent Yad2 requests across all tasks
_api_semaphore: asyncio.Semaphore | None = None


def _get_semaphore() -> asyncio.Semaphore:
    """Lazy-init semaphore (must be created inside a running event loop)."""
    global _api_semaphore
    if _api_semaphore is None:
        _api_semaphore = asyncio.Semaphore(settings.scrape_concurrency)
    return _api_semaphore


async def _delay():
    """Random delay between requests to avoid rate limiting."""
    delay = random.uniform(settings.request_delay_min, settings.request_delay_max)
    await asyncio.sleep(delay)


async def fetch_region(
    region_id: int,
    deal_type: DealType = DealType.RENT,
    params: Optional[dict] = None,
    client: Optional[httpx.AsyncClient] = None,
) -> list[dict]:
    """Fetch markers for a single region from the Yad2 map feed API.

    Returns list of raw marker dicts or empty list on failure.
    """
    path = DEAL_TYPE_PATHS[deal_type]
    url = f"{BASE_URL}/{path}/map"

    query_params = {"region": region_id}
    if params:
        query_params.update(params)

    should_close = client is None
    if client is None:
        client = httpx.AsyncClient(timeout=30.0)

    try:
        response = await client.get(url, params=query_params, headers=_get_headers())

        if response.status_code != 200:
            logger.warning(f"Yad2 returned status {response.status_code} for region {region_id}")
            return []

        data = response.json()
        markers = data.get("data", {}).get("markers", [])
        return markers

    except (httpx.HTTPError, ValueError) as e:
        logger.error(f"Error fetching region {region_id}: {e}")
        return []
    finally:
        if should_close:
            await client.aclose()


def parse_marker(marker: dict, deal_type: DealType = DealType.RENT) -> Optional[Listing]:
    """Parse a single map marker into a Listing model."""
    token = marker.get("token", "")
    if not token:
        return None

    addr = marker.get("address", {})
    house = addr.get("house", {})
    coords = addr.get("coords", {})
    details = marker.get("additionalDetails", {})
    meta = marker.get("metaData", {})

    # Build address
    address = Address(
        city=addr.get("city", {}).get("text", ""),
        neighborhood=addr.get("neighborhood", {}).get("text", ""),
        street=addr.get("street", {}).get("text", ""),
        house_number=str(house.get("number", "")) if house.get("number") is not None else "",
        area=addr.get("area", {}).get("text", ""),
        area_id=0,
        top_area=addr.get("region", {}).get("text", ""),
        top_area_id=addr.get("region", {}).get("id", 0) or 0,
    )

    # Rooms, floor, sqm
    rooms = _parse_float(details.get("roomsCount"))
    floor = house.get("floor")
    if floor is not None:
        floor = _parse_int(floor)
    sqm = _parse_float(details.get("squareMeter"))

    # Price
    price = _parse_int(marker.get("price"))

    # Price per sqm
    price_per_sqm = None
    if price and sqm and sqm > 0:
        price_per_sqm = round(price / sqm, 1)

    # Geo location
    location = None
    lat = coords.get("lat")
    lng = coords.get("lon")
    if lat and lng:
        try:
            location = GeoLocation(coordinates=[float(lng), float(lat)])
        except (ValueError, TypeError):
            pass

    # Images
    images = meta.get("images", [])
    if not images and meta.get("coverImage"):
        images = [meta["coverImage"]]

    # Amenities (not available in map feed, will be empty)
    amenities = Amenities()

    # URL
    url = f"https://www.yad2.co.il/item/{token}"

    return Listing(
        yad2_id=token,
        deal_type=deal_type,
        address=address,
        rooms=rooms,
        floor=floor,
        sqm=sqm,
        price=price,
        price_per_sqm=price_per_sqm,
        amenities=amenities,
        location=location,
        description="",
        images=images,
        url=url,
        entry_date="",
        project_name="",
    )


def _build_api_params(filters: dict) -> dict:
    """Convert search filters to Yad2 map feed API query params."""
    params = {}

    if rooms_min := filters.get("rooms_min"):
        params["minRooms"] = rooms_min
    if rooms_max := filters.get("rooms_max"):
        params["maxRooms"] = rooms_max
    if price_min := filters.get("price_min"):
        params["minPrice"] = price_min
    if price_max := filters.get("price_max"):
        params["maxPrice"] = price_max

    return params


def _parse_float(value) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


def _parse_int(value) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        try:
            return int(float(value))
        except (ValueError, TypeError):
            return None


async def _fetch_with_params(
    deal_type: DealType,
    query_params: dict,
    client: httpx.AsyncClient,
) -> tuple[list[dict], list[dict]]:
    """Fetch markers+clusters for given query params.

    Returns (markers, clusters). Rate-limited via global semaphore.
    """
    path = DEAL_TYPE_PATHS[deal_type]
    url = f"{BASE_URL}/{path}/map"

    async with _get_semaphore():
        await _delay()
        try:
            response = await client.get(url, params=query_params, headers=_get_headers())
            if response.status_code != 200:
                logger.warning(f"Yad2 returned {response.status_code} for params {query_params}")
                return [], []
            data = response.json()
            markers = data.get("data", {}).get("markers", [])
            clusters = data.get("data", {}).get("clusters", [])
            return markers, clusters
        except (httpx.HTTPError, ValueError) as e:
            logger.error(f"Error fetching {query_params}: {e}")
            return [], []


# Price range buckets used to subdivide large neighborhoods
_PRICE_RANGES = [
    (1, 3000),
    (3001, 5000),
    (5001, 7000),
    (7001, 9000),
    (9001, 12000),
    (12001, 16000),
    (16001, 25000),
    (25001, 50000),
    (50001, 999999),
]


async def _deep_fetch_region(
    region_id: int,
    deal_type: DealType,
    api_params: dict,
    client: httpx.AsyncClient,
    on_chunk=None,
    chunk_size: int = 200,
) -> list[dict]:
    """Hierarchically fetch all markers for a region by drilling into clusters.

    Strategy: region -> area -> city -> neighborhood -> price-range subdivision.
    This bypasses the 200-marker-per-request cap.
    Uses concurrent fetches within each drill-down level for speed.

    If on_chunk is provided, it's called with each batch of new markers
    (approx chunk_size) for incremental DB persistence.
    """
    all_markers: list[dict] = []
    seen_tokens: set[str] = set()
    _pending: list[dict] = []
    _lock = asyncio.Lock()

    async def _flush():
        """Flush pending markers via callback."""
        if _pending and on_chunk:
            await on_chunk(list(_pending))
        _pending.clear()

    async def _collect_flush(markers: list[dict]):
        """Collect markers and flush if pending exceeds chunk_size (thread-safe)."""
        async with _lock:
            _collect(markers)
            if len(_pending) >= chunk_size:
                await _flush()

    def _collect(markers: list[dict]):
        for m in markers:
            token = m.get("token", "")
            if token and token not in seen_tokens:
                seen_tokens.add(token)
                all_markers.append(m)
                _pending.append(m)

    async def _drill_hood(params: dict, city_id, hood_cluster: dict):
        """Drill into a single neighborhood, splitting by price if needed."""
        hood_id = hood_cluster.get("hoodId")
        hood_docs = hood_cluster.get("docCount", 0)
        if not hood_id:
            return

        if hood_docs <= 200:
            hood_params = {**params, "city": city_id, "neighborhood": hood_id}
            hood_markers, _ = await _fetch_with_params(deal_type, hood_params, client)
            await _collect_flush(hood_markers)
            return

        # Neighborhood still > 200, split by price ranges concurrently
        async def _fetch_price_range(price_min, price_max):
            price_params = {
                **params,
                "city": city_id,
                "neighborhood": hood_id,
                "minPrice": price_min,
                "maxPrice": price_max,
            }
            price_markers, _ = await _fetch_with_params(deal_type, price_params, client)
            await _collect_flush(price_markers)

        await asyncio.gather(*[
            _fetch_price_range(pmin, pmax) for pmin, pmax in _PRICE_RANGES
        ])

    async def _drill_city(params: dict, city_cluster: dict):
        """Drill into a single city, spawning concurrent hood fetches."""
        city_id = city_cluster.get("cityId")
        city_docs = city_cluster.get("docCount", 0)
        if not city_id:
            return

        if city_docs <= 200:
            city_params = {**params, "city": city_id}
            city_markers, _ = await _fetch_with_params(deal_type, city_params, client)
            await _collect_flush(city_markers)
            return

        # City too large, drill into neighborhoods
        city_params = {**params, "city": city_id}
        _, hood_clusters = await _fetch_with_params(deal_type, city_params, client)

        if not hood_clusters:
            city_markers, _ = await _fetch_with_params(deal_type, city_params, client)
            await _collect_flush(city_markers)
            return

        await asyncio.gather(*[
            _drill_hood(params, city_id, hc) for hc in hood_clusters
        ])

    async def _drill_area(params: dict, area_cluster: dict):
        """Drill into a single area, spawning concurrent city fetches."""
        area_id = area_cluster.get("areaId")
        doc_count = area_cluster.get("docCount", 0)

        if not area_id:
            return

        if doc_count <= 200:
            area_params = {**params, "area": area_id}
            area_markers, _ = await _fetch_with_params(deal_type, area_params, client)
            await _collect_flush(area_markers)
            return

        # Area too large, drill into cities
        area_params = {**params, "area": area_id}
        _, city_clusters = await _fetch_with_params(deal_type, area_params, client)

        if not city_clusters:
            area_markers, _ = await _fetch_with_params(deal_type, area_params, client)
            await _collect_flush(area_markers)
            return

        await asyncio.gather(*[
            _drill_city(params, cc) for cc in city_clusters
        ])

    params = {"region": region_id, **api_params}
    markers, clusters = await _fetch_with_params(deal_type, params, client)

    # If no clusters, just collect what we got
    if not clusters:
        async with _lock:
            _collect(markers)
            await _flush()
        return all_markers

    # Collect any top-level markers that came with clusters
    async with _lock:
        _collect(markers)

    # Drill into all area clusters concurrently
    await asyncio.gather(*[_drill_area(params, ac) for ac in clusters])

    # Flush any remaining markers
    async with _lock:
        await _flush()

    logger.info(
        f"Region {region_id} ({REGIONS.get(region_id, '?')}): "
        f"collected {len(all_markers)} unique markers"
    )
    return all_markers


async def fetch_all_listings(
    params: dict,
    max_pages: int = 5,
    deal_type: DealType = DealType.RENT,
    region_ids: Optional[list[int]] = None,
    deep: bool = False,
) -> list[Listing]:
    """Fetch listings from Yad2 map feed API.

    The new API requires a region param and returns up to 200 markers per region.
    If no region_ids provided, fetches from all known regions.

    Args:
        params: Filter params (from saved search filters)
        max_pages: Max regions to fetch (only used when region_ids is None).
        deal_type: RENT or FORSALE
        region_ids: List of region IDs to scrape. None = all regions.
        deep: If True, use hierarchical drill-down to bypass the 200 cap.
    """
    if region_ids is None:
        region_ids = list(REGIONS.keys())

    api_params = _build_api_params(params)
    all_listings = []

    async with httpx.AsyncClient(timeout=30.0) as client:
        for region_id in region_ids:
            logger.info(
                f"Fetching {deal_type.value} region {region_id} "
                f"({REGIONS.get(region_id, '?')}) deep={deep}"
            )

            if deep:
                markers = await _deep_fetch_region(
                    region_id, deal_type, api_params, client
                )
            else:
                markers = await fetch_region(
                    region_id, deal_type=deal_type, params=api_params, client=client
                )
                await _delay()

            if not markers:
                logger.warning(f"No markers for region {region_id}")
                continue

            for marker in markers:
                listing = parse_marker(marker, deal_type=deal_type)
                if listing:
                    all_listings.append(listing)

            logger.info(f"Region {region_id}: parsed {len(markers)} markers")

    logger.info(f"Fetched {len(all_listings)} listings total from {len(region_ids)} regions")
    return all_listings


# --- Item detail endpoint (for amenity enrichment) ---

DETAIL_URL = "https://gw.yad2.co.il/feed-search-legacy/item"

# Maps Yad2 additional_info_items_v2 keys to our Amenities fields
_AMENITY_KEY_MAP = {
    "air_conditioner": "air_conditioning",
    "elevator": "elevator",
    "shelter": "mamad",
    "pets": "pets_allowed",
    "furniture": "furnished",
    "bars": "bars",
    "boiler": "boiler",
    "accessibility": "accessible",
}


async def fetch_item_detail(
    token: str,
    client: Optional[httpx.AsyncClient] = None,
    _retries: int = 3,
) -> Optional[Amenities]:
    """Fetch individual listing detail to extract amenities.

    Returns an Amenities object or None on failure.
    Uses browser headers and exponential backoff on rate-limit responses.
    """
    should_close = client is None
    if client is None:
        client = httpx.AsyncClient(timeout=15.0)

    try:
        for attempt in range(_retries):
            resp = await client.get(DETAIL_URL, params={"token": token}, headers=_get_headers())

            if resp.status_code == 200:
                break

            # Rate limited or blocked -- exponential backoff
            if resp.status_code in (429, 403):
                backoff = 30 * (2 ** attempt)  # 30s, 60s, 120s
                logger.warning(f"Rate limited ({resp.status_code}) on {token}, backing off {backoff}s")
                await asyncio.sleep(backoff)
                continue

            # Other error -- don't retry
            return None
        else:
            # Exhausted retries
            return None

        data = resp.json().get("data", {})

        # Parse boolean amenities from additional_info_items_v2
        amenity_values = {}
        for item in data.get("additional_info_items_v2", []):
            key = item.get("key", "")
            our_key = _AMENITY_KEY_MAP.get(key)
            if our_key:
                amenity_values[our_key] = bool(item.get("value"))

        # Parking: top-level numeric field (>0 means has parking)
        parking_val = data.get("parking")
        if parking_val is not None:
            amenity_values["parking"] = int(parking_val) > 0 if str(parking_val).isdigit() else False

        # Balcony: top-level numeric field
        balconies_val = data.get("balconies")
        if balconies_val is not None:
            amenity_values["balcony"] = int(balconies_val) > 0 if str(balconies_val).isdigit() else False

        return Amenities(**amenity_values)

    except (httpx.HTTPError, ValueError, KeyError) as e:
        logger.debug(f"Error fetching detail for {token}: {e}")
        return None
    finally:
        if should_close:
            await client.aclose()
