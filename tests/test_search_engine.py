"""Tests for the search engine (query builder, sorting, pagination)."""

import re
from html import unescape
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from _pytest.mark.structures import MarkDecorator
from httpx._models import Response

from app.models import Address, Amenities, DealType, Listing
from app.search.engine import SearchFilters, get_area_counts, search_listings

pytestmark: MarkDecorator = pytest.mark.asyncio


# -- SearchFilters.build_query() --
def test_build_query_empty_filters_returns_active_only():
    sf = SearchFilters(filters={})
    query: dict[str, Any] = sf.build_query()
    assert query == {'is_active': True}


@pytest.mark.parametrize(
    argnames=('filters', 'key', 'expected'),
    argvalues=[
        ({'deal_type': 'forsale'}, 'deal_type', 'forsale'),
        ({'city': 'תל אביב'}, 'address.city', 'תל אביב'),
    ],
)
def test_build_query_simple_filter(filters: dict, key: str, expected: Any):
    sf = SearchFilters(filters=filters)
    query: dict[str, Any] = sf.build_query()
    assert query[key] == expected


@pytest.mark.parametrize(
    argnames=('filters', 'query_key', 'expected'),
    argvalues=[
        ({'area_ids': ['10', '20', '30']}, 'address.area_id', {'$in': [10, 20, 30]}),
        ({'area_ids': []}, 'address.area_id', None),
        ({'top_area_ids': ['3', '7']}, 'address.top_area_id', {'$in': [3, 7]}),
    ],
)
def test_build_query_list_filter(filters: dict, query_key: str, expected: Any):
    sf = SearchFilters(filters=filters)
    query: dict[str, Any] = sf.build_query()
    if expected is None:
        assert query_key not in query
    else:
        assert query[query_key] == expected


@pytest.mark.parametrize(
    argnames=('filters', 'field', 'expected'),
    argvalues=[
        ({'rooms_min': '2.5', 'rooms_max': '4'}, 'rooms', {'$gte': 2.5, '$lte': 4.0}),
        ({'rooms_min': '3'}, 'rooms', {'$gte': 3.0}),
        ({'price_min': '3000', 'price_max': '8000'}, 'price', {'$gte': 3000, '$lte': 8000}),
        ({'sqm_min': '60', 'sqm_max': '120'}, 'sqm', {'$gte': 60.0, '$lte': 120.0}),
        ({'floor_min': '2', 'floor_max': '10'}, 'floor', {'$gte': 2, '$lte': 10}),
    ],
)
def test_build_query_range_filter(filters: dict, field: str, expected: Any):
    sf = SearchFilters(filters=filters)
    query: dict[str, Any] = sf.build_query()
    assert query[field] == expected


@pytest.mark.parametrize(
    argnames=('filters', 'expected_present', 'expected_absent'),
    argvalues=[
        ({'parking': '1'}, ['amenities.parking'], []),
        (
            {'parking': '1', 'elevator': '1', 'shelter': '1'},
            ['amenities.parking', 'amenities.elevator', 'amenities.shelter'],
            [],
        ),
        ({'parking': '', 'elevator': '0'}, ['amenities.elevator'], ['amenities.parking']),
    ],
)
def test_build_query_amenity_filter(filters: dict, expected_present: list[str], expected_absent: list[str]):
    sf = SearchFilters(filters=filters)
    query: dict[str, Any] = sf.build_query()
    for key in expected_present:
        assert query[key] is True
    for key in expected_absent:
        assert key not in query


@pytest.mark.parametrize(
    argnames=('filters', 'has_location'),
    argvalues=[
        ({'center_lat': '32.06', 'center_lng': '34.77', 'radius_km': '5'}, True),
        ({'center_lat': '32.06', 'center_lng': '34.77'}, False),
    ],
)
def test_build_query_geo_search(filters: dict, *, has_location: bool):
    sf = SearchFilters(filters=filters)
    query: dict[str, Any] = sf.build_query()
    if has_location:
        assert '$nearSphere' in query['location']
        coords: Any = query['location']['$nearSphere']['$geometry']['coordinates']
        assert coords == [34.77, 32.06]
        assert query['location']['$nearSphere']['$maxDistance'] == 5000
    else:
        assert 'location' not in query


def test_build_query_combined_filters():
    sf = SearchFilters(
        filters={
            'deal_type': 'rent',
            'top_area_ids': ['3'],
            'rooms_min': '2',
            'rooms_max': '4',
            'price_max': '8000',
            'parking': '1',
        },
    )
    query: dict[str, Any] = sf.build_query()
    assert query['deal_type'] == 'rent'
    assert query['address.top_area_id'] == {'$in': [3]}
    assert query['rooms']['$gte'] == 2
    assert query['rooms']['$lte'] == 4
    assert query['price'] == {'$lte': 8000}
    assert query['amenities.parking'] is True


