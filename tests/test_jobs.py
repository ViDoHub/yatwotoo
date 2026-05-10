"""Tests for scheduler jobs (enrichment, cleanup, poll gating)."""

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest

from app.models import Amenities, DealType, Listing, ScrapeJob
from app.scheduler.jobs import cleanup_stale_listings_job, enrich_amenities_job, poll_listings_job


pytestmark = pytest.mark.asyncio


class TestPollListingsJobGating:
    """Test that poll_listings_job is properly gated."""

    async def test_skips_when_no_completed_scrape(self):
        """Should skip poll if no ScrapeJob has completed."""
        # No ScrapeJob exists at all
        await poll_listings_job()
        # Should complete without error (just logs and returns)

    async def test_skips_when_job_running(self):
        """Should skip poll if another job is currently running."""
        await ScrapeJob(status="completed", completed_at=datetime.utcnow()).insert()
        await ScrapeJob(status="running").insert()

        # Should return early without fetching
        with patch("app.scheduler.jobs.fetch_all_listings", new_callable=AsyncMock) as mock_fetch:
            await poll_listings_job()
            mock_fetch.assert_not_called()

    async def test_runs_when_completed_exists_and_none_running(self):
        """Should proceed with poll when conditions are met."""
        await ScrapeJob(status="completed", completed_at=datetime.utcnow()).insert()

        with patch("app.scheduler.jobs.fetch_all_listings", new_callable=AsyncMock, return_value=[]) as mock_fetch:
            await poll_listings_job()
            # Should have been called (at least once for rent or forsale)
            assert mock_fetch.call_count >= 1


class TestCleanupStaleListings:
    """Test stale listing deactivation."""

    async def test_marks_stale_listings_inactive(self):
        """Listings not seen in 3+ days should be deactivated."""
        # Fresh listing
        await Listing(
            yad2_id="fresh1",
            deal_type=DealType.RENT,
            is_active=True,
            last_seen_at=datetime.utcnow(),
        ).insert()

        # Stale listing (not seen in 5 days)
        await Listing(
            yad2_id="stale1",
            deal_type=DealType.RENT,
            is_active=True,
            last_seen_at=datetime.utcnow() - timedelta(days=5),
        ).insert()

        await cleanup_stale_listings_job()

        fresh = await Listing.find_one(Listing.yad2_id == "fresh1")
        stale = await Listing.find_one(Listing.yad2_id == "stale1")

        assert fresh.is_active is True
        assert stale.is_active is False

    async def test_already_inactive_stays_inactive(self):
        await Listing(
            yad2_id="already_inactive",
            deal_type=DealType.RENT,
            is_active=False,
            last_seen_at=datetime.utcnow() - timedelta(days=10),
        ).insert()

        await cleanup_stale_listings_job()

        saved = await Listing.find_one(Listing.yad2_id == "already_inactive")
        assert saved.is_active is False


class TestEnrichAmenitiesJob:
    """Test amenity enrichment background job."""

    async def test_skips_when_no_unenriched(self):
        """Should log and return if no un-enriched listings found."""
        # All enriched
        await Listing(
            yad2_id="enriched1",
            deal_type=DealType.RENT,
            amenities=Amenities(parking=True, elevator=False, mamad=True),
            is_active=True,
        ).insert()

        # Should complete without errors
        await enrich_amenities_job(batch_size=10)

    async def test_enriches_unenriched_listings(self):
        """Should call fetch_item_detail for listings with all-None amenities."""
        # Un-enriched listing (all amenities None)
        await Listing(
            yad2_id="unenriched1",
            deal_type=DealType.RENT,
            amenities=Amenities(),
            is_active=True,
        ).insert()

        mock_amenities = Amenities(parking=True, elevator=True, mamad=False)

        with patch("app.scheduler.jobs.fetch_item_detail", new_callable=AsyncMock, return_value=mock_amenities):
            with patch("app.config.settings.request_delay_min", 0):
                with patch("app.config.settings.request_delay_max", 0):
                    await enrich_amenities_job(batch_size=10)

        saved = await Listing.find_one(Listing.yad2_id == "unenriched1")
        assert saved.amenities.parking is True
        assert saved.amenities.elevator is True
        assert saved.amenities.mamad is False

    async def test_handles_fetch_failure(self):
        """Should count failures but continue processing."""
        await Listing(
            yad2_id="fail1",
            deal_type=DealType.RENT,
            amenities=Amenities(),
            is_active=True,
        ).insert()
        await Listing(
            yad2_id="success1",
            deal_type=DealType.RENT,
            amenities=Amenities(),
            is_active=True,
        ).insert()

        # First call fails, second succeeds
        mock_amenities = Amenities(parking=True)

        with patch(
            "app.scheduler.jobs.fetch_item_detail",
            new_callable=AsyncMock,
            side_effect=[None, mock_amenities],
        ):
            with patch("app.config.settings.request_delay_min", 0):
                with patch("app.config.settings.request_delay_max", 0):
                    await enrich_amenities_job(batch_size=10)

        # One should be enriched, one unchanged
        fail = await Listing.find_one(Listing.yad2_id == "fail1")
        success = await Listing.find_one(Listing.yad2_id == "success1")
        # fail1's amenities remain unchanged (all None)
        assert fail.amenities.parking is None
        # success1 got enriched
        assert success.amenities.parking is True

    async def test_batch_size_limits_processing(self):
        """Should only process up to batch_size listings."""
        for i in range(5):
            await Listing(
                yad2_id=f"batch_{i}",
                deal_type=DealType.RENT,
                amenities=Amenities(),
                is_active=True,
            ).insert()

        call_count = 0

        async def mock_fetch(token, client):
            nonlocal call_count
            call_count += 1
            return Amenities(parking=True)

        with patch("app.scheduler.jobs.fetch_item_detail", side_effect=mock_fetch):
            with patch("app.config.settings.request_delay_min", 0):
                with patch("app.config.settings.request_delay_max", 0):
                    await enrich_amenities_job(batch_size=3)

        assert call_count == 3

    async def test_skips_inactive_listings(self):
        """Inactive listings should not be enriched."""
        await Listing(
            yad2_id="inactive_unenriched",
            deal_type=DealType.RENT,
            amenities=Amenities(),
            is_active=False,
        ).insert()

        with patch("app.scheduler.jobs.fetch_item_detail", new_callable=AsyncMock) as mock_fetch:
            await enrich_amenities_job(batch_size=10)
            mock_fetch.assert_not_called()

    async def test_partially_enriched_not_refetched(self):
        """Listings with at least one non-None amenity should be skipped."""
        # Has parking set, but elevator is None
        await Listing(
            yad2_id="partial1",
            deal_type=DealType.RENT,
            amenities=Amenities(parking=True),
            is_active=True,
        ).insert()

        with patch("app.scheduler.jobs.fetch_item_detail", new_callable=AsyncMock) as mock_fetch:
            await enrich_amenities_job(batch_size=10)
            mock_fetch.assert_not_called()
