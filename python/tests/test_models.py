"""Tests for models (validation, defaults, edge cases)."""

from datetime import datetime

import pytest

from app.models import (
    Address,
    Amenities,
    DealType,
    GeoLocation,
    Listing,
    SavedSearch,
    ScrapeJob,
)


class TestDealType:
    def test_enum_values(self):
        assert DealType.RENT.value == 'rent'
        assert DealType.FORSALE.value == 'forsale'
        assert DealType.NEW_PROJECTS.value == 'newprojects'

    def test_from_string(self):
        assert DealType('rent') == DealType.RENT
        assert DealType('forsale') == DealType.FORSALE

    def test_invalid_raises(self):
        with pytest.raises(ValueError):
            DealType('invalid')


class TestAddress:
    def test_defaults(self):
        addr = Address()
        assert addr.city == ''
        assert addr.area_id == 0
        assert addr.top_area_id == 0

    def test_with_values(self):
        addr = Address(city='תל אביב', area_id=10, top_area_id=3)
        assert addr.city == 'תל אביב'


class TestAmenities:
    def test_defaults_all_none(self):
        a = Amenities()
        assert a.parking is None
        assert a.elevator is None
        assert a.balcony is None
        assert a.pets_allowed is None
        assert a.air_conditioning is None
        assert a.furnished is None
        assert a.shelter is None

    def test_partial_values(self):
        a = Amenities(parking=True, elevator=False)
        assert a.parking is True
        assert a.elevator is False
        assert a.shelter is None  # still None


class TestGeoLocation:
    def test_point_type(self):
        geo = GeoLocation(coordinates=[34.77, 32.06])
        assert geo.type == 'Point'
        assert geo.coordinates == [34.77, 32.06]

    def test_empty_default(self):
        geo = GeoLocation()
        assert geo.coordinates == []


class TestListing:
    def test_defaults(self):
        listing = Listing(yad2_id='test1')
        assert listing.deal_type == DealType.RENT
        assert listing.is_active is True
        assert listing.rooms is None
        assert listing.price is None
        assert listing.amenities.parking is None
        assert listing.images == []
        assert isinstance(listing.first_seen_at, datetime)
        assert isinstance(listing.last_seen_at, datetime)

    def test_price_per_sqm_calculated(self):
        """price_per_sqm is set externally, not auto-calculated in model."""
        listing = Listing(yad2_id='calc1', price=10000, sqm=100.0, price_per_sqm=100.0)
        assert listing.price_per_sqm == 100.0


class TestScrapeJob:
    def test_defaults(self):
        job = ScrapeJob()
        assert job.status == 'pending'
        assert job.completed_at is None
        assert job.regions_completed == []
        assert job.total_fetched == 0
        assert job.total_new == 0
        assert job.error is None


class TestSavedSearch:
    def test_defaults(self):
        ss = SavedSearch(name='test')
        assert ss.filters == {}
        assert ss.is_active is True