@pytest.mark.parametrize(
    argnames=('filters', 'expected_key', 'expected_value'),
    argvalues=[
        (
            {'top_area_ids': ['3'], 'cities': ['הרצליה']},
            'address.city',
            {'$in': ['הרצליה']},
        ),
        (
            {'top_area_ids': ['3'], 'neighborhoods': ['בינתחומי', 'גני הרצליה']},
            'address.neighborhood',
            {'$in': ['בינתחומי', 'גני הרצליה']},
        ),
    ],
)
def test_build_query_top_area_skipped_when_specific_geo_present(filters: dict, expected_key: str, expected_value: Any):
    """top_area_id filter dropped when cities or neighborhoods are specified."""
    sf = SearchFilters(filters=filters)
    query: dict[str, Any] = sf.build_query()
    assert 'address.top_area_id' not in query
    assert query[expected_key] == expected_value


@pytest.mark.parametrize(
    argnames=('filters', 'absent_keys', 'present_check'),
    argvalues=[
        ({'price_min': '0'}, [], {'price': {'$gte': 0}}),
        ({'price_min': '', 'price_max': '', 'rooms_min': '', 'rooms_max': ''}, ['price', 'rooms'], {}),
    ],
)
def test_build_query_edge_case_values(filters: dict, absent_keys: list[str], present_check: dict[str, Any]):
    """Empty strings ignored by walrus; '0' is truthy so produces harmless $gte: 0."""
    sf = SearchFilters(filters=filters)
    query: dict[str, Any] = sf.build_query()
    for key in absent_keys:
        assert key not in query
    for key, value in present_check.items():
        assert query.get(key) == value


# -- SearchFilters.get_sort() --
@pytest.mark.parametrize(
    argnames=('sort_by', 'expected'),
    argvalues=[
        (None, []),
        ('price_asc', [('price', 1)]),
        ('price_desc', [('price', -1)]),
        ('price_per_sqm_asc', [('price_per_sqm', 1)]),
        ('sqm_desc', [('sqm', -1)]),
        ('newest', [('date_added', -1), ('first_seen_at', -1)]),
        ('invalid_sort', []),
        (['price_asc', 'newest'], [('price', 1), ('date_added', -1), ('first_seen_at', -1)]),
        (['newest', 'sqm_desc'], [('date_added', -1), ('first_seen_at', -1), ('sqm', -1)]),
        ([], []),
    ],
)
def test_sort(sort_by: str | list[str] | None, expected: list[tuple[str, int]]):
    filters: dict = {'sort_by': sort_by} if sort_by is not None else {}
    sf = SearchFilters(filters=filters)
    assert sf.get_sort() == expected


# -- search_listings() integration tests (requires MongoDB) --
async def test_search_empty_db_returns_zero():
    listings, total = await search_listings(filters={})
    assert listings == []
    assert total == 0


async def test_search_returns_active_listings_only(sample_listing: Listing):
    await sample_listing.insert()
    inactive = Listing(
        yad2_id='inactive1',
        deal_type=DealType.RENT,
        is_active=False,
        price=5000,
    )
    await inactive.insert()

    listings, total = await search_listings(filters={})
    assert total == 1
    assert listings[0].yad2_id == 'abc123'


async def test_search_with_deal_type_filter(sample_listing: Listing, sample_forsale_listing: Listing):
    await sample_listing.insert()
    await sample_forsale_listing.insert()

    listings, total = await search_listings(filters={'deal_type': 'forsale'})
    assert total == 1
    assert listings[0].yad2_id == 'sale456'


async def test_search_pagination():
    for i in range(5):
        listing = Listing(
            yad2_id=f'page_{i}',
            deal_type=DealType.RENT,
            price=5000 + i * 100,
            is_active=True,
        )
        await listing.insert()

    listings_p1, total = await search_listings(filters={}, page=1, page_size=2)
    assert total == 5
    assert len(listings_p1) == 2

    listings_p2, _ = await search_listings(filters={}, page=2, page_size=2)
    assert len(listings_p2) == 2

    listings_p3, _ = await search_listings(filters={}, page=3, page_size=2)
    assert len(listings_p3) == 1


async def test_search_with_rooms_filter():
    for rooms in [2, 3, 4, 5]:
        await Listing(
            yad2_id=f'rooms_{rooms}',
            rooms=float(rooms),
            deal_type=DealType.RENT,
            is_active=True,
        ).insert()

    listings, total = await search_listings(filters={'rooms_min': '3', 'rooms_max': '4'})
    assert total == 2
    yad2_ids: set[str] = {l.yad2_id for l in listings}
    assert yad2_ids == {'rooms_3', 'rooms_4'}


