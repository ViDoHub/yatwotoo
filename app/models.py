from datetime import datetime
from enum import Enum
from typing import Optional

from beanie import Document, Indexed
from pydantic import BaseModel, Field


class DealType(str, Enum):
    RENT = "rent"
    FORSALE = "forsale"
    NEW_PROJECTS = "newprojects"


class Address(BaseModel):
    city: str = ""
    neighborhood: str = ""
    street: str = ""
    house_number: str = ""
    area: str = ""  # Yad2 area name (Hebrew)
    area_id: int = 0  # Yad2 area code
    top_area: str = ""  # Yad2 top-level area name
    top_area_id: int = 0  # Yad2 top-level area code


class GeoLocation(BaseModel):
    type: str = "Point"
    coordinates: list[float] = Field(default_factory=list)  # [lng, lat]


class Amenities(BaseModel):
    parking: Optional[bool] = None
    elevator: Optional[bool] = None
    balcony: Optional[bool] = None
    pets_allowed: Optional[bool] = None
    air_conditioning: Optional[bool] = None
    furnished: Optional[bool] = None
    accessible: Optional[bool] = None
    bars: Optional[bool] = None
    boiler: Optional[bool] = None
    mamad: Optional[bool] = None  # safe room


class Listing(Document):
    yad2_id: Indexed(str, unique=True)
    deal_type: DealType = DealType.RENT
    address: Address = Field(default_factory=Address)
    rooms: Optional[float] = None
    floor: Optional[int] = None
    sqm: Optional[float] = None
    price: Optional[int] = None
    price_per_sqm: Optional[float] = None
    amenities: Amenities = Field(default_factory=Amenities)
    location: Optional[GeoLocation] = None
    description: str = ""
    images: list[str] = Field(default_factory=list)
    url: str = ""
    entry_date: str = ""  # move-in date or delivery date for new projects
    project_name: str = ""  # for new projects
    first_seen_at: datetime = Field(default_factory=datetime.utcnow)
    last_seen_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = True

    class Settings:
        name = "listings"
        indexes = [
            "deal_type",
            "address.area_id",
            "address.top_area_id",
            "address.city",
            "address.neighborhood",
            "is_active",
            [("location", "2dsphere")],
        ]


class SavedSearch(Document):
    name: str
    filters: dict = Field(default_factory=dict)
    # Possible filter keys:
    # deal_type (rent/forsale/newprojects),
    # city, area_ids, top_area_ids, rooms_min, rooms_max,
    # price_min, price_max, sqm_min, sqm_max, floor_min, floor_max,
    # parking, elevator, balcony, pets_allowed,
    # center_lat, center_lng, radius_km
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "saved_searches"


class PriceHistory(Document):
    listing_id: Indexed(str)
    price: int
    observed_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "price_history"


class NotificationLog(Document):
    saved_search_id: str
    listing_id: str
    message_type: str  # "new_listing" or "price_drop"
    sent_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "notification_logs"


class UserSettings(Document):
    # WhatsApp (Callmebot)
    whatsapp_enabled: bool = True
    whatsapp_phone: str = ""
    whatsapp_apikey: str = ""

    # Telegram
    telegram_enabled: bool = False
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    # Email (SMTP)
    email_enabled: bool = False
    email_smtp_host: str = ""
    email_smtp_port: int = 587
    email_smtp_user: str = ""
    email_smtp_password: str = ""
    email_to: str = ""

    poll_interval_minutes: int = 15
    notifications_enabled: bool = True  # global kill switch

    class Settings:
        name = "user_settings"


class ScrapeJob(Document):
    status: str = "running"  # running, completed, failed
    started_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    current_region: Optional[int] = None
    current_deal_type: Optional[str] = None
    regions_completed: list[str] = Field(default_factory=list)  # ["rent:1", "rent:2", ...]
    total_fetched: int = 0
    total_new: int = 0
    total_price_drops: int = 0
    error: Optional[str] = None

    class Settings:
        name = "scrape_jobs"
