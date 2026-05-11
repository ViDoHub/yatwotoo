"""Project-wide constants — single source of truth for repeated literals."""

from enum import StrEnum


class FilterParam(StrEnum):
    """Keys used in the search filters dict."""

    DEAL_TYPE = 'deal_type'
    CITIES = 'cities'
    CITY = 'city'
    AREA_IDS = 'area_ids'
    TOP_AREA_IDS = 'top_area_ids'
    NEIGHBORHOODS = 'neighborhoods'
    ROOMS_MIN = 'rooms_min'
    ROOMS_MAX = 'rooms_max'
    PRICE_MIN = 'price_min'
    PRICE_MAX = 'price_max'
    SQM_MIN = 'sqm_min'
    SQM_MAX = 'sqm_max'
    FLOOR_MIN = 'floor_min'
    FLOOR_MAX = 'floor_max'
    CENTER_LAT = 'center_lat'
    CENTER_LNG = 'center_lng'
    RADIUS_KM = 'radius_km'
    GEO_POLYGON = 'geo_polygon'
    SORT_BY = 'sort_by'
    PAGE = 'page'
    VIEW = 'view'


class SortBy(StrEnum):
    """Listing sort options."""

    NEWEST = 'newest'
    PRICE_ASC = 'price_asc'
    PRICE_DESC = 'price_desc'
    PRICE_PER_SQM_ASC = 'price_per_sqm_asc'
    PRICE_PER_SQM_DESC = 'price_per_sqm_desc'
    SQM_DESC = 'sqm_desc'
    ROOMS_ASC = 'rooms_asc'


class JobStatus(StrEnum):
    """Scrape job lifecycle statuses."""

    PENDING = 'pending'
    RUNNING = 'running'
    COMPLETED = 'completed'
    FAILED = 'failed'
    CANCELLED = 'cancelled'
    RESUMED = 'resumed'
    ALREADY_RUNNING = 'already_running'
    STARTED = 'started'


class MessageType(StrEnum):
    """Notification message types."""

    NEW_LISTING = 'new_listing'
    PRICE_DROP = 'price_drop'


class ViewMode(StrEnum):
    """Listing page view modes."""

    LIST = 'list'
    MAP = 'map'


# ---------------------------------------------------------------------------
# Scheduler job IDs
# ---------------------------------------------------------------------------
SCHEDULER_JOB_POLL = 'poll_listings'
SCHEDULER_JOB_CLEANUP = 'cleanup_stale'
SCHEDULER_JOB_BACKUP = 'backup_db'
SCHEDULER_JOB_ENRICH = 'enrich_amenities'

# ---------------------------------------------------------------------------
# Template names
# ---------------------------------------------------------------------------
TEMPLATE_DASHBOARD = 'dashboard.html'
TEMPLATE_LISTINGS = 'listings.html'
TEMPLATE_LISTING_DETAIL = 'listing_detail.html'
TEMPLATE_LISTING_LIST_PARTIAL = 'partials/listing_list.html'
TEMPLATE_SETTINGS = 'settings.html'

# ---------------------------------------------------------------------------
# HTTP / HTMX
# ---------------------------------------------------------------------------
HX_REQUEST = 'HX-Request'

# ---------------------------------------------------------------------------
# GeoJSON type literals
# ---------------------------------------------------------------------------
GEO_TYPE_POINT = 'Point'
GEO_TYPE_POLYGON = 'Polygon'
