import logging

from app.models import Listing

logger = logging.getLogger(__name__)


class SearchFilters:
    """Build MongoDB query from search filter parameters."""

    def __init__(self, filters: dict):
        self.filters = filters

    def build_query(self) -> dict:
        query: dict = {"is_active": True}

        # Deal type filter
        if deal_type := self.filters.get("deal_type"):
            query["deal_type"] = deal_type

        # City filter (singular or plural)
        if cities := self.filters.get("cities"):
            if isinstance(cities, list) and cities:
                query["address.city"] = {"$in": cities}
        elif city := self.filters.get("city"):
            query["address.city"] = city

        # Area filter (multi-select)
        if area_ids := self.filters.get("area_ids"):
            if isinstance(area_ids, list) and area_ids:
                query["address.area_id"] = {"$in": [int(a) for a in area_ids]}

        # Top area filter (multi-select)
        if top_area_ids := self.filters.get("top_area_ids"):
            if isinstance(top_area_ids, list) and top_area_ids:
                query["address.top_area_id"] = {"$in": [int(a) for a in top_area_ids]}

        # Neighborhood filter (multi-select)
        if neighborhoods := self.filters.get("neighborhoods"):
            if isinstance(neighborhoods, list) and neighborhoods:
                query["address.neighborhood"] = {"$in": neighborhoods}

        # Rooms range
        if rooms_min := self.filters.get("rooms_min"):
            query.setdefault("rooms", {})["$gte"] = float(rooms_min)
        if rooms_max := self.filters.get("rooms_max"):
            query.setdefault("rooms", {})["$lte"] = float(rooms_max)

        # Price range
        if price_min := self.filters.get("price_min"):
            query.setdefault("price", {})["$gte"] = int(price_min)
        if price_max := self.filters.get("price_max"):
            query.setdefault("price", {})["$lte"] = int(price_max)

        # Sqm range
        if sqm_min := self.filters.get("sqm_min"):
            query.setdefault("sqm", {})["$gte"] = float(sqm_min)
        if sqm_max := self.filters.get("sqm_max"):
            query.setdefault("sqm", {})["$lte"] = float(sqm_max)

        # Floor range
        if floor_min := self.filters.get("floor_min"):
            query.setdefault("floor", {})["$gte"] = int(floor_min)
        if floor_max := self.filters.get("floor_max"):
            query.setdefault("floor", {})["$lte"] = int(floor_max)

        # Boolean amenities - match only True (confirmed)
        for amenity in ["parking", "elevator", "balcony", "pets_allowed", "air_conditioning",
                        "furnished", "mamad"]:
            if self.filters.get(amenity):
                query[f"amenities.{amenity}"] = True

        # Geographic radius search (using MongoDB $nearSphere)
        center_lat = self.filters.get("center_lat")
        center_lng = self.filters.get("center_lng")
        radius_km = self.filters.get("radius_km")
        if center_lat and center_lng and radius_km:
            query["location"] = {
                "$nearSphere": {
                    "$geometry": {
                        "type": "Point",
                        "coordinates": [float(center_lng), float(center_lat)],
                    },
                    "$maxDistance": float(radius_km) * 1000,  # convert km to meters
                }
            }

        # Geographic polygon search (using MongoDB $geoWithin)
        if geo_polygon := self.filters.get("geo_polygon"):
            if isinstance(geo_polygon, list) and len(geo_polygon) >= 4:
                # Ensure polygon is closed
                coords = [[float(c[0]), float(c[1])] for c in geo_polygon]
                if coords[0] != coords[-1]:
                    coords.append(coords[0])
                query["location"] = {
                    "$geoWithin": {
                        "$geometry": {
                            "type": "Polygon",
                            "coordinates": [coords],
                        }
                    }
                }

        return query

    def get_sort(self) -> list[tuple[str, int]]:
        """Return sort specification based on filters."""
        sort_by = self.filters.get("sort_by", "newest")

        sort_map = {
            "newest": [("first_seen_at", -1)],
            "price_asc": [("price", 1)],
            "price_desc": [("price", -1)],
            "price_per_sqm_asc": [("price_per_sqm", 1)],
            "price_per_sqm_desc": [("price_per_sqm", -1)],
            "sqm_desc": [("sqm", -1)],
            "rooms_asc": [("rooms", 1)],
        }

        return sort_map.get(sort_by, [("first_seen_at", -1)])


async def search_listings(
    filters: dict,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Listing], int]:
    """Search listings with filters, sorting, and pagination.

    Returns (listings, total_count).
    """
    search = SearchFilters(filters)
    query = search.build_query()
    sort = search.get_sort()

    total = await Listing.find(query).count()

    skip = (page - 1) * page_size
    listings = (
        await Listing.find(query)
        .sort(sort)
        .skip(skip)
        .limit(page_size)
        .to_list()
    )

    return listings, total


async def match_saved_search(filters: dict, listing: Listing) -> bool:
    """Check if a listing matches a saved search's filters."""
    search = SearchFilters(filters)
    query = search.build_query()

    # Add the specific listing ID to the query
    query["yad2_id"] = listing.yad2_id

    match = await Listing.find_one(query)
    return match is not None


async def get_area_counts() -> dict[int, int]:
    """Get count of active listings per area_id for filter display."""
    pipeline = [
        {"$match": {"is_active": True, "address.area_id": {"$gt": 0}}},
        {"$group": {"_id": "$address.area_id", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    results = await Listing.aggregate(pipeline).to_list()
    return {r["_id"]: r["count"] for r in results}
