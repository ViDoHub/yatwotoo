import math
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from fastapi.templating import Jinja2Templates

from app.areas import AREAS, CITIES, TOP_AREAS
from app.consts import (
    HX_REQUEST,
    TEMPLATE_DASHBOARD,
    TEMPLATE_LISTING_DETAIL,
    TEMPLATE_LISTING_LIST_PARTIAL,
    TEMPLATE_LISTINGS,
    FilterParam,
    SortBy,
    ViewMode,
)
from app.models import AmenityFilter, DealType, Listing, NotificationLog, PriceHistory, SavedSearch
from app.search.engine import get_area_counts, search_listings

router = APIRouter()
templates = Jinja2Templates(directory='app/templates')


@router.get(path='/', response_class=HTMLResponse)
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
        name=TEMPLATE_DASHBOARD,
        context={
            'saved_searches': saved_searches,
            'total_listings': total_listings,
            'rent_count': rent_count,
            'forsale_count': forsale_count,
            'recent_notifications': recent_notifications,
        },
    )


@router.get(path='/listings', response_class=HTMLResponse)
async def listings_page(request: Request) -> Response:
    """Browse listings with filters."""
    params: dict[str, str] = dict(request.query_params)

    # Build filters from query params
    filters: dict[str, Any] = {}
    if deal_type := params.get(FilterParam.DEAL_TYPE):
        filters[FilterParam.DEAL_TYPE] = deal_type
    # Multi-value params: getlist handles repeated keys (e.g. cities=A&cities=B)
    # and split handles comma-separated (e.g. cities=A,B)
    if cities_raw := request.query_params.getlist(key=FilterParam.CITIES):
        cities_list: list[str] = []
        for c in cities_raw:
            cities_list.extend(c.split(sep=','))
        cities_list = [c for c in cities_list if c]
        if cities_list:
            filters[FilterParam.CITIES] = cities_list
    if area_ids_raw := request.query_params.getlist(key=FilterParam.AREA_IDS):
        ids: list[str] = []
        for a in area_ids_raw:
            ids.extend(a.split(sep=','))
        filters[FilterParam.AREA_IDS] = [int(a) for a in ids if a]
    if neighborhoods_raw := request.query_params.getlist(key=FilterParam.NEIGHBORHOODS):
        hoods: list[str] = []
        for n in neighborhoods_raw:
            hoods.extend(n.split(sep=','))
        hoods = [h for h in hoods if h]
        if hoods:
            filters[FilterParam.NEIGHBORHOODS] = hoods
    if top_area_ids_raw := request.query_params.getlist(key=FilterParam.TOP_AREA_IDS):
        ids: list[str] = []
        for a in top_area_ids_raw:
            ids.extend(a.split(sep=','))
        filters[FilterParam.TOP_AREA_IDS] = [int(a) for a in ids if a]
    if rooms_min := params.get(FilterParam.ROOMS_MIN):
        filters[FilterParam.ROOMS_MIN] = rooms_min
    if rooms_max := params.get(FilterParam.ROOMS_MAX):
        filters[FilterParam.ROOMS_MAX] = rooms_max
    if price_min := params.get(FilterParam.PRICE_MIN):
        filters[FilterParam.PRICE_MIN] = price_min
    if price_max := params.get(FilterParam.PRICE_MAX):
        filters[FilterParam.PRICE_MAX] = price_max
    if sqm_min := params.get(FilterParam.SQM_MIN):
        filters[FilterParam.SQM_MIN] = sqm_min
    if sqm_max := params.get(FilterParam.SQM_MAX):
        filters[FilterParam.SQM_MAX] = sqm_max
    if floor_min := params.get(FilterParam.FLOOR_MIN):
        filters[FilterParam.FLOOR_MIN] = floor_min
    if floor_max := params.get(FilterParam.FLOOR_MAX):
        filters[FilterParam.FLOOR_MAX] = floor_max

    # Boolean filters
    for amenity in AmenityFilter:
        if params.get(amenity):
            filters[amenity] = True

    # Geo radius
    if params.get(FilterParam.CENTER_LAT) and params.get(FilterParam.CENTER_LNG) and params.get(FilterParam.RADIUS_KM):
        filters[FilterParam.CENTER_LAT] = params[FilterParam.CENTER_LAT]
        filters[FilterParam.CENTER_LNG] = params[FilterParam.CENTER_LNG]
        filters[FilterParam.RADIUS_KM] = params[FilterParam.RADIUS_KM]

    # Geo polygon
    if geo_polygon := params.get(FilterParam.GEO_POLYGON):
        import json as _json

        try:
            filters[FilterParam.GEO_POLYGON] = _json.loads(s=geo_polygon)
        except (ValueError, TypeError):
            pass

    # Sort
    filters[FilterParam.SORT_BY] = params.get(FilterParam.SORT_BY, SortBy.NEWEST)

    page: int = int(params.get(FilterParam.PAGE, 1))
    listings: list[Listing]
    total: int
    listings, total = await search_listings(filters=filters, page=page, page_size=20)
    total_pages: int = math.ceil(total / 20) if total > 0 else 1

    area_counts: dict[int, int] = await get_area_counts()

    # If htmx request, return partial
    if request.headers.get(HX_REQUEST):
        return templates.TemplateResponse(
            request=request,
            name=TEMPLATE_LISTING_LIST_PARTIAL,
            context={
                'listings': listings,
                'total': total,
                'page': page,
                'total_pages': total_pages,
                'filters': filters,
            },
        )

    return templates.TemplateResponse(
        request=request,
        name=TEMPLATE_LISTINGS,
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
            'view_mode': params.get(FilterParam.VIEW, ViewMode.LIST),
            'selected_neighborhoods': filters.get(FilterParam.NEIGHBORHOODS, []),
        },
    )


@router.get(path='/listings/{yad2_id}', response_class=HTMLResponse)
async def listing_detail(request: Request, yad2_id: str) -> Response:
    """Single listing detail page."""
    listing: Listing | None = await Listing.find_one(Listing.yad2_id == yad2_id)
    if not listing:
        return HTMLResponse(content='Listing not found', status_code=404)

    price_history: list[PriceHistory] = (
        await PriceHistory.find(PriceHistory.listing_id == yad2_id).sort([('observed_at', 1)]).to_list()
    )

    return templates.TemplateResponse(
        request=request,
        name=TEMPLATE_LISTING_DETAIL,
        context={
            'listing': listing,
            'price_history': price_history,
        },
    )


@router.get(path='/map')
async def map_view(request: Request) -> RedirectResponse:
    """Redirect to listings page with map view."""
    return RedirectResponse(url='/listings?view=map', status_code=302)
