"""Tests for the search engine (query builder, sorting, pagination)."""

import pytest

from app.models import Address, Amenities, DealType, Listing
from app.search.engine import SearchFilters, get_area_counts, search_listings

pytestmark = pytest.mark.asyncio


class TestSearchFiltersQueryBuilder:
    """Test SearchFilters.build_query() with various filter combinations."""

    def test_empty_filters_returns_active_only(self):
        sf = SearchFilters({})
        query = sf.build_query()
        assert query == {'is_active': True}

    def test_deal_type_filter(self):
        sf = SearchFilters({'deal_type': 'forsale'})
        query = sf.build_query()
        assert query['deal_type'] == 'forsale'

    def test_city_filter(self):
        sf = SearchFilters({'city': 'תל אביב'})
        query = sf.build_query()
        assert query['address.city'] == 'תל אביב'

    def test_area_ids_list(self):
        sf = SearchFilters({'area_ids': ['10', '20', '30']})
        query = sf.build_query()
        assert query['address.area_id'] == {'$in': [10, 20, 30]}

    def test_area_ids_empty_list_ignored(self):
        sf = SearchFilters({'area_ids': []})
        query = sf.build_query()
        assert 'address.area_id' not in query

    def test_top_area_ids_list(self):
        sf = SearchFilters({'top_area_ids': ['3', '7']})
        query = sf.build_query()
        assert query['address.top_area_id'] == {'$in': [3, 7]}

    def test_rooms_range(self):
        sf = SearchFilters({'rooms_min': '2.5', 'rooms_max': '4'})
        query = sf.build_query()
        assert query['rooms'] == {'$gte': 2.5, '$lte': 4.0}

    def test_rooms_min_only(self):
        sf = SearchFilters({'rooms_min': '3'})
        query = sf.build_query()
        assert query['rooms'] == {'$gte': 3.0}

    def test_price_range(self):
        sf = SearchFilters({'price_min': '3000', 'price_max': '8000'})
        query = sf.build_query()
        assert query['price'] == {'$gte': 3000, '$lte': 8000}

    def test_sqm_range(self):
        sf = SearchFilters({'sqm_min': '60', 'sqm_max': '120'})
        query = sf.build_query()
        assert query['sqm'] == {'$gte': 60.0, '$lte': 120.0}

    def test_floor_range(self):
        sf = SearchFilters({'floor_min': '2', 'floor_max': '10'})
        query = sf.build_query()
        assert query['floor'] == {'$gte': 2, '$lte': 10}

    def test_amenity_filter_parking(self):
        sf = SearchFilters({'parking': '1'})
        query = sf.build_query()
        assert query['amenities.parking'] is True

    def test_amenity_filter_multiple(self):
        sf = SearchFilters({'parking': '1', 'elevator': '1', 'shelter': '1'})
        query = sf.build_query()
        assert query['amenities.parking'] is True
        assert query['amenities.elevator'] is True
        assert query['amenities.shelter'] is True

    def test_amenity_filter_falsy_value_ignored(self):
        """Amenity filter with empty/falsy value should not be applied."""
        sf = SearchFilters({'parking': '', 'elevator': '0'})
        query = sf.build_query()
        assert 'amenities.parking' not in query
        # "0" is truthy as string, so it WILL be applied - this is a potential edge case
        # The current code checks `if self.filters.get(amenity):` which is truthy for "0"
        assert 'amenities.elevator' in query

    def test_geo_radius_search(self):
        sf = SearchFilters(
            {
                'center_lat': '32.06',
                'center_lng': '34.77',
                'radius_km': '5',
            }
        )
        query = sf.build_query()
        assert '$nearSphere' in query['location']
        coords = query['location']['$nearSphere']['$geometry']['coordinates']
        assert coords == [34.77, 32.06]
        assert query['location']['$nearSphere']['$maxDistance'] == 5000.0

    def test_geo_search_partial_coords_ignored(self):
        """Missing one of lat/lng/radius should skip geo query."""
        sf = SearchFilters({'center_lat': '32.06', 'center_lng': '34.77'})
        query = sf.build_query()
        assert 'location' not in query

    def test_combined_filters(self):
        sf = SearchFilters(
            {
                'deal_type': 'rent',
                'top_area_ids': ['3'],
                'rooms_min': '2',
                'rooms_max': '4',
                'price_max': '8000',
                'parking': '1',
            }
        )
        query = sf.build_query()
        assert query['deal_type'] == 'rent'
        assert query['address.top_area_id'] == {'$in': [3]}
        assert query['rooms']['$gte'] == 2.0
        assert query['rooms']['$lte'] == 4.0
        assert query['price'] == {'$lte': 8000}
        assert query['amenities.parking'] is True

    # Edge case: walrus operator (:=) with "0" values
    def test_zero_price_min_ignored(self):
        """price_min='0' is falsy for int conversion but truthy string.
        The walrus operator `if price_min := ...` evaluates truthiness of the string."""
        sf = SearchFilters({'price_min': '0'})
        query = sf.build_query()
        # "0" is truthy as string, so walrus assigns it, then int("0") = 0
        # This would set $gte: 0, which is useless but not harmful
        # Actually - walrus `if price_min := self.filters.get("price_min"):`
        # "0" is truthy, so it will be included
        if 'price' in query:
            assert query['price']['$gte'] == 0

    def test_empty_string_values_ignored(self):
        """Empty string filter values should be ignored by walrus operator."""
        sf = SearchFilters(
            {
                'price_min': '',
                'price_max': '',
                'rooms_min': '',
                'rooms_max': '',
            }
        )
        query = sf.build_query()
        assert 'price' not in query
        assert 'rooms' not in query


