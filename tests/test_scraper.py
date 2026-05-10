"""Tests for the Yad2 scraper client (parsing, fetching, enrichment)."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.models import Amenities, DealType
from app.scraper.yad2_client import (
    _build_api_params,
    _parse_float,
    _parse_int,
    fetch_item_detail,
    fetch_region,
    parse_marker,
)


pytestmark = pytest.mark.asyncio


class TestParseMarker:
    """Test marker-to-Listing conversion."""

    def test_valid_marker(self, sample_marker):
        listing = parse_marker(sample_marker, deal_type=DealType.RENT)
        assert listing is not None
        assert listing.yad2_id == "xyz789"
        assert listing.deal_type == DealType.RENT
        assert listing.address.city == "חיפה"
        assert listing.address.neighborhood == "כרמל"
        assert listing.address.street == "הנשיא"
        assert listing.address.house_number == "5"
        assert listing.address.top_area == "צפון ועמקים"
        assert listing.address.top_area_id == 7
        assert listing.rooms == 3.5
        assert listing.floor == 3
        assert listing.sqm == 80.0
        assert listing.price == 5500
        assert listing.price_per_sqm == pytest.approx(68.75, rel=0.01)
        assert listing.location.coordinates == [34.98, 32.78]
        assert listing.url == "https://www.yad2.co.il/item/xyz789"

    def test_marker_without_token_returns_none(self, sample_marker):
        sample_marker["token"] = ""
        assert parse_marker(sample_marker) is None

    def test_marker_missing_token_key_returns_none(self):
        assert parse_marker({}) is None

    def test_marker_with_missing_optional_fields(self):
        """Marker with minimal data should still parse."""
        marker = {"token": "minimal1", "address": {}, "additionalDetails": {}, "metaData": {}}
        listing = parse_marker(marker)
        assert listing is not None
        assert listing.yad2_id == "minimal1"
        assert listing.rooms is None
        assert listing.floor is None
        assert listing.sqm is None
        assert listing.price is None
        assert listing.location is None

    def test_marker_with_zero_price(self, sample_marker):
        sample_marker["price"] = 0
        listing = parse_marker(sample_marker)
        # _parse_int(0) returns 0, price_per_sqm should be None since price is 0
        assert listing.price == 0
        assert listing.price_per_sqm is None  # 0 / sqm check: if price and sqm -> False

    def test_marker_with_no_coords(self, sample_marker):
        sample_marker["address"]["coords"] = {}
        listing = parse_marker(sample_marker)
        assert listing.location is None

    def test_marker_images_from_cover(self):
        """Should use coverImage when images list is empty."""
        marker = {
            "token": "cover1",
            "address": {},
            "additionalDetails": {},
            "metaData": {"images": [], "coverImage": "https://img.yad2.co.il/cover.jpg"},
        }
        listing = parse_marker(marker)
        assert listing.images == ["https://img.yad2.co.il/cover.jpg"]

    def test_marker_forsale_deal_type(self, sample_marker):
        listing = parse_marker(sample_marker, deal_type=DealType.FORSALE)
        assert listing.deal_type == DealType.FORSALE

    def test_marker_with_string_floor(self, sample_marker):
        """Floor should handle string values gracefully."""
        sample_marker["address"]["house"]["floor"] = "5"
        listing = parse_marker(sample_marker)
        assert listing.floor == 5

    def test_marker_with_invalid_floor(self, sample_marker):
        """Non-numeric floor should not crash."""
        sample_marker["address"]["house"]["floor"] = "basement"
        listing = parse_marker(sample_marker)
        assert listing.floor is None

    def test_marker_with_house_number_zero(self, sample_marker):
        """house_number=0 is a valid value, should produce '0'."""
        sample_marker["address"]["house"]["number"] = 0
        listing = parse_marker(sample_marker)
        assert listing.address.house_number == "0"


class TestParseHelpers:
    """Test _parse_float and _parse_int."""

    def test_parse_float_valid(self):
        assert _parse_float("3.5") == 3.5
        assert _parse_float(3) == 3.0
        assert _parse_float("0") == 0.0

    def test_parse_float_none(self):
        assert _parse_float(None) is None

    def test_parse_float_invalid(self):
        assert _parse_float("abc") is None
        assert _parse_float("") is None

    def test_parse_int_valid(self):
        assert _parse_int("42") == 42
        assert _parse_int(7) == 7
        assert _parse_int("0") == 0

    def test_parse_int_none(self):
        assert _parse_int(None) is None

    def test_parse_int_invalid(self):
        assert _parse_int("abc") is None
        assert _parse_int("3.5") == 3  # truncates float strings to int
        assert _parse_int("abc") is None


class TestBuildApiParams:
    """Test filter-to-API-param conversion."""

    def test_empty_filters(self):
        assert _build_api_params({}) == {}

    def test_rooms_params(self):
        params = _build_api_params({"rooms_min": 2, "rooms_max": 4})
        assert params == {"minRooms": 2, "maxRooms": 4}

    def test_price_params(self):
        params = _build_api_params({"price_min": 3000, "price_max": 8000})
        assert params == {"minPrice": 3000, "maxPrice": 8000}

    def test_mixed_params(self):
        params = _build_api_params({
            "rooms_min": 3,
            "price_max": 10000,
            "city": "ignored",  # not handled by _build_api_params
        })
        assert params == {"minRooms": 3, "maxPrice": 10000}


class TestFetchRegion:
    """Test fetch_region with mocked HTTP."""

    async def test_successful_fetch(self):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "data": {"markers": [{"token": "m1"}, {"token": "m2"}]}
        }

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)

        markers = await fetch_region(1, DealType.RENT, client=mock_client)
        assert len(markers) == 2
        assert markers[0]["token"] == "m1"

    async def test_non_200_returns_empty(self):
        mock_response = MagicMock()
        mock_response.status_code = 403

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)

        markers = await fetch_region(1, DealType.RENT, client=mock_client)
        assert markers == []

    async def test_http_error_returns_empty(self):
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=httpx.ConnectError("timeout"))

        markers = await fetch_region(1, DealType.RENT, client=mock_client)
        assert markers == []

    async def test_includes_region_param(self):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"data": {"markers": []}}

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)

        await fetch_region(5, DealType.FORSALE, params={"minRooms": 3}, client=mock_client)

        call_kwargs = mock_client.get.call_args
        assert call_kwargs.kwargs["params"]["region"] == 5
        assert call_kwargs.kwargs["params"]["minRooms"] == 3


class TestFetchItemDetail:
    """Test amenity enrichment with mocked HTTP."""

    async def test_successful_detail_fetch(self, sample_detail_response):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = sample_detail_response

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)

        amenities = await fetch_item_detail("token123", client=mock_client)
        assert amenities is not None
        assert amenities.air_conditioning is True
        assert amenities.elevator is True
        assert amenities.mamad is True
        assert amenities.pets_allowed is False
        assert amenities.furnished is True
        assert amenities.parking is True
        assert amenities.balcony is True  # balconies=2 > 0

    async def test_rate_limit_with_backoff(self):
        """Should retry on 429 with exponential backoff."""
        response_429 = MagicMock()
        response_429.status_code = 429

        response_200 = MagicMock()
        response_200.status_code = 200
        response_200.json.return_value = {"data": {"additional_info_items_v2": [], "parking": "0"}}

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=[response_429, response_200])

        with patch("app.scraper.yad2_client.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            amenities = await fetch_item_detail("token123", client=mock_client, _retries=3)

        assert amenities is not None
        # Should have slept 30s on first attempt
        mock_sleep.assert_called_once_with(30)

    async def test_all_retries_exhausted_returns_none(self):
        """Should return None after all retries fail."""
        response_429 = MagicMock()
        response_429.status_code = 429

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=response_429)

        with patch("app.scraper.yad2_client.asyncio.sleep", new_callable=AsyncMock):
            amenities = await fetch_item_detail("token123", client=mock_client, _retries=2)

        assert amenities is None

    async def test_non_retryable_error_returns_none(self):
        """Non-429/403 errors should not retry."""
        response_500 = MagicMock()
        response_500.status_code = 500

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=response_500)

        amenities = await fetch_item_detail("token123", client=mock_client)
        assert amenities is None
        # Should only have been called once (no retry)
        assert mock_client.get.call_count == 1

    async def test_parking_zero_is_false(self):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "data": {"additional_info_items_v2": [], "parking": "0", "balconies": "0"}
        }

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)

        amenities = await fetch_item_detail("token123", client=mock_client)
        assert amenities.parking is False
        assert amenities.balcony is False

    async def test_parking_non_digit_is_false(self):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "data": {"additional_info_items_v2": [], "parking": "none"}
        }

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)

        amenities = await fetch_item_detail("token123", client=mock_client)
        assert amenities.parking is False

    async def test_network_error_returns_none(self):
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=httpx.ConnectError("connection refused"))

        amenities = await fetch_item_detail("token123", client=mock_client)
        assert amenities is None
