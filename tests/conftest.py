"""Shared test fixtures for the yad2-search application."""

import pytest
import pytest_asyncio
from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

from app.models import (
    Address,
    Amenities,
    DealType,
    GeoLocation,
    Listing,
    NotificationLog,
    PriceHistory,
    SavedSearch,
    ScrapeJob,
    UserSettings,
)

DOCUMENT_MODELS = [Listing, SavedSearch, PriceHistory, NotificationLog, UserSettings, ScrapeJob]


@pytest_asyncio.fixture(autouse=True)
async def setup_beanie():
    """Initialize Beanie with a clean test database before each test."""
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client['yad2search_test']
    await init_beanie(database=db, document_models=DOCUMENT_MODELS)
    # Clean all collections before each test
    for model in DOCUMENT_MODELS:
        await model.get_motor_collection().drop()
    yield
    # Cleanup after test
    for model in DOCUMENT_MODELS:
        await model.get_motor_collection().drop()
    client.close()


@pytest.fixture
def sample_address():
    return Address(
        city='תל אביב',
        neighborhood='פלורנטין',
        street='שלמה',
        house_number='10',
        area='תל אביב',
        area_id=10,
        top_area='תל אביב והסביבה',
        top_area_id=3,
    )


@pytest.fixture
def sample_amenities():
    return Amenities(
        parking=True,
        elevator=True,
        balcony=False,
        pets_allowed=True,
        air_conditioning=True,
        furnished=False,
        shelter=True,
    )


@pytest.fixture
def sample_location():
    return GeoLocation(coordinates=[34.77, 32.06])


@pytest.fixture
def sample_listing(sample_address, sample_amenities, sample_location):
    return Listing(
        yad2_id='abc123',
        deal_type=DealType.RENT,
        address=sample_address,
        rooms=3.0,
        floor=4,
        sqm=75.0,
        price=6000,
        price_per_sqm=80.0,
        amenities=sample_amenities,
        location=sample_location,
        description='Nice apartment',
        images=['https://img.yad2.co.il/1.jpg'],
        url='https://www.yad2.co.il/item/abc123',
        is_active=True,
    )


@pytest.fixture
def sample_forsale_listing(sample_address, sample_location):
    return Listing(
        yad2_id='sale456',
        deal_type=DealType.FORSALE,
        address=sample_address,
        rooms=4.0,
        floor=7,
        sqm=100.0,
        price=2500000,
        price_per_sqm=25000.0,
        amenities=Amenities(parking=True, elevator=True, shelter=True),
        location=sample_location,
        url='https://www.yad2.co.il/item/sale456',
        is_active=True,
    )


@pytest.fixture
def sample_marker():
    """Raw marker dict as returned by Yad2 map feed API."""
    return {
        'token': 'xyz789',
        'price': 5500,
        'address': {
            'city': {'text': 'חיפה'},
            'neighborhood': {'text': 'כרמל'},
            'street': {'text': 'הנשיא'},
            'house': {'number': 5, 'floor': 3},
            'coords': {'lat': 32.78, 'lon': 34.98},
            'area': {'text': 'חיפה'},
            'region': {'text': 'צפון ועמקים', 'id': 7},
        },
        'additionalDetails': {
            'roomsCount': '3.5',
            'squareMeter': '80',
        },
        'metaData': {
            'images': ['https://img.yad2.co.il/test.jpg'],
        },
    }


@pytest.fixture
def sample_detail_response():
    """Raw JSON response from Yad2 item detail API."""
    return {
        'data': {
            'additional_info_items_v2': [
                {'key': 'air_conditioner', 'value': True},
                {'key': 'elevator', 'value': True},
                {'key': 'shelter', 'value': True},
                {'key': 'pets', 'value': False},
                {'key': 'furniture', 'value': True},
                {'key': 'bars', 'value': False},
            ],
            'parking': '1',
            'balconies': '2',
        }
    }
