import asyncio
import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import Coroutine

import httpx
from fastapi import APIRouter, BackgroundTasks, Query, Request
from fastapi.responses import JSONResponse

from app.models import DealType, Listing, SavedSearch, ScrapeJob
from app.scraper.sync import upsert_listings
from app.scraper.yad2_client import (
    REGIONS,
    _deep_fetch_region,
    parse_marker,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix='/api')


@router.get('/markers')
async def get_markers(
    south: float = Query(None),
    west: float = Query(None),
    north: float = Query(None),
    east: float = Query(None),
    deal_type: str = Query(''),
    top_area_ids: str = Query(''),
    cities: str = Query(''),
    neighborhoods: str = Query(''),
    rooms_min: str = Query(''),
    rooms_max: str = Query(''),
    price_min: str = Query(''),
    price_max: str = Query(''),
    sqm_min: str = Query(''),
    sqm_max: str = Query(''),
    parking: str = Query(''),
    elevator: str = Query(''),
    balcony: str = Query(''),
    pets_allowed: str = Query(''),
    air_conditioning: str = Query(''),
    furnished: str = Query(''),
    shelter: str = Query(''),
) -> JSONResponse:
    """Return listing markers within a bounding box (viewport) with optional filters."""
    query: dict[str, Any] = {'is_active': True}

    # Only apply geo filter if bounds are provided
    if all(v is not None for v in (south, west, north, east)):
        query['location'] = {
            '$geoWithin': {
                '$geometry': {
                    'type': 'Polygon',
                    'coordinates': [
                        [
                            [west, south],
                            [east, south],
                            [east, north],
                            [west, north],
                            [west, south],
                        ]
                    ],
                }
            }
        }

    # Apply filters
    if deal_type:
        query['deal_type'] = deal_type
    if top_area_ids:
        ids: list[int] = [int(a) for a in top_area_ids.split(',') if a]
        if ids:
            query['address.top_area_id'] = {'$in': ids}
    if cities:
        city_list: list[str] = [c for c in cities.split(',') if c]
        if city_list:
            query['address.city'] = {'$in': city_list}
    if neighborhoods:
        hood_list: list[str] = [h for h in neighborhoods.split(',') if h]
        if hood_list:
            query['address.neighborhood'] = {'$in': hood_list}
    if rooms_min:
        query.setdefault('rooms', {})['$gte'] = float(rooms_min)
    if rooms_max:
        query.setdefault('rooms', {})['$lte'] = float(rooms_max)
    if price_min:
        query.setdefault('price', {})['$gte'] = int(price_min)
    if price_max:
        query.setdefault('price', {})['$lte'] = int(price_max)
    if sqm_min:
        query.setdefault('sqm', {})['$gte'] = float(sqm_min)
    if sqm_max:
        query.setdefault('sqm', {})['$lte'] = float(sqm_max)

    # Boolean amenities - match only True (confirmed)
    for param_name, param_val in [
        ('parking', parking),
        ('elevator', elevator),
        ('balcony', balcony),
        ('pets_allowed', pets_allowed),
        ('air_conditioning', air_conditioning),
        ('furnished', furnished),
        ('shelter', shelter),
    ]:
        if param_val:
            query[f'amenities.{param_name}'] = True

    # Use raw motor query for $geoWithin (Beanie's ODM doesn't natively support $box)
    collection = Listing.get_motor_collection()
    cursor = collection.find(
        query,
        {
            'yad2_id': 1,
            'location.coordinates': 1,
            'price': 1,
            'rooms': 1,
            'sqm': 1,
            'address.street': 1,
            'address.city': 1,
            'deal_type': 1,
        },
    ).limit(2000)

    markers: list[dict[str, Any]] = []
    async for doc in cursor:
        coords = doc.get('location', {}).get('coordinates', [])
        if len(coords) == 2:
            addr: dict[str, Any] = doc.get('address', {})
            street: str = addr.get('street', '')
            city: str = addr.get('city', '')
            address: str = f'{street}, {city}' if street else city

            markers.append(
                {
                    'lat': coords[1],
                    'lng': coords[0],
                    'price': doc.get('price'),
                    'rooms': doc.get('rooms'),
                    'sqm': doc.get('sqm'),
                    'address': address,
                    'yad2_id': doc.get('yad2_id'),
                }
            )

    return JSONResponse({'markers': markers, 'total': len(markers)})