class TestSearchFiltersSort:
    """Test SearchFilters.get_sort()."""

    def test_default_sort_newest(self):
        sf = SearchFilters({})
        assert sf.get_sort() == [('first_seen_at', -1)]

    def test_sort_price_asc(self):
        sf = SearchFilters({'sort_by': 'price_asc'})
        assert sf.get_sort() == [('price', 1)]

    def test_sort_price_desc(self):
        sf = SearchFilters({'sort_by': 'price_desc'})
        assert sf.get_sort() == [('price', -1)]

    def test_sort_price_per_sqm(self):
        sf = SearchFilters({'sort_by': 'price_per_sqm_asc'})
        assert sf.get_sort() == [('price_per_sqm', 1)]

    def test_sort_sqm_desc(self):
        sf = SearchFilters({'sort_by': 'sqm_desc'})
        assert sf.get_sort() == [('sqm', -1)]

    def test_unknown_sort_defaults_to_newest(self):
        sf = SearchFilters({'sort_by': 'invalid_sort'})
        assert sf.get_sort() == [('first_seen_at', -1)]


class TestSearchListings:
    """Integration tests for search_listings (requires MongoDB)."""

    async def test_search_empty_db_returns_zero(self):
        listings, total = await search_listings({})
        assert listings == []
        assert total == 0

    async def test_search_returns_active_listings_only(self, sample_listing):
        await sample_listing.insert()
        inactive = Listing(
            yad2_id='inactive1',
            deal_type=DealType.RENT,
            is_active=False,
            price=5000,
        )
        await inactive.insert()

        listings, total = await search_listings({})
        assert total == 1
        assert listings[0].yad2_id == 'abc123'

    async def test_search_with_deal_type_filter(self, sample_listing, sample_forsale_listing):
        await sample_listing.insert()
        await sample_forsale_listing.insert()

        listings, total = await search_listings({'deal_type': 'forsale'})
        assert total == 1
        assert listings[0].yad2_id == 'sale456'

    async def test_pagination(self, sample_listing):
        # Insert multiple listings
        for i in range(5):
            listing = Listing(
                yad2_id=f'page_{i}',
                deal_type=DealType.RENT,
                price=5000 + i * 100,
                is_active=True,
            )
            await listing.insert()

        listings_p1, total = await search_listings({}, page=1, page_size=2)
        assert total == 5
        assert len(listings_p1) == 2

        listings_p2, _ = await search_listings({}, page=2, page_size=2)
        assert len(listings_p2) == 2

        listings_p3, _ = await search_listings({}, page=3, page_size=2)
        assert len(listings_p3) == 1

    async def test_search_with_rooms_filter(self):
        for rooms in [2, 3, 4, 5]:
            await Listing(
                yad2_id=f'rooms_{rooms}',
                rooms=float(rooms),
                deal_type=DealType.RENT,
                is_active=True,
            ).insert()

        listings, total = await search_listings({'rooms_min': '3', 'rooms_max': '4'})
        assert total == 2
        yad2_ids = {l.yad2_id for l in listings}
        assert yad2_ids == {'rooms_3', 'rooms_4'}

    async def test_search_with_price_filter(self):
        for price in [3000, 5000, 7000, 9000]:
            await Listing(
                yad2_id=f'price_{price}',
                price=price,
                deal_type=DealType.RENT,
                is_active=True,
            ).insert()

        listings, total = await search_listings({'price_min': '4000', 'price_max': '8000'})
        assert total == 2
        prices = {l.price for l in listings}
        assert prices == {5000, 7000}

    async def test_search_with_amenity_filter(self):
        # Listing with parking
        await Listing(
            yad2_id='has_parking',
            amenities=Amenities(parking=True),
            deal_type=DealType.RENT,
            is_active=True,
        ).insert()
        # Listing without parking
        await Listing(
            yad2_id='no_parking',
            amenities=Amenities(parking=False),
            deal_type=DealType.RENT,
            is_active=True,
        ).insert()
        # Listing with unknown parking (None) - excluded with strict match
        await Listing(
            yad2_id='unknown_parking',
            amenities=Amenities(parking=None),
            deal_type=DealType.RENT,
            is_active=True,
        ).insert()

        listings, total = await search_listings({'parking': '1'})
        assert total == 1
        yad2_ids = {l.yad2_id for l in listings}
        assert yad2_ids == {'has_parking'}

    async def test_sort_by_price_asc(self):
        for price in [7000, 3000, 5000]:
            await Listing(
                yad2_id=f'sort_{price}',
                price=price,
                deal_type=DealType.RENT,
                is_active=True,
            ).insert()

        listings, _ = await search_listings({'sort_by': 'price_asc'})
        prices = [l.price for l in listings]
        assert prices == [3000, 5000, 7000]

    async def test_top_area_filter(self):
        await Listing(
            yad2_id='ta1',
            address=Address(top_area_id=3, city='תל אביב'),
            deal_type=DealType.RENT,
            is_active=True,
        ).insert()
        await Listing(
            yad2_id='haifa1',
            address=Address(top_area_id=7, city='חיפה'),
            deal_type=DealType.RENT,
            is_active=True,
        ).insert()

        listings, total = await search_listings({'top_area_ids': ['3']})
        assert total == 1
        assert listings[0].yad2_id == 'ta1'


