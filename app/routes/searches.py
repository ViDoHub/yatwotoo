import json
from typing import Any

from fastapi import APIRouter, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from starlette.datastructures import FormData

from app.consts import TEMPLATE_SETTINGS, FilterParam
from app.models import AmenityFilter, SavedSearch, UserSettings
from app.notifications.callmebot import send_whatsapp
from app.notifications.email import send_email
from app.notifications.telegram import send_telegram

router = APIRouter()
templates = Jinja2Templates(directory='app/templates')


@router.post(path='/searches')
async def create_search(request: Request) -> RedirectResponse:
    """Create a new saved search from form data."""
    form: FormData = await request.form()

    filters: dict[str, Any] = {}
    if deal_type := form.get(FilterParam.DEAL_TYPE):
        filters[FilterParam.DEAL_TYPE] = deal_type

    # Multi-location support: collect all non-empty cities and region IDs
    cities: list[str] = [c for c in form.getlist(key='cities[]') if isinstance(c, str) and c]
    if cities:
        filters['cities'] = cities
    if top_area_ids := form.getlist('top_area_ids[]'):
        filters['top_area_ids'] = [int(str(object=a)) for a in top_area_ids if a]

    # Map-drawn polygon (GeoJSON coordinates as JSON string)
    if geo_polygon := form.get(FilterParam.GEO_POLYGON):
        try:
            coords: list[Any] = json.loads(str(object=geo_polygon))
            if coords and len(coords) >= 4:
                filters[FilterParam.GEO_POLYGON] = coords
        except (json.JSONDecodeError, TypeError):
            pass
    if rooms_min := form.get(FilterParam.ROOMS_MIN):
        filters[FilterParam.ROOMS_MIN] = rooms_min
    if rooms_max := form.get(FilterParam.ROOMS_MAX):
        filters[FilterParam.ROOMS_MAX] = rooms_max
    if price_min := form.get(FilterParam.PRICE_MIN):
        filters[FilterParam.PRICE_MIN] = price_min
    if price_max := form.get(FilterParam.PRICE_MAX):
        filters[FilterParam.PRICE_MAX] = price_max
    if sqm_min := form.get(FilterParam.SQM_MIN):
        filters[FilterParam.SQM_MIN] = sqm_min
    if sqm_max := form.get(FilterParam.SQM_MAX):
        filters[FilterParam.SQM_MAX] = sqm_max

    for amenity in AmenityFilter:
        if form.get(amenity):
            filters[amenity] = True

    # Geo filters
    if form.get(FilterParam.CENTER_LAT) and form.get(FilterParam.CENTER_LNG) and form.get(FilterParam.RADIUS_KM):
        filters[FilterParam.CENTER_LAT] = form.get(FilterParam.CENTER_LAT)
        filters[FilterParam.CENTER_LNG] = form.get(FilterParam.CENTER_LNG)
        filters[FilterParam.RADIUS_KM] = form.get(FilterParam.RADIUS_KM)

    name: str = str(object=form.get('name', '')).strip() or 'חיפוש חדש'

    search: SavedSearch = SavedSearch(name=name, filters=filters)
    await search.insert()

    return RedirectResponse(url='/', status_code=303)


@router.post(path='/searches/{search_id}/delete')
async def delete_search(search_id: str) -> RedirectResponse:
    """Delete (deactivate) a saved search."""
    from beanie import PydanticObjectId

    search: SavedSearch | None = await SavedSearch.get(document_id=PydanticObjectId(oid=search_id))
    if search:
        search.is_active = False
        await search.save()
    return RedirectResponse(url='/', status_code=303)


@router.get(path='/settings', response_class=HTMLResponse)
async def settings_page(request: Request) -> HTMLResponse:
    """Settings page for WhatsApp configuration."""
    user_settings: UserSettings | None = await UserSettings.find_one()
    return templates.TemplateResponse(
        request,
        name=TEMPLATE_SETTINGS,
        context={
            'user_settings': user_settings,
        },
    )


@router.post(path='/settings/whatsapp')
async def save_whatsapp_settings(
    request: Request,
    phone: str = Form(default=''),
    apikey: str = Form(default=''),
    whatsapp_enabled: str = Form(default=''),
) -> RedirectResponse:
    """Save WhatsApp configuration."""
    enabled: bool = whatsapp_enabled == '1'
    user_settings: UserSettings | None = await UserSettings.find_one()
    if user_settings:
        user_settings.whatsapp_enabled = enabled
        user_settings.whatsapp_phone = phone.strip()
        user_settings.whatsapp_apikey = apikey.strip()
        await user_settings.save()
    else:
        await UserSettings(
            whatsapp_enabled=enabled,
            whatsapp_phone=phone.strip(),
            whatsapp_apikey=apikey.strip(),
        ).insert()

    return RedirectResponse(url='/settings?saved=1', status_code=303)


