"""Tests for the upsert logic and deduplication."""

from datetime import datetime

import pytest

from app.models import Address, DealType, Listing, PriceHistory
from app.scraper.sync import deduplicate_listing, upsert_listings

pytestmark = pytest.mark.asyncio


class TestUpsertListings:
    """Test listing upsert logic (insert new, update existing, price tracking)."""

    async def test_insert_new_listing(self):
        listing = Listing(
            yad2_id='new1',
            deal_type=DealType.RENT,
            price=5000,
            is_active=True,
        )

        new, price_drops = await upsert_listings([listing])
        assert len(new) == 1
        assert len(price_drops) == 0
        assert new[0].yad2_id == 'new1'

        # Check it's in DB
        saved = await Listing.find_one(Listing.yad2_id == 'new1')
        assert saved is not None
        assert saved.price == 5000

    async def test_insert_records_initial_price_history(self):
        listing = Listing(
            yad2_id='price_hist1',
            deal_type=DealType.RENT,
            price=6000,
            is_active=True,
        )

        await upsert_listings([listing])

        history = await PriceHistory.find(PriceHistory.listing_id == 'price_hist1').to_list()
        assert len(history) == 1
        assert history[0].price == 6000

    async def test_insert_no_price_skips_history(self):
        listing = Listing(
            yad2_id='no_price1',
            deal_type=DealType.RENT,
            price=None,
            is_active=True,
        )

        await upsert_listings([listing])

        history = await PriceHistory.find(PriceHistory.listing_id == 'no_price1').to_list()
        assert len(history) == 0

    async def test_update_existing_updates_last_seen(self):
        # Insert original
        original = Listing(
            yad2_id='exist1',
            deal_type=DealType.RENT,
            price=5000,
            is_active=True,
            last_seen_at=datetime(2026, 1, 1),
        )
        await original.insert()

        # Upsert same yad2_id
        updated = Listing(
            yad2_id='exist1',
            deal_type=DealType.RENT,
            price=5000,
            is_active=True,
        )
        new, _ = await upsert_listings([updated])
        assert len(new) == 0

        saved = await Listing.find_one(Listing.yad2_id == 'exist1')
        assert saved.last_seen_at > datetime(2026, 1, 1)

    async def test_price_drop_detected(self):
        # Insert at higher price
        original = Listing(
            yad2_id='drop1',
            deal_type=DealType.RENT,
            price=8000,
            is_active=True,
        )
        await original.insert()

        # Upsert with lower price
        updated = Listing(
            yad2_id='drop1',
            deal_type=DealType.RENT,
            price=6000,
            price_per_sqm=80.0,
            is_active=True,
        )
        new, price_drops = await upsert_listings([updated])
        assert len(new) == 0
        assert len(price_drops) == 1
        assert price_drops[0].price == 6000

        # Price history should have new entry
        history = await PriceHistory.find(PriceHistory.listing_id == 'drop1').to_list()
        assert len(history) == 1
        assert history[0].price == 6000

    async def test_price_increase_not_in_drops(self):
        """Price increase should NOT appear in price_drops list."""
        original = Listing(
            yad2_id='increase1',
            deal_type=DealType.RENT,
            price=5000,
            is_active=True,
        )
        await original.insert()

        updated = Listing(
            yad2_id='increase1',
            deal_type=DealType.RENT,
            price=7000,
            is_active=True,
        )
        _, price_drops = await upsert_listings([updated])
        assert len(price_drops) == 0

    async def test_reactivates_inactive_listing(self):
        inactive = Listing(
            yad2_id='reactivate1',
            deal_type=DealType.RENT,
            price=5000,
            is_active=False,
        )
        await inactive.insert()

        updated = Listing(
            yad2_id='reactivate1',
            deal_type=DealType.RENT,
            price=5000,
            is_active=True,
        )
        await upsert_listings([updated])

        saved = await Listing.find_one(Listing.yad2_id == 'reactivate1')
        assert saved.is_active is True

    async def test_updates_description_and_images(self):
        original = Listing(
            yad2_id='update_fields1',
            deal_type=DealType.RENT,
            description='old desc',
            images=['old.jpg'],
            is_active=True,
        )
        await original.insert()

        updated = Listing(
            yad2_id='update_fields1',
            deal_type=DealType.RENT,
            description='new desc',
            images=['new1.jpg', 'new2.jpg'],
            is_active=True,
        )
        await upsert_listings([updated])

        saved = await Listing.find_one(Listing.yad2_id == 'update_fields1')
        assert saved.description == 'new desc'
        assert saved.images == ['new1.jpg', 'new2.jpg']

    async def test_empty_description_doesnt_overwrite(self):
        """Empty string description in update shouldn't overwrite existing."""
        original = Listing(
            yad2_id='keep_desc1',
            deal_type=DealType.RENT,
            description='good description',
            is_active=True,
        )
        await original.insert()

        updated = Listing(
            yad2_id='keep_desc1',
            deal_type=DealType.RENT,
            description='',  # empty
            is_active=True,
        )
        await upsert_listings([updated])

        saved = await Listing.find_one(Listing.yad2_id == 'keep_desc1')
        assert saved.description == 'good description'

    async def test_batch_upsert_multiple(self):
        listings = [
            Listing(yad2_id=f'batch_{i}', deal_type=DealType.RENT, price=5000 + i * 100, is_active=True)
            for i in range(10)
        ]
        new, _ = await upsert_listings(listings)
        assert len(new) == 10

        total = await Listing.count()
        assert total == 10


