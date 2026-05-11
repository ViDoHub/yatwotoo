import logging
from typing import Any

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse

from app.consts import GEO_TYPE_POLYGON, FilterParam, JobStatus
from app.models import AmenityFilter, DealType, Listing, SavedSearch, ScrapeJob
from app.scraper.yad2_client import REGIONS

logger: logging.Logger = logging.getLogger(name=__name__)

router = APIRouter(prefix='/api')


@router.get(path='/markers')
async def get_markers(
    south: float = Query(default=None),
    west: float = Query(default=None),
    north: float = Query(default=None),
    east: float = Query(default=None),
    deal_type: str = Query(default=''),
    top_area_ids: str = Query(default=''),
    cities: str = Query(default=''),
    neighborhoods: str = Query(default=''),
    rooms_min: str = Query(default=''),
    rooms_max: str = Query(default=''),
    price_min: str = Query(default=''),
    price_max: str = Query(default=''),
    sqm_min: str = Query(default=''),
    sqm_max: str = Query(default=''),
    parking: str = Query(default=''),
    elevator: str = Query(default=''),
    balcony: str = Query(default=''),
    pets_allowed: str = Query(default=''),
    air_conditioning: str = Query(default=''),
    furnished: str = Query(default=''),
    shelter: str = Query(default=''),
) -> JSONResponse:
    """Return listing markers within a bounding box (viewport) with optional filters."""
    query: dict[str, Any] = {'is_active': True}

    # Only apply geo filter if bounds are provided
    if all(v is not None for v in (south, west, north, east)):
        query['location'] = {
            '$geoWithin': {
                '$geometry': {
                    'type': GEO_TYPE_POLYGON,
                    'coordinates': [
                        [
                            [west, south],
                            [east, south],
                            [east, north],
                            [west, north],
                            [west, south],
                        ],
                    ],
                },
            },
        }

    # Apply filters
    if deal_type:
        query['deal_type'] = deal_type
    if top_area_ids:
        ids: list[int] = [int(a) for a in top_area_ids.split(sep=',') if a]
        if ids:
            query['address.top_area_id'] = {'$in': ids}
    if cities:
        city_list: list[str] = [c for c in cities.split(sep=',') if c]
        if city_list:
            query['address.city'] = {'$in': city_list}
    if neighborhoods:
        hood_list: list[str] = [h for h in neighborhoods.split(sep=',') if h]
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
                },
            )

    return JSONResponse(content={'markers': markers, 'total': len(markers)})


@router.post(path='/scrape')
async def trigger_scrape(
    *,
    resume: bool = Query(default=False, description="Resume from last failed job's progress"),
) -> JSONResponse:
    """Create a pending scrape job. The worker process picks it up and executes it."""
    # Check if a scrape is already running or pending
    active: ScrapeJob | None = await ScrapeJob.find_one(
        {'status': {'$in': [JobStatus.RUNNING, JobStatus.PENDING]}},
    )
    if active:
        return JSONResponse(
            content={
                'status': JobStatus.ALREADY_RUNNING,
                'job_id': str(object=active.id),
                'message': 'A scrape is already in progress or pending.',
            },
        )

    job: ScrapeJob = ScrapeJob()

    if resume:
        prev: ScrapeJob | None = await ScrapeJob.find_one(
            {'status': {'$in': [JobStatus.FAILED, JobStatus.CANCELLED]}, 'regions_completed': {'$ne': []}},
            sort=[('started_at', -1)],
        )
        if prev:
            job.regions_completed = prev.regions_completed
            job.total_fetched = prev.total_fetched
            job.total_new = prev.total_new
            job.total_price_drops = prev.total_price_drops
            prev.status = JobStatus.RESUMED
            await prev.save()
            logger.info(msg=f'Resuming from job {prev.id}: {len(prev.regions_completed)} steps already done')

    await job.insert()

    return JSONResponse(
        content={
            'status': JobStatus.STARTED,
            'job_id': str(object=job.id),
            'message': 'Scrape job queued — worker will pick it up shortly.',
        },
    )


@router.get(path='/scrape/status')
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
            'id': str(object=job.id),
            'status': job.status,
            'started_at': job.started_at.isoformat(),
            'completed_at': job.completed_at.isoformat() if job.completed_at else None,
            'regions_completed': len(job.regions_completed),
            'total_steps': total_steps,
            'progress_pct': round(number=len(job.regions_completed) / total_steps * 100),
            'total_fetched': job.total_fetched,
            'total_new': job.total_new,
            'total_price_drops': job.total_price_drops,
            'error': job.error,
        }
    else:
        result['job'] = None

    return JSONResponse(content=result)


@router.get(path='/neighborhoods')
async def get_neighborhoods(cities: str = Query(default='', description='Comma-separated city names')) -> JSONResponse:
    """Return distinct neighborhoods for the given cities."""
    query: dict[str, Any] = {'is_active': True, 'address.neighborhood': {'$ne': ''}}
    if cities:
        city_list: list[str] = [c.strip() for c in cities.split(sep=',') if c.strip()]
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
            },
        )
    return JSONResponse(content=results)


@router.post(path='/searches')
async def save_search_api(request: Request) -> JSONResponse:
    """Save current listing filters as a new saved search (JSON API).

    If a search with the same name already exists, updates its filters.
    """
    body: dict[str, Any] = await request.json()
    name: str = body.get('name', '').strip() or 'Saved Search'
    filters: dict[str, Any] = body.get('filters', {})

    # Sanitize: only allow known filter keys
    allowed_keys: frozenset[str] = frozenset({*FilterParam, *AmenityFilter})
    clean_filters: dict[str, Any] = {k: v for k, v in filters.items() if k in allowed_keys and v}

    # Upsert: update existing search with same name, or create new
    existing: SavedSearch | None = await SavedSearch.find_one(SavedSearch.name == name)
    if existing:
        existing.filters = clean_filters
        existing.is_active = True
        await existing.save()
        return JSONResponse(content={'status': 'updated', 'id': str(object=existing.id), 'name': name})

    search: SavedSearch = SavedSearch(name=name, filters=clean_filters)
    await search.insert()
    return JSONResponse(content={'status': 'saved', 'id': str(object=search.id), 'name': name})


@router.put(path='/searches/{search_id}')
async def update_search_api(search_id: str, request: Request) -> JSONResponse:
    """Update an existing saved search's filters by ID."""
    from beanie import PydanticObjectId

    body: dict[str, Any] = await request.json()
    filters: dict[str, Any] = body.get('filters', {})

    allowed_keys: frozenset[str] = frozenset({*FilterParam, *AmenityFilter})
    clean_filters: dict[str, Any] = {k: v for k, v in filters.items() if k in allowed_keys and v}

    existing: SavedSearch | None = await SavedSearch.get(document_id=PydanticObjectId(oid=search_id))
    if not existing:
        return JSONResponse(content={'status': 'error', 'message': 'Search not found'}, status_code=404)

    existing.filters = clean_filters
    existing.is_active = True
    await existing.save()
    return JSONResponse(content={'status': 'updated', 'id': str(object=existing.id), 'name': existing.name})


@router.post(path='/enrich')
async def trigger_enrich() -> JSONResponse:
    """Signal the worker to run amenity enrichment on its next cycle.

    The worker's enrich_amenities_job runs every 30 minutes automatically.
    This endpoint is informational — it confirms enrichment is scheduled.
    """
    return JSONResponse(
        content={
            'status': JobStatus.STARTED,
            'message': 'Amenity enrichment runs automatically every 30 minutes via the worker.',
        },
    )
