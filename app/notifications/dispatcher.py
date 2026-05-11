"""Multi-channel notification dispatcher.

Routes messages to all enabled channels (WhatsApp, Telegram, Email).
Replaces direct callmebot usage in the scheduler.
"""

import logging

from app.models import Listing, NotificationLog, UserSettings
from app.notifications.callmebot import (
    format_new_listing_message,
    format_price_drop_message,
    send_whatsapp,
)
from app.notifications.email import send_email
from app.notifications.telegram import send_telegram

logger = logging.getLogger(__name__)


async def _send_to_all_channels(message: str, subject: str = '') -> bool:
    """Send a message to all enabled notification channels.

    Returns True if at least one channel succeeded.
    """
    user_settings: UserSettings | None = await UserSettings.find_one()
    if not user_settings or not user_settings.notifications_enabled:
        logger.info('Notifications globally disabled')
        return False

    any_success: bool = False

    # WhatsApp
    if user_settings.whatsapp_enabled:
        try:
            ok: bool = await send_whatsapp(message)
            any_success = any_success or ok
        except Exception as e:
            logger.error(f'WhatsApp dispatch error: {e}')

    # Telegram
    if user_settings.telegram_enabled:
        try:
            ok: bool = await send_telegram(message)
            any_success = any_success or ok
        except Exception as e:
            logger.error(f'Telegram dispatch error: {e}')

    # Email
    if user_settings.email_enabled:
        try:
            ok: bool = await send_email(subject or 'Yad2 Alert', message)
            any_success = any_success or ok
        except Exception as e:
            logger.error(f'Email dispatch error: {e}')

    return any_success


async def notify_new_listing(listing: Listing, saved_search_id: str) -> bool:
    """Send notification for new listing to all channels and log it."""
    # Check if already notified
    existing: NotificationLog | None = await NotificationLog.find_one(
        NotificationLog.saved_search_id == saved_search_id,
        NotificationLog.listing_id == listing.yad2_id,
        NotificationLog.message_type == 'new_listing',
    )
    if existing:
        return False

    message: str = format_new_listing_message(listing)
    success: bool = await _send_to_all_channels(message, subject='Yad2: דירה חדשה נמצאה!')

    if success:
        await NotificationLog(
            saved_search_id=saved_search_id,
            listing_id=listing.yad2_id,
            message_type='new_listing',
        ).insert()

    return success


async def notify_price_drop(listing: Listing, old_price: int, saved_search_id: str) -> bool:
    """Send notification for price drop to all channels and log it."""
    existing: NotificationLog | None = await NotificationLog.find_one(
        NotificationLog.saved_search_id == saved_search_id,
        NotificationLog.listing_id == listing.yad2_id,
        NotificationLog.message_type == 'price_drop',
    )
    if existing:
        return False

    message: str = format_price_drop_message(listing, old_price)
    success: bool = await _send_to_all_channels(message, subject='Yad2: ירידת מחיר!')

    if success:
        await NotificationLog(
            saved_search_id=saved_search_id,
            listing_id=listing.yad2_id,
            message_type='price_drop',
        ).insert()

    return success
