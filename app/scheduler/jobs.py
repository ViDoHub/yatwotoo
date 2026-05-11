import asyncio
import logging
import random
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx

from app.consts import FilterParam, JobStatus
from app.models import DealType, Listing, SavedSearch, ScrapeJob
from app.notifications.dispatcher import notify_new_listing, notify_price_drop
from app.scraper.sync import upsert_listings
from app.scraper.yad2_client import REGIONS, _deep_fetch_region, fetch_all_listings, fetch_item_detail, parse_marker
from app.search.engine import match_saved_search

logger: logging.Logger = logging.getLogger(name=__name__)


def _build_scrape_params(filters: dict[str, Any]) -> tuple[dict[str, str], DealType, list[int] | None]:
    """Convert saved search filters to Yad2 API params.

    Returns (params_dict, deal_type, region_ids).
    """
    params: dict[str, str] = {}

    deal_type_str: str = filters.get(FilterParam.DEAL_TYPE, 'rent')
    try:
        deal_type: DealType = DealType(value=deal_type_str)
    except ValueError:
        deal_type = DealType.RENT

    # Region IDs (new API uses 'region' instead of topArea/area)
    region_ids: list[int] | None = None
    if (top_area_ids := filters.get(FilterParam.TOP_AREA_IDS)) and isinstance(top_area_ids, list) and top_area_ids:
        region_ids = [int(r) for r in top_area_ids]

    # Rooms range
    if rooms_min := filters.get(FilterParam.ROOMS_MIN):
        params['minRooms'] = rooms_min
    if rooms_max := filters.get(FilterParam.ROOMS_MAX):
        params['maxRooms'] = rooms_max

    # Price range
    if price_min := filters.get(FilterParam.PRICE_MIN):
        params['minPrice'] = price_min
    if price_max := filters.get(FilterParam.PRICE_MAX):
        params['maxPrice'] = price_max

    return params, deal_type, region_ids


async def poll_listings_job() -> None:
    """Periodic poll: incremental sync after initial full sync completes.

    - Before initial sync: skip entirely (manual /api/scrape handles it)
    - After initial sync: shallow fetch per region, deep-drill only on overflow (200 cap)
    - Notifications gated on initial sync completion
    """
    logger.info(msg='Starting listing poll job')

    # Check if initial full sync has ever completed
    initial_sync_done: ScrapeJob | None = await ScrapeJob.find_one(ScrapeJob.status == JobStatus.COMPLETED)
    if not initial_sync_done:
        logger.info(msg='No completed initial sync yet - skipping periodic poll (use /api/scrape)')
        return

    # Check if a manual scrape is currently running - avoid fighting
    running_job: ScrapeJob | None = await ScrapeJob.find_one(ScrapeJob.status == JobStatus.RUNNING)
    if running_job:
        logger.info(msg='A scrape job is already running - skipping periodic poll')
        return

    saved_searches: list[SavedSearch] = await SavedSearch.find(SavedSearch.is_active == True).to_list()  # noqa: E712

    # Incremental sync: shallow fetch per region for each deal type
    # Only deep-drill regions that return exactly 200 (overflow = more data)
    all_new: list[Listing] = []
    all_price_drops: list[Listing] = []

    for deal_type in [DealType.RENT, DealType.FORSALE]:
        for region_id in REGIONS:
            listings: list[Listing] = await fetch_all_listings(
                params={},
                deal_type=deal_type,
                region_ids=[region_id],
                deep=False,
            )
            if not listings:
                continue

            # If we hit the 200 cap, there might be more - do a deep fetch for this region
            if len(listings) >= 200:
                logger.info(msg=f'Region {region_id} {deal_type.value}: hit 200 cap, deep-drilling')
                listings = await fetch_all_listings(params={}, deal_type=deal_type, region_ids=[region_id], deep=True)

            new_listings, price_drops = await upsert_listings(listings=listings)
            all_new.extend(new_listings)
            all_price_drops.extend(price_drops)

    logger.info(msg=f'Incremental poll done: {len(all_new)} new, {len(all_price_drops)} price drops')

    # Send notifications for new/changed listings that match saved searches
    if not saved_searches:
        return

    for search in saved_searches:
        for listing in all_new:
            if await match_saved_search(filters=search.filters, listing=listing):
                await notify_new_listing(listing=listing, saved_search_id=str(search.id))

        for listing in all_price_drops:
            if await match_saved_search(filters=search.filters, listing=listing):
                from app.models import PriceHistory

                history: list[PriceHistory] = (
                    await PriceHistory.find(PriceHistory.listing_id == listing.yad2_id)
                    .sort([('observed_at', -1)])
                    .limit(2)
                    .to_list()
                )
                if len(history) >= 2:
                    old_price: int = history[1].price
                    await notify_price_drop(listing=listing, old_price=old_price, saved_search_id=str(search.id))

    logger.info(msg='Poll job complete')