class TestDeduplicateListing:
    """Test duplicate detection logic."""

    async def test_no_duplicate_found(self):
        listing = Listing(
            yad2_id='unique1',
            deal_type=DealType.RENT,
            address=Address(city='תל אביב', street='דיזנגוף'),
            rooms=3.0,
            sqm=80.0,
            is_active=True,
        )
        is_dup = await deduplicate_listing(listing)
        assert is_dup is False

    async def test_duplicate_detected(self):
        # Existing listing
        await Listing(
            yad2_id='original1',
            deal_type=DealType.RENT,
            address=Address(city='תל אביב', street='דיזנגוף'),
            rooms=3.0,
            sqm=80.0,
            is_active=True,
        ).insert()

        # Same address+rooms+sqm, different yad2_id
        new_listing = Listing(
            yad2_id='republished1',
            deal_type=DealType.RENT,
            address=Address(city='תל אביב', street='דיזנגוף'),
            rooms=3.0,
            sqm=80.0,
            is_active=True,
        )
        is_dup = await deduplicate_listing(new_listing)
        assert is_dup is True

    async def test_different_rooms_not_duplicate(self):
        await Listing(
            yad2_id='orig2',
            deal_type=DealType.RENT,
            address=Address(city='תל אביב', street='דיזנגוף'),
            rooms=3.0,
            sqm=80.0,
            is_active=True,
        ).insert()

        different_rooms = Listing(
            yad2_id='diff_rooms',
            deal_type=DealType.RENT,
            address=Address(city='תל אביב', street='דיזנגוף'),
            rooms=4.0,
            sqm=80.0,
            is_active=True,
        )
        assert await deduplicate_listing(different_rooms) is False

    async def test_no_street_skips_dedup(self):
        """Listings without street shouldn't be dedup-checked."""
        listing = Listing(
            yad2_id='no_street1',
            deal_type=DealType.RENT,
            address=Address(city='תל אביב', street=''),
            rooms=3.0,
            is_active=True,
        )
        assert await deduplicate_listing(listing) is False

    async def test_no_rooms_skips_dedup(self):
        """Listings without rooms shouldn't be dedup-checked."""
        listing = Listing(
            yad2_id='no_rooms1',
            deal_type=DealType.RENT,
            address=Address(city='תל אביב', street='דיזנגוף'),
            rooms=None,
            is_active=True,
        )
        assert await deduplicate_listing(listing) is False

    async def test_inactive_existing_not_considered_duplicate(self):
        """Inactive listings should NOT trigger dedup."""
        await Listing(
            yad2_id='inactive_orig',
            deal_type=DealType.RENT,
            address=Address(city='תל אביב', street='דיזנגוף'),
            rooms=3.0,
            sqm=80.0,
            is_active=False,
        ).insert()

        new_listing = Listing(
            yad2_id='new_after_inactive',
            deal_type=DealType.RENT,
            address=Address(city='תל אביב', street='דיזנגוף'),
            rooms=3.0,
            sqm=80.0,
            is_active=True,
        )
        assert await deduplicate_listing(new_listing) is False
