import logging
from datetime import UTC, datetime
from typing import Any

from app.models import Listing, PriceHistory

logger: logging.Logger = logging.getLogger(name=__name__)


async def upsert_listings(listings: list[Listing]) -> tuple[list[Listing], list[Listing]]:
    """Upsert listings into the database.

    Returns (new_listings, price_changed_listings).
    """
    new_listings: list[Listing] = []
    price_changed: list[Listing] = []

    for listing in listings:
        existing = await Listing.find_one(Listing.yad2_id == listing.yad2_id)

        if existing is None:
            # New listing
            await listing.insert()
            new_listings.append(listing)

            # Record initial price
            if listing.price:
                await PriceHistory(
                    listing_id=listing.yad2_id,
                    price=listing.price,
                ).insert()
        else:
            # Update existing listing
            existing.last_seen_at = datetime.now(tz=UTC)
            existing.is_active = True

            # Check for price change
            if listing.price and existing.price and listing.price != existing.price:
                old_price = existing.price
                existing.price = listing.price
                existing.price_per_sqm = listing.price_per_sqm

                await PriceHistory(
                    listing_id=existing.yad2_id,
                    price=listing.price,
                ).insert()

                if listing.price < old_price:
                    price_changed.append(existing)

                logger.info(msg=f'Price change for {existing.yad2_id}: {old_price} -> {listing.price}')

            # Update other fields that might have changed
            existing.description = listing.description or existing.description
            existing.images = listing.images or existing.images
            if listing.amenities:
                existing.amenities = listing.amenities
            if listing.location:
                existing.location = listing.location

            await existing.save()

    logger.info(msg=f'Upsert complete: {len(new_listings)} new, {len(price_changed)} price drops')
    return new_listings, price_changed


async def deduplicate_listing(listing: Listing) -> bool:
    """Check if a listing is a duplicate of an existing one (republished with new ID).

    Returns True if it's a duplicate.
    """
    if not listing.address.street or not listing.rooms:
        return False

    # Look for existing listing with same address + rooms + sqm but different yad2_id
    query: dict[str, Any] = {
        'yad2_id': {'$ne': listing.yad2_id},
        'address.city': listing.address.city,
        'address.street': listing.address.street,
        'rooms': listing.rooms,
        'is_active': True,
    }

    if listing.sqm:
        query['sqm'] = listing.sqm

    existing = await Listing.find_one(query)
    return existing is not None
