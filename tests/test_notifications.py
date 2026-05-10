"""Tests for notification formatting and dedup logic."""

import pytest
from unittest.mock import AsyncMock, patch

from app.models import Address, DealType, Listing, NotificationLog, UserSettings
from app.notifications.callmebot import (
    format_new_listing_message,
    format_price_drop_message,
    get_whatsapp_config,
    notify_new_listing,
    notify_price_drop,
    send_whatsapp,
)


pytestmark = pytest.mark.asyncio


class TestFormatMessages:
    """Test notification message formatting."""

    def test_new_listing_message_full(self):
        listing = Listing(
            yad2_id="msg1",
            deal_type=DealType.RENT,
            address=Address(
                city="תל אביב",
                street="דיזנגוף",
                house_number="100",
                neighborhood="צפון",
            ),
            rooms=3.5,
            sqm=85.0,
            floor=5,
            price=7000,
            price_per_sqm=82.35,
            entry_date="2026-06-01",
            url="https://www.yad2.co.il/item/msg1",
        )
        msg = format_new_listing_message(listing)
        assert "דירה חדשה נמצאה" in msg
        assert "דיזנגוף 100, תל אביב" in msg
        assert "צפון" in msg
        assert "3.5 חדרים" in msg
        assert "85.0 מ\"ר" in msg
        assert "קומה 5" in msg
        assert "7,000" in msg
        assert "82 ₪/מ\"ר" in msg
        assert "2026-06-01" in msg
        assert "https://www.yad2.co.il/item/msg1" in msg

    def test_new_listing_message_minimal(self):
        listing = Listing(
            yad2_id="min1",
            deal_type=DealType.RENT,
            address=Address(city="חיפה"),
            url="https://www.yad2.co.il/item/min1",
        )
        msg = format_new_listing_message(listing)
        assert "חיפה" in msg
        assert "https://www.yad2.co.il/item/min1" in msg

    def test_price_drop_message(self):
        listing = Listing(
            yad2_id="drop1",
            deal_type=DealType.RENT,
            address=Address(city="תל אביב", street="רוטשילד"),
            price=6000,
            url="https://www.yad2.co.il/item/drop1",
        )
        msg = format_price_drop_message(listing, old_price=8000)
        assert "ירידת מחיר" in msg
        assert "8,000" in msg
        assert "6,000" in msg
        assert "2,000" in msg  # diff
        assert "25.0%" in msg
        assert "רוטשילד" in msg


class TestNotifyNewListing:
    """Test notification dedup and sending."""

    async def test_sends_and_logs(self):
        listing = Listing(
            yad2_id="notify1",
            deal_type=DealType.RENT,
            address=Address(city="תל אביב"),
            url="https://www.yad2.co.il/item/notify1",
        )
        await listing.insert()

        with patch("app.notifications.callmebot.send_whatsapp", new_callable=AsyncMock, return_value=True):
            result = await notify_new_listing(listing, saved_search_id="search1")

        assert result is True

        # Should have logged the notification
        log = await NotificationLog.find_one(
            NotificationLog.listing_id == "notify1",
            NotificationLog.message_type == "new_listing",
        )
        assert log is not None
        assert log.saved_search_id == "search1"

    async def test_dedup_prevents_double_send(self):
        listing = Listing(
            yad2_id="dedup1",
            deal_type=DealType.RENT,
            address=Address(city="תל אביב"),
            url="https://www.yad2.co.il/item/dedup1",
        )
        await listing.insert()

        # Pre-existing notification log
        await NotificationLog(
            saved_search_id="search1",
            listing_id="dedup1",
            message_type="new_listing",
        ).insert()

        with patch("app.notifications.callmebot.send_whatsapp", new_callable=AsyncMock) as mock_send:
            result = await notify_new_listing(listing, saved_search_id="search1")

        assert result is False
        mock_send.assert_not_called()

    async def test_failed_send_no_log(self):
        listing = Listing(
            yad2_id="fail_notify1",
            deal_type=DealType.RENT,
            address=Address(city="תל אביב"),
            url="https://www.yad2.co.il/item/fail_notify1",
        )
        await listing.insert()

        with patch("app.notifications.callmebot.send_whatsapp", new_callable=AsyncMock, return_value=False):
            result = await notify_new_listing(listing, saved_search_id="search1")

        assert result is False
        log = await NotificationLog.find_one(NotificationLog.listing_id == "fail_notify1")
        assert log is None


class TestNotifyPriceDrop:
    """Test price drop notification dedup."""

    async def test_sends_price_drop(self):
        listing = Listing(
            yad2_id="pdrop1",
            deal_type=DealType.RENT,
            address=Address(city="חיפה", street="הרצל"),
            price=5000,
            url="https://www.yad2.co.il/item/pdrop1",
        )
        await listing.insert()

        with patch("app.notifications.callmebot.send_whatsapp", new_callable=AsyncMock, return_value=True):
            result = await notify_price_drop(listing, old_price=7000, saved_search_id="s1")

        assert result is True

        log = await NotificationLog.find_one(
            NotificationLog.listing_id == "pdrop1",
            NotificationLog.message_type == "price_drop",
        )
        assert log is not None

    async def test_price_drop_dedup(self):
        listing = Listing(
            yad2_id="pdrop_dup",
            deal_type=DealType.RENT,
            price=5000,
            url="https://www.yad2.co.il/item/pdrop_dup",
        )
        await listing.insert()

        await NotificationLog(
            saved_search_id="s1",
            listing_id="pdrop_dup",
            message_type="price_drop",
        ).insert()

        with patch("app.notifications.callmebot.send_whatsapp", new_callable=AsyncMock) as mock_send:
            result = await notify_price_drop(listing, old_price=7000, saved_search_id="s1")

        assert result is False
        mock_send.assert_not_called()


class TestGetWhatsappConfig:
    """Test config source priority."""

    async def test_reads_from_user_settings(self):
        await UserSettings(
            whatsapp_phone="+1234567890",
            whatsapp_apikey="test_key",
        ).insert()

        phone, apikey = await get_whatsapp_config()
        assert phone == "+1234567890"
        assert apikey == "test_key"

    async def test_falls_back_to_env(self):
        # No UserSettings in DB
        with patch("app.config.settings") as mock_settings:
            mock_settings.callmebot_phone = "+9876543210"
            mock_settings.callmebot_apikey = "env_key"
            phone, apikey = await get_whatsapp_config()

        assert phone == "+9876543210"
        assert apikey == "env_key"

    async def test_empty_user_settings_falls_back(self):
        """UserSettings with empty phone/apikey should fall back to env."""
        await UserSettings(whatsapp_phone="", whatsapp_apikey="").insert()

        with patch("app.config.settings") as mock_settings:
            mock_settings.callmebot_phone = "+111"
            mock_settings.callmebot_apikey = "k"
            phone, apikey = await get_whatsapp_config()

        assert phone == "+111"


class TestSendWhatsapp:
    """Test WhatsApp send logic."""

    async def test_not_configured_returns_false(self):
        """Should return False when no config available."""
        result = await send_whatsapp("test", phone="", apikey="")
        assert result is False

    async def test_disabled_notifications_returns_false(self):
        """Should return False when user disabled notifications."""
        await UserSettings(
            whatsapp_phone="+123",
            whatsapp_apikey="key",
            notifications_enabled=False,
        ).insert()

        result = await send_whatsapp("test", phone="+123", apikey="key")
        assert result is False