async def test_search_with_price_filter():
    for price in [3000, 5000, 7000, 9000]:
        await Listing(
            yad2_id=f'price_{price}',
            price=price,
            deal_type=DealType.RENT,
            is_active=True,
        ).insert()

    listings, total = await search_listings(filters={'price_min': '4000', 'price_max': '8000'})
    assert total == 2
    prices: set[int | None] = {l.price for l in listings}
    assert prices == {5000, 7000}


async def test_search_with_amenity_filter():
    await Listing(
        yad2_id='has_parking',
        amenities=Amenities(parking=True),
        deal_type=DealType.RENT,
        is_active=True,
    ).insert()
    await Listing(
        yad2_id='no_parking',
        amenities=Amenities(parking=False),
        deal_type=DealType.RENT,
        is_active=True,
    ).insert()
    await Listing(
        yad2_id='unknown_parking',
        amenities=Amenities(parking=None),
        deal_type=DealType.RENT,
        is_active=True,
    ).insert()

    listings, total = await search_listings(filters={'parking': '1'})
    assert total == 1
    yad2_ids: set[str] = {l.yad2_id for l in listings}
    assert yad2_ids == {'has_parking'}


async def test_search_sort_by_price_asc():
    for price in [7000, 3000, 5000]:
        await Listing(
            yad2_id=f'sort_{price}',
            price=price,
            deal_type=DealType.RENT,
            is_active=True,
        ).insert()

    listings, _ = await search_listings(filters={'sort_by': 'price_asc'})
    prices = [l.price for l in listings]
    assert prices == [3000, 5000, 7000]


async def test_search_top_area_filter():
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

    listings, total = await search_listings(filters={'top_area_ids': ['3']})
    assert total == 1
    assert listings[0].yad2_id == 'ta1'


# -- get_area_counts() --
async def test_area_counts_empty_db():
    counts = await get_area_counts()
    assert counts == {}


async def test_area_counts_groups_correctly():
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


async def test_area_counts_excludes_inactive():
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


# -- Pagination preserves filters --
@pytest.fixture
async def client():
    from app.main import app

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as c:
        yield c


def _extract_pagination_hrefs(html: str) -> list[str]:
    return [unescape(s=h) for h in re.findall(pattern=r'<a href="(\?page=[^"]*)"', string=html)]


async def test_pagination_links_include_filters(client: httpx.AsyncClient):
    """Page links must carry all current filter params, not just ?page=N."""
    for i in range(25):
        await Listing(yad2_id=f'pag_{i}', deal_type=DealType.FORSALE, price=1_000_000 + i, is_active=True).insert()

    resp: Response = await client.get(
        url='/listings',
        params={'deal_type': 'forsale', 'price_min': '500000'},
        headers={'HX-Request': 'true'},
    )
    assert resp.status_code == 200

    hrefs: list[str] = _extract_pagination_hrefs(html=resp.text)
    assert hrefs, 'Expected pagination links but found none'
    for href in hrefs:
        parsed: dict[str, list[str]] = parse_qs(qs=urlparse(url=href).query)
        assert 'deal_type' in parsed, f'deal_type missing from {href}'
        assert parsed['deal_type'] == ['forsale']
        assert 'price_min' in parsed, f'price_min missing from {href}'
        assert parsed['price_min'] == ['500000']


async def test_pagination_links_exclude_page_param_duplication(client: httpx.AsyncClient):
    """page=1 from the current URL should not leak into pagination hrefs as a duplicate."""
    for i in range(25):
        await Listing(yad2_id=f'dup_{i}', deal_type=DealType.RENT, is_active=True).insert()

    resp: Response = await client.get(
        url='/listings',
        params={'deal_type': 'rent', 'page': '1'},
    )
    assert resp.status_code == 200

    hrefs: list[str] = _extract_pagination_hrefs(html=resp.text)
    for href in hrefs:
        parsed: dict[str, list[str]] = parse_qs(qs=urlparse(url=href).query)
        assert len(parsed.get('page', [])) == 1, f'Duplicate page param in {href}'


async def test_htmx_partial_pagination_includes_filters(client: httpx.AsyncClient):
    """HTMX partial responses must also carry filters in pagination links."""
    for i in range(25):
        await Listing(yad2_id=f'hx_{i}', deal_type=DealType.FORSALE, is_active=True).insert()

    resp: Response = await client.get(
        url='/listings',
        params={'deal_type': 'forsale', 'sort_by': 'price_asc'},
        headers={'HX-Request': 'true'},
    )
    assert resp.status_code == 200

    hrefs: list[str] = _extract_pagination_hrefs(html=resp.text)
    assert hrefs
    for href in hrefs:
        parsed: dict[str, list[str]] = parse_qs(qs=urlparse(url=href).query)
        assert parsed.get('deal_type') == ['forsale']
        assert parsed.get('sort_by') == ['price_asc']