@router.post(path='/settings/whatsapp/test', response_class=HTMLResponse)
async def test_whatsapp(request: Request) -> HTMLResponse:
    """Send a test WhatsApp message."""
    user_settings: UserSettings | None = await UserSettings.find_one()
    if not user_settings or not user_settings.whatsapp_phone:
        return HTMLResponse(content='<span class="text-red-500">WhatsApp not configured</span>')

    success: bool = await send_whatsapp(
        message='Yad2 Search - Test message works!',
        phone=user_settings.whatsapp_phone,
        apikey=user_settings.whatsapp_apikey,
    )

    if success:
        return HTMLResponse(content='<span class="text-green-500">Message sent successfully!</span>')
    return HTMLResponse(content='<span class="text-red-500">Failed to send. Check phone number and API key.</span>')


@router.post(path='/settings/general')
async def save_general_settings(
    request: Request,
    poll_interval: int = Form(default=15),
    notifications_enabled: str = Form(default=''),
) -> RedirectResponse:
    """Save general settings (poll interval, global toggle)."""
    enabled: bool = notifications_enabled == '1'
    user_settings: UserSettings | None = await UserSettings.find_one()
    if user_settings:
        user_settings.poll_interval_minutes: int = poll_interval
        user_settings.notifications_enabled: bool = enabled
        await user_settings.save()
    else:
        await UserSettings(
            poll_interval_minutes=poll_interval,
            notifications_enabled=enabled,
        ).insert()
    return RedirectResponse(url='/settings?saved=1', status_code=303)


@router.post(path='/settings/telegram')
async def save_telegram_settings(
    request: Request,
    telegram_enabled: str = Form(default=''),
    telegram_bot_token: str = Form(default=''),
    telegram_chat_id: str = Form(default=''),
) -> RedirectResponse:
    """Save Telegram configuration."""
    enabled: bool = telegram_enabled == '1'
    user_settings: UserSettings | None = await UserSettings.find_one()
    if user_settings:
        user_settings.telegram_enabled = enabled
        user_settings.telegram_bot_token = telegram_bot_token.strip()
        user_settings.telegram_chat_id = telegram_chat_id.strip()
        await user_settings.save()
    else:
        await UserSettings(
            telegram_enabled=enabled,
            telegram_bot_token=telegram_bot_token.strip(),
            telegram_chat_id=telegram_chat_id.strip(),
        ).insert()
    return RedirectResponse(url='/settings?saved=1', status_code=303)


@router.post(path='/settings/telegram/test', response_class=HTMLResponse)
async def test_telegram(request: Request) -> HTMLResponse:
    """Send a test Telegram message."""
    user_settings: UserSettings | None = await UserSettings.find_one()
    if not user_settings or not user_settings.telegram_bot_token:
        return HTMLResponse(content='<span class="text-red-500">Telegram not configured</span>')

    success: bool = await send_telegram(
        message='Yad2 Search - Test message works! ✅',
        token=user_settings.telegram_bot_token,
        chat_id=user_settings.telegram_chat_id,
    )

    if success:
        return HTMLResponse(content='<span class="text-green-500">Message sent successfully!</span>')
    return HTMLResponse(content='<span class="text-red-500">Failed to send. Check bot token and chat ID.</span>')


@router.post(path='/settings/email')
async def save_email_settings(
    request: Request,
    email_enabled: str = Form(default=''),
    email_smtp_host: str = Form(default=''),
    email_smtp_port: int = Form(default=587),
    email_smtp_user: str = Form(default=''),
    email_smtp_password: str = Form(default=''),
    email_to: str = Form(default=''),
) -> RedirectResponse:
    """Save Email SMTP configuration."""
    enabled: bool = email_enabled == '1'
    user_settings: UserSettings | None = await UserSettings.find_one()
    if user_settings:
        user_settings.email_enabled = enabled
        user_settings.email_smtp_host = email_smtp_host.strip()
        user_settings.email_smtp_port = email_smtp_port
        user_settings.email_smtp_user = email_smtp_user.strip()
        user_settings.email_smtp_password = email_smtp_password.strip()
        user_settings.email_to = email_to.strip()
        await user_settings.save()
    else:
        await UserSettings(
            email_enabled=enabled,
            email_smtp_host=email_smtp_host.strip(),
            email_smtp_port=email_smtp_port,
            email_smtp_user=email_smtp_user.strip(),
            email_smtp_password=email_smtp_password.strip(),
            email_to=email_to.strip(),
        ).insert()
    return RedirectResponse(url='/settings?saved=1', status_code=303)


@router.post(path='/settings/email/test', response_class=HTMLResponse)
async def test_email(request: Request) -> HTMLResponse:
    """Send a test email."""
    user_settings: UserSettings | None = await UserSettings.find_one()
    if not user_settings or not user_settings.email_smtp_host:
        return HTMLResponse(content='<span class="text-red-500">Email not configured</span>')

    success: bool = await send_email(
        subject='Yad2 Search - Test Email',
        body='This is a test email from your Yad2 apartment search monitor. If you see this, email notifications are working!',
    )

    if success:
        return HTMLResponse(content='<span class="text-green-500">Email sent successfully!</span>')
    return HTMLResponse(content='<span class="text-red-500">Failed to send. Check SMTP settings.</span>')
