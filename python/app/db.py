"""Shared database initialisation used by both the web process and the worker."""

import logging

from beanie import Document, init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

from app.config import settings
from app.models import Listing, NotificationLog, PriceHistory, SavedSearch, ScrapeJob, UserSettings

logger: logging.Logger = logging.getLogger(name=__name__)

DOCUMENT_MODELS: list[type[Document]] = [
    Listing,
    SavedSearch,
    PriceHistory,
    NotificationLog,
    UserSettings,
    ScrapeJob,
]


async def init_db() -> AsyncIOMotorClient:
    """Connect to MongoDB and initialise Beanie ODM.

    Returns the Motor client so callers can store / close it.
    """
    client: AsyncIOMotorClient = AsyncIOMotorClient(host=settings.mongodb_url)
    await init_beanie(
        database=client[settings.mongodb_db],
        document_models=DOCUMENT_MODELS,
    )
    logger.info(msg=f'Connected to MongoDB at {settings.mongodb_url}/{settings.mongodb_db}')
    return client