async def _run_deep_scrape(job_id: str) -> None:
    """Background task: deep scrape all regions and deal types, updating job progress.

    Runs multiple region+deal_type combinations concurrently (bounded by
    the global API semaphore in yad2_client).
    """
    job: ScrapeJob | None = await ScrapeJob.get(job_id)
    if not job:
        return

    # Lock protects job counter updates from concurrent on_chunk callbacks
    job_lock: asyncio.Lock = asyncio.Lock()

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:

            async def _scrape_step(deal_type: DealType, region_id: int) -> None:
                step_key: str = f'{deal_type.value}:{region_id}'

                # Skip already-completed steps (resume support)
                if step_key in job.regions_completed:
                    return

                logger.info(f'[Job {job_id}] Deep scraping {deal_type.value} region {region_id}')

                async def on_chunk(chunk_markers: list[dict[str, Any]], _deal_type: DealType = deal_type) -> None:
                    """Called every ~200 markers - upsert to DB and update job."""
                    listings = [
                        parsed for m in chunk_markers if (parsed := parse_marker(m, deal_type=_deal_type)) is not None
                    ]
                    if listings:
                        new_listings, price_drops = await upsert_listings(listings)
                        async with job_lock:
                            job.total_fetched += len(listings)
                            job.total_new += len(new_listings)
                            job.total_price_drops += len(price_drops)
                            await job.save()

                await _deep_fetch_region(region_id, deal_type, {}, client, on_chunk=on_chunk)

                async with job_lock:
                    job.regions_completed.append(step_key)
                    await job.save()

            # Build all region+deal_type tasks
            tasks: list[Coroutine[Any, Any, None]] = [
                _scrape_step(deal_type, region_id)
                for deal_type in [DealType.RENT, DealType.FORSALE]
                for region_id in REGIONS
            ]
            await asyncio.gather(*tasks)

        job.status = 'completed'
        job.completed_at = datetime.now(UTC)
        job.current_region = None
        job.current_deal_type = None
        await job.save()
        logger.info(f'[Job {job_id}] Scrape completed: {job.total_fetched} fetched, {job.total_new} new')

    except Exception as e:
        logger.error(f'[Job {job_id}] Scrape failed: {e}')
        job.status = 'failed'
        job.error = str(e)
        job.completed_at = datetime.now(UTC)
        await job.save()


@router.post('/scrape')
async def trigger_scrape(
    background_tasks: BackgroundTasks,
    *,
    resume: bool = Query(default=False, description="Resume from last failed job's progress"),
) -> JSONResponse:
    """Kick off a deep scrape in the background. Returns immediately with job ID."""
    # Check if a scrape is already running
    running: ScrapeJob | None = await ScrapeJob.find_one(ScrapeJob.status == 'running')
    if running:
        return JSONResponse(
            {
                'status': 'already_running',
                'job_id': str(running.id),
                'message': 'A scrape is already in progress.',
            }
        )

    job: ScrapeJob = ScrapeJob()

    if resume:
        # Find most recent failed/cancelled job with progress to resume from
        prev: ScrapeJob | None = await ScrapeJob.find_one(
            {'status': {'$in': ['failed', 'cancelled']}, 'regions_completed': {'$ne': []}},
            sort=[('started_at', -1)],
        )
        if prev:
            job.regions_completed = prev.regions_completed
            job.total_fetched = prev.total_fetched
            job.total_new = prev.total_new
            job.total_price_drops = prev.total_price_drops
            # Mark the old job as "resumed" so it won't be picked up again
            prev.status = 'resumed'
            await prev.save()
            logger.info(f'Resuming from job {prev.id}: {len(prev.regions_completed)} steps already done')

    await job.insert()

    background_tasks.add_task(_run_deep_scrape, str(job.id))

    return JSONResponse(
        {
            'status': 'started',
            'job_id': str(job.id),
            'message': 'Scrape started in background.',
        }
    )


@router.get('/scrape/status')
async def scrape_status() -> JSONResponse:
    """Return current/last scrape job status and listing counts."""
    job: ScrapeJob | None = await ScrapeJob.find_one(
        {},
        sort=[('started_at', -1)],
    )

    total_listings: int = await Listing.find(Listing.is_active == True).count()  # noqa: E712
    rent_count: int = await Listing.find(Listing.is_active == True, Listing.deal_type == DealType.RENT).count()  # noqa: E712
    forsale_count: int = await Listing.find(Listing.is_active == True, Listing.deal_type == DealType.FORSALE).count()  # noqa: E712

    result: dict[str, Any] = {
        'total_listings': total_listings,
        'rent_count': rent_count,
        'forsale_count': forsale_count,
    }

    if job:
        total_steps: int = len(REGIONS) * 2  # 8 regions x 2 deal types
        result['job'] = {
            'id': str(job.id),
            'status': job.status,
            'started_at': job.started_at.isoformat(),
            'completed_at': job.completed_at.isoformat() if job.completed_at else None,
            'regions_completed': len(job.regions_completed),
            'total_steps': total_steps,
            'progress_pct': round(len(job.regions_completed) / total_steps * 100),
            'total_fetched': job.total_fetched,
            'total_new': job.total_new,
            'total_price_drops': job.total_price_drops,
            'error': job.error,
        }
    else:
        result['job'] = None

    return JSONResponse(result)


