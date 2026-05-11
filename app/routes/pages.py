import math
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from fastapi.templating import Jinja2Templates

from app.areas import AREAS, CITIES, TOP_AREAS
from app.models import DealType, Listing, NotificationLog, PriceHistory, SavedSearch
from app.search.engine import get_area_counts, search_listings

router = APIRouter()
templates = Jinja2Templates(directory='app/templates')


@router.get('/', response_class=HTMLResponse)
async def dashboard(request: Request) -> Response:
    """Dashboard: active searches, recent notifications, stats."""
    saved_searches: list[SavedSearch] = await SavedSearch.find(SavedSearch.is_active == True).to_list()  # noqa: E712
    total_listings: int = await Listing.find(Listing.is_active == True).count()  # noqa: E712
    rent_count: int = await Listing.find(Listing.is_active == True, Listing.deal_type == DealType.RENT).count()  # noqa: E712
    forsale_count: int = await Listing.find(Listing.is_active == True, Listing.deal_type == DealType.FORSALE).count()  # noqa: E712
    recent_notifications: list[NotificationLog] = (
        await NotificationLog.find().sort([('sent_at', -1)]).limit(10).to_list()
    )

    return templates.TemplateResponse(
        request,
        'dashboard.html',
        context={
            'saved_searches': saved_searches,
            'total_listings': total_listings,
            'rent_count': rent_count,
            'forsale_count': forsale_count,
            'recent_notifications': recent_notifications,
        },
    )


@router.get('/listings', response_class=HTMLResponse)
async def listings_page(request: Request) -> Response:
    """Browse listings with filters."""
    params: dict[str, str] = dict(request.query_params)

    # Build filters from query params
    filters: dict[str, Any] = {}
    if deal_type := params.get('deal_type'):
        filters['deal_type'] = deal_type
    # Multi-value params: getlist handles repeated keys (e.g. cities=A&cities=B)
    # and split handles comma-separated (e.g. cities=A,B)
    if cities_raw := request.query_params.getlist('cities'):
        cities_list: list[str] = []
        for c in cities_raw:
            cities_list.extend(c.split(','))
        cities_list = [c for c in cities_list if c]
        if cities_list:
            filters['cities'] = cities_list
    if area_ids_raw := request.query_params.getlist('area_ids'):
        ids: list[str] = []
        for a in area_ids_raw:
            ids.extend(a.split(','))
        filters['area_ids'] = [int(a) for a in ids if a]
    if neighborhoods_raw := request.query_params.getlist('neighborhoods'):
        hoods: list[str] = []
        for n in neighborhoods_raw:
            hoods.extend(n.split(','))
        hoods = [h for h in hoods if h]
        if hoods:
            filters['neighborhoods'] = hoods
    if top_area_ids_raw := request.query_params.getlist('top_area_ids'):
        ids: list[str] = []
        for a in top_area_ids_raw:
            ids.extend(a.split(','))
        filters['top_area_ids'] = [int(a) for a in ids if a]
    if rooms_min := params.get('rooms_min'):
        filters['rooms_min'] = rooms_min
    if rooms_max := params.get('rooms_max'):
        filters['rooms_max'] = rooms_max
    if price_min := params.get('price_min'):
        filters['price_min'] = price_min
    if price_max := params.get('price_max'):
        filters['price_max'] = price_max
    if sqm_min := params.get('sqm_min'):
        filters['sqm_min'] = sqm_min
    if sqm_max := params.get('sqm_max'):
        filters['sqm_max'] = sqm_max
    if floor_min := params.get('floor_min'):
        filters['floor_min'] = floor_min
    if floor_max := params.get('floor_max'):
        filters['floor_max'] = floor_max

    # Boolean filters
    for amenity in ['parking', 'elevator', 'balcony', 'pets_allowed', 'air_conditioning', 'furnished', 'shelter']:
        if params.get(amenity):
            filters[amenity] = True

    # Geo radius
    if params.get('center_lat') and params.get('center_lng') and params.get('radius_km'):
        filters['center_lat'] = params['center_lat']
        filters['center_lng'] = params['center_lng']
        filters['radius_km'] = params['radius_km']

    # Geo polygon
    if geo_polygon := params.get('geo_polygon'):
        import json as _json

        try:
            filters['geo_polygon'] = _json.loads(geo_polygon)
        except (ValueError, TypeError):
            pass

    # Sort
    filters['sort_by'] = params.get('sort_by', 'newest')

    page: int = int(params.get('page', 1))
    listings: list[Listing]
    total: int
    listings, total = await search_listings(filters, page=page, page_size=20)
    total_pages: int = math.ceil(total / 20) if total > 0 else 1

    area_counts: dict[int, int] = await get_area_counts()

    # If htmx request, return partial
    if request.headers.get('HX-Request'):
        return templates.TemplateResponse(
            request,
            'partials/listing_list.html',
            context={
                'listings': listings,
                'total': total,
                'page': page,
                'total_pages': total_pages,
                'filters': filters,
            },
        )

    return templates.TemplateResponse(
        request,
        'listings.html',
        context={
            'listings': listings,
            'total': total,
            'page': page,
            'total_pages': total_pages,
            'filters': filters,
            'params': params,
            'top_areas': TOP_AREAS,
            'areas': AREAS,
            'cities': CITIES,
            'area_counts': area_counts,
            'view_mode': params.get('view', 'list'),
            'selected_neighborhoods': filters.get('neighborhoods', []),
        },
    )


@router.get('/listings/{yad2_id}', response_class=HTMLResponse)
async def listing_detail(request: Request, yad2_id: str) -> Response:
    """Single listing detail page."""
    listing: Listing | None = await Listing.find_one(Listing.yad2_id == yad2_id)
    if not listing:
        return HTMLResponse('Listing not found', status_code=404)

    price_history: list[PriceHistory] = (
        await PriceHistory.find(PriceHistory.listing_id == yad2_id).sort([('observed_at', 1)]).to_list()
    )

    return templates.TemplateResponse(
        request,
        'listing_detail.html',
        context={
            'listing': listing,
            'price_history': price_history,
        },
    )


@router.get('/map')
async def map_view(request: Request) -> RedirectResponse:
    """Redirect to listings page with map view."""
    return RedirectResponse(url='/listings?view=map', status_code=302)
