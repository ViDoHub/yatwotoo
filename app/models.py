from datetime import UTC, datetime
from enum import StrEnum
from typing import Annotated, Any

from beanie import Document, Indexed
from pydantic import BaseModel, Field

from app.consts import GEO_TYPE_POINT, JobStatus


class DealType(StrEnum):
    RENT = 'rent'
    FORSALE = 'forsale'
    NEW_PROJECTS = 'newprojects'


class AmenityFilter(StrEnum):
    PARKING = 'parking'
    ELEVATOR = 'elevator'
    BALCONY = 'balcony'
    PETS_ALLOWED = 'pets_allowed'
    AIR_CONDITIONING = 'air_conditioning'
    FURNISHED = 'furnished'
    SHELTER = 'shelter'


class Address(BaseModel):
    city: str = ''
    neighborhood: str = ''
    street: str = ''
    house_number: str = ''
    area: str = ''  # Yad2 area name (Hebrew)
    area_id: int = 0  # Yad2 area code
    top_area: str = ''  # Yad2 top-level area name
    top_area_id: int = 0  # Yad2 top-level area code


class GeoLocation(BaseModel):
    type: str = GEO_TYPE_POINT
    coordinates: list[float] = Field(default_factory=list)  # [lng, lat]


class Amenities(BaseModel):
    parking: bool | None = None
    elevator: bool | None = None
    balcony: bool | None = None
    pets_allowed: bool | None = None
    air_conditioning: bool | None = None
    furnished: bool | None = None
    accessible: bool | None = None
    bars: bool | None = None
    boiler: bool | None = None
    shelter: bool | None = None  # safe room (mamad)
    renovated: bool | None = None
    long_term: bool | None = None
    storage: bool | None = None  # warehouse / machsan
    for_partners: bool | None = None  # roommates allowed


class Listing(Document):
    yad2_id: Annotated[str, Indexed(unique=True)]
    deal_type: DealType = DealType.RENT
    address: Address = Field(default_factory=Address)
    rooms: float | None = None
    floor: int | None = None
    sqm: float | None = None
    price: int | None = None
    price_per_sqm: float | None = None
    amenities: Amenities = Field(default_factory=Amenities)
    location: GeoLocation | None = None
    description: str = ''
    images: list[str] = Field(default_factory=list)
    url: str = ''
    entry_date: str = ''  # move-in date or delivery date for new projects
    date_added: str = ''  # original publish date from Yad2
    date_updated: str = ''  # last updated date from Yad2
    project_name: str = ''  # for new projects
    property_tax: str = ''  # arnona per 2 months
    house_committee: str = ''  # va'ad bayit fee
    total_floors: int | None = None  # total floors in building
    contact_name: str = ''  # landlord/agent name
    parking_spots: int | None = None  # number of parking spots
    garden_area: int | None = None  # garden sqm
    payments_in_year: int | None = None  # payment installments
    first_seen_at: datetime = Field(default_factory=lambda: datetime(1970, 1, 1, tzinfo=UTC))
    last_seen_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
    is_active: bool = True

    class Settings:
        name = 'listings'
        indexes: list[str | list[tuple[str, str]]] = [
            'deal_type',
            'address.area_id',
            'address.top_area_id',
            'address.city',
            'address.neighborhood',
            'is_active',
            [('location', '2dsphere')],
        ]


class SavedSearch(Document):
    name: str
    filters: dict[str, Any] = Field(default_factory=dict)
    # Possible filter keys:
    # deal_type (rent/forsale/newprojects),
    # city, area_ids, top_area_ids, rooms_min, rooms_max,
    # price_min, price_max, sqm_min, sqm_max, floor_min, floor_max,
    # parking, elevator, balcony, pets_allowed,
    # center_lat, center_lng, radius_km
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))

    class Settings:
        name = 'saved_searches'


class PriceHistory(Document):
    listing_id: Annotated[str, Indexed()]
    price: int
    observed_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))

    class Settings:
        name = 'price_history'


class NotificationLog(Document):
    saved_search_id: str
    listing_id: str
    message_type: str  # "new_listing" or "price_drop"
    sent_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))

    class Settings:
        name = 'notification_logs'


class UserSettings(Document):
    # WhatsApp (Callmebot)
    whatsapp_enabled: bool = True
    whatsapp_phone: str = ''
    whatsapp_apikey: str = ''

    # Telegram
    telegram_enabled: bool = False
    telegram_bot_token: str = ''
    telegram_chat_id: str = ''

    # Email (SMTP)
    email_enabled: bool = False
    email_smtp_host: str = ''
    email_smtp_port: int = 587
    email_smtp_user: str = ''
    email_smtp_password: str = ''
    email_to: str = ''

    poll_interval_minutes: int = 15
    notifications_enabled: bool = True  # global kill switch

    class Settings:
        name = 'user_settings'


class ScrapeJob(Document):
    status: str = JobStatus.PENDING
    started_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
    completed_at: datetime | None = None
    current_region: int | None = None
    current_deal_type: str | None = None
    regions_completed: list[str] = Field(default_factory=list)  # ["rent:1", "rent:2", ...]
    total_fetched: int = 0
    total_new: int = 0
    total_price_drops: int = 0
    error: str | None = None

    class Settings:
        name = 'scrape_jobs'
