import logging

import httpx

from app.models import Listing, NotificationLog, UserSettings

logger = logging.getLogger(__name__)

CALLMEBOT_URL = 'https://api.callmebot.com/whatsapp.php'


async def get_whatsapp_config() -> tuple[str, str]:
    """Get WhatsApp config from DB (UserSettings), fall back to env."""
    user_settings = await UserSettings.find_one()
    if user_settings and user_settings.whatsapp_phone and user_settings.whatsapp_apikey:
        return user_settings.whatsapp_phone, user_settings.whatsapp_apikey

    from app.config import settings

    return settings.callmebot_phone, settings.callmebot_apikey


async def send_whatsapp(message: str, phone: str = '', apikey: str = '') -> bool:
    """Send a WhatsApp message via Callmebot.

    If phone/apikey not provided, reads from UserSettings or env.
    Returns True on success.
    """
    if not phone or not apikey:
        phone, apikey = await get_whatsapp_config()

    if not phone or not apikey:
        logger.warning('WhatsApp not configured (no phone/apikey)')
        return False

    # Check if notifications are enabled
    user_settings = await UserSettings.find_one()
    if user_settings and not user_settings.notifications_enabled:
        logger.info('WhatsApp notifications disabled by user (global)')
        return False

    params = {
        'phone': phone,
        'text': message,
        'apikey': apikey,
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(CALLMEBOT_URL, params=params)

            if response.status_code == 200:
                logger.info(f'WhatsApp message sent to {phone}')
                return True
            logger.error(f'Callmebot returned {response.status_code}: {response.text}')
            return False
    except httpx.HTTPError as e:
        logger.error(f'Error sending WhatsApp message: {e}')
        return False


def format_new_listing_message(listing: Listing) -> str:
    """Format a notification message for a new listing."""
    parts = ['*דירה חדשה נמצאה!* 🏠\n']

    if listing.address.street:
        addr = listing.address.street
        if listing.address.house_number:
            addr += f' {listing.address.house_number}'
        addr += f', {listing.address.city}'
        parts.append(f'📍 {addr}')
    elif listing.address.city:
        parts.append(f'📍 {listing.address.city}')

    if listing.address.neighborhood:
        parts.append(f'🏘️ {listing.address.neighborhood}')

    details: list[str] = []
    if listing.rooms:
        details.append(f'{listing.rooms} חדרים')
    if listing.sqm:
        details.append(f'{listing.sqm} מ"ר')
    if listing.floor is not None:
        details.append(f'קומה {listing.floor}')
    if details:
        parts.append(f'📐 {" | ".join(details)}')

    if listing.price:
        parts.append(f'💰 {listing.price:,} ₪/חודש')
        if listing.price_per_sqm:
            parts.append(f'📊 {listing.price_per_sqm:.0f} ₪/מ"ר')

    if listing.entry_date:
        parts.append(f'📅 כניסה: {listing.entry_date}')

    parts.append(f'\n🔗 {listing.url}')

    return '\n'.join(parts)


def format_price_drop_message(listing: Listing, old_price: int) -> str:
    """Format a notification message for a price drop."""
    parts = ['*ירידת מחיר!* 📉\n']

    if listing.address.street:
        parts.append(f'📍 {listing.address.street}, {listing.address.city}')

    parts.append(f'💰 {old_price:,} ₪ → *{listing.price:,} ₪*')

    price = listing.price or 0
    diff = old_price - price
    percent = (diff / old_price) * 100 if old_price else 0
    parts.append(f'📉 חיסכון: {diff:,} ₪ ({percent:.1f}%)')

    parts.append(f'\n🔗 {listing.url}')

    return '\n'.join(parts)


async def notify_new_listing(listing: Listing, saved_search_id: str) -> bool:
    """Send notification for new listing and log it."""
    # Check if already notified
    existing = await NotificationLog.find_one(
        NotificationLog.saved_search_id == saved_search_id,
        NotificationLog.listing_id == listing.yad2_id,
        NotificationLog.message_type == 'new_listing',
    )
    if existing:
        return False

    message = format_new_listing_message(listing)
    success = await send_whatsapp(message)

    if success:
        await NotificationLog(
            saved_search_id=saved_search_id,
            listing_id=listing.yad2_id,
            message_type='new_listing',
        ).insert()

    return success


async def notify_price_drop(listing: Listing, old_price: int, saved_search_id: str) -> bool:
    """Send notification for price drop and log it."""
    existing = await NotificationLog.find_one(
        NotificationLog.saved_search_id == saved_search_id,
        NotificationLog.listing_id == listing.yad2_id,
        NotificationLog.message_type == 'price_drop',
    )
    if existing:
        return False

    message = format_price_drop_message(listing, old_price)
    success = await send_whatsapp(message)

    if success:
        await NotificationLog(
            saved_search_id=saved_search_id,
            listing_id=listing.yad2_id,
            message_type='price_drop',
        ).insert()

    return success
