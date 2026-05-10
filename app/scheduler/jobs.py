import logging
from datetime import datetime, timedelta

from app.models import DealType, Listing, SavedSearch, ScrapeJob
from app.notifications.dispatcher import notify_new_listing, notify_price_drop
from app.scraper.sync import upsert_listings
from app.scraper.yad2_client import REGIONS, fetch_all_listings, fetch_item_detail
from app.search.engine import match_saved_search

logger = logging.getLogger(__name__)


def _build_scrape_params(filters: dict) -> tuple[dict, DealType, list[int] | None]:
    """Convert saved search filters to Yad2 API params.

    Returns (params_dict, deal_type, region_ids).
    """
    params: dict[str, str] = {}

    deal_type_str = filters.get('deal_type', 'rent')
    try:
        deal_type = DealType(deal_type_str)
    except ValueError:
        deal_type = DealType.RENT

    # Region IDs (new API uses 'region' instead of topArea/area)
    region_ids = None
    if (top_area_ids := filters.get('top_area_ids')) and isinstance(top_area_ids, list) and top_area_ids:
        region_ids = [int(r) for r in top_area_ids]

    # Rooms range
    if rooms_min := filters.get('rooms_min'):
        params['minRooms'] = rooms_min
    if rooms_max := filters.get('rooms_max'):
        params['maxRooms'] = rooms_max

    # Price range
    if price_min := filters.get('price_min'):
        params['minPrice'] = price_min
    if price_max := filters.get('price_max'):
        params['maxPrice'] = price_max

    return params, deal_type, region_ids


async def poll_listings_job() -> None:
    """Periodic poll: incremental sync after initial full sync completes.

    - Before initial sync: skip entirely (manual /api/scrape handles it)
    - After initial sync: shallow fetch per region, deep-drill only on overflow (200 cap)
    - Notifications gated on initial sync completion
    """
    logger.info('Starting listing poll job')

    # Check if initial full sync has ever completed
    initial_sync_done = await ScrapeJob.find_one(ScrapeJob.status == 'completed')
    if not initial_sync_done:
        logger.info('No completed initial sync yet - skipping periodic poll (use /api/scrape)')
        return

    # Check if a manual scrape is currently running - avoid fighting
    running_job = await ScrapeJob.find_one(ScrapeJob.status == 'running')
    if running_job:
        logger.info('A scrape job is already running - skipping periodic poll')
        return

    saved_searches = await SavedSearch.find(SavedSearch.is_active == True).to_list()  # noqa: E712

    # Incremental sync: shallow fetch per region for each deal type
    # Only deep-drill regions that return exactly 200 (overflow = more data)
    all_new: list[Listing] = []
    all_price_drops: list[Listing] = []

    for deal_type in [DealType.RENT, DealType.FORSALE]:
        for region_id in REGIONS:
            listings = await fetch_all_listings({}, deal_type=deal_type, region_ids=[region_id], deep=False)
            if not listings:
                continue

            # If we hit the 200 cap, there might be more - do a deep fetch for this region
            if len(listings) >= 200:
                logger.info(f'Region {region_id} {deal_type.value}: hit 200 cap, deep-drilling')
                listings = await fetch_all_listings({}, deal_type=deal_type, region_ids=[region_id], deep=True)

            new_listings, price_drops = await upsert_listings(listings)
            all_new.extend(new_listings)
            all_price_drops.extend(price_drops)

    logger.info(f'Incremental poll done: {len(all_new)} new, {len(all_price_drops)} price drops')

    # Send notifications for new/changed listings that match saved searches
    if not saved_searches:
        return

    for search in saved_searches:
        for listing in all_new:
            if await match_saved_search(search.filters, listing):
                await notify_new_listing(listing, str(search.id))

        for listing in all_price_drops:
            if await match_saved_search(search.filters, listing):
                from app.models import PriceHistory

                history = (
                    await PriceHistory.find(PriceHistory.listing_id == listing.yad2_id)
                    .sort([('observed_at', -1)])
                    .limit(2)
                    .to_list()
                )
                if len(history) >= 2:
                    old_price = history[1].price
                    await notify_price_drop(listing, old_price, str(search.id))

    logger.info('Poll job complete')


async def cleanup_stale_listings_job() -> None:
    """Mark listings as inactive if not seen for 3 days."""
    cutoff = datetime.utcnow() - timedelta(days=3)

    result = await Listing.find(
        Listing.last_seen_at < cutoff,
        Listing.is_active == True,  # noqa: E712 - Beanie ODM requires explicit comparison
    ).update_many({'$set': {'is_active': False}})

    logger.info(f'Cleanup: marked {result.modified_count} stale listings as inactive')


async def backup_db_job() -> None:
    """Dump MongoDB to a compressed archive. Retain backups for configured days."""
    import asyncio
    import os
    from pathlib import Path

    from app.config import settings

    backup_dir = Path(settings.backup_dir)
    backup_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
    archive_path = backup_dir / f'{settings.mongodb_db}_{timestamp}.gz'

    cmd = [
        'mongodump',
        f'--uri={settings.mongodb_url}',
        f'--db={settings.mongodb_db}',
        f'--archive={archive_path}',
        '--gzip',
    ]

    proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    _, stderr = await proc.communicate()

    if proc.returncode != 0:
        logger.error(f'mongodump failed: {stderr.decode()}')
        return

    logger.info(f'DB backup saved to {archive_path}')

    # Remove backups older than retention period
    cutoff = datetime.utcnow() - timedelta(days=settings.backup_retention_days)
    for f in backup_dir.glob(f'{settings.mongodb_db}_*.gz'):
        if datetime.fromtimestamp(os.path.getmtime(f)) < cutoff:
            f.unlink()
            logger.info(f'Removed old backup: {f}')


async def enrich_amenities_job(batch_size: int = 1000) -> None:
    """Fetch amenity details for listings that haven't been enriched yet.

    Processes up to batch_size listings per run, with rate limiting.
    Listings with all-None amenities are considered un-enriched.
    """
    import httpx

    from app.config import settings

    # Find listings where all amenity fields are None (never enriched)
    query = {
        'is_active': True,
        'amenities.parking': None,
        'amenities.elevator': None,
        'amenities.mamad': None,
    }

    listings = await Listing.find(query).limit(batch_size).to_list()

    if not listings:
        logger.info('Amenity enrichment: no un-enriched listings found')
        return

    logger.info(f'Amenity enrichment: processing {len(listings)} listings')

    enriched = 0
    failed = 0

    async with httpx.AsyncClient(timeout=15.0) as client:
        for listing in listings:
            amenities = await fetch_item_detail(listing.yad2_id, client=client)
            if amenities:
                listing.amenities = amenities
                await listing.save()
                enriched += 1
            else:
                failed += 1

            # Rate limit: respect Yad2 servers
            delay = (
                settings.request_delay_min
                + (settings.request_delay_max - settings.request_delay_min) * __import__('random').random()
            )
            await __import__('asyncio').sleep(delay)

    logger.info(f'Amenity enrichment done: {enriched} enriched, {failed} failed')