@router.get('/neighborhoods')
async def get_neighborhoods(cities: str = Query('', description='Comma-separated city names')) -> JSONResponse:
    """Return distinct neighborhoods for the given cities."""
    query: dict[str, Any] = {'is_active': True, 'address.neighborhood': {'$ne': ''}}
    if cities:
        city_list: list[str] = [c.strip() for c in cities.split(',') if c.strip()]
        if city_list:
            query['address.city'] = {'$in': city_list}

    collection = Listing.get_motor_collection()
    pipeline: list[dict[str, Any]] = [
        {'$match': query},
        {'$group': {'_id': {'city': '$address.city', 'hood': '$address.neighborhood'}, 'count': {'$sum': 1}}},
        {'$sort': {'_id.city': 1, '_id.hood': 1}},
    ]
    results: list[dict[str, Any]] = []
    async for doc in collection.aggregate(pipeline):
        results.append(
            {
                'city': doc['_id']['city'],
                'name': doc['_id']['hood'],
                'count': doc['count'],
            }
        )
    return JSONResponse(results)


@router.post('/searches')
async def save_search_api(request: Request) -> JSONResponse:
    """Save current listing filters as a new saved search (JSON API).

    If a search with the same name already exists, updates its filters.
    """
    body: dict[str, Any] = await request.json()
    name: str = body.get('name', '').strip() or 'Saved Search'
    filters: dict[str, Any] = body.get('filters', {})

    # Sanitize: only allow known filter keys
    allowed_keys: set[str] = {
        'deal_type',
        'cities',
        'top_area_ids',
        'area_ids',
        'neighborhoods',
        'rooms_min',
        'rooms_max',
        'price_min',
        'price_max',
        'sqm_min',
        'sqm_max',
        'floor_min',
        'floor_max',
        'parking',
        'elevator',
        'balcony',
        'pets_allowed',
        'air_conditioning',
        'furnished',
        'shelter',
        'center_lat',
        'center_lng',
        'radius_km',
    }
    clean_filters: dict[str, Any] = {k: v for k, v in filters.items() if k in allowed_keys and v}

    # Upsert: update existing search with same name, or create new
    existing: SavedSearch | None = await SavedSearch.find_one(SavedSearch.name == name)
    if existing:
        existing.filters = clean_filters
        existing.is_active = True
        await existing.save()
        return JSONResponse({'status': 'updated', 'id': str(existing.id), 'name': name})

    search: SavedSearch = SavedSearch(name=name, filters=clean_filters)
    await search.insert()
    return JSONResponse({'status': 'saved', 'id': str(search.id), 'name': name})


@router.put('/searches/{search_id}')
async def update_search_api(search_id: str, request: Request) -> JSONResponse:
    """Update an existing saved search's filters by ID."""
    from beanie import PydanticObjectId

    body: dict[str, Any] = await request.json()
    filters: dict[str, Any] = body.get('filters', {})

    allowed_keys: set[str] = {
        'deal_type',
        'cities',
        'top_area_ids',
        'area_ids',
        'neighborhoods',
        'rooms_min',
        'rooms_max',
        'price_min',
        'price_max',
        'sqm_min',
        'sqm_max',
        'floor_min',
        'floor_max',
        'parking',
        'elevator',
        'balcony',
        'pets_allowed',
        'air_conditioning',
        'furnished',
        'shelter',
        'center_lat',
        'center_lng',
        'radius_km',
    }
    clean_filters: dict[str, Any] = {k: v for k, v in filters.items() if k in allowed_keys and v}

    existing: SavedSearch | None = await SavedSearch.get(PydanticObjectId(search_id))
    if not existing:
        return JSONResponse({'status': 'error', 'message': 'Search not found'}, status_code=404)

    existing.filters = clean_filters
    existing.is_active = True
    await existing.save()
    return JSONResponse({'status': 'updated', 'id': str(existing.id), 'name': existing.name})


@router.post('/enrich')
async def trigger_enrich(background_tasks: BackgroundTasks) -> JSONResponse:
    """Manually trigger amenity enrichment for un-enriched listings."""
    from app.scheduler.jobs import enrich_amenities_job

    background_tasks.add_task(enrich_amenities_job, batch_size=1000)
    return JSONResponse({'status': 'started', 'message': 'Enriching up to 1000 listings'})