async def cleanup_stale_listings_job() -> None:
    """Mark listings as inactive if not seen for 3 days."""
    cutoff: datetime = datetime.now(tz=UTC) - timedelta(days=3)

    result = await Listing.find(
        Listing.last_seen_at < cutoff,
        Listing.is_active == True,  # noqa: E712 - Beanie ODM requires explicit comparison
    ).update_many({'$set': {'is_active': False}})

    logger.info(msg=f'Cleanup: marked {result.modified_count} stale listings as inactive')


async def backup_db_job() -> None:
    """Dump MongoDB to a compressed archive. Retain backups for configured days."""
    import os

    from app.config import settings

    backup_dir: Path = Path(settings.backup_dir)
    backup_dir.mkdir(parents=True, exist_ok=True)

    timestamp: str = datetime.now(tz=UTC).strftime(format='%Y%m%d_%H%M%S')
    archive_path: Path = backup_dir / f'{settings.mongodb_db}_{timestamp}.gz'

    cmd: list[str] = [
        'mongodump',
        f'--uri={settings.mongodb_url}',
        f'--db={settings.mongodb_db}',
        f'--archive={archive_path}',
        '--gzip',
    ]

    proc: asyncio.subprocess.Process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()

    if proc.returncode != 0:
        logger.error(msg=f'mongodump failed: {stderr.decode()}')
        return

    logger.info(msg=f'DB backup saved to {archive_path}')

    # Remove backups older than retention period
    cutoff: datetime = datetime.now(tz=UTC) - timedelta(days=settings.backup_retention_days)
    for f in backup_dir.glob(pattern=f'{settings.mongodb_db}_*.gz'):
        if datetime.fromtimestamp(timestamp=os.path.getmtime(filename=f), tz=UTC) < cutoff:
            f.unlink()
            logger.info(msg=f'Removed old backup: {f}')