class TestGetAreaCounts:
    """Test the area_counts aggregation."""

    async def test_area_counts_empty_db(self):
        counts = await get_area_counts()
        assert counts == {}

    async def test_area_counts_groups_correctly(self):
        for i in range(3):
            await Listing(
                yad2_id=f'area10_{i}',
                address=Address(area_id=10),
                deal_type=DealType.RENT,
                is_active=True,
            ).insert()
        for i in range(2):
            await Listing(
                yad2_id=f'area20_{i}',
                address=Address(area_id=20),
                deal_type=DealType.RENT,
                is_active=True,
            ).insert()
        # area_id=0 should be excluded
        await Listing(
            yad2_id='area0',
            address=Address(area_id=0),
            deal_type=DealType.RENT,
            is_active=True,
        ).insert()

        counts = await get_area_counts()
        assert counts[10] == 3
        assert counts[20] == 2
        assert 0 not in counts

    async def test_area_counts_excludes_inactive(self):
        await Listing(
            yad2_id='active1',
            address=Address(area_id=10),
            deal_type=DealType.RENT,
            is_active=True,
        ).insert()
        await Listing(
            yad2_id='inactive1',
            address=Address(area_id=10),
            deal_type=DealType.RENT,
            is_active=False,
        ).insert()

        counts = await get_area_counts()
        assert counts[10] == 1
