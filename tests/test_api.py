"""Tests for API routes (saved searches, scrape status, markers, health)."""

import json
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from motor.motor_asyncio import AsyncIOMotorClient

from app.models import DealType, Listing, SavedSearch, ScrapeJob

pytestmark = pytest.mark.asyncio


class TestSaveSearchAPI:
    """Test POST /api/searches (upsert logic, filter sanitization)."""

    async def test_create_new_search(self):
        from app.routes.api import save_search_api

        # Simulate request
        mock_request = AsyncMock()
        mock_request.json = AsyncMock(
            return_value={
                'name': 'My Search',
                'filters': {'deal_type': 'rent', 'rooms_min': '3', 'price_max': '8000'},
            },
        )

        response = await save_search_api(mock_request)
        data = response.body.decode()

        assert 'saved' in data
        assert 'My Search' in data

        # Check DB
        saved = await SavedSearch.find_one(SavedSearch.name == 'My Search')
        assert saved is not None
        assert saved.filters['deal_type'] == 'rent'
        assert saved.filters['rooms_min'] == '3'

    async def test_upsert_existing_search(self):
        from app.routes.api import save_search_api

        # Create initial
        await SavedSearch(name='Existing', filters={'deal_type': 'rent'}).insert()

        mock_request = AsyncMock()
        mock_request.json = AsyncMock(
            return_value={
                'name': 'Existing',
                'filters': {'deal_type': 'forsale', 'rooms_min': '4'},
            },
        )

        response = await save_search_api(mock_request)
        data = response.body.decode()
        assert 'updated' in data

        # Should still be only 1 search
        count = await SavedSearch.find(SavedSearch.name == 'Existing').count()
        assert count == 1

        # Filters should be updated
        saved = await SavedSearch.find_one(SavedSearch.name == 'Existing')
        assert saved.filters['deal_type'] == 'forsale'

    async def test_sanitizes_unknown_filter_keys(self):
        from app.routes.api import save_search_api

        mock_request = AsyncMock()
        mock_request.json = AsyncMock(
            return_value={
                'name': 'Sanitized',
                'filters': {
                    'deal_type': 'rent',
                    'rooms_min': '3',
                    'malicious_key': 'DROP TABLE',
                    '__proto__': 'pollution',
                    'constructor': 'evil',
                },
            },
        )

        await save_search_api(mock_request)

        saved = await SavedSearch.find_one(SavedSearch.name == 'Sanitized')
        assert 'malicious_key' not in saved.filters
        assert '__proto__' not in saved.filters
        assert 'constructor' not in saved.filters
        assert saved.filters['deal_type'] == 'rent'

    async def test_empty_values_excluded(self):
        from app.routes.api import save_search_api

        mock_request = AsyncMock()
        mock_request.json = AsyncMock(
            return_value={
                'name': 'Empty Vals',
                'filters': {
                    'deal_type': 'rent',
                    'price_min': '',  # empty string - falsy
                    'price_max': '',
                    'rooms_min': '3',
                },
            },
        )

        await save_search_api(mock_request)

        saved = await SavedSearch.find_one(SavedSearch.name == 'Empty Vals')
        assert 'price_min' not in saved.filters
        assert 'price_max' not in saved.filters
        assert saved.filters['rooms_min'] == '3'

    async def test_default_name_when_empty(self):
        from app.routes.api import save_search_api

        mock_request = AsyncMock()
        mock_request.json = AsyncMock(
            return_value={
                'name': '   ',  # whitespace only
                'filters': {'deal_type': 'rent'},
            },
        )

        await save_search_api(mock_request)

        saved = await SavedSearch.find_one(SavedSearch.name == 'Saved Search')
        assert saved is not None


class TestScrapeStatus:
    """Test GET /api/scrape/status."""

    async def test_no_job_returns_null(self):
        from app.routes.api import scrape_status

        response = await scrape_status()
        import json

        data = json.loads(response.body)

        assert data['total_listings'] == 0
        assert data['job'] is None

    async def test_with_running_job(self):
        from app.routes.api import scrape_status

        await Listing(yad2_id='s1', deal_type=DealType.RENT, is_active=True).insert()
        await Listing(yad2_id='s2', deal_type=DealType.FORSALE, is_active=True).insert()

        await ScrapeJob(
            status='running',
            regions_completed=['rent:1', 'rent:2'],
            total_fetched=5000,
            total_new=100,
        ).insert()

        response = await scrape_status()
        import json

        data = json.loads(response.body)

        assert data['total_listings'] == 2
        assert data['rent_count'] == 1
        assert data['forsale_count'] == 1
        assert data['job']['status'] == 'running'
        assert data['job']['regions_completed'] == 2
        assert data['job']['total_steps'] == 16  # 8 regions x 2 deal types
        assert data['job']['progress_pct'] == 12  # 2/16 * 100


class TestTriggerScrape:
    """Test POST /api/scrape."""

    async def test_prevents_duplicate_scrape(self):
        from fastapi import BackgroundTasks

        from app.routes.api import trigger_scrape

        # Already running job
        await ScrapeJob(status='running').insert()

        bg = BackgroundTasks()
        response = await trigger_scrape(bg)
        import json

        data = json.loads(response.body)

        assert data['status'] == 'already_running'

    async def test_starts_new_scrape(self):
        from fastapi import BackgroundTasks

        from app.routes.api import trigger_scrape

        bg = BackgroundTasks()
        response = await trigger_scrape(bg)
        import json

        data = json.loads(response.body)

        assert data['status'] == 'started'
        assert 'job_id' in data

        # Job should exist in DB
        job = await ScrapeJob.find_one(ScrapeJob.status == 'running')
        assert job is not None


class TestHealth:
    """Test GET /health endpoint."""

    async def test_health_ok(self):
        from app.main import app, health

        # Simulate app state set during lifespan
        app.state.started_at = datetime.now(tz=UTC)
        app.state.motor_client = AsyncIOMotorClient('mongodb://localhost:27017')

        response = await health()
        data = json.loads(response.body)

        assert data['status'] == 'ok'
        assert data['db'] == 'connected'
        assert data['uptime_seconds'] >= 0

        app.state.motor_client.close()

    async def test_health_degraded_when_db_unreachable(self):
        from app.main import app, health

        app.state.started_at = datetime.now(tz=UTC)
        # Mock a client that fails on ping
        mock_client = MagicMock()
        mock_client.__getitem__ = MagicMock(return_value=MagicMock())
        mock_client.__getitem__().command = AsyncMock(side_effect=ConnectionError('no db'))
        app.state.motor_client = mock_client

        response = await health()
        data = json.loads(response.body)

        assert data['status'] == 'degraded'
        assert data['db'] == 'unreachable'
        assert data['uptime_seconds'] >= 0
