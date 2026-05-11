"""Tests for the hide/unhide listing feature."""

from typing import Any
from unittest.mock import AsyncMock

import pytest
from _pytest.mark.structures import MarkDecorator
from starlette.responses import Response

from app.models import Address, DealType, Listing
from app.routes.api import hide_listing, unhide_listing
from app.search.engine import SearchFilters, search_listings
from tests.conftest import get_collection

pytestmark: MarkDecorator = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


async def _insert_listings() -> tuple[Listing, Listing, Listing]:
    """Insert three listings: one visible, one hidden, one inactive."""
    visible = Listing(
        yad2_id='visible1',
        deal_type=DealType.RENT,
        address=Address(city='תל אביב', area_id=10, top_area_id=3),
        price=5000,
        rooms=3.0,
        is_active=True,
        is_hidden=False,
    )
    hidden = Listing(
        yad2_id='hidden1',
        deal_type=DealType.RENT,
        address=Address(city='תל אביב', area_id=10, top_area_id=3),
        price=6000,
        rooms=4.0,
        is_active=True,
        is_hidden=True,
    )
    inactive = Listing(
        yad2_id='inactive1',
        deal_type=DealType.RENT,
        price=4000,
        is_active=False,
        is_hidden=False,
    )
    await visible.insert()
    await hidden.insert()
    await inactive.insert()
    return visible, hidden, inactive


# ---------------------------------------------------------------------------
# SearchFilters.build_query — is_hidden handling
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    argnames=('hidden_only', 'expected_is_hidden'),
    argvalues=[
        (False, {'$ne': True}),
        (True, True),
    ],
)
def test_build_query_hidden_flag(hidden_only: bool, expected_is_hidden: Any):  # noqa: FBT001
    query: dict[str, Any] = SearchFilters(filters={}).build_query(hidden_only=hidden_only)
    assert query['is_hidden'] == expected_is_hidden
    assert query['is_active'] is True


def test_build_query_hidden_only_with_filters():
    query: dict[str, Any] = SearchFilters(filters={'deal_type': 'rent', 'rooms_min': '3'}).build_query(hidden_only=True)
    assert query['is_hidden'] is True
    assert query['deal_type'] == 'rent'
    assert query['rooms']['$gte'] == 3


# ---------------------------------------------------------------------------
# search_listings — hidden_only integration
# ---------------------------------------------------------------------------


async def test_normal_search_excludes_hidden():
    _ = await _insert_listings()

    listings, total = await search_listings(filters={})
    assert total == 1
    yad2_ids: list[str] = [l.yad2_id for l in listings]
    assert 'visible1' in yad2_ids
    assert 'hidden1' not in yad2_ids


async def test_hidden_only_returns_only_hidden():
    _ = await _insert_listings()

    listings, total = await search_listings(filters={}, hidden_only=True)
    assert total == 1
    assert listings[0].yad2_id == 'hidden1'


async def test_hidden_only_excludes_inactive():
    """Hidden + inactive listing should not appear in hidden_only results."""
    await Listing(
        yad2_id='hidden_inactive',
        deal_type=DealType.RENT,
        price=3000,
        is_active=False,
        is_hidden=True,
    ).insert()

    _, total = await search_listings(filters={}, hidden_only=True)
    assert total == 0


async def test_hidden_only_with_deal_type_filter():
    await Listing(yad2_id='h_rent', deal_type=DealType.RENT, price=5000, is_active=True, is_hidden=True).insert()
    await Listing(yad2_id='h_sale', deal_type=DealType.FORSALE, price=2000000, is_active=True, is_hidden=True).insert()

    listings, total = await search_listings(filters={'deal_type': 'rent'}, hidden_only=True)
    assert total == 1
    assert listings[0].yad2_id == 'h_rent'


async def test_hidden_only_with_price_filter():
    await Listing(yad2_id='h_cheap', deal_type=DealType.RENT, price=3000, is_active=True, is_hidden=True).insert()
    await Listing(yad2_id='h_expensive', deal_type=DealType.RENT, price=9000, is_active=True, is_hidden=True).insert()

    listings, total = await search_listings(
        filters={'price_min': '4000', 'price_max': '10000'},
        hidden_only=True,
    )
    assert total == 1
    assert listings[0].yad2_id == 'h_expensive'


# ---------------------------------------------------------------------------
# Hide / unhide API endpoints
# ---------------------------------------------------------------------------


async def test_hide_listing():
    await Listing(yad2_id='to_hide', deal_type=DealType.RENT, price=5000, is_active=True).insert()

    mock_request = AsyncMock()
    mock_request.headers = {}
    response: Response = await hide_listing(request=mock_request, yad2_id='to_hide')

    assert response.status_code == 200
    listing = await Listing.find_one(Listing.yad2_id == 'to_hide')
    assert listing.is_hidden is True


async def test_unhide_listing():
    await Listing(yad2_id='to_unhide', deal_type=DealType.RENT, price=5000, is_active=True, is_hidden=True).insert()

    mock_request = AsyncMock()
    mock_request.headers = {}
    response: Response = await unhide_listing(request=mock_request, yad2_id='to_unhide')

    assert response.status_code == 200
    listing = await Listing.find_one(Listing.yad2_id == 'to_unhide')
    assert listing.is_hidden is False


@pytest.mark.parametrize(argnames='endpoint', argvalues=['hide_listing', 'unhide_listing'])
async def test_nonexistent_returns_404(endpoint: str):
    fn = {'hide_listing': hide_listing, 'unhide_listing': unhide_listing}[endpoint]
    mock_request = AsyncMock()
    mock_request.headers = {}
    response: Response = await fn(request=mock_request, yad2_id='nonexistent')
    assert response.status_code == 404


@pytest.mark.parametrize(
    argnames=('endpoint', 'initial_hidden'),
    argvalues=[
        ('hide_listing', False),
        ('unhide_listing', True),
    ],
)
async def test_htmx_returns_empty_html(endpoint: str, initial_hidden: bool):  # noqa: FBT001
    fn = {'hide_listing': hide_listing, 'unhide_listing': unhide_listing}[endpoint]
    await Listing(
        yad2_id='htmx_test',
        deal_type=DealType.RENT,
        price=5000,
        is_active=True,
        is_hidden=initial_hidden,
    ).insert()

    mock_request = AsyncMock()
    mock_request.headers = {'HX-Request': 'true'}
    response: Response = await fn(request=mock_request, yad2_id='htmx_test')

    assert response.status_code == 200
    assert response.body == b''


# ---------------------------------------------------------------------------
# Listing model default
# ---------------------------------------------------------------------------


def test_is_hidden_defaults_to_false():
    listing = Listing(yad2_id='default_test', deal_type=DealType.RENT, price=5000)
    assert listing.is_hidden is False


async def test_legacy_listing_without_field_excluded_by_ne_query():
    """Listings without is_hidden field should be treated as visible."""
    # Insert via raw motor to simulate pre-migration document without is_hidden
    collection = get_collection(model=Listing)
    await collection.insert_one(
        {
            'yad2_id': 'legacy_doc',
            'deal_type': 'rent',
            'price': 5000,
            'is_active': True,
            # no is_hidden field
        },
    )

    listings, total = await search_listings(filters={})
    assert total == 1
    assert listings[0].yad2_id == 'legacy_doc'

    # Should NOT appear in hidden_only
    _, total_h = await search_listings(filters={}, hidden_only=True)
    assert total_h == 0
