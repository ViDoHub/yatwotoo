import logging
from typing import Any

from app.consts import GEO_TYPE_POINT, GEO_TYPE_POLYGON, FilterParam, SortBy
from app.models import AmenityFilter, Listing

logger: logging.Logger = logging.getLogger(name=__name__)


class SearchFilters:
    """Build MongoDB query from search filter parameters."""

    def __init__(self, filters: dict[str, Any]) -> None:
        self.filters: dict[str, Any] = filters

    def build_query(self) -> dict[str, Any]:
        query: dict[str, Any] = {'is_active': True}

        # Deal type filter
        if deal_type := self.filters.get(FilterParam.DEAL_TYPE):
            query['deal_type'] = deal_type

        # City filter (singular or plural)
        if cities := self.filters.get(FilterParam.CITIES):
            if isinstance(cities, list) and cities:
                query['address.city'] = {'$in': cities}
        elif city := self.filters.get(FilterParam.CITY):
            query['address.city'] = city

        # Area filter (multi-select)
        if (area_ids := self.filters.get(FilterParam.AREA_IDS)) and isinstance(area_ids, list) and area_ids:
            query['address.area_id'] = {'$in': [int(a) for a in area_ids]}

        # Top area filter (multi-select)
        if (
            (top_area_ids := self.filters.get(FilterParam.TOP_AREA_IDS))
            and isinstance(top_area_ids, list)
            and top_area_ids
        ):
            query['address.top_area_id'] = {'$in': [int(a) for a in top_area_ids]}

        # Neighborhood filter (multi-select)
        if (
            (neighborhoods := self.filters.get(FilterParam.NEIGHBORHOODS))
            and isinstance(neighborhoods, list)
            and neighborhoods
        ):
            query['address.neighborhood'] = {'$in': neighborhoods}

        # Rooms range
        if rooms_min := self.filters.get(FilterParam.ROOMS_MIN):
            query.setdefault('rooms', {})['$gte'] = float(rooms_min)
        if rooms_max := self.filters.get(FilterParam.ROOMS_MAX):
            query.setdefault('rooms', {})['$lte'] = float(rooms_max)

        # Price range
        if price_min := self.filters.get(FilterParam.PRICE_MIN):
            query.setdefault('price', {})['$gte'] = int(price_min)
        if price_max := self.filters.get(FilterParam.PRICE_MAX):
            query.setdefault('price', {})['$lte'] = int(price_max)

        # Sqm range
        if sqm_min := self.filters.get(FilterParam.SQM_MIN):
            query.setdefault('sqm', {})['$gte'] = float(sqm_min)
        if sqm_max := self.filters.get(FilterParam.SQM_MAX):
            query.setdefault('sqm', {})['$lte'] = float(sqm_max)

        # Floor range
        if floor_min := self.filters.get(FilterParam.FLOOR_MIN):
            query.setdefault('floor', {})['$gte'] = int(floor_min)
        if floor_max := self.filters.get(FilterParam.FLOOR_MAX):
            query.setdefault('floor', {})['$lte'] = int(floor_max)

        # Boolean amenities - match only True (confirmed)
        for amenity in AmenityFilter:
            if self.filters.get(amenity):
                query[f'amenities.{amenity}'] = True

        # Geographic radius search (using MongoDB $nearSphere)
        center_lat: Any | None = self.filters.get(FilterParam.CENTER_LAT)
        center_lng: Any | None = self.filters.get(FilterParam.CENTER_LNG)
        radius_km: Any | None = self.filters.get(FilterParam.RADIUS_KM)
        if center_lat and center_lng and radius_km:
            query['location'] = {
                '$nearSphere': {
                    '$geometry': {
                        'type': GEO_TYPE_POINT,
                        'coordinates': [float(center_lng), float(center_lat)],
                    },
                    '$maxDistance': float(radius_km) * 1000,  # convert km to meters
                },
            }

        # Geographic polygon search (using MongoDB $geoWithin)
        if (
            (geo_polygon := self.filters.get(FilterParam.GEO_POLYGON))
            and isinstance(geo_polygon, list)
            and len(geo_polygon) >= 4
        ):
            # Ensure polygon is closed
            coords: list[list[float]] = [[float(c[0]), float(c[1])] for c in geo_polygon]
            if coords[0] != coords[-1]:
                coords.append(coords[0])
            query['location'] = {
                '$geoWithin': {
                    '$geometry': {
                        'type': GEO_TYPE_POLYGON,
                        'coordinates': [coords],
                    },
                },
            }

        return query

    def get_sort(self) -> list[tuple[str, int]]:
        """Return sort specification based on filters."""
        sort_by: str = self.filters.get(FilterParam.SORT_BY, SortBy.NEWEST)

        sort_map: dict[str, list[tuple[str, int]]] = {
            SortBy.NEWEST: [('first_seen_at', -1)],
            SortBy.PRICE_ASC: [('price', 1)],
            SortBy.PRICE_DESC: [('price', -1)],
            SortBy.PRICE_PER_SQM_ASC: [('price_per_sqm', 1)],
            SortBy.PRICE_PER_SQM_DESC: [('price_per_sqm', -1)],
            SortBy.SQM_DESC: [('sqm', -1)],
            SortBy.ROOMS_ASC: [('rooms', 1)],
        }

        return sort_map.get(sort_by, [('first_seen_at', -1)])


async def search_listings(
    filters: dict[str, Any],
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Listing], int]:
    """Search listings with filters, sorting, and pagination.

    Returns (listings, total_count).
    """
    search: SearchFilters = SearchFilters(filters)
    query: dict[str, Any] = search.build_query()
    sort: list[tuple[str, int]] = search.get_sort()

    total: int = await Listing.find(query).count()

    skip: int = (page - 1) * page_size
    listings: list[Listing] = await Listing.find(query).sort(sort).skip(skip).limit(page_size).to_list()

    return listings, total


async def match_saved_search(filters: dict[str, Any], listing: Listing) -> bool:
    """Check if a listing matches a saved search's filters."""
    search: SearchFilters = SearchFilters(filters)
    query: dict[str, Any] = search.build_query()

    # Add the specific listing ID to the query
    query['yad2_id'] = listing.yad2_id

    match: Listing | None = await Listing.find_one(query)
    return match is not None


async def get_area_counts() -> dict[int, int]:
    """Get count of active listings per area_id for filter display."""
    pipeline: list[dict[str, Any]] = [
        {'$match': {'is_active': True, 'address.area_id': {'$gt': 0}}},
        {'$group': {'_id': '$address.area_id', 'count': {'$sum': 1}}},
        {'$sort': {'count': -1}},
    ]
    results: list[dict[str, Any]] = await Listing.aggregate(pipeline).to_list()
    return {r['_id']: r['count'] for r in results}
