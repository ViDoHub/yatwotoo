import json
from typing import Any

from fastapi import APIRouter, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from app.models import SavedSearch, UserSettings
from app.notifications.callmebot import send_whatsapp
from app.notifications.email import send_email
from app.notifications.telegram import send_telegram

router = APIRouter()
templates = Jinja2Templates(directory='app/templates')


@router.post('/searches')
async def create_search(request: Request) -> RedirectResponse:
    """Create a new saved search from form data."""
    form = await request.form()

    filters: dict[str, Any] = {}
    if deal_type := form.get('deal_type'):
        filters['deal_type'] = deal_type

    # Multi-location support: collect all non-empty cities and region IDs
    cities = [c for c in form.getlist('cities[]') if c]
    if cities:
        filters['cities'] = cities
    if top_area_ids := form.getlist('top_area_ids[]'):
        filters['top_area_ids'] = [int(str(a)) for a in top_area_ids if a]

    # Map-drawn polygon (GeoJSON coordinates as JSON string)
    if geo_polygon := form.get('geo_polygon'):
        try:
            coords = json.loads(str(geo_polygon))
            if coords and len(coords) >= 4:
                filters['geo_polygon'] = coords
        except (json.JSONDecodeError, TypeError):
            pass
    if rooms_min := form.get('rooms_min'):
        filters['rooms_min'] = rooms_min
    if rooms_max := form.get('rooms_max'):
        filters['rooms_max'] = rooms_max
    if price_min := form.get('price_min'):
        filters['price_min'] = price_min
    if price_max := form.get('price_max'):
        filters['price_max'] = price_max
    if sqm_min := form.get('sqm_min'):
        filters['sqm_min'] = sqm_min
    if sqm_max := form.get('sqm_max'):
        filters['sqm_max'] = sqm_max

    for amenity in ['parking', 'elevator', 'balcony', 'pets_allowed', 'furnished', 'mamad']:
        if form.get(amenity):
            filters[amenity] = True

    # Geo filters
    if form.get('center_lat') and form.get('center_lng') and form.get('radius_km'):
        filters['center_lat'] = form.get('center_lat')
        filters['center_lng'] = form.get('center_lng')
        filters['radius_km'] = form.get('radius_km')

    name = str(form.get('name', '')).strip() or 'חיפוש חדש'

    search = SavedSearch(name=name, filters=filters)
    await search.insert()

    return RedirectResponse(url='/', status_code=303)


@router.post('/searches/{search_id}/delete')
async def delete_search(search_id: str) -> RedirectResponse:
    """Delete (deactivate) a saved search."""
    from beanie import PydanticObjectId

    search = await SavedSearch.get(PydanticObjectId(search_id))
    if search:
        search.is_active = False
        await search.save()
    return RedirectResponse(url='/', status_code=303)


@router.get('/settings', response_class=HTMLResponse)
async def settings_page(request: Request) -> HTMLResponse:
    """Settings page for WhatsApp configuration."""
    user_settings = await UserSettings.find_one()
    return templates.TemplateResponse(
        request,
        'settings.html',
        context={
            'user_settings': user_settings,
        },
    )


@router.post('/settings/whatsapp')
async def save_whatsapp_settings(
    request: Request,
    phone: str = Form(''),
    apikey: str = Form(''),
    whatsapp_enabled: str = Form(''),
) -> RedirectResponse:
    """Save WhatsApp configuration."""
    enabled = whatsapp_enabled == '1'
    user_settings = await UserSettings.find_one()
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


@router.post('/settings/whatsapp/test', response_class=HTMLResponse)
async def test_whatsapp(request: Request) -> HTMLResponse:
    """Send a test WhatsApp message."""
    user_settings = await UserSettings.find_one()
    if not user_settings or not user_settings.whatsapp_phone:
        return HTMLResponse('<span class="text-red-500">WhatsApp not configured</span>')

    success = await send_whatsapp(
        'Yad2 Search - Test message works!',
        phone=user_settings.whatsapp_phone,
        apikey=user_settings.whatsapp_apikey,
    )

    if success:
        return HTMLResponse('<span class="text-green-500">Message sent successfully!</span>')
    return HTMLResponse('<span class="text-red-500">Failed to send. Check phone number and API key.</span>')


@router.post('/settings/general')
async def save_general_settings(
    request: Request,
    poll_interval: int = Form(15),
    notifications_enabled: str = Form(''),
) -> RedirectResponse:
    """Save general settings (poll interval, global toggle)."""
    enabled = notifications_enabled == '1'
    user_settings = await UserSettings.find_one()
    if user_settings:
        user_settings.poll_interval_minutes = poll_interval
        user_settings.notifications_enabled = enabled
        await user_settings.save()
    else:
        await UserSettings(
            poll_interval_minutes=poll_interval,
            notifications_enabled=enabled,
        ).insert()
    return RedirectResponse(url='/settings?saved=1', status_code=303)


@router.post('/settings/telegram')
async def save_telegram_settings(
    request: Request,
    telegram_enabled: str = Form(''),
    telegram_bot_token: str = Form(''),
    telegram_chat_id: str = Form(''),
) -> RedirectResponse:
    """Save Telegram configuration."""
    enabled = telegram_enabled == '1'
    user_settings = await UserSettings.find_one()
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


@router.post('/settings/telegram/test', response_class=HTMLResponse)
async def test_telegram(request: Request) -> HTMLResponse:
    """Send a test Telegram message."""
    user_settings = await UserSettings.find_one()
    if not user_settings or not user_settings.telegram_bot_token:
        return HTMLResponse('<span class="text-red-500">Telegram not configured</span>')

    success = await send_telegram(
        'Yad2 Search - Test message works! ✅',
        token=user_settings.telegram_bot_token,
        chat_id=user_settings.telegram_chat_id,
    )

    if success:
        return HTMLResponse('<span class="text-green-500">Message sent successfully!</span>')
    return HTMLResponse('<span class="text-red-500">Failed to send. Check bot token and chat ID.</span>')


@router.post('/settings/email')
async def save_email_settings(
    request: Request,
    email_enabled: str = Form(''),
    email_smtp_host: str = Form(''),
    email_smtp_port: int = Form(587),
    email_smtp_user: str = Form(''),
    email_smtp_password: str = Form(''),
    email_to: str = Form(''),
) -> RedirectResponse:
    """Save Email SMTP configuration."""
    enabled = email_enabled == '1'
    user_settings = await UserSettings.find_one()
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


@router.post('/settings/email/test', response_class=HTMLResponse)
async def test_email(request: Request) -> HTMLResponse:
    """Send a test email."""
    user_settings = await UserSettings.find_one()
    if not user_settings or not user_settings.email_smtp_host:
        return HTMLResponse('<span class="text-red-500">Email not configured</span>')

    success = await send_email(
        'Yad2 Search - Test Email',
        'This is a test email from your Yad2 apartment search monitor. If you see this, email notifications are working!',
    )

    if success:
        return HTMLResponse('<span class="text-green-500">Email sent successfully!</span>')
    return HTMLResponse('<span class="text-red-500">Failed to send. Check SMTP settings.</span>')