async def enrich_amenities_job(batch_size: int = 5000) -> None:
    """Fetch amenity details and descriptions for un-enriched listings.

    Processes up to batch_size listings per run with concurrent requests
    (bounded by a local semaphore) and per-request rate limiting.
    Listings with all-None amenities are considered un-enriched.
    """
    from app.config import settings

    query: dict[str, bool | None] = {
        'is_active': True,
        'amenities.parking': None,
        'amenities.elevator': None,
        'amenities.shelter': None,
    }

    listings: list[Listing] = await Listing.find(query).limit(batch_size).to_list()

    if not listings:
        logger.info(msg='Amenity enrichment: no un-enriched listings found')
        return

    total: int = len(listings)
    logger.info(msg=f'Amenity enrichment: processing {total} listings')

    enriched: int = 0
    failed: int = 0
    sem: asyncio.Semaphore = asyncio.Semaphore(value=5)

    async def _enrich_one(listing: Listing, client: httpx.AsyncClient) -> bool:
        async with sem:
            await asyncio.sleep(delay=random.uniform(a=settings.request_delay_min, b=settings.request_delay_max))
            detail = await fetch_item_detail(token=listing.yad2_id, client=client)
        if detail:
            listing.amenities = detail.amenities
            if detail.description:
                listing.description = detail.description
            if detail.images:
                listing.images = detail.images
            if detail.entry_date:
                listing.entry_date = detail.entry_date
            if detail.date_added:
                listing.date_added = detail.date_added
            if detail.date_updated:
                listing.date_updated = detail.date_updated
            if detail.property_tax:
                listing.property_tax = detail.property_tax
            if detail.house_committee:
                listing.house_committee = detail.house_committee
            if detail.total_floors is not None:
                listing.total_floors = detail.total_floors
            if detail.contact_name:
                listing.contact_name = detail.contact_name
            if detail.parking_spots is not None:
                listing.parking_spots = detail.parking_spots
            if detail.garden_area is not None:
                listing.garden_area = detail.garden_area
            if detail.payments_in_year is not None:
                listing.payments_in_year = detail.payments_in_year
            await listing.save()
            return True
        return False

    async with httpx.AsyncClient(timeout=15.0) as client:
        for i in range(0, total, 50):
            chunk: list[Listing] = listings[i : i + 50]
            results: list[bool] = await asyncio.gather(
                *[_enrich_one(listing=item, client=client) for item in chunk],
            )
            enriched += sum(results)
            failed += len(results) - sum(results)
            logger.info(msg=f'Amenity enrichment progress: {enriched + failed}/{total}')

    logger.info(msg=f'Amenity enrichment done: {enriched} enriched, {failed} failed')


async def run_deep_scrape(job_id: str) -> None:
    """Execute a deep scrape for all regions and deal types, updating job progress.

    Runs multiple region+deal_type combinations concurrently (bounded by
    the global API semaphore in yad2_client).
    """
    job: ScrapeJob | None = await ScrapeJob.get(document_id=job_id)
    if not job:
        return

    job.status = JobStatus.RUNNING
    await job.save()

    job_lock: asyncio.Lock = asyncio.Lock()

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:

            async def _scrape_step(deal_type: DealType, region_id: int) -> None:
                step_key: str = f'{deal_type.value}:{region_id}'

                if step_key in job.regions_completed:
                    return

                logger.info(msg=f'[Job {job_id}] Deep scraping {deal_type.value} region {region_id}')

                async def on_chunk(chunk_markers: list[dict[str, Any]], _deal_type: DealType = deal_type) -> None:
                    listings: list[Listing] = [
                        parsed
                        for m in chunk_markers
                        if (parsed := parse_marker(marker=m, deal_type=_deal_type)) is not None
                    ]
                    if listings:
                        new_listings, price_drops = await upsert_listings(listings=listings)
                        async with job_lock:
                            job.total_fetched += len(listings)
                            job.total_new += len(new_listings)
                            job.total_price_drops += len(price_drops)
                            await job.save()

                await _deep_fetch_region(
                    region_id=region_id,
                    deal_type=deal_type,
                    api_params={},
                    client=client,
                    on_chunk=on_chunk,
                )

                async with job_lock:
                    job.regions_completed.append(step_key)
                    await job.save()

            tasks: list[asyncio.Task[None]] = [
                asyncio.create_task(coro=_scrape_step(deal_type=deal_type, region_id=region_id))
                for deal_type in [DealType.RENT, DealType.FORSALE]
                for region_id in REGIONS
            ]
            await asyncio.gather(*tasks)

        job.status = JobStatus.COMPLETED
        job.completed_at = datetime.now(tz=UTC)
        job.current_region = None
        job.current_deal_type = None
        await job.save()
        logger.info(msg=f'[Job {job_id}] Scrape completed: {job.total_fetched} fetched, {job.total_new} new')

    except Exception as e:
        logger.error(msg=f'[Job {job_id}] Scrape failed: {e}')
        job.status = JobStatus.FAILED
        job.error = str(object=e)
        job.completed_at = datetime.now(tz=UTC)
        await job.save()
